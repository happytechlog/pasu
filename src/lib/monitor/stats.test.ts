import { describe, expect, it } from "vitest";
import {
  bucketStart,
  fillBuckets,
  formatDuration,
  formatUptime,
  parseRange,
  sslDaysLeft,
  uptimePercent,
} from "./stats";

describe("uptimePercent / formatUptime", () => {
  it("no checks → null → —", () => {
    expect(uptimePercent(0, 0)).toBeNull();
    expect(formatUptime(null)).toBe("—");
  });

  it("formats with up to 2 decimals and never rounds up to 100%", () => {
    expect(formatUptime(uptimePercent(10, 10))).toBe("100%");
    expect(formatUptime(uptimePercent(9999, 10000))).toBe("99.99%");
    expect(formatUptime(uptimePercent(99999, 100000))).toBe("99.99%");
    expect(formatUptime(uptimePercent(1, 2))).toBe("50%");
    expect(formatUptime(uptimePercent(1, 3))).toBe("33.33%");
    expect(formatUptime(uptimePercent(0, 5))).toBe("0%");
    expect(formatUptime(99.5)).toBe("99.5%");
  });
});

describe("parseRange", () => {
  it("accepts known ranges, defaults to 24h", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("30d")).toBe("30d");
    expect(parseRange("1y")).toBe("24h");
    expect(parseRange(undefined)).toBe("24h");
    expect(parseRange(["7d"])).toBe("24h");
  });
});

describe("bucketStart / fillBuckets", () => {
  const H = 3600_000;

  it("aligns 6h buckets to KST midnight", () => {
    // 2026-10-31 13:20 KST → 12:00 KST bucket
    expect(bucketStart(new Date("2026-10-31T13:20:00+09:00"), 6 * H).toISOString()).toBe(
      new Date("2026-10-31T12:00:00+09:00").toISOString(),
    );
  });

  it("fills missing buckets with zero totals and keeps existing rows", () => {
    const now = new Date("2026-10-31T03:30:00Z");
    const existing = { bucket: new Date("2026-10-31T02:00:00Z"), total: 60, failed: 1, avgMs: 120 };
    const out = fillBuckets([existing], now, 3 * H, H);
    expect(out.map((b) => b.bucket.toISOString())).toEqual([
      "2026-10-31T00:00:00.000Z",
      "2026-10-31T01:00:00.000Z",
      "2026-10-31T02:00:00.000Z",
      "2026-10-31T03:00:00.000Z",
    ]);
    expect(out[2]).toBe(existing);
    expect(out[0]).toEqual({ bucket: new Date("2026-10-31T00:00:00Z"), total: 0, failed: 0, avgMs: null });
  });
});

describe("sslDaysLeft", () => {
  const now = new Date("2026-10-31T00:00:00Z");
  it("floors whole days, null when unknown, negative when expired", () => {
    expect(sslDaysLeft(null, now)).toBeNull();
    expect(sslDaysLeft(new Date("2026-11-14T12:00:00Z"), now)).toBe(14);
    expect(sslDaysLeft(new Date("2026-10-31T23:00:00Z"), now)).toBe(0);
    expect(sslDaysLeft(new Date("2026-10-30T12:00:00Z"), now)).toBe(-1);
  });
});

describe("formatDuration", () => {
  it("formats minutes, hours and days", () => {
    expect(formatDuration(45_000)).toBe("1분 미만");
    expect(formatDuration(12 * 60_000)).toBe("12분");
    expect(formatDuration(60 * 60_000)).toBe("1시간");
    expect(formatDuration(185 * 60_000)).toBe("3시간 5분");
    expect(formatDuration((2 * 1440 + 3 * 60 + 7) * 60_000)).toBe("2일 3시간");
    expect(formatDuration(1440 * 60_000)).toBe("1일");
  });
});
