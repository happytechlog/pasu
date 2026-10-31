import { describe, expect, it } from "vitest";
import { monitorInputSchema } from "./input";

const valid = {
  name: " API 서버 ",
  url: " https://api.example.com/health ",
  intervalSec: "60",
  method: "GET",
  timeoutSec: "10",
  expectedStatus: "2XX, 301",
  channelIds: [],
};

describe("monitorInputSchema", () => {
  it("accepts and normalizes valid input", () => {
    const r = monitorInputSchema.parse(valid);
    expect(r).toEqual({
      name: "API 서버",
      url: "https://api.example.com/health",
      intervalSec: 60,
      method: "GET",
      timeoutSec: 10,
      expectedStatus: "2xx,301",
      channelIds: [],
    });
  });

  it("allows localhost http URLs (dev test routes)", () => {
    expect(monitorInputSchema.safeParse({ ...valid, url: "http://localhost:3000/api/test/fail" }).success).toBe(true);
  });

  it.each([
    ["name", ""],
    ["url", "example.com"],
    ["url", "ftp://example.com"],
    ["url", "javascript:alert(1)"],
    ["intervalSec", "120"],
    ["method", "POST"],
    ["timeoutSec", "0"],
    ["timeoutSec", "31"],
    ["timeoutSec", "1.5"],
    ["timeoutSec", "abc"],
    ["expectedStatus", "ok"],
  ])("rejects %s=%j", (field, value) => {
    const r = monitorInputSchema.safeParse({ ...valid, [field]: value });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual([field]);
  });

  it("rejects non-uuid channel ids", () => {
    expect(monitorInputSchema.safeParse({ ...valid, channelIds: ["x"] }).success).toBe(false);
  });
});
