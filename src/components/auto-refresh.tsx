"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the current route's Server Components every `intervalMs`
 * (router.refresh keeps client state and scroll position). Skips while the
 * tab is hidden and refreshes once when it becomes visible again.
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      last = Date.now();
      router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= intervalMs) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return null;
}
