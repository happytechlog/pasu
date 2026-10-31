import { describe, expect, it } from "vitest";
import { describeSslError, isHttpsUrl, parseCertDate, sslAlertThreshold } from "./ssl";

describe("sslAlertThreshold", () => {
  it("is null while more than 14 days remain", () => {
    expect(sslAlertThreshold(15)).toBeNull();
    expect(sslAlertThreshold(90)).toBeNull();
  });

  it("picks the nearest threshold at or above daysLeft", () => {
    expect(sslAlertThreshold(14)).toBe(14);
    expect(sslAlertThreshold(8)).toBe(14);
    expect(sslAlertThreshold(7)).toBe(7);
    expect(sslAlertThreshold(5)).toBe(7);
    expect(sslAlertThreshold(2)).toBe(7);
    expect(sslAlertThreshold(1)).toBe(1);
  });

  it("treats expiring today and already expired as the 1-day threshold", () => {
    expect(sslAlertThreshold(0)).toBe(1);
    expect(sslAlertThreshold(-30)).toBe(1);
  });
});

describe("parseCertDate", () => {
  it("parses Node's valid_to format", () => {
    expect(parseCertDate("Nov  7 12:00:00 2026 GMT")?.toISOString()).toBe("2026-11-07T12:00:00.000Z");
  });
  it("returns null for missing or garbage input", () => {
    expect(parseCertDate(undefined)).toBeNull();
    expect(parseCertDate("")).toBeNull();
    expect(parseCertDate("nope")).toBeNull();
  });
});

describe("isHttpsUrl", () => {
  it("accepts only https URLs", () => {
    expect(isHttpsUrl("https://example.com")).toBe(true);
    expect(isHttpsUrl("http://example.com")).toBe(false);
    expect(isHttpsUrl("not a url")).toBe(false);
  });
});

describe("describeSslError", () => {
  it("maps socket error codes, including dual-stack AggregateErrors", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:9"), { code: "ECONNREFUSED" });
    expect(describeSslError(refused)).toBe("연결 거부됨");
    const agg = Object.assign(new AggregateError([refused], ""), { code: "ECONNREFUSED" });
    expect(describeSslError(agg)).toBe("연결 거부됨");
    expect(describeSslError(Object.assign(new Error("getaddrinfo ENOTFOUND x"), { code: "ENOTFOUND" }))).toBe("DNS 조회 실패");
  });
  it("keeps our own messages", () => {
    expect(describeSslError(new Error("시간 초과 (10초)"))).toBe("시간 초과 (10초)");
  });
});
