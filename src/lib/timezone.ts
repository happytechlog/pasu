// Time zone helpers. Pure (Intl only): shared by the web and the worker.
//
// - Web pages show times in the viewer's browser time zone, which the browser
//   writes to the TIME_ZONE_COOKIE cookie (src/components/time-zone-sync.tsx).
// - Email alerts (and Slack fallback text) use the team's alert time zone
//   from app_settings.
// - Daily aggregates (monitor_daily_stats, chart bucket origin) always use KST
//   and don't depend on either.

export const DEFAULT_TIME_ZONE = "Asia/Seoul";
export const TIME_ZONE_COOKIE = "tz";

/** Shown first in the settings select. */
export const COMMON_TIME_ZONES = [
  "Asia/Seoul",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Asia/Tokyo",
  "UTC",
] as const;

/** Canonical IANA name (e.g. "asia/seoul" → "Asia/Seoul"), or null if unknown. */
export function normalizeTimeZone(tz: unknown): string | null {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Memoized Intl.DateTimeFormat (pages format many rows with the same options). */
export function dateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, f);
  }
  return f;
}

function zoneName(tz: string, at: Date, style: "short" | "shortOffset"): string {
  const parts = dateTimeFormat("en-US", { timeZone: tz, timeZoneName: style }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}

/**
 * Short zone label shown next to times: "KST" for Seoul, otherwise Intl's
 * short name ("PST"/"PDT", "UTC", "GMT+9", …). Depends on `at` because of DST.
 */
export function timeZoneLabel(tz: string, at: Date): string {
  if (tz === "Asia/Seoul") return "KST";
  return zoneName(tz, at, "short");
}

/** "GMT+9", "GMT-8", "GMT+5:30" at `at`. */
export function timeZoneOffset(tz: string, at: Date): string {
  return zoneName(tz, at, "shortOffset");
}

/** All IANA zones this runtime knows, plus "UTC" (not in supportedValuesOf). */
export function allTimeZones(): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}
