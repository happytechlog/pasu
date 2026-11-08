import { describe, expect, it } from "vitest";
import { channelInputSchema, isSlackWebhookUrl } from "./input";
import { formatAlert, maskSecret } from "./message";

const monitor = { id: "m1", name: "API 서버", url: "https://api.example.com" };
const at = new Date("2026-10-31T05:03:00Z"); // 14:03 KST

describe("formatAlert", () => {
  it("down: name, url, reason, detection time with zone label, dashboard link", () => {
    const m = formatAlert({ kind: "down", monitor, reason: "HTTP 503", at }, { appUrl: "http://localhost:3000/" });
    expect(m.subject).toBe("[DOWN] API 서버");
    expect(m.text).toBe(
      "🔴 [DOWN] API 서버 — https://api.example.com · 원인: HTTP 503 · 14:03 KST 감지\nhttp://localhost:3000/monitors/m1",
    );
  });

  it("down without reason or app url", () => {
    expect(formatAlert({ kind: "down", monitor, reason: null, at }).text).toBe(
      "🔴 [DOWN] API 서버 — https://api.example.com · 원인: 알 수 없음 · 14:03 KST 감지",
    );
  });

  it("recovered: downtime, or none when unknown", () => {
    expect(formatAlert({ kind: "recovered", monitor, downtimeMs: 12 * 60_000, at }).text).toBe("🟢 [UP] API 서버 복구 — 다운 시간 12분");
    expect(formatAlert({ kind: "recovered", monitor, downtimeMs: null, at }).text).toBe("🟢 [UP] API 서버 복구");
    expect(formatAlert({ kind: "recovered", monitor, downtimeMs: 0, at }).subject).toBe("[UP] API 서버 복구");
  });

  it("ssl: days left, expiring within a day, expired; KST date", () => {
    const expiresAt = new Date("2026-11-06T20:00:00Z"); // 2026-11-07 05:00 KST
    const soon = formatAlert({ kind: "ssl", monitor, expiresAt, daysLeft: 7, at }, { appUrl: "http://localhost:3000" });
    expect(soon.subject).toBe("[SSL] API 서버 인증서 만료 예정");
    expect(soon.text).toBe("⚠️ [SSL] API 서버 — 인증서가 7일 후 만료됩니다 (2026-11-07)\nhttp://localhost:3000/monitors/m1");
    expect(formatAlert({ kind: "ssl", monitor, expiresAt, daysLeft: 0, at }).text).toContain("24시간 안에 만료됩니다");
    const expired = formatAlert({ kind: "ssl", monitor, expiresAt, daysLeft: -3, at });
    expect(expired.subject).toBe("[SSL] API 서버 인증서 만료됨");
    expect(expired.text).toBe("⚠️ [SSL] API 서버 — 인증서가 만료되었습니다 (2026-11-07)");
  });

  it("uses the given time zone, with DST-aware labels", () => {
    const la = { timeZone: "America/Los_Angeles" };
    expect(formatAlert({ kind: "down", monitor, reason: null, at }, la).text).toContain("· 22:03 PDT 감지");
    const expiresAt = new Date("2026-11-06T20:00:00Z"); // 12:00 PST, after DST ends
    expect(formatAlert({ kind: "ssl", monitor, expiresAt, daysLeft: 7, at }, la).text).toContain("(2026-11-06)");
    expect(formatAlert({ kind: "test", channelName: "a", at: expiresAt }, la).text).toContain("· 12:00 PST");
    expect(formatAlert({ kind: "test", channelName: "a", at }, { timeZone: "UTC" }).text).toContain("· 05:03 UTC");
  });

  it("test message names the channel", () => {
    expect(formatAlert({ kind: "test", channelName: "운영팀", at }).text).toContain("'운영팀' 채널");
  });

  it("midnight reads 00:05, never 24:05", () => {
    const midnight = new Date("2026-10-30T15:05:09Z"); // 00:05:09 KST on the 31st
    const m = formatAlert({ kind: "down", monitor, reason: null, at: midnight });
    expect(m.text).toContain("· 00:05 KST 감지");
    expect(m.text).not.toContain("24:05");
    expect(JSON.stringify(m.slack)).toContain("2026-10-31 00:05:09 KST");
  });

  it("truncates a long failure reason in the email text and the Slack code span", () => {
    const reason = "x".repeat(5000);
    const m = formatAlert({ kind: "down", monitor, reason, at });
    expect(m.text).toContain(`원인: ${"x".repeat(299)}… ·`);
    expect(m.text.length).toBeLessThan(600);
    expect(JSON.stringify(m.slack)).toContain("`" + "x".repeat(299) + "…`");
  });

  it("does not split an emoji when truncating", () => {
    const m = formatAlert({ kind: "down", monitor, reason: "😀".repeat(400), at });
    expect(m.text).toContain(`원인: ${"😀".repeat(149)}… ·`);
  });

  it("keeps every Slack section within Slack's 3000-character limit", () => {
    // Escaping turns each "&" into "&amp;", so even a valid 2000-char URL can overflow.
    const url = `https://example.com/?${"a=1&".repeat(490)}`;
    const { slack } = formatAlert(
      { kind: "down", monitor: { id: "m1", name: "N".repeat(100), url }, reason: "&".repeat(5000), at },
      { appUrl: "http://localhost:3000" },
    );
    const sections = [...slack.blocks, ...slack.attachments.flatMap((a) => a.blocks)].filter((b) => b.type === "section");
    expect(sections.length).toBe(2);
    for (const s of sections) {
      expect((s.text as { text: string }).text.length).toBeLessThanOrEqual(3000);
    }
  });
});

