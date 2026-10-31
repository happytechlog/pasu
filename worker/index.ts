import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { runCheck } from "../src/lib/monitor/check";
import { claimDueMonitors, mapLimit, recordResult, type DueMonitor, type RecordOutcome } from "../src/lib/monitor/runner";
import { formatDuration } from "../src/lib/monitor/stats";
import { notifyMonitorEvent } from "../src/lib/notify";

const TICK_MS = 10_000;
const CONCURRENCY = 20;
const CLAIM_LIMIT = 200; // per tick; leftovers are picked up on the next tick

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
  for (const r of results) {
    if (r.error) log(`alert failed: ${m.name} → ${r.channel.name} (${r.channel.type}): ${r.error}`);
    else log(`alert sent: ${m.name} → ${r.channel.name} (${r.channel.type})`);
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

async function main() {
  await db.execute(sql`select 1`);
  log(`started: tick ${TICK_MS / 1000}s, concurrency ${CONCURRENCY}`);

  const run = () => {
    if (!running) inFlight = tick(); // keep the running tick's promise for shutdown
  };
  run();
  const timer = setInterval(run, TICK_MS);

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`${signal} received, finishing in-flight checks…`);
    clearInterval(timer);
    await inFlight;
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
