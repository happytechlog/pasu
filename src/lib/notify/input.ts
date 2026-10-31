import { z } from "zod";

// Form schema for alert channels ("/settings/alerts").

/**
 * Only Slack incoming-webhook URLs are accepted. The web server POSTs to this
 * URL on "테스트 발송", so restricting the host also keeps the form from being
 * used to make requests to arbitrary (e.g. internal) addresses.
 */
export function isSlackWebhookUrl(v: string): boolean {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  return u.protocol === "https:" && u.hostname === "hooks.slack.com" && u.pathname.startsWith("/services/") && !u.username && !u.password;
}

const name = z.string().trim().min(1, "이름을 입력하세요.").max(50, "이름은 50자 이하로 입력하세요.");

export const channelInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("slack"),
    name,
    target: z
      .string()
      .trim()
      .refine(isSlackWebhookUrl, "Slack Incoming Webhook URL(https://hooks.slack.com/services/…)을 입력하세요."),
  }),
  z.object({
    type: z.literal("email"),
    name,
    target: z.string().trim().toLowerCase().pipe(z.email("올바른 이메일 주소를 입력하세요.")),
  }),
], { error: "알림 종류를 선택하세요." });

export type ChannelInput = z.infer<typeof channelInputSchema>;
