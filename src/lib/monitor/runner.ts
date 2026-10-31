import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { checks, incidents, monitors } from "../db/schema";
import type { CheckResult } from "./check";
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
