import { describe, expect, it } from "vitest";
import { channelInputSchema, isSlackWebhookUrl } from "./input";
import { formatAlert, maskSecret } from "./message";

const monitor = { id: "m1", name: "API 서버", url: "https://api.example.com" };
const at = new Date("2026-10-31T05:03:00Z"); // 14:03 KST

describe("formatAlert", () => {
  it("down: name, url, reason, KST detection time, dashboard link", () => {
    const m = formatAlert({ kind: "down", monitor, reason: "HTTP 503", at }, "http://localhost:3000/");
    expect(m.subject).toBe("[DOWN] API 서버");
    expect(m.text).toBe(
      "🔴 [DOWN] API 서버 — https://api.example.com · 원인: HTTP 503 · 14:03 감지\nhttp://localhost:3000/monitors/m1",
    );
  });

  it("down without reason or app url", () => {
    expect(formatAlert({ kind: "down", monitor, reason: null, at }).text).toBe(
      "🔴 [DOWN] API 서버 — https://api.example.com · 원인: 알 수 없음 · 14:03 감지",
    );
  });

  it("recovered: downtime, or none when unknown", () => {
    expect(formatAlert({ kind: "recovered", monitor, downtimeMs: 12 * 60_000, at }).text).toBe("🟢 [UP] API 서버 복구 — 다운 시간 12분");
    expect(formatAlert({ kind: "recovered", monitor, downtimeMs: null, at }).text).toBe("🟢 [UP] API 서버 복구");
    expect(formatAlert({ kind: "recovered", monitor, downtimeMs: 0, at }).subject).toBe("[UP] API 서버 복구");
  });

  it("test message names the channel", () => {
    expect(formatAlert({ kind: "test", channelName: "운영팀", at }).text).toContain("'운영팀' 채널");
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
