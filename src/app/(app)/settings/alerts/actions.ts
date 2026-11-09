"use server";

import { refresh } from "next/cache";
import { and, eq, isNull, lte, not, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { db } from "@/lib/db";
import { alertChannels } from "@/lib/db/schema";
import { buildAlert, sendToChannel, describeSendError } from "@/lib/notify";
import { channelInputSchema } from "@/lib/notify/input";
import {
  canCreateChannel,
  EMAIL_CHANNEL_ADMIN_ONLY_MESSAGE,
  TEST_SEND_COOLDOWN_SEC,
  testSendWaitSec,
} from "@/lib/notify/policy";
import { requireUser } from "@/server/session";

// Alert channels are shared by the whole team: any signed-in user can use, switch off and delete
// them. Email channels can only be created by admins (they relay mail through the team's SMTP
// account), and each channel can be test-sent once per TEST_SEND_COOLDOWN_SEC.

export async function createChannelAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = channelInputSchema.safeParse({
    type: fd.get("type"),
    name: fd.get("name"),
    target: fd.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!canCreateChannel(user.role, parsed.data.type)) return { error: EMAIL_CHANNEL_ADMIN_ONLY_MESSAGE };

  await db.insert(alertChannels).values(parsed.data);
  refresh();
  return { message: `'${parsed.data.name}' 채널을 추가했습니다. 모니터 수정 화면에서 이 채널을 연결하세요.` };
}

export async function toggleChannelAction(fd: FormData) {
  await requireUser();
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return;
  await db.update(alertChannels).set({ enabled: not(alertChannels.enabled) }).where(eq(alertChannels.id, id.data));
  refresh();
}

export async function deleteChannelAction(fd: FormData) {
  await requireUser();
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return;
  await db.delete(alertChannels).where(eq(alertChannels.id, id.data)); // monitor links cascade
  refresh();
}

export type TestSendState = { ok: boolean; message: string } | undefined;

export async function testChannelAction(_: TestSendState, fd: FormData): Promise<TestSendState> {
  await requireUser();
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };

  // Claim the test slot atomically so concurrent clicks can't all pass the cooldown check.
  // A failed send still uses it, which also keeps a broken SMTP server from being hammered.
  const [c] = await db
    .update(alertChannels)
    .set({ lastTestAt: sql`now()` })
    .where(
      and(
        eq(alertChannels.id, id.data),
        or(
          isNull(alertChannels.lastTestAt),
          lte(alertChannels.lastTestAt, sql`now() - make_interval(secs => ${TEST_SEND_COOLDOWN_SEC})`),
        ),
      ),
    )
    .returning();
  if (!c) {
    const [existing] = await db
      .select({ lastTestAt: alertChannels.lastTestAt })
      .from(alertChannels)
      .where(eq(alertChannels.id, id.data))
      .limit(1);
    if (!existing) return { ok: false, message: "채널을 찾을 수 없습니다." };
    const wait = Math.max(1, testSendWaitSec(existing.lastTestAt));
    return { ok: false, message: `테스트 발송은 채널당 ${TEST_SEND_COOLDOWN_SEC}초에 한 번만 가능합니다. ${wait}초 후 다시 시도하세요.` };
  }

  try {
    await sendToChannel(c, await buildAlert({ kind: "test", channelName: c.name, at: new Date() }));
    return { ok: true, message: "보냈습니다." };
  } catch (err) {
    console.error("test alert failed", c.id, err);
    // SMTP errors carry host/IP/port and auth details; keep them in the server log, not on screen.
    if (c.type === "email") return { ok: false, message: "발송에 실패했습니다. 서버 로그를 확인하세요." };
    return { ok: false, message: `실패: ${describeSendError(err)}` };
  }
}
