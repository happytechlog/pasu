import { describe, expect, it } from "vitest";
import { matchesExpectedStatus, normalizeExpectedStatus, parseExpectedStatus } from "./expected-status";

describe("parseExpectedStatus", () => {
  it.each(["", " , ", "2x", "600", "099", "20", "abc", "2xx,foo", "6xx"])("rejects %j", (spec) => {
    expect(parseExpectedStatus(spec)).toBeNull();
  });

  it("parses classes and exact codes", () => {
    expect(parseExpectedStatus(" 2XX , 301 ")).toEqual([
      { kind: "class", digit: 2 },
      { kind: "exact", code: 301 },
    ]);
  });
});

describe("normalizeExpectedStatus", () => {
  it.each([
    ["2xx", "2xx"],
    [" 2XX ,200, 2xx ", "2xx,200"],
    ["200,,404", "200,404"],
  ])("%j → %j", (input, expected) => {
    expect(normalizeExpectedStatus(input)).toBe(expected);
  });

  it("returns null for invalid input", () => {
    expect(normalizeExpectedStatus("2xx,999")).toBeNull();
  });
});

describe("matchesExpectedStatus", () => {
  it.each([
    ["2xx", 200, true],
    ["2xx", 299, true],
    ["2xx", 301, false],
    ["200,301", 301, true],
    ["200,301", 302, false],
    ["2xx,3xx", 304, true],
    ["404", 404, true],
  ])("%s matches %i → %s", (spec, code, expected) => {
    expect(matchesExpectedStatus(spec, code)).toBe(expected);
  });

  it("falls back to 2xx for an invalid stored spec", () => {
    expect(matchesExpectedStatus("garbage", 204)).toBe(true);
    expect(matchesExpectedStatus("garbage", 500)).toBe(false);
  });
});
