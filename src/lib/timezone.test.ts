import { describe, expect, it } from "vitest";
import { allTimeZones, normalizeTimeZone, timeZoneLabel, timeZoneOffset } from "./timezone";

describe("normalizeTimeZone", () => {
  it("returns the canonical IANA name, or null for unknown input", () => {
    expect(normalizeTimeZone("America/Los_Angeles")).toBe("America/Los_Angeles");
    expect(normalizeTimeZone("asia/seoul")).toBe("Asia/Seoul");
    expect(normalizeTimeZone("UTC")).toBe("UTC");
    for (const v of ["Mars/Base", "", undefined, 42, "x".repeat(65)]) expect(normalizeTimeZone(v), String(v)).toBeNull();
  });
});

describe("timeZoneLabel / timeZoneOffset", () => {
  const summer = new Date("2026-10-31T12:00:00Z"); // LA still on PDT
  const winter = new Date("2026-11-02T12:00:00Z"); // DST ended 2026-11-01

  it("labels Seoul as KST and follows DST elsewhere", () => {
    expect(timeZoneLabel("Asia/Seoul", summer)).toBe("KST");
    expect(timeZoneLabel("America/Los_Angeles", summer)).toBe("PDT");
    expect(timeZoneLabel("America/Los_Angeles", winter)).toBe("PST");
    expect(timeZoneLabel("UTC", winter)).toBe("UTC");
  });

  it("gives GMT offsets", () => {
    expect(timeZoneOffset("Asia/Seoul", winter)).toBe("GMT+9");
    expect(timeZoneOffset("America/Los_Angeles", summer)).toBe("GMT-7");
    expect(timeZoneOffset("America/Los_Angeles", winter)).toBe("GMT-8");
  });
});

describe("allTimeZones", () => {
  it("includes UTC and common zones exactly once", () => {
    const zones = allTimeZones();
    for (const z of ["UTC", "Asia/Seoul", "America/Los_Angeles"]) expect(zones.filter((x) => x === z)).toHaveLength(1);
  });
});
