import dns from "node:dns";
import { isIP, type BlockList } from "node:net";
import { allowedNetworksFromEnv, classifyAddress, isAddressAllowed, policyFor } from "./network";

// Registration-time check of a monitor URL's target. The worker enforces the
// same rules when it connects, so this exists to give a clear error (and to
// decide who may save a private target); it is not the security boundary.

export type TargetCheck =
  | { ok: true; private: boolean }
  | { ok: false; reason: "blocked" | "admin-only" | "not-allowed"; message: string };

const DNS_TIMEOUT_MS = 5000;

/** Addresses the URL's host points to, or null when it can't be resolved. */
export type Resolver = (hostname: string) => Promise<string[] | null>;

export const resolveHost: Resolver = async (hostname) => {
  const lookup = dns.promises
    .lookup(hostname, { all: true })
    .then((r) => r.map((a) => a.address))
    .catch(() => null);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), DNS_TIMEOUT_MS).unref());
  return Promise.race([lookup, timeout]);
};

/**
 * Decides whether `role` may save a monitor for `url`.
 * - link-local / cloud metadata targets: nobody
 * - private targets: admins only, and only inside MONITOR_ALLOWED_NETWORKS
 * - public targets and names that don't resolve (the worker reports DNS failures): everyone
 */
export async function checkMonitorTarget(
  url: string,
  isAdmin: boolean,
  resolver: Resolver = resolveHost,
  allowed: BlockList = allowedNetworksFromEnv().list,
): Promise<TargetCheck> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return { ok: true, private: false }; // malformed URLs are rejected by the form schema
  }
  const addresses = isIP(hostname) ? [hostname] : await resolver(hostname);
  if (!addresses || addresses.length === 0) return { ok: true, private: false };

  const classes = addresses.map(classifyAddress);
  if (classes.includes("blocked")) {
    return {
      ok: false,
      reason: "blocked",
      message: "링크로컬·클라우드 메타데이터 주소(169.254.x.x 등)는 감시할 수 없습니다.",
    };
  }
  if (!classes.includes("private")) return { ok: true, private: false };

  if (!isAdmin) {
    return {
      ok: false,
      reason: "admin-only",
      message: "사설망·내부 주소(10.x, 192.168.x, localhost 등)를 가리키는 URL은 관리자만 등록할 수 있습니다.",
    };
  }
  const policy = { ...policyFor(true), allowed };
  if (!addresses.every((a) => isAddressAllowed(a, policy))) {
    return {
      ok: false,
      reason: "not-allowed",
      message: "이 사설망 주소는 서버의 MONITOR_ALLOWED_NETWORKS 설정에 포함되어 있지 않아 감시할 수 없습니다.",
    };
  }
  return { ok: true, private: true };
}
