"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TIME_ZONE_COOKIE } from "@/lib/timezone";

/**
 * Stores the browser's time zone in a cookie so Server Components can format
 * times for this viewer (src/server/timezone.ts). When the cookie was missing
 * or different (first visit, travel), re-renders once with the new zone.
 */
export function TimeZoneSync() {
  const router = useRouter();

  useEffect(() => {
    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!tz) return;
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${TIME_ZONE_COOKIE}=`))
      ?.slice(TIME_ZONE_COOKIE.length + 1);
    if (current === tz) return;
    document.cookie = `${TIME_ZONE_COOKIE}=${tz}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }, [router]);

  return null;
}
