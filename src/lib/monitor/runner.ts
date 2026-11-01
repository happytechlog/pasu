import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { checks, incidents, monitorDailyStats, monitors, sslAlertsSent } from "../db/schema";
import type { CheckResult } from "./check";
import { SSL_CHECK_INTERVAL_MS, SSL_RETRY_AFTER_MS } from "./ssl";
import { nextState, type TransitionResult } from "./state";

// DB side of the worker. Shared lib code: no Next/React imports.

export type DueMonitor = {
  id: string;
  name: string;
  url: string;
  method: "GET" | "HEAD";
  timeoutMs: number;
  expectedStatus: string;
};

/**
 * Atomically claims due monitors and pushes their nextCheckAt forward by one
 * interval. Scheduling from claim time keeps the cadence steady regardless of
 * how long a check takes, and SKIP LOCKED makes it safe with several workers.
 */
export async function claimDueMonitors(limit: number): Promise<DueMonitor[]> {
  const { rows } = await db.execute<{
    id: string;
    name: string;
    url: string;
    method: "GET" | "HEAD";
    timeout_ms: number;
    expected_status: string;
  }>(sql`
    update ${monitors} m
       set next_check_at = now() + make_interval(secs => m.interval_sec)
     where m.id in (
       select id from ${monitors}
        where enabled and next_check_at <= now()
        order by next_check_at
        limit ${limit}
        for update skip locked
     )
    returning m.id, m.name, m.url, m.method, m.timeout_ms, m.expected_status
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    method: r.method,
    timeoutMs: r.timeout_ms,
    expectedStatus: r.expected_status,
  }));
}

export type RecordOutcome =
  | { skipped: true }
  | ({ skipped: false; incidentStartedAt: Date | null } & TransitionResult);

/**
 * Stores a check and applies the status transition in one transaction.
 * The monitor row is re-read under lock, so a pause/resume/delete made while
 * the request was in flight wins over the stale claim.
 */
export async function recordResult(monitorId: string, result: CheckResult, checkedAt = new Date()): Promise<RecordOutcome> {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ enabled: monitors.enabled, status: monitors.status, consecutiveFailures: monitors.consecutiveFailures })
      .from(monitors)
      .where(eq(monitors.id, monitorId))
      .for("update");
    if (!m || !m.enabled) return { skipped: true } as const;

    await tx.insert(checks).values({
      monitorId,
      checkedAt,
      ok: result.ok,
      statusCode: result.statusCode,
      responseTimeMs: result.responseTimeMs,
      error: result.error,
    });
    // Daily counts (KST day) for the status pages' 90-day bars; kept beyond checks retention.
    const okInc = result.ok ? 1 : 0;
    await tx
      .insert(monitorDailyStats)
      .values({
        monitorId,
        day: sql`(${checkedAt.toISOString()}::timestamptz at time zone 'Asia/Seoul')::date`,
        totalChecks: 1,
        okChecks: okInc,
      })
      .onConflictDoUpdate({
        target: [monitorDailyStats.monitorId, monitorDailyStats.day],
        set: {
          totalChecks: sql`${monitorDailyStats.totalChecks} + 1`,
          okChecks: sql`${monitorDailyStats.okChecks} + ${okInc}`,
        },
      });

    const t = nextState(m, result.ok);
    await tx
      .update(monitors)
      .set({ status: t.status, consecutiveFailures: t.consecutiveFailures, lastCheckedAt: checkedAt })
      .where(eq(monitors.id, monitorId));

    let incidentStartedAt: Date | null = null;
    let event = t.event;
    if (event === "down") {
      // An incident may still be open from before a pause; then it's the same
      // outage, so don't report "down" (and alert) a second time.
      const opened = await tx
        .insert(incidents)
        .values({ monitorId, startedAt: checkedAt, reason: result.error })
        .onConflictDoNothing()
        .returning({ id: incidents.id });
      if (opened.length === 0) event = null;
    }
    if (t.closeIncident) {
      const [closed] = await tx
        .update(incidents)
        .set({ resolvedAt: checkedAt })
        .where(and(eq(incidents.monitorId, monitorId), isNull(incidents.resolvedAt)))
        .returning({ startedAt: incidents.startedAt });
      incidentStartedAt = closed?.startedAt ?? null;
    }
    return { skipped: false, incidentStartedAt, ...t, event };
  });
}

// ---------------------------------------------------------------------------
// SSL (once a day per enabled https monitor)
// ---------------------------------------------------------------------------

export type SslDueMonitor = { id: string; name: string; url: string };

/**
 * Claims enabled https monitors whose certificate hasn't been read in the last
 * day, stamping sslCheckedAt so other ticks/workers skip them.
 */
export async function claimSslDue(limit: number): Promise<SslDueMonitor[]> {
  const { rows } = await db.execute<SslDueMonitor>(sql`
    update ${monitors} m
       set ssl_checked_at = now()
     where m.id in (
       select id from ${monitors}
        where enabled
          and url ilike 'https://%'
          and (ssl_checked_at is null or ssl_checked_at <= now() - make_interval(secs => ${SSL_CHECK_INTERVAL_MS / 1000}))
        order by ssl_checked_at nulls first
        limit ${limit}
        for update skip locked
     )
    returning m.id, m.name, m.url
  `);
  return rows;
}

/** Stores the certificate expiry read from the server. */
export async function saveSslExpiry(monitorId: string, expiresAt: Date): Promise<void> {
  await db.update(monitors).set({ sslExpiresAt: expiresAt }).where(eq(monitors.id, monitorId));
}

/**
 * The lookup failed: keep the last known expiry and back-date sslCheckedAt so
 * the monitor is retried in about an hour instead of a day.
 */
export async function markSslRetry(monitorId: string): Promise<void> {
  const backdateSec = (SSL_CHECK_INTERVAL_MS - SSL_RETRY_AFTER_MS) / 1000;
  await db
    .update(monitors)
    .set({ sslCheckedAt: sql`now() - make_interval(secs => ${backdateSec})` })
    .where(eq(monitors.id, monitorId));
}

/**
 * Records that the alert for (monitor, certificate expiry, threshold) is being
 * sent. Returns false if it was already sent, so each fires at most once.
 */
export async function claimSslAlert(monitorId: string, expiresAt: Date, thresholdDays: number): Promise<boolean> {
  const inserted = await db
    .insert(sslAlertsSent)
    .values({ monitorId, expiresAt, thresholdDays })
    .onConflictDoNothing()
    .returning({ id: sslAlertsSent.id });
  return inserted.length > 0;
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/**
 * Deletes checks older than `retentionDays`, `batchSize` rows per statement so
 * no single delete holds locks for long. Daily stats (monitor_daily_stats)
 * are not touched. Returns the number of rows deleted.
 */
export async function purgeOldChecks(retentionDays: number, batchSize = 5000): Promise<number> {
  let deleted = 0;
  for (;;) {
    const { rowCount } = await db.execute(sql`
      delete from ${checks}
       where id in (
         select id from ${checks}
          where checked_at < now() - make_interval(days => ${retentionDays})
          limit ${batchSize}
       )
    `);
    deleted += rowCount ?? 0;
    if (!rowCount || rowCount < batchSize) return deleted;
  }
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}
