import { describe, expect, it } from "vitest";
import { parseAllowedNetworks } from "./network";
import { checkMonitorTarget, type Resolver } from "./target";

const allowed = parseAllowedNetworks("10.0.0.0/8,127.0.0.0/8").list;
const resolving =
  (...addrs: string[]): Resolver =>
  async () =>
    addrs;
const check = (url: string, isAdmin: boolean, resolver: Resolver = resolving("93.184.216.34")) =>
  checkMonitorTarget(url, isAdmin, resolver, allowed);

describe("checkMonitorTarget", () => {
  it("lets everyone save public targets", async () => {
    expect(await check("https://example.com", false)).toEqual({ ok: true, private: false });
    expect(await check("https://example.com", true)).toEqual({ ok: true, private: false });
    expect(await check("http://8.8.8.8/", false)).toEqual({ ok: true, private: false });
  });

  it("restricts private targets to admins", async () => {
    expect(await check("http://10.0.0.5/", false)).toMatchObject({ ok: false, reason: "admin-only" });
    expect(await check("http://10.0.0.5/", true)).toEqual({ ok: true, private: true });
    expect(await check("http://[::ffff:10.0.0.5]/", false)).toMatchObject({ reason: "admin-only" });
  });

  it("applies the same rule to names that resolve to private addresses", async () => {
    expect(await check("http://intranet.local", false, resolving("10.1.1.1"))).toMatchObject({ reason: "admin-only" });
    expect(await check("http://intranet.local", true, resolving("10.1.1.1"))).toEqual({ ok: true, private: true });
    // One private address among public ones still makes it a private target.
    expect(await check("http://mixed.example", false, resolving("93.184.216.34", "10.1.1.1"))).toMatchObject({
      reason: "admin-only",
    });
  });

  it("rejects admins too when the address is outside MONITOR_ALLOWED_NETWORKS", async () => {
    expect(await check("http://192.168.1.1/", true)).toMatchObject({ ok: false, reason: "not-allowed" });
    expect(await check("http://host.local", true, resolving("10.0.0.1", "192.168.1.1"))).toMatchObject({
      reason: "not-allowed",
    });
  });

  it("rejects link-local and metadata targets for everyone", async () => {
    expect(await check("http://169.254.169.254/latest/meta-data/", true)).toMatchObject({ reason: "blocked" });
    expect(await check("http://169.254.169.254/", false)).toMatchObject({ reason: "blocked" });
    expect(await check("http://evil.example", true, resolving("169.254.169.254"))).toMatchObject({ reason: "blocked" });
  });

  it("lets unresolvable names through (the worker reports the DNS failure)", async () => {
    expect(await check("http://nope.invalid", false, async () => null)).toEqual({ ok: true, private: false });
    expect(await check("http://nope.invalid", false, async () => [])).toEqual({ ok: true, private: false });
  });
});
