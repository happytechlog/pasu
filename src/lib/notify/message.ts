// Alert text formatting. Pure: no I/O. Shared by the worker and the web
// ("테스트 발송").
//
// Times: email text uses the team's alert time zone with a zone label
// ("14:03 KST"). Slack uses <!date^…> tokens, which Slack renders in each
// reader's own time zone; the alert time zone is only the token's fallback.

import { formatDuration } from "../monitor/stats";
import { dateTimeFormat, DEFAULT_TIME_ZONE, timeZoneLabel } from "../timezone";

export type AlertMonitor = { id: string; name: string; url: string };

export type AlertEvent =
  | { kind: "down"; monitor: AlertMonitor; reason: string | null; at: Date }
  | { kind: "recovered"; monitor: AlertMonitor; downtimeMs: number | null; at: Date }
  | { kind: "ssl"; monitor: AlertMonitor; expiresAt: Date; daysLeft: number; at: Date }
  | { kind: "test"; channelName: string; at: Date };

export type MonitorAlertEvent = Exclude<AlertEvent, { kind: "test" }>;

type SlackBlock = Record<string, unknown>;

/** Slack incoming-webhook body (minus username/icon, added at send time). */
export type SlackPayload = {
  /** Notification / fallback text. */
  text: string;
  blocks: SlackBlock[];
  attachments: { color: string; blocks: SlackBlock[] }[];
};

/** `text` is used for email; Slack gets the richer `slack` payload. */
export type AlertMessage = { subject: string; text: string; slack: SlackPayload };

/** Formatting for one alert's time zone. */
function zoneFormats(tz: string) {
  return {
    // YYYY-MM-DD HH:mm:ss
    dateTime: dateTimeFormat("sv-SE", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23", // not hour12:false, which can print midnight as "24:05"
    }),
    // HH:mm
    time: dateTimeFormat("ko-KR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    // YYYY-MM-DD
    date: dateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }),
    label: (at: Date) => timeZoneLabel(tz, at),
  };
}

/**
 * Slack date token: shown in the reader's time zone (and 12/24h preference).
 * `fallback` is used by clients that can't render it, e.g. notifications.
 */
export function slackDate(at: Date, format: string, fallback: string): string {
  return `<!date^${Math.floor(at.getTime() / 1000)}^${format}|${slackEscape(fallback).replace(/\|/g, "¦")}>`;
}

const SLACK_COLORS = { down: "#E01E5A", up: "#2EB67D", warn: "#ECB22E", info: "#8D8D8D" } as const;

/** Escapes user text for Slack mrkdwn. */
export function slackEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slackLink(url: string, label?: string): string {
  const u = url.replace(/&/g, "&amp;").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/\|/g, "%7C");
  return label ? `<${u}|${slackEscape(label).replace(/\|/g, "¦")}>` : `<${u}>`;
}

function slackCode(s: string): string {
  return "`" + slackEscape(s).replace(/`/g, "'") + "`";
}

// The failure reason comes from the monitored server (error text, status
// line), so its length is not ours to control.
const MAX_REASON_LENGTH = 300;
// Slack rejects the whole message (400 invalid_blocks) if a section's text is longer.
const SLACK_SECTION_MAX = 3000;

// Counts UTF-16 units (String#length), the stricter way to measure, and never
// cuts an emoji's surrogate pair in half.
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  let cut = max - 1;
  const last = s.charCodeAt(cut - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut--; // high surrogate without its low half
  return s.slice(0, cut) + "…";
}

/**
 * Title line, then a colored attachment with "label: value" lines and an
 * optional link button (like UptimeRobot's alerts). Values must already be
 * mrkdwn-safe.
 */
function slackMessage(o: {
  fallback: string;
  title: string;
  color: string;
  fields: [label: string, value: string][];
  button?: { text: string; url: string };
}): SlackPayload {
  const details: SlackBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: truncate(o.fields.map(([k, v]) => `*${k}:* ${v}`).join("\n"), SLACK_SECTION_MAX) },
    },
  ];
  if (o.button) {
    details.push({
      type: "actions",
      elements: [{ type: "button", text: { type: "plain_text", text: o.button.text }, url: o.button.url, style: "primary" }],
    });
  }
  return {
    text: slackEscape(o.fallback),
    blocks: [{ type: "section", text: { type: "mrkdwn", text: truncate(o.title, SLACK_SECTION_MAX) } }],
    attachments: [{ color: o.color, blocks: details }],
  };
}

export type FormatOptions = {
  /** e.g. http://localhost:3000: adds a link to the monitor's dashboard page ("모니터 보기" in Slack). */
  appUrl?: string;
  /** IANA zone for email times and Slack fallbacks. Default Asia/Seoul. */
  timeZone?: string;
};

/**
 * Builds the alert. Email text:
 *   🔴 [DOWN] API 서버 — https://api.example.com · 원인: HTTP 503 · 14:03 KST 감지
 *   🟢 [UP] API 서버 복구 — 다운 시간 12분
 *   ⚠️ [SSL] API 서버 — 인증서가 7일 후 만료됩니다 (2026-11-07)
 */
