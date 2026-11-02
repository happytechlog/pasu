import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, TIME_ZONE_COOKIE } from "@/lib/timezone";

/**
 * The viewer's time zone from the cookie set by <TimeZoneSync> (browser
 * setting). Falls back to Asia/Seoul until the browser has reported it.
 * Request-time data: call inside <Suspense>.
 */
export async function getViewerTimeZone(): Promise<string> {
  const value = (await cookies()).get(TIME_ZONE_COOKIE)?.value;
  return normalizeTimeZone(value) ?? DEFAULT_TIME_ZONE;
}
