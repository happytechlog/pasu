"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { monitors, statusPageMonitors, statusPages } from "@/lib/db/schema";
import {
  statusPageFormValues,
  statusPageInputSchema,
  type StatusPageFormValues,
  type StatusPageInput,
} from "@/lib/status-page/input";
import { requireUser } from "@/server/session";

// Status pages are shared by the whole team: any signed-in user can manage them.

export type StatusPageFormState = { error?: string; values?: StatusPageFormValues } | undefined;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const SLUG_TAKEN = "이미 사용 중인 주소입니다. 다른 주소를 입력하세요.";

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

function parse(fd: FormData): { ok: true; data: StatusPageInput } | { ok: false; state: StatusPageFormState } {
  const values = statusPageFormValues(fd);
  const parsed = statusPageInputSchema.safeParse(values);
  if (!parsed.success) return { ok: false, state: { error: parsed.error.issues[0].message, values } };
  return { ok: true, data: parsed.data };
}

// Replaces the page's monitor list. Unknown ids (a monitor deleted while the
// form was open) are dropped.
async function setMonitors(tx: Tx, statusPageId: string, monitorIds: string[]) {
  await tx.delete(statusPageMonitors).where(eq(statusPageMonitors.statusPageId, statusPageId));
  if (monitorIds.length === 0) return;
  const existing = await tx.select({ id: monitors.id }).from(monitors).where(inArray(monitors.id, monitorIds));
  if (existing.length === 0) return;
  await tx.insert(statusPageMonitors).values(existing.map((m) => ({ statusPageId, monitorId: m.id })));
}

export async function createStatusPageAction(_: StatusPageFormState, fd: FormData): Promise<StatusPageFormState> {
  await requireUser();
  const r = parse(fd);
  if (!r.ok) return r.state;

  try {
    await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(statusPages)
        .values({ title: r.data.title, slug: r.data.slug })
        .returning({ id: statusPages.id });
      await setMonitors(tx, p.id, r.data.monitorIds);
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: SLUG_TAKEN, values: statusPageFormValues(fd) };
    throw err;
  }
  redirect("/settings/status-pages");
}

export async function updateStatusPageAction(
  id: string,
  _: StatusPageFormState,
  fd: FormData,
): Promise<StatusPageFormState> {
  await requireUser();
  const pageId = z.uuid().parse(id);
  const r = parse(fd);
  if (!r.ok) return r.state;

  let found = false;
  try {
    found = await db.transaction(async (tx) => {
      const updated = await tx
        .update(statusPages)
        .set({ title: r.data.title, slug: r.data.slug })
        .where(eq(statusPages.id, pageId))
        .returning({ id: statusPages.id });
      if (updated.length === 0) return false;
      await setMonitors(tx, pageId, r.data.monitorIds);
      return true;
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: SLUG_TAKEN, values: statusPageFormValues(fd) };
    throw err;
  }
  if (!found) return { error: "상태 페이지를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다." };
  redirect("/settings/status-pages");
}

export async function deleteStatusPageAction(fd: FormData) {
  await requireUser();
  const id = z.uuid().parse(fd.get("id"));
  await db.delete(statusPages).where(eq(statusPages.id, id)); // monitor links cascade
  if (fd.get("from") === "edit") redirect("/settings/status-pages");
  refresh();
}
