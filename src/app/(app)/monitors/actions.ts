"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray, not, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { alertChannels, monitorAlertChannels, monitors } from "@/lib/db/schema";
import { formValues, monitorInputSchema, type MonitorFormValues, type MonitorInput } from "@/lib/monitor/input";
import { requireUser } from "@/server/session";

export type MonitorFormState = { error?: string; values?: MonitorFormValues } | undefined;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function parse(fd: FormData): { ok: true; data: MonitorInput } | { ok: false; state: MonitorFormState } {
  const values = formValues(fd);
  const parsed = monitorInputSchema.safeParse(values);
  if (!parsed.success) return { ok: false, state: { error: parsed.error.issues[0].message, values } };
  return { ok: true, data: parsed.data };
}

function columns(d: MonitorInput) {
  return {
    name: d.name,
    url: d.url,
    intervalSec: d.intervalSec,
    method: d.method,
    timeoutMs: d.timeoutSec * 1000,
    expectedStatus: d.expectedStatus,
  };
}

// Replaces the monitor's channel links. Unknown ids (e.g. a channel deleted
// while the form was open) are silently dropped.
async function setChannels(tx: Tx, monitorId: string, channelIds: string[]) {
  await tx.delete(monitorAlertChannels).where(eq(monitorAlertChannels.monitorId, monitorId));
  if (channelIds.length === 0) return;
  const existing = await tx
    .select({ id: alertChannels.id })
    .from(alertChannels)
    .where(inArray(alertChannels.id, channelIds));
  if (existing.length === 0) return;
  await tx.insert(monitorAlertChannels).values(existing.map((c) => ({ monitorId, channelId: c.id })));
}

export async function createMonitorAction(_: MonitorFormState, fd: FormData): Promise<MonitorFormState> {
  const user = await requireUser();
  const r = parse(fd);
  if (!r.ok) return r.state;

  await db.transaction(async (tx) => {
    const [m] = await tx
      .insert(monitors)
      .values({ ...columns(r.data), createdBy: user.id })
      .returning({ id: monitors.id });
    await setChannels(tx, m.id, r.data.channelIds);
  });
  redirect("/");
}

export async function updateMonitorAction(
  id: string,
  _: MonitorFormState,
  fd: FormData,
): Promise<MonitorFormState> {
  await requireUser();
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { error: "잘못된 요청입니다.", values: formValues(fd) };
  const monitorId = parsedId.data;
  const r = parse(fd);
  if (!r.ok) return r.state;

  const found = await db.transaction(async (tx) => {
    // Check again soon so changed settings take effect without waiting a full interval.
    const updated = await tx
      .update(monitors)
      .set({
        ...columns(r.data),
        nextCheckAt: new Date(),
        // A different URL may mean a different certificate (or none): forget
        // the old one so the worker reads it again on its next SSL pass.
        sslExpiresAt: sql`case when ${monitors.url} = ${r.data.url} then ${monitors.sslExpiresAt} end`,
        sslCheckedAt: sql`case when ${monitors.url} = ${r.data.url} then ${monitors.sslCheckedAt} end`,
      })
      .where(eq(monitors.id, monitorId))
      .returning({ id: monitors.id });
    if (updated.length === 0) return false;
    await setChannels(tx, monitorId, r.data.channelIds);
    return true;
  });
  if (!found) return { error: "모니터를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.", values: formValues(fd) };
  redirect("/");
}

export async function toggleMonitorAction(fd: FormData) {
  await requireUser();
  const parsedId = z.uuid().safeParse(fd.get("id"));
  if (!parsedId.success) return;
  const id = parsedId.data;
  const [m] = await db
    .update(monitors)
    .set({ enabled: not(monitors.enabled) })
    .where(eq(monitors.id, id))
    .returning({ enabled: monitors.enabled });
  if (m?.enabled) {
    // Resumed: start over as "pending" and check right away.
    await db
      .update(monitors)
      .set({ status: "pending", consecutiveFailures: 0, nextCheckAt: new Date() })
      .where(eq(monitors.id, id));
  }
  refresh();
}

export async function deleteMonitorAction(fd: FormData) {
  await requireUser();
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return;
  await db.delete(monitors).where(eq(monitors.id, id.data)); // checks/incidents/channel links cascade
  if (fd.get("from") === "edit") redirect("/");
  refresh();
}
