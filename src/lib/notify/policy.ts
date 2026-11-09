// Who may do what with alert channels, and how often a channel can be test-sent.
// Pure, shared by the web actions and the page. No Next/React imports.

/** Minimum seconds between "테스트 발송" clicks on the same channel. */
export const TEST_SEND_COOLDOWN_SEC = 60;

/**
 * Email channels send mail from the team's SMTP account to any address, so only
 * admins may create them. Members can still create Slack channels (the webhook
 * host is restricted to hooks.slack.com) and use, switch off or delete any channel.
 */
export function canCreateChannel(role: "admin" | "member", type: "slack" | "email"): boolean {
  return type !== "email" || role === "admin";
}

export const EMAIL_CHANNEL_ADMIN_ONLY_MESSAGE = "이메일 채널은 관리자만 추가할 수 있습니다. 관리자에게 요청하세요.";

/** Whole seconds left before the channel can be test-sent again (0 = now). */
export function testSendWaitSec(lastTestAt: Date | null, now: Date = new Date()): number {
  if (!lastTestAt) return 0;
  const elapsedMs = now.getTime() - lastTestAt.getTime();
  // Clamped so a clock that jumped backwards can't lock a channel for longer than one cooldown.
  return Math.min(TEST_SEND_COOLDOWN_SEC, Math.max(0, Math.ceil((TEST_SEND_COOLDOWN_SEC * 1000 - elapsedMs) / 1000)));
}
