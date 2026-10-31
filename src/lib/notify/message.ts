// Alert text formatting. Pure: no I/O. Shared by the worker and the web
// ("테스트 발송").

import { formatDuration } from "../monitor/stats";

export type AlertMonitor = { id: string; name: string; url: string };

export type AlertEvent =
  | { kind: "down"; monitor: AlertMonitor; reason: string | null; at: Date }
  | { kind: "recovered"; monitor: AlertMonitor; downtimeMs: number | null; at: Date }
  | { kind: "test"; channelName: string; at: Date };

export type AlertMessage = { subject: string; text: string };

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Builds the alert text. `appUrl` (e.g. http://localhost:3000) adds a link
 * to the monitor's dashboard page.
 *   🔴 [DOWN] API 서버 — https://api.example.com · 원인: HTTP 503 · 14:03 감지
 *   🟢 [UP] API 서버 복구 — 다운 시간 12분
 */
export function formatAlert(e: AlertEvent, appUrl?: string): AlertMessage {
  const base = appUrl?.replace(/\/+$/, "");
  const link = (id: string) => (base ? `\n${base}/monitors/${id}` : "");

  switch (e.kind) {
    case "down": {
      const line = `🔴 [DOWN] ${e.monitor.name} — ${e.monitor.url} · 원인: ${e.reason ?? "알 수 없음"} · ${timeFmt.format(e.at)} 감지`;
      return { subject: `[DOWN] ${e.monitor.name}`, text: line + link(e.monitor.id) };
    }
    case "recovered": {
      const dur = e.downtimeMs !== null ? ` — 다운 시간 ${formatDuration(e.downtimeMs)}` : "";
      const line = `🟢 [UP] ${e.monitor.name} 복구${dur}`;
      return { subject: `[UP] ${e.monitor.name} 복구`, text: line + link(e.monitor.id) };
    }
    case "test":
      return {
        subject: "[테스트] 알림 채널 확인",
        text: `🔔 [테스트] '${e.channelName}' 채널로 보낸 테스트 알림입니다 · ${timeFmt.format(e.at)}`,
      };
  }
}

/** Shows only the last 4 characters of a secret (Slack webhook URL). */
export function maskSecret(s: string): string {
  return s.length <= 4 ? "••••" : `••••${s.slice(-4)}`;
}
