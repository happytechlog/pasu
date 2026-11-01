import { describe, expect, it } from "vitest";
import { statusPageInputSchema } from "./input";

const id = "8f0b6c3e-2a1d-4c5e-9f7a-1b2c3d4e5f60";

describe("statusPageInputSchema", () => {
  it("trims and lowercases the slug", () => {
    expect(statusPageInputSchema.parse({ title: " 서비스 상태 ", slug: " Acme-Status ", monitorIds: [id] })).toEqual({
      title: "서비스 상태",
      slug: "acme-status",
      monitorIds: [id],
    });
  });

  it("rejects bad slugs", () => {
    for (const slug of ["", "-a", "a-", "a b", "상태", "a/b", "a".repeat(41), "../x"]) {
      expect(statusPageInputSchema.safeParse({ title: "t", slug, monitorIds: [] }).success, slug).toBe(false);
    }
    expect(statusPageInputSchema.safeParse({ title: "t", slug: "a", monitorIds: [] }).success).toBe(true);
  });

  it("requires a title and valid monitor ids", () => {
    expect(statusPageInputSchema.safeParse({ title: " ", slug: "a", monitorIds: [] }).success).toBe(false);
    expect(statusPageInputSchema.safeParse({ title: "t", slug: "a", monitorIds: ["nope"] }).success).toBe(false);
  });
});
