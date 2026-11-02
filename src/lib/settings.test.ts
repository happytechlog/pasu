import { describe, expect, it } from "vitest";
import { alertTimeZoneInputSchema, retentionInputSchema } from "./settings";

describe("retentionInputSchema", () => {
  it("accepts whole days within 7..365 from form strings", () => {
    expect(retentionInputSchema.parse({ checkRetentionDays: "30" })).toEqual({ checkRetentionDays: 30 });
    expect(retentionInputSchema.parse({ checkRetentionDays: "7" }).checkRetentionDays).toBe(7);
    expect(retentionInputSchema.parse({ checkRetentionDays: "365" }).checkRetentionDays).toBe(365);
  });

  it("rejects out of range, fractional and non-numeric values", () => {
    for (const v of ["6", "366", "10.5", "abc", "", "-30"]) {
      expect(retentionInputSchema.safeParse({ checkRetentionDays: v }).success, v).toBe(false);
    }
  });
});

describe("alertTimeZoneInputSchema", () => {
  it("accepts IANA zones and canonicalizes their spelling", () => {
    expect(alertTimeZoneInputSchema.parse({ alertTimeZone: "America/Los_Angeles" })).toEqual({
      alertTimeZone: "America/Los_Angeles",
    });
    expect(alertTimeZoneInputSchema.parse({ alertTimeZone: "asia/seoul" }).alertTimeZone).toBe("Asia/Seoul");
    expect(alertTimeZoneInputSchema.parse({ alertTimeZone: "UTC" }).alertTimeZone).toBe("UTC");
  });

  it("rejects unknown or missing zones", () => {
    for (const v of ["Mars/Base", "", null, "x".repeat(65)]) {
      expect(alertTimeZoneInputSchema.safeParse({ alertTimeZone: v }).success, String(v)).toBe(false);
    }
  });
});
