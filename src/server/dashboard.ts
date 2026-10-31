import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { checks, incidents, monitors } from "@/lib/db/schema";
import { BUCKET_ORIGIN, CHART_RANGES, fillBuckets, type BucketRow, type ChartRange } from "@/lib/monitor/stats";

// Dashboard read queries. All checks lookups go through
// checks_monitor_checked_at_idx (monitor_id, checked_at).

export const HEAT_BAR_SIZE = 30;

export type RecentCheck = {
  checkedAt: Date;
  ok: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
};

export type MonitorSummary = typeof monitors.$inferSelect & {
  recent: RecentCheck[]; // newest first, up to HEAT_BAR_SIZE
  ok24h: number;
  total24h: number;
};

export async function listMonitorSummaries(): Promise<MonitorSummary[]> {
  const [rows, recent, uptime] = await Promise.all([
    db.select().from(monitors).orderBy(monitors.name, monitors.createdAt),
    db.execute<{
      monitor_id: string;
      checked_at: Date;
      ok: boolean;
      status_code: number | null;
      response_time_ms: number | null;
      error: string | null;
    }>(sql`
      select m.id as monitor_id, c.checked_at, c.ok, c.status_code, c.response_time_ms, c.error
        from ${monitors} m
        cross join lateral (
          select checked_at, ok, status_code, response_time_ms, error
            from ${checks}
           where monitor_id = m.id
           order by checked_at desc
           limit ${HEAT_BAR_SIZE}
        ) c
       order by m.id, c.checked_at desc
    `),
    db.execute<{ monitor_id: string; ok: number; total: number }>(sql`
      select monitor_id, (count(*) filter (where ok))::int as ok, count(*)::int as total
        from ${checks}
       where checked_at > now() - interval '24 hours'
       group by monitor_id
    `),
  ]);

  const recentBy = new Map<string, RecentCheck[]>();
  for (const r of recent.rows) {
    const list = recentBy.get(r.monitor_id) ?? [];
    list.push({
      checkedAt: new Date(r.checked_at),
      ok: r.ok,
      statusCode: r.status_code,
      responseTimeMs: r.response_time_ms,
      error: r.error,
    });
    recentBy.set(r.monitor_id, list);
  }
  const uptimeBy = new Map(uptime.rows.map((u) => [u.monitor_id, u]));

  return rows.map((m) => ({
    ...m,
    recent: recentBy.get(m.id) ?? [],
    ok24h: uptimeBy.get(m.id)?.ok ?? 0,
    total24h: uptimeBy.get(m.id)?.total ?? 0,
  }));
}

export async function getMonitor(id: string) {
  const [m] = await db.select().from(monitors).where(eq(monitors.id, id)).limit(1);
  return m ?? null;
}

export type UptimeWindows = Record<ChartRange, { ok: number; total: number }>;

export async function getUptimeWindows(monitorId: string): Promise<UptimeWindows> {
  const { rows } = await db.execute<{
    ok_24h: number;
    total_24h: number;
    ok_7d: number;
    total_7d: number;
    ok_30d: number;
    total_30d: number;
  }>(sql`
    select
      (count(*) filter (where ok and checked_at > now() - interval '24 hours'))::int as ok_24h,
      (count(*) filter (where checked_at > now() - interval '24 hours'))::int as total_24h,
      (count(*) filter (where ok and checked_at > now() - interval '7 days'))::int as ok_7d,
      (count(*) filter (where checked_at > now() - interval '7 days'))::int as total_7d,
      (count(*) filter (where ok))::int as ok_30d,
      count(*)::int as total_30d
      from ${checks}
     where monitor_id = ${monitorId} and checked_at > now() - interval '30 days'
  `);
  const r = rows[0];
  return {
    "24h": { ok: r.ok_24h, total: r.total_24h },
    "7d": { ok: r.ok_7d, total: r.total_7d },
    "30d": { ok: r.ok_30d, total: r.total_30d },
  };
}

/** Response-time buckets for the chart; empty buckets are filled in. */
export async function getResponseBuckets(monitorId: string, range: ChartRange, now = new Date()): Promise<BucketRow[]> {
  const { durationMs, bucketMs } = CHART_RANGES[range];
  const since = new Date(now.getTime() - durationMs);
  const { rows } = await db.execute<{ bucket: Date; total: number; failed: number; avg_ms: number | null }>(sql`
    select date_bin(make_interval(secs => ${bucketMs / 1000}), checked_at, ${BUCKET_ORIGIN.toISOString()}::timestamptz) as bucket,
           count(*)::int as total,
           (count(*) filter (where not ok))::int as failed,
           round(avg(response_time_ms) filter (where ok))::int as avg_ms
      from ${checks}
     where monitor_id = ${monitorId} and checked_at > ${since.toISOString()}::timestamptz
     group by 1
     order by 1
  `);
  return fillBuckets(
    rows.map((r) => ({ bucket: new Date(r.bucket), total: r.total, failed: r.failed, avgMs: r.avg_ms })),
    now,
    durationMs,
    bucketMs,
  );
}

export async function listIncidents(monitorId: string, limit = 20) {
  return db
    .select()
    .from(incidents)
    .where(eq(incidents.monitorId, monitorId))
    .orderBy(desc(incidents.startedAt))
    .limit(limit);
}

export async function listRecentChecks(monitorId: string, limit = HEAT_BAR_SIZE) {
  return db
    .select({
      checkedAt: checks.checkedAt,
      ok: checks.ok,
      statusCode: checks.statusCode,
      responseTimeMs: checks.responseTimeMs,
      error: checks.error,
    })
    .from(checks)
    .where(eq(checks.monitorId, monitorId))
    .orderBy(desc(checks.checkedAt))
    .limit(limit);
}
