"use server";

import { refresh } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { invitations, user } from "@/lib/db/schema";
import { sendMail } from "@/lib/mail";
import type { FormState } from "@/components/action-form";
import { requireAdmin } from "@/server/session";
import { INVITE_TTL_MS, inviteUrl, newInviteToken } from "@/server/invitations";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("올바른 이메일 주소를 입력하세요."),
  role: z.enum(["admin", "member"]),
});

export async function inviteUserAction(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = inviteSchema.safeParse({ email: fd.get("email"), role: fd.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, role } = parsed.data;

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing) return { error: "이미 가입된 이메일입니다." };

  // Re-inviting replaces any pending invitation for the same address.
  await db
    .delete(invitations)
    .where(and(eq(invitations.email, email), isNull(invitations.acceptedAt)));

  const { token, tokenHash } = newInviteToken();
  await db.insert(invitations).values({
    email,
    role,
    tokenHash,
    invitedBy: admin.id,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  refresh();

  const link = inviteUrl(token);
  try {
    await sendMail({
      to: email,
      subject: "[Uptime Monitor] 팀 초대",
      text: `${admin.name}님이 Uptime Monitor에 초대했습니다.\n\n아래 링크에서 계정을 만드세요(7일 동안 유효).\n${link}\n`,
    });
  } catch (err) {
    console.error("invite mail failed", err);
    return { error: "초대는 만들었지만 메일 발송에 실패했습니다. 아래 링크를 직접 전달하세요.", link };
  }
  return { message: `${email}로 초대 메일을 보냈습니다.`, link };
}

export async function cancelInvitationAction(fd: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(fd.get("id"));
  await db.delete(invitations).where(and(eq(invitations.id, id), isNull(invitations.acceptedAt)));
  refresh();
}

export async function deleteUserAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = z.string().min(1).parse(fd.get("id"));
  if (id === admin.id) return; // cannot delete yourself
  await db.delete(user).where(eq(user.id, id)); // sessions/accounts cascade
  refresh();
}

export async function changeRoleAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = z.string().min(1).parse(fd.get("id"));
  const role = z.enum(["admin", "member"]).parse(fd.get("role"));
  if (id === admin.id) return; // keep at least one admin: can't demote yourself
  await db.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, id));
  refresh();
}

