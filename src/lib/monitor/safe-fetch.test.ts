import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeFetchError, runCheck, type CheckTarget } from "./check";
import { parseAllowedNetworks, STRICT_POLICY, type NetworkPolicy } from "./network";
import { createSafeFetch } from "./safe-fetch";

// A real server on loopback. Loopback is a "private" address, which shows the policy at work.
let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/redirect-meta") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
      return;
    }
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const target = (path: string, host = "127.0.0.1"): CheckTarget => ({
  url: `http://${host}:${port}${path}`,
  method: "GET",
  timeoutMs: 3000,
  expectedStatus: "2xx",
});
const BLOCKED_MESSAGE = describeFetchError({ cause: { code: "PASU_BLOCKED_ADDRESS" } }, false, 0);
const allowLoopback: NetworkPolicy = {
  allowPrivate: true,
  allowed: parseAllowedNetworks("127.0.0.0/8,::1/128").list,
};

describe("createSafeFetch", () => {
  it("refuses private IP literals and names under the strict policy", async () => {
    const f = createSafeFetch(STRICT_POLICY);
    for (const host of ["127.0.0.1", "localhost"]) {
      const r = await runCheck(target("/", host), f);
      expect(r).toMatchObject({ ok: false, statusCode: null, error: BLOCKED_MESSAGE });
    }
  });

  it("does not connect when the monitor is flagged but the network is not allowed", async () => {
    const f = createSafeFetch({ allowPrivate: true, allowed: parseAllowedNetworks("10.0.0.0/8").list });
    expect(await runCheck(target("/"), f)).toMatchObject({ ok: false, error: BLOCKED_MESSAGE });
  });

  it("connects to allowed private addresses", async () => {
    const f = createSafeFetch(allowLoopback);
    expect(await runCheck(target("/"), f)).toMatchObject({ ok: true, statusCode: 200 });
    expect(await runCheck(target("/", "localhost"), f)).toMatchObject({ ok: true, statusCode: 200 });
  });

  it("stops a redirect to the metadata address even when private targets are allowed", async () => {
    const f = createSafeFetch(allowLoopback);
    expect(await runCheck(target("/redirect-meta"), f)).toMatchObject({ ok: false, error: BLOCKED_MESSAGE });
  });
});
