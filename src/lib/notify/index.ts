import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { alertChannels, monitorAlertChannels } from "../db/schema";
import { sendMail } from "../mail";
import { getSettings } from "../settings";
import { DEFAULT_TIME_ZONE } from "../timezone";
import { formatAlert, type AlertEvent, type AlertMessage, type MonitorAlertEvent, type SlackPayload } from "./message";

// Sending alerts. Shared lib code (worker + web "테스트 발송"): no Next/React imports.

export type Channel = { id: string; type: "slack" | "email"; name: string; target: string };

const SLACK_TIMEOUT_MS = 10_000;
// Shown as the sender instead of "incoming-webhook". Honored by legacy
// "Incoming WebHooks" integrations; Slack-app webhooks ignore it and use the
// app's own name/icon.
const SLACK_USERNAME = "PasuMonitor";
const SLACK_ICON_EMOJI = ":shield:";

function appUrl() {
  return process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/** The team's alert time zone (app_settings); the default if it can't be read. */
async function alertTimeZone(): Promise<string> {
  try {
    return (await getSettings()).alertTimeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** formatAlert with the app URL and the team's alert time zone. */
export async function buildAlert(event: AlertEvent): Promise<AlertMessage> {
  return formatAlert(event, { appUrl: appUrl(), timeZone: await alertTimeZone() });
}

export async function sendSlack(webhookUrl: string, payload: SlackPayload): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: SLACK_USERNAME, icon_emoji: SLACK_ICON_EMOJI, ...payload }),
    redirect: "error",
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 100);
    throw new Error(`Slack 응답 ${res.status}${body ? `: ${body}` : ""}`);
  }
}

export async function sendToChannel(channel: Channel, msg: AlertMessage): Promise<void> {
  if (channel.type === "slack") return sendSlack(channel.target, msg.slack);
  return sendMail({ to: channel.target, subject: `[Pasu Monitor] ${msg.subject}`, text: msg.text });
}

/** Short reason for showing a send failure to users / logs. */
export function describeSendError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError") return `시간 초과 (${SLACK_TIMEOUT_MS / 1000}초)`;
    return err.message;
  }
  return String(err);
}

export type SendResult = { channel: Channel; error: string | null };

/** Sends to all channels in parallel; never throws. */
export async function sendToChannels(channels: Channel[], msg: AlertMessage): Promise<SendResult[]> {
  const settled = await Promise.allSettled(channels.map((c) => sendToChannel(c, msg)));
  return settled.map((r, i) => ({
    channel: channels[i],
    error: r.status === "rejected" ? describeSendError(r.reason) : null,
  }));
}

/** Enabled channels linked to a monitor. */
export async function channelsForMonitor(monitorId: string): Promise<Channel[]> {
  return db
    .select({ id: alertChannels.id, type: alertChannels.type, name: alertChannels.name, target: alertChannels.target })
    .from(monitorAlertChannels)
    .innerJoin(alertChannels, eq(alertChannels.id, monitorAlertChannels.channelId))
    .where(and(eq(monitorAlertChannels.monitorId, monitorId), eq(alertChannels.enabled, true)));
}

/** Sends a down/recovered/ssl alert to the monitor's enabled channels. Never throws. */
export async function notifyMonitorEvent(event: MonitorAlertEvent): Promise<SendResult[]> {
  let channels: Channel[];
  try {
    channels = await channelsForMonitor(event.monitor.id);
  } catch (err) {
    return [{ channel: { id: "", type: "email", name: "(채널 조회)", target: "" }, error: describeSendError(err) }];
  }
  if (channels.length === 0) return [];
  return sendToChannels(channels, await buildAlert(event));
}

export { formatAlert };
