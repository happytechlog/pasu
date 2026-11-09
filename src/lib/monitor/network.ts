import dns from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";

// Which addresses a monitor may connect to. Shared lib code: no Next/React imports.
//
//   blocked  link-local and cloud metadata addresses. Never allowed, whatever the settings.
//   private  loopback, RFC 1918, CGNAT, reserved ranges, ... Blocked unless the monitor was
//            approved for private targets (monitors.allow_private, admins only) AND the
//            address is inside MONITOR_ALLOWED_NETWORKS.
//   public   everything else.
//
// NAT64 (64:ff9b::/96) and 6to4 (2002::/16) addresses embed an IPv4 address, so the
// embedded form of every v4 range below is listed too. IPv4-mapped IPv6 addresses
// (::ffff:a.b.c.d) are matched against the v4 rules by BlockList itself.

type Cidr = readonly [address: string, prefix: number];

const V4_BLOCKED: Cidr[] = [
  ["169.254.0.0", 16], // link-local, including the 169.254.169.254 metadata service
  ["100.100.100.200", 32], // Alibaba Cloud metadata
  ["168.63.129.16", 32], // Azure platform endpoint
];
const V6_BLOCKED: Cidr[] = [
  ["fe80::", 10], // link-local
  ["fd00:ec2::", 32], // AWS IPv6 metadata
];

const V4_PRIVATE: Cidr[] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. broadcast
];
const V6_PRIVATE: Cidr[] = [
  ["::", 96], // unspecified, loopback, deprecated IPv4-compatible
  ["fc00::", 7], // unique local
  ["ff00::", 8], // multicast
  ["2001:db8::", 32], // documentation
];

/** The NAT64 and 6to4 forms of an IPv4 range. */
function embeddedForms([address, prefix]: Cidr): Cidr[] {
  const [a, b, c, d] = address.split(".").map(Number);
  const hi = ((a << 8) | b).toString(16);
  const lo = ((c << 8) | d).toString(16);
  return [
    [`64:ff9b::${hi}:${lo}`, 96 + prefix],
    [`2002:${hi}:${lo}::`, 16 + prefix],
  ];
}

function buildList(v4: Cidr[], v6: Cidr[]): BlockList {
  const list = new BlockList();
  for (const c of v4) {
    list.addSubnet(c[0], c[1], "ipv4");
    for (const e of embeddedForms(c)) list.addSubnet(e[0], e[1], "ipv6");
  }
  for (const c of v6) list.addSubnet(c[0], c[1], "ipv6");
  return list;
}

const BLOCKED = buildList(V4_BLOCKED, V6_BLOCKED);
const PRIVATE = buildList(V4_PRIVATE, V6_PRIVATE);

/** Strips brackets (`[::1]`) and a zone id (`fe80::1%eth0`). */
function normalizeAddress(address: string): string {
  return address.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
}

function inList(list: BlockList, address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return list.check(address, family === 4 ? "ipv4" : "ipv6");
}

export type AddressClass = "blocked" | "private" | "public";

/** Anything that isn't an IP address is treated as blocked. */
export function classifyAddress(address: string): AddressClass {
  const ip = normalizeAddress(address);
  if (isIP(ip) === 0) return "blocked";
  if (inList(BLOCKED, ip)) return "blocked";
  if (inList(PRIVATE, ip)) return "private";
  return "public";
}

// ---------------------------------------------------------------------------
// MONITOR_ALLOWED_NETWORKS
// ---------------------------------------------------------------------------

/**
 * Parses a comma/space separated list of CIDRs or single addresses. Invalid
 * entries are skipped (fail closed: they allow nothing) and returned so the
 * caller can warn about them.
 */
export function parseAllowedNetworks(raw: string | undefined): { list: BlockList; invalid: string[] } {
  const list = new BlockList();
  const invalid: string[] = [];
  for (const entry of (raw ?? "").split(/[\s,]+/).filter(Boolean)) {
    const [addr, prefixStr, ...rest] = entry.split("/");
    const family = isIP(addr);
    const max = family === 4 ? 32 : 128;
    const prefix = prefixStr === undefined ? max : /^\d+$/.test(prefixStr) ? Number(prefixStr) : NaN;
    if (family === 0 || rest.length > 0 || !(prefix >= 0 && prefix <= max)) {
      invalid.push(entry);
      continue;
    }
    list.addSubnet(addr, prefix, family === 4 ? "ipv4" : "ipv6");
  }
  return { list, invalid };
}

let fromEnv: ReturnType<typeof parseAllowedNetworks> | undefined;

/** MONITOR_ALLOWED_NETWORKS from the environment, parsed once per process. */
export function allowedNetworksFromEnv(): ReturnType<typeof parseAllowedNetworks> {
  return (fromEnv ??= parseAllowedNetworks(process.env.MONITOR_ALLOWED_NETWORKS));
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export type NetworkPolicy = {
  /** True for monitors an admin approved for private targets. */
  allowPrivate: boolean;
  /** Private addresses must also be inside this list. */
  allowed: BlockList;
};

/** Public targets only. */
export const STRICT_POLICY: NetworkPolicy = { allowPrivate: false, allowed: new BlockList() };

export function policyFor(allowPrivate: boolean): NetworkPolicy {
  return allowPrivate ? { allowPrivate: true, allowed: allowedNetworksFromEnv().list } : STRICT_POLICY;
}

export function isAddressAllowed(address: string, policy: NetworkPolicy): boolean {
  const ip = normalizeAddress(address);
  switch (classifyAddress(ip)) {
    case "public":
      return true;
    case "private":
      return policy.allowPrivate && inList(policy.allowed, ip);
    default:
      return false;
  }
}

export const BLOCKED_ADDRESS_CODE = "PASU_BLOCKED_ADDRESS";

export class BlockedAddressError extends Error {
  readonly code = BLOCKED_ADDRESS_CODE;
  constructor(host: string) {
    super(`blocked address: ${host}`);
    this.name = "BlockedAddressError";
  }
}

/**
 * A `lookup` for net/tls/undici connections. Resolves the name itself and
 * fails if ANY resulting address is not allowed, so the address that gets
 * connected to is the one that was checked (no DNS rebinding window).
 */
export function createSafeLookup(policy: NetworkPolicy): LookupFunction {
  return (hostname, options, callback) => {
    const opts: dns.LookupOptions = typeof options === "number" ? { family: options } : options;
    dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
      if (err) return callback(err, "");
      const list = addresses as dns.LookupAddress[];
      if (list.some((a) => !isAddressAllowed(a.address, policy))) return callback(new BlockedAddressError(hostname), "");
      if (opts.all) return callback(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

/**
 * `lookup` isn't called for IP literals, so check those up front. Throws
 * BlockedAddressError. For host names this is a no-op (the lookup handles them).
 */
export function assertLiteralAllowed(host: string, policy: NetworkPolicy): void {
  const ip = normalizeAddress(host);
  if (isIP(ip) !== 0 && !isAddressAllowed(ip, policy)) throw new BlockedAddressError(host);
}
