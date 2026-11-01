import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { runCheck } from "../src/lib/monitor/check";
import {
  claimDueMonitors,
  claimSslAlert,
  claimSslDue,
  mapLimit,
  markSslRetry,
  purgeOldChecks,
  recordResult,
  saveSslExpiry,
  type DueMonitor,
  type RecordOutcome,
  type SslDueMonitor,
} from "../src/lib/monitor/runner";
import { describeSslError, fetchCertExpiry, sslAlertThreshold } from "../src/lib/monitor/ssl";
import { formatDuration, sslDaysLeft } from "../src/lib/monitor/stats";
import { notifyMonitorEvent, type SendResult } from "../src/lib/notify";
import { getSettings } from "../src/lib/settings";

const TICK_MS = 10_000;
const CONCURRENCY = 20;
const CLAIM_LIMIT = 200; // per tick; leftovers are picked up on the next tick
const SSL_TICK_MS = 60_000;
const SSL_CONCURRENCY = 5;
const SSL_CLAIM_LIMIT = 50;
const SSL_TIMEOUT_MS = 10_000;
// Retention is read from app_settings on every run, so a change made in
// /settings/general takes effect within an hour.
const PURGE_EVERY_MS = 60 * 60_000;

const log = (...args: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...args);

async function checkOne(m: DueMonitor) {
  const result = await runCheck(m);
  let out: RecordOutcome;
  try {
    out = await recordResult(m.id, result);
  } catch (err) {
    log(`failed to record result for ${m.name} (${m.id}):`, err);
    return;
  }
  if (out.skipped || !out.event) return;

  // Alerts go out after the transaction has committed; a failed send never
  // affects the stored check or the status transition.
  const monitor = { id: m.id, name: m.name, url: m.url };
  const now = new Date();
  let results;
  if (out.event === "down") {
    log(`DOWN ${m.name} — ${m.url} · 원인: ${result.error}`);
    results = await notifyMonitorEvent({ kind: "down", monitor, reason: result.error, at: now });
  } else {
    const downtimeMs = out.incidentStartedAt ? now.getTime() - out.incidentStartedAt.getTime() : null;
    log(`UP ${m.name} 복구${downtimeMs !== null ? ` — 다운 시간 ${formatDuration(downtimeMs)}` : ""}`);
    results = await notifyMonitorEvent({ kind: "recovered", monitor, downtimeMs, at: now });
  }
  logSendResults(m.name, results);
}

function logSendResults(monitorName: string, results: SendResult[]) {
  for (const r of results) {
    if (r.error) log(`alert failed: ${monitorName} → ${r.channel.name} (${r.channel.type}): ${r.error}`);
    else log(`alert sent: ${monitorName} → ${r.channel.name} (${r.channel.type})`);
  }
}

async function sslCheckOne(m: SslDueMonitor) {
  let expiresAt: Date;
  try {
    expiresAt = await fetchCertExpiry(m.url, SSL_TIMEOUT_MS);
  } catch (err) {
    log(`ssl lookup failed for ${m.name} (${m.url}): ${describeSslError(err)}`);
    await markSslRetry(m.id).catch((e) => log(`failed to schedule ssl retry for ${m.name}:`, e));
    return;
  }
  try {
    await saveSslExpiry(m.id, expiresAt);
    const now = new Date();
    const daysLeft = sslDaysLeft(expiresAt, now)!;
    const threshold = sslAlertThreshold(daysLeft);
    log(`ssl ${m.name}: expires ${expiresAt.toISOString()} (${daysLeft}d left)`);
    if (threshold === null || !(await claimSslAlert(m.id, expiresAt, threshold))) return;

    log(`SSL ${m.name} — ${daysLeft}일 남음 (임계값 ${threshold}일)`);
    const monitor = { id: m.id, name: m.name, url: m.url };
    logSendResults(m.name, await notifyMonitorEvent({ kind: "ssl", monitor, expiresAt, daysLeft, at: now }));
  } catch (err) {
    log(`failed to record ssl result for ${m.name} (${m.id}):`, err);
  }
}

let running = false;
let stopping = false;
let inFlight: Promise<void> | null = null;

async function tick() {
  if (running || stopping) return; // never overlap ticks
  running = true;
  try {
    const due = await claimDueMonitors(CLAIM_LIMIT);
    if (due.length > 0) {
      const started = Date.now();
      await mapLimit(due, CONCURRENCY, checkOne);
      log(`checked ${due.length} monitor(s) in ${Date.now() - started}ms`);
    }
  } catch (err) {
    log("tick failed:", err);
  } finally {
    running = false;
  }
}

let sslRunning = false;
let sslInFlight: Promise<void> | null = null;

async function sslTick() {
  if (sslRunning || stopping) return;
  sslRunning = true;
  try {
    const due = await claimSslDue(SSL_CLAIM_LIMIT);
    if (due.length > 0) await mapLimit(due, SSL_CONCURRENCY, sslCheckOne);
  } catch (err) {
    log("ssl tick failed:", err);
  } finally {
    sslRunning = false;
  }
}

let purging: Promise<void> | null = null;

async function purge() {
  if (purging || stopping) return;
  purging = (async () => {
    try {
      const { checkRetentionDays } = await getSettings();
      const started = Date.now();
      const n = await purgeOldChecks(checkRetentionDays);
      if (n > 0) log(`purged ${n} check(s) older than ${checkRetentionDays}d in ${Date.now() - started}ms`);
    } catch (err) {
      log("purge failed:", err);
    } finally {
      purging = null;
    }
  })();
}

async function main() {
  await db.execute(sql`select 1`);
  log(`started: tick ${TICK_MS / 1000}s, concurrency ${CONCURRENCY}; ssl every ${SSL_TICK_MS / 1000}s`);

  const run = () => {
    if (!running) inFlight = tick(); // keep the running tick's promise for shutdown
  };
  run();
  const timer = setInterval(run, TICK_MS);
  const runSsl = () => {
    if (!sslRunning) sslInFlight = sslTick();
  };
  runSsl();
  const sslTimer = setInterval(runSsl, SSL_TICK_MS);
  void purge();
  const purgeTimer = setInterval(() => void purge(), PURGE_EVERY_MS);

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`${signal} received, finishing in-flight checks…`);
    clearInterval(timer);
    clearInterval(sslTimer);
    clearInterval(purgeTimer);
    await Promise.all([inFlight, sslInFlight, purging]);
    await pool.end();
    log("stopped");
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
