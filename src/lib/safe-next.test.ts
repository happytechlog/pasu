import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it.each([
    ["/settings/users", "/settings/users"],
    ["/monitors/1?tab=7d", "/monitors/1?tab=7d"],
    ["/", "/"],
  ])("keeps relative path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    ["https://evil.com"],
    ["//evil.com"],
    ["/\\evil.com"],
    ["/\tevil"],
    ["javascript:alert(1)"],
    [""],
    [null],
    [undefined],
  ])("rejects %s", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });
});
