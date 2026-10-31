import { isIP } from "node:net";
import tls from "node:tls";
import { describeFetchError } from "./check";

// SSL certificate expiry. The decision helpers are pure and unit-tested;
// fetchCertExpiry does the TLS handshake. Shared lib code: no Next/React imports.

/** Days before expiry at which an alert goes out (once each per certificate). */
export const SSL_ALERT_THRESHOLDS = [14, 7, 1] as const;

/** How often each https monitor's certificate is re-read. */
export const SSL_CHECK_INTERVAL_MS = 24 * 60 * 60_000;
/** After a failed lookup, try again this much sooner than a full interval. */
export const SSL_RETRY_AFTER_MS = 60 * 60_000;

export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The alert threshold that applies at `daysLeft` (whole days, floored; see
 * sslDaysLeft): the smallest threshold ≥ daysLeft, or null when it's still
 * more than 14 days away. If several thresholds are crossed at once (a new
 * monitor whose certificate has 5 days left) only the nearest one (7) fires;
 * an expired certificate falls under 1.
 */
export function sslAlertThreshold(daysLeft: number): number | null {
  let hit: number | null = null;
  for (const t of SSL_ALERT_THRESHOLDS) if (daysLeft <= t) hit = t;
  return hit;
}

/** Parses a Node peer-certificate date ("Nov  7 12:00:00 2026 GMT"). */
export function parseCertDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Short reason for a failed lookup. Socket errors carry their code on the
 * error itself (on dual-stack hosts it's an AggregateError with an empty
 * message), so reuse the fetch mapping by presenting the error as the cause.
 */
export function describeSslError(err: unknown): string {
  const inner = err instanceof AggregateError && err.errors.length > 0 ? err.errors[0] : err;
  const code = (err as { code?: string })?.code ?? (inner as { code?: string })?.code;
  const message = inner instanceof Error ? inner.message : String(inner);
  if (!code && message) return message; // our own errors (timeout, unreadable cert)
  return describeFetchError({ cause: { code, message } }, false, 0);
}

/**
 * Connects to the URL's host and returns the leaf certificate's expiry.
 * Verification is off on purpose: expired or otherwise invalid certificates
 * must still be readable so we can report them.
 */
export function fetchCertExpiry(url: string, timeoutMs = 10_000): Promise<Date> {
  const u = new URL(url);
  const host = u.hostname.replace(/^\[|\]$/g, ""); // IPv6 literals come bracketed
  const port = u.port ? Number(u.port) : 443;

  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host,
      port,
      servername: isIP(host) ? undefined : host, // SNI must not be an IP
      rejectUnauthorized: false,
      timeout: timeoutMs,
    });
    const fail = (err: Error) => {
      socket.destroy();
      reject(err);
    };
    socket.once("secureConnect", () => {
      const expiresAt = parseCertDate(socket.getPeerCertificate()?.valid_to);
      socket.end();
      if (expiresAt) resolve(expiresAt);
      else reject(new Error("인증서를 읽을 수 없음"));
    });
    socket.once("timeout", () => fail(new Error(`시간 초과 (${Math.round(timeoutMs / 1000)}초)`)));
    socket.once("error", fail);
  });
}
