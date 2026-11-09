import { describe, expect, it } from "vitest";
import { canCreateChannel, TEST_SEND_COOLDOWN_SEC, testSendWaitSec } from "./policy";

describe("canCreateChannel", () => {
  it("lets only admins create email channels", () => {
    expect(canCreateChannel("admin", "email")).toBe(true);
    expect(canCreateChannel("member", "email")).toBe(false);
  });

  it("lets everyone create Slack channels", () => {
    expect(canCreateChannel("admin", "slack")).toBe(true);
    expect(canCreateChannel("member", "slack")).toBe(true);
  });
});

describe("testSendWaitSec", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  const ago = (sec: number) => new Date(now.getTime() - sec * 1000);

  it("is 0 when the channel was never test-sent", () => {
    expect(testSendWaitSec(null, now)).toBe(0);
  });

  it("counts down the cooldown, rounding up", () => {
    expect(testSendWaitSec(ago(0), now)).toBe(TEST_SEND_COOLDOWN_SEC);
    expect(testSendWaitSec(ago(10), now)).toBe(TEST_SEND_COOLDOWN_SEC - 10);
    expect(testSendWaitSec(new Date(now.getTime() - 59_500), now)).toBe(1);
  });

  it("is 0 once the cooldown has passed", () => {
    expect(testSendWaitSec(ago(TEST_SEND_COOLDOWN_SEC), now)).toBe(0);
    expect(testSendWaitSec(ago(3600), now)).toBe(0);
  });

  it("never waits longer than one cooldown, even for a timestamp in the future", () => {
    expect(testSendWaitSec(new Date(now.getTime() + 5000), now)).toBe(TEST_SEND_COOLDOWN_SEC);
  });
});
