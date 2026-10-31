// Pure helpers for the dashboard (uptime, chart buckets, SSL, durations).
// Shared lib code: no Next/React imports.

/**
 * Uptime = ok checks / all checks in the window, as a percentage.
 * Returns null when there were no checks (shown as "—", not 100%).
 */
export function uptimePercent(ok: number, total: number): number | null {
  if (total <= 0) return null;
  return (ok / total) * 100;
}

/** 99.95 → "99.95%", 100 → "100%", null → "—". Never rounds up to 100. */
export function formatUptime(pct: number | null): string {
  if (pct === null) return "—";
  if (pct >= 100) return "100%";
  // Floor to 2 decimals so 99.999% doesn't display as 100%.
  const floored = Math.floor(pct * 100) / 100;
  return `${floored.toFixed(2).replace(/\.?0+$/, "")}%`;
}

export const CHART_RANGES = {
  "24h": { label: "24시간", durationMs: 24 * 3600_000, bucketMs: 15 * 60_000 },
  "7d": { label: "7일", durationMs: 7 * 24 * 3600_000, bucketMs: 3600_000 },
  "30d": { label: "30일", durationMs: 30 * 24 * 3600_000, bucketMs: 6 * 3600_000 },
} as const;

export type ChartRange = keyof typeof CHART_RANGES;

export function parseRange(v: unknown): ChartRange {
  return typeof v === "string" && v in CHART_RANGES ? (v as ChartRange) : "24h";
}

/** Buckets are aligned to this origin (midnight KST) so 6h buckets start at 00/06/12/18 KST. */
export const BUCKET_ORIGIN = new Date("2000-01-01T00:00:00+09:00");

export function bucketStart(t: Date, bucketMs: number, origin = BUCKET_ORIGIN): Date {
  const o = origin.getTime();
  return new Date(o + Math.floor((t.getTime() - o) / bucketMs) * bucketMs);
}

export type BucketRow = {
  bucket: Date;
  total: number;
  failed: number;
  avgMs: number | null; // average response time of ok checks
};

/**
 * Returns one entry per bucket from the bucket containing `now - duration`
 * through the bucket containing `now`, filling buckets without checks
 * with total = 0 so the chart can show gaps explicitly.
 */
export function fillBuckets(rows: BucketRow[], now: Date, durationMs: number, bucketMs: number): BucketRow[] {
  const byTime = new Map(rows.map((r) => [r.bucket.getTime(), r]));
  const first = bucketStart(new Date(now.getTime() - durationMs), bucketMs).getTime();
  const last = bucketStart(now, bucketMs).getTime();
  const out: BucketRow[] = [];
  for (let t = first; t <= last; t += bucketMs) {
    out.push(byTime.get(t) ?? { bucket: new Date(t), total: 0, failed: 0, avgMs: null });
  }
  return out;
}

/** Whole days until expiry, floored (expires in 23h → 0). Negative once expired. */
export function sslDaysLeft(expiresAt: Date | null, now = new Date()): number | null {
  if (!expiresAt) return null;
  return Math.floor((expiresAt.getTime() - now.getTime()) / 86400_000);
}

/** 45s → "1분 미만", 12m → "12분", 3h5m → "3시간 5분", 2d3h → "2일 3시간". */
export function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "1분 미만";
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return h > 0 ? `${d}일 ${h}시간` : `${d}일`;
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  return `${m}분`;
}