describe("formatAlert slack payload", () => {
  it("down: title, red attachment with details and a monitor button", () => {
    const { slack } = formatAlert({ kind: "down", monitor, reason: "HTTP 503", at }, { appUrl: "http://localhost:3000" });
    expect(slack.text).toBe("🔴 장애 발생: API 서버 — HTTP 503");
    expect(slack.blocks).toEqual([
      { type: "section", text: { type: "mrkdwn", text: "🔴 *장애 발생: <https://api.example.com|API 서버>*" } },
    ]);
    expect(slack.attachments).toEqual([
      {
        color: "#E01E5A",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*감지 시각:* _<!date^1793422980^{date_num} {time_secs}|2026-10-31 14:03:00 KST>_\n*확인한 URL:* <https://api.example.com>\n*원인:* `HTTP 503`",
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "모니터 보기" },
                url: "http://localhost:3000/monitors/m1",
                style: "primary",
              },
            ],
          },
        ],
      },
    ]);
  });

  it("escapes user text and omits the button without an app url", () => {
    const evil = { id: "m2", name: "<!channel> A|B & C", url: "https://x.example.com/?a=1&b=2" };
    const { slack } = formatAlert({ kind: "down", monitor: evil, reason: "bad `code` <x>", at });
    const title = (slack.blocks[0] as { text: { text: string } }).text.text;
    expect(title).toBe("🔴 *장애 발생: <https://x.example.com/?a=1&amp;b=2|&lt;!channel&gt; A¦B &amp; C>*");
    expect(slack.text).not.toContain("<!channel>");
    const details = slack.attachments[0].blocks;
    expect(details).toHaveLength(1);
    expect((details[0] as { text: { text: string } }).text.text).toContain("*원인:* `bad 'code' &lt;x&gt;`");
  });

  it("times are Slack date tokens with the alert time zone as fallback", () => {
    const { slack } = formatAlert({ kind: "test", channelName: "a", at }, { timeZone: "America/Los_Angeles" });
    expect(JSON.stringify(slack)).toContain("*보낸 시각:* _<!date^1793422980^{date_num} {time_secs}|2026-10-30 22:03:00 PDT>_");
  });

  it("recovered: green, with downtime when known", () => {
    const { slack } = formatAlert({ kind: "recovered", monitor, downtimeMs: 12 * 60_000, at });
    expect(slack.attachments[0].color).toBe("#2EB67D");
    expect(JSON.stringify(slack)).toContain("*다운 시간:* 12분");
    const unknown = formatAlert({ kind: "recovered", monitor, downtimeMs: null, at }).slack;
    expect(JSON.stringify(unknown)).not.toContain("다운 시간");
  });

  it("ssl: amber while expiring, red once expired", () => {
    const expiresAt = new Date("2026-11-06T20:00:00Z");
    const soon = formatAlert({ kind: "ssl", monitor, expiresAt, daysLeft: 7, at }).slack;
    expect(soon.attachments[0].color).toBe("#ECB22E");
    expect(JSON.stringify(soon)).toContain("*만료일:* <!date^1793995200^{date_num}|2026-11-07>\\n*남은 기간:* 7일");
    const expired = formatAlert({ kind: "ssl", monitor, expiresAt, daysLeft: -1, at }).slack;
    expect(expired.attachments[0].color).toBe("#E01E5A");
    expect(expired.text).toContain("SSL 인증서 만료됨");
  });
});

describe("maskSecret", () => {
  it("keeps only the last 4 characters", () => {
    expect(maskSecret("https://hooks.slack.com/services/T0/B0/abcdWXYZ")).toBe("••••WXYZ");
    expect(maskSecret("abc")).toBe("••••");
  });
});

describe("channel input", () => {
  it("accepts only https hooks.slack.com/services URLs", () => {
    expect(isSlackWebhookUrl("https://hooks.slack.com/services/T0/B0/xyz")).toBe(true);
    expect(isSlackWebhookUrl("http://hooks.slack.com/services/T0/B0/xyz")).toBe(false);
    expect(isSlackWebhookUrl("https://hooks.slack.com.evil.com/services/x")).toBe(false);
    expect(isSlackWebhookUrl("https://user:pw@hooks.slack.com/services/x")).toBe(false);
    expect(isSlackWebhookUrl("https://localhost/services/x")).toBe(false);
    expect(isSlackWebhookUrl("not a url")).toBe(false);
  });

  it("validates by type and normalizes email", () => {
    expect(channelInputSchema.parse({ type: "email", name: " 운영 ", target: " Ops@Example.COM " })).toEqual({
      type: "email",
      name: "운영",
      target: "ops@example.com",
    });
    expect(channelInputSchema.safeParse({ type: "email", name: "a", target: "nope" }).success).toBe(false);
    expect(channelInputSchema.safeParse({ type: "slack", name: "a", target: "https://example.com/hook" }).success).toBe(false);
    expect(channelInputSchema.safeParse({ type: "sms", name: "a", target: "x" }).success).toBe(false);
    expect(channelInputSchema.safeParse({ type: "slack", name: "", target: "https://hooks.slack.com/services/a" }).success).toBe(false);
  });
});
