import { describe, expect, it, vi } from "vitest";
import { describeFetchError, runCheck, type CheckTarget } from "./check";

const target: CheckTarget = { url: "https://example.com", method: "GET", timeoutMs: 1000, expectedStatus: "2xx" };

function respond(status: number) {
  return vi.fn(async () => new Response(status === 204 || status === 304 ? null : "body", { status }));
}

// Fake clock: each call advances 42ms.
function clock() {
  let t = 0;
  return () => (t += 42);
}

describe("runCheck", () => {
  it("2xx matches the default spec", async () => {
    const f = respond(200);
    const r = await runCheck(target, f as unknown as typeof fetch, clock());
    expect(r).toEqual({ ok: true, statusCode: 200, responseTimeMs: 42, error: null });
    expect(f).toHaveBeenCalledWith("https://example.com", expect.objectContaining({ method: "GET", redirect: "follow" }));
  });

  it("non-matching status fails with HTTP code", async () => {
    const r = await runCheck(target, respond(503) as unknown as typeof fetch, clock());
    expect(r).toMatchObject({ ok: false, statusCode: 503, error: "HTTP 503" });
  });

  it("uses manual redirects when a 3xx is expected", async () => {
    const f = respond(301);
    const r = await runCheck({ ...target, method: "HEAD", expectedStatus: "301" }, f as unknown as typeof fetch, clock());
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledWith(target.url, expect.objectContaining({ method: "HEAD", redirect: "manual" }));
  });

  it("times out via AbortController", async () => {
    const hang = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const r = await runCheck({ ...target, timeoutMs: 20 }, hang as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, statusCode: null, responseTimeMs: null, error: "타임아웃 (0초)" });
  });

  it("maps network errors", async () => {
    const fail = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    });
    const r = await runCheck(target, fail as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, statusCode: null, error: "연결 거부됨" });
  });
});

describe("describeFetchError", () => {
  it.each([
    ["ENOTFOUND", "DNS 조회 실패"],
    ["CERT_HAS_EXPIRED", "SSL 인증서 만료"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "SSL 인증서 오류 (ERR_TLS_CERT_ALTNAME_INVALID)"],
    ["EWEIRD", "요청 실패: EWEIRD"],
  ])("%s → %s", (code, expected) => {
    expect(describeFetchError(new TypeError("fetch failed", { cause: { code } }), false, 1000)).toBe(expected);
  });

  it("timeout wins over the abort error", () => {
    expect(describeFetchError(new Error("aborted"), true, 10000)).toBe("타임아웃 (10초)");
  });

  it("falls back to the message", () => {
    expect(describeFetchError(new Error("boom"), false, 1000)).toBe("요청 실패: boom");
  });
});