export function formatAlert(e: AlertEvent, { appUrl, timeZone = DEFAULT_TIME_ZONE }: FormatOptions = {}): AlertMessage {
  const f = zoneFormats(timeZone);
  const clock = (d: Date) => `${f.time.format(d)} ${f.label(d)}`; // "14:03 KST"
  const base = appUrl?.replace(/\/+$/, "");
  const monitorPage = (id: string) => (base ? `${base}/monitors/${id}` : null);
  const link = (id: string) => (base ? `\n${monitorPage(id)}` : "");
  const button = (id: string) => {
    const url = monitorPage(id);
    return url ? { text: "모니터 보기", url } : undefined;
  };
  const at = `_${slackDate(e.at, "{date_num} {time_secs}", `${f.dateTime.format(e.at)} ${f.label(e.at)}`)}_`;

  switch (e.kind) {
    case "down": {
      const reason = truncate(e.reason ?? "알 수 없음", MAX_REASON_LENGTH);
      const line = `🔴 [DOWN] ${e.monitor.name} — ${e.monitor.url} · 원인: ${reason} · ${clock(e.at)} 감지`;
      return {
        subject: `[DOWN] ${e.monitor.name}`,
        text: line + link(e.monitor.id),
        slack: slackMessage({
          fallback: `🔴 장애 발생: ${e.monitor.name} — ${reason}`,
          title: `🔴 *장애 발생: ${slackLink(e.monitor.url, e.monitor.name)}*`,
          color: SLACK_COLORS.down,
          fields: [
            ["감지 시각", at],
            ["확인한 URL", slackLink(e.monitor.url)],
            ["원인", slackCode(reason)],
          ],
          button: button(e.monitor.id),
        }),
      };
    }
    case "recovered": {
      const duration = e.downtimeMs !== null ? formatDuration(e.downtimeMs) : null;
      const line = `🟢 [UP] ${e.monitor.name} 복구${duration ? ` — 다운 시간 ${duration}` : ""}`;
      return {
        subject: `[UP] ${e.monitor.name} 복구`,
        text: line + link(e.monitor.id),
        slack: slackMessage({
          fallback: `🟢 복구됨: ${e.monitor.name}${duration ? ` — 다운 시간 ${duration}` : ""}`,
          title: `🟢 *복구됨: ${slackLink(e.monitor.url, e.monitor.name)}*`,
          color: SLACK_COLORS.up,
          fields: [
            ["복구 시각", at],
            ["확인한 URL", slackLink(e.monitor.url)],
            ...(duration ? [["다운 시간", duration] as [string, string]] : []),
          ],
          button: button(e.monitor.id),
        }),
      };
    }
    case "ssl": {
      const date = f.date.format(e.expiresAt);
      const expired = e.daysLeft < 0;
      const when = expired ? "인증서가 만료되었습니다" : e.daysLeft === 0 ? "인증서가 24시간 안에 만료됩니다" : `인증서가 ${e.daysLeft}일 후 만료됩니다`;
      const left = expired ? "만료됨" : e.daysLeft === 0 ? "24시간 이내" : `${e.daysLeft}일`;
      const heading = expired ? "SSL 인증서 만료됨" : "SSL 인증서 만료 예정";
      return {
        subject: `[SSL] ${e.monitor.name} ${expired ? "인증서 만료됨" : "인증서 만료 예정"}`,
        text: `⚠️ [SSL] ${e.monitor.name} — ${when} (${date})` + link(e.monitor.id),
        slack: slackMessage({
          fallback: `⚠️ ${heading}: ${e.monitor.name} — ${when}`,
          title: `⚠️ *${heading}: ${slackLink(e.monitor.url, e.monitor.name)}*`,
          color: expired ? SLACK_COLORS.down : SLACK_COLORS.warn,
          fields: [
            ["만료일", slackDate(e.expiresAt, "{date_num}", date)],
            ["남은 기간", left],
            ["확인한 URL", slackLink(e.monitor.url)],
          ],
          button: button(e.monitor.id),
        }),
      };
    }
    case "test":
      return {
        subject: "[테스트] 알림 채널 확인",
        text: `🔔 [테스트] '${e.channelName}' 채널로 보낸 테스트 알림입니다 · ${clock(e.at)}`,
        slack: slackMessage({
          fallback: `🔔 테스트 알림: ${e.channelName}`,
          title: "🔔 *테스트 알림* — 이 채널로 알림이 정상 전달됩니다",
          color: SLACK_COLORS.info,
          fields: [
            ["알림 채널", slackEscape(e.channelName)],
            ["보낸 시각", at],
          ],
        }),
      };
  }
}

/** Shows only the last 4 characters of a secret (Slack webhook URL). */
export function maskSecret(s: string): string {
  return s.length <= 4 ? "••••" : `••••${s.slice(-4)}`;
}
