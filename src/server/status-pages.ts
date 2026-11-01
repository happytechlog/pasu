import "server-only";
import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorDailyStats, monitors, statusPageMonitors, statusPages } from "@/lib/db/schema";
import { addDays, fillDays, kstDay, STATUS_PAGE_DAYS, type DayRow } from "@/lib/monitor/stats";

// Status page queries. The public one (getPublicStatusPage) must never select
// monitor URLs or check errors: only what's in PublicMonitor reaches the page.

export async function listStatusPages() {
  return db
    .select({
      id: statusPages.id,
      slug: statusPages.slug,
      title: statusPages.title,
      monitorCount: count(statusPageMonitors.monitorId),
    })
    .from(statusPages)
    .leftJoin(statusPageMonitors, eq(statusPageMonitors.statusPageId, statusPages.id))
    .groupBy(statusPages.id)
    .orderBy(asc(statusPages.createdAt));
}

export function listMonitorOptions() {
  return db
    .select({ id: monitors.id, name: monitors.name, enabled: monitors.enabled })
    .from(monitors)
    .orderBy(asc(monitors.name), asc(monitors.createdAt));
}

export async function getStatusPageForEdit(id: string) {
  const [page] = await db.select().from(statusPages).where(eq(statusPages.id, id)).limit(1);
  if (!page) return null;
  const links = await db
    .select({ monitorId: statusPageMonitors.monitorId })
    .from(statusPageMonitors)
    .where(eq(statusPageMonitors.statusPageId, id));
  return { ...page, monitorIds: links.map((l) => l.monitorId) };
}

export type PublicMonitorStatus = "up" | "down" | "pending" | "paused";

export type PublicMonitor = {
  name: string;
  status: PublicMonitorStatus;
  days: DayRow[]; // STATUS_PAGE_DAYS entries, oldest first
  ok: number; // totals over those days
  total: number;
};

export type PublicStatusPage = { title: string; monitors: PublicMonitor[] };

/** Title only, for <title>. */
export async function getStatusPageTitle(slug: string): Promise<string | null> {
  const [p] = await db.select({ title: statusPages.title }).from(statusPages).where(eq(statusPages.slug, slug)).limit(1);
  return p?.title ?? null;
}

export async function getPublicStatusPage(slug: string, now = new Date()): Promise<PublicStatusPage | null> {
  const [page] = await db
    .select({ id: statusPages.id, title: statusPages.title })
    .from(statusPages)
    .where(eq(statusPages.slug, slug))
    .limit(1);
  if (!page) return null;

  const today = kstDay(now);
  const since = addDays(today, -(STATUS_PAGE_DAYS - 1));

  const [rows, stats] = await Promise.all([
    db
      .select({ id: monitors.id, name: monitors.name, enabled: monitors.enabled, status: monitors.status })
      .from(statusPageMonitors)
      .innerJoin(monitors, eq(monitors.id, statusPageMonitors.monitorId))
      .where(eq(statusPageMonitors.statusPageId, page.id))
      .orderBy(asc(monitors.name), asc(monitors.createdAt)),
    db.execute<{ monitor_id: string; day: string; total: number; ok: number }>(sql`
      select s.monitor_id, to_char(s.day, 'YYYY-MM-DD') as day, s.total_checks as total, s.ok_checks as ok
        from ${monitorDailyStats} s
        join ${statusPageMonitors} spm on spm.monitor_id = s.monitor_id
       where spm.status_page_id = ${page.id} and s.day >= ${since}::date
    `),
  ]);

  const byMonitor = new Map<string, DayRow[]>();
  for (const r of stats.rows) {
    const list = byMonitor.get(r.monitor_id) ?? [];
    list.push({ day: r.day, total: r.total, ok: r.ok });
    byMonitor.set(r.monitor_id, list);
  }

  return {
    title: page.title,
    monitors: rows.map((m) => {
      const days = fillDays(byMonitor.get(m.id) ?? [], today);
      return {
        name: m.name,
        status: m.enabled ? m.status : "paused",
        days,
        ok: days.reduce((s, d) => s + d.ok, 0),
        total: days.reduce((s, d) => s + d.total, 0),
      };
    }),
  };
}
