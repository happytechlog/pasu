import { describe, expect, it } from "vitest";
import {
  assertLiteralAllowed,
  BlockedAddressError,
  classifyAddress,
  isAddressAllowed,
  parseAllowedNetworks,
  STRICT_POLICY,
  type NetworkPolicy,
} from "./network";

describe("classifyAddress", () => {
  it.each([
    ["8.8.8.8", "public"],
    ["93.184.216.34", "public"],
    ["2606:4700:4700::1111", "public"],
    ["10.1.2.3", "private"],
    ["172.16.0.1", "private"],
    ["172.32.0.1", "public"],
    ["192.168.1.1", "private"],
    ["127.0.0.1", "private"],
    ["100.64.0.1", "private"],
    ["0.0.0.0", "private"],
    ["255.255.255.255", "private"],
    ["::1", "private"],
    ["::", "private"],
    ["fc00::1", "private"],
    ["fd12:3456::1", "private"],
    ["ff02::1", "private"],
    ["169.254.169.254", "blocked"],
    ["169.254.0.1", "blocked"],
    ["100.100.100.200", "blocked"],
    ["fe80::1", "blocked"],
    ["fe80::1%eth0", "blocked"],
    ["fd00:ec2::254", "blocked"],
    ["[::1]", "private"],
    ["not-an-ip", "blocked"],
  ])("%s → %s", (address, expected) => {
    expect(classifyAddress(address)).toBe(expected);
  });

  it("sees through IPv4-mapped, NAT64 and 6to4 forms", () => {
    expect(classifyAddress("::ffff:10.0.0.1")).toBe("private");
    expect(classifyAddress("::ffff:169.254.169.254")).toBe("blocked");
    expect(classifyAddress("::ffff:8.8.8.8")).toBe("public");
    expect(classifyAddress("64:ff9b::a00:1")).toBe("private"); // 10.0.0.1
    expect(classifyAddress("64:ff9b::a9fe:a9fe")).toBe("blocked"); // 169.254.169.254
    expect(classifyAddress("64:ff9b::808:808")).toBe("public"); // 8.8.8.8
    expect(classifyAddress("2002:a00:1::")).toBe("private"); // 6to4 of 10.0.0.1
    expect(classifyAddress("2002:808:808::")).toBe("public");
  });
});

describe("parseAllowedNetworks", () => {
  it("accepts CIDRs and single addresses separated by commas or spaces", () => {
    const { list, invalid } = parseAllowedNetworks("10.0.0.0/8, 192.168.10.5  fd00::/8");
    expect(invalid).toEqual([]);
    expect(list.check("10.9.9.9")).toBe(true);
    expect(list.check("192.168.10.5")).toBe(true);
    expect(list.check("192.168.10.6")).toBe(false);
    expect(list.check("fd00::1", "ipv6")).toBe(true);
  });

  it("skips invalid entries and reports them", () => {
    const { list, invalid } = parseAllowedNetworks("10.0.0.0/33,foo,1.2.3.4/x,1.2.3.4/8/9,172.16.0.0/12");
    expect(invalid).toEqual(["10.0.0.0/33", "foo", "1.2.3.4/x", "1.2.3.4/8/9"]);
    expect(list.check("172.16.5.5")).toBe(true);
    expect(list.check("10.0.0.1")).toBe(false);
  });

  it("is empty for undefined or blank", () => {
    expect(parseAllowedNetworks(undefined).invalid).toEqual([]);
    expect(parseAllowedNetworks("  ").list.check("10.0.0.1")).toBe(false);
  });
});

describe("isAddressAllowed", () => {
  const allowing = (raw: string): NetworkPolicy => ({ allowPrivate: true, allowed: parseAllowedNetworks(raw).list });

  it("strict policy allows only public addresses", () => {
    expect(isAddressAllowed("8.8.8.8", STRICT_POLICY)).toBe(true);
    expect(isAddressAllowed("10.0.0.1", STRICT_POLICY)).toBe(false);
    expect(isAddressAllowed("127.0.0.1", STRICT_POLICY)).toBe(false);
    expect(isAddressAllowed("169.254.169.254", STRICT_POLICY)).toBe(false);
  });

  it("private addresses need both the monitor flag and an allowed network", () => {
    const p = allowing("10.0.0.0/8");
    expect(isAddressAllowed("10.1.2.3", p)).toBe(true);
    expect(isAddressAllowed("::ffff:10.1.2.3", p)).toBe(true);
    expect(isAddressAllowed("192.168.1.1", p)).toBe(false);
    expect(isAddressAllowed("127.0.0.1", p)).toBe(false);
    expect(isAddressAllowed("10.1.2.3", { ...p, allowPrivate: false })).toBe(false);
    expect(isAddressAllowed("8.8.8.8", p)).toBe(true);
  });

  it("never allows link-local or metadata addresses, even when listed", () => {
    const p = allowing("0.0.0.0/0,::/0");
    expect(isAddressAllowed("169.254.169.254", p)).toBe(false);
    expect(isAddressAllowed("fe80::1", p)).toBe(false);
    expect(isAddressAllowed("64:ff9b::a9fe:a9fe", p)).toBe(false);
    expect(isAddressAllowed("10.0.0.1", p)).toBe(true);
  });
});

describe("assertLiteralAllowed", () => {
  it("throws for blocked IP literals and ignores host names", () => {
    expect(() => assertLiteralAllowed("10.0.0.1", STRICT_POLICY)).toThrow(BlockedAddressError);
    expect(() => assertLiteralAllowed("[::1]", STRICT_POLICY)).toThrow(BlockedAddressError);
    expect(() => assertLiteralAllowed("8.8.8.8", STRICT_POLICY)).not.toThrow();
    expect(() => assertLiteralAllowed("localhost", STRICT_POLICY)).not.toThrow(); // handled by lookup
  });
});
