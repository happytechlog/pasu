import { describe, expect, it } from "vitest";
import { settingsInputSchema } from "./settings";

describe("settingsInputSchema", () => {
  it("accepts whole days within 7..365 from form strings", () => {
    expect(settingsInputSchema.parse({ checkRetentionDays: "30" })).toEqual({ checkRetentionDays: 30 });
    expect(settingsInputSchema.parse({ checkRetentionDays: "7" }).checkRetentionDays).toBe(7);
    expect(settingsInputSchema.parse({ checkRetentionDays: "365" }).checkRetentionDays).toBe(365);
  });

  it("rejects out of range, fractional and non-numeric values", () => {
    for (const v of ["6", "366", "10.5", "abc", "", "-30"]) {
      expect(settingsInputSchema.safeParse({ checkRetentionDays: v }).success, v).toBe(false);
    }
  });
});
