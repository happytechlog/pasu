import { matchesExpectedStatus, parseExpectedStatus } from "./expected-status";
import { BLOCKED_ADDRESS_CODE } from "./network";

export type CheckTarget = {
  url: string;
  method: "GET" | "HEAD";
  timeoutMs: number;
  expectedStatus: string;
};

/** True if both targets would run the same request and judge it the same way. */
export function sameCheckTarget(a: CheckTarget, b: CheckTarget): boolean {
  return (
    a.url === b.url && a.method === b.method && a.timeoutMs === b.timeoutMs && a.expectedStatus === b.expectedStatus
  );
}

export type CheckResult = {
  ok: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  /** Short Korean reason for failures, used in incidents and alerts. */
  error: string | null;
};

const USER_AGENT = "Pasu/1.0";

// Redirects are followed unless the spec expects a 3xx explicitly
// (otherwise a "301" rule could never match).
function wantsRedirectStatus(spec: string): boolean {
  return (parseExpectedStatus(spec) ?? []).some((r) =>
    r.kind === "class" ? r.digit === 3 : r.code >= 300 && r.code < 400,
  );
}

/** Maps a fetch failure to a short reason. Exported for tests. */
export function describeFetchError(err: unknown, timedOut: boolean, timeoutMs: number): string {
  if (timedOut) return `타임아웃 (${Math.round(timeoutMs / 1000)}초)`;
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
  const code = cause?.code;
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "DNS 조회 실패";
    case BLOCKED_ADDRESS_CODE:
      return "허용되지 않은 주소 (사설망·내부 주소)";
    case "ECONNREFUSED":
      return "연결 거부됨";
    case "ECONNRESET":
      return "연결이 끊김";
    case "ETIMEDOUT":
    case "UND_ERR_CONNECT_TIMEOUT":
      return "연결 시간 초과";
    case "CERT_HAS_EXPIRED":
      return "SSL 인증서 만료";
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return `SSL 인증서 오류 (${code})`;
  }
  const msg = cause?.message ?? (err as Error)?.message ?? String(err);
  return code ? `요청 실패: ${code}` : `요청 실패: ${msg}`.slice(0, 200);
}

export async function runCheck(
  target: CheckTarget,
  fetchImpl: typeof fetch = fetch,
  now: () => number = () => performance.now(),
): Promise<CheckResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, target.timeoutMs);

  const start = now();
  try {
    const res = await fetchImpl(target.url, {
      method: target.method,
      redirect: wantsRedirectStatus(target.expectedStatus) ? "manual" : "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
      cache: "no-store",
    });
    const responseTimeMs = Math.round(now() - start);
    // We only need the status line; release the connection without reading the body.
    await res.body?.cancel().catch(() => {});
    const ok = matchesExpectedStatus(target.expectedStatus, res.status);
    return { ok, statusCode: res.status, responseTimeMs, error: ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, statusCode: null, responseTimeMs: null, error: describeFetchError(err, timedOut, target.timeoutMs) };
  } finally {
    clearTimeout(timer);
  }
}
