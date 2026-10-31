"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { z } from "zod";
import { db } from "@/lib/db";
import { invitations, user } from "@/lib/db/schema";
import { safeNextPath } from "@/lib/safe-next";
import type { FormState } from "@/components/action-form";
import { auth } from "@/server/auth";
import { countUsers } from "@/server/session";
import { hashInviteToken } from "@/server/invitations";

const email = z.string().trim().toLowerCase().email("올바른 이메일 주소를 입력하세요.");
const password = z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(128);
const name = z.string().trim().min(1, "이름을 입력하세요.").max(100);

function authErrorMessage(err: unknown): string {
  if (isAPIError(err)) {
    const code = (err.body as { code?: string } | undefined)?.code ?? "";
    if (code === "INVALID_EMAIL_OR_PASSWORD") return "이메일 또는 비밀번호가 올바르지 않습니다.";
    if (code.startsWith("USER_ALREADY_EXISTS")) return "이미 가입된 이메일입니다.";
    if (code === "PASSWORD_TOO_SHORT") return "비밀번호는 8자 이상이어야 합니다.";
    if (code === "INVALID_EMAIL") return "올바른 이메일 주소를 입력하세요.";
  }
  console.error(err);
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.";
}

export async function signInAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = z
    .object({ email, password: z.string().min(1, "비밀번호를 입력하세요.") })
    .safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
  redirect(safeNextPath(fd.get("next")));
}

export async function setupAdminAction(_: FormState, fd: FormData): Promise<FormState> {
  if ((await countUsers()) > 0) redirect("/login");

  const parsed = z
    .object({ name, email, password })
    .safeParse({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let userId: string;
  try {
    const res = await auth.api.signUpEmail({ body: parsed.data, headers: await headers() });
    userId = res.user.id;
  } catch (err) {
    return { error: authErrorMessage(err) };
  }

  // Promote only if this is still the sole user (guards concurrent /setup).
  const promoted = await db
    .update(user)
    .set({ role: "admin" })
    .where(and(eq(user.id, userId), sql`(select count(*) from ${user}) = 1`))
    .returning({ id: user.id });
  if (promoted.length === 0) {
    await db.delete(user).where(eq(user.id, userId));
    redirect("/login");
  }
  redirect("/");
}

export async function acceptInviteAction(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token") ?? "");
  const parsed = z
    .object({ name, password })
    .safeParse({ name: fd.get("name"), password: fd.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Claim the invitation atomically so a token can be used only once.
  const [inv] = await db
    .update(invitations)
    .set({ acceptedAt: new Date() })
    .where(
      and(
        eq(invitations.tokenHash, hashInviteToken(token)),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!inv) return { error: "초대 링크가 만료되었거나 이미 사용되었습니다." };

  try {
    const res = await auth.api.signUpEmail({
      body: { ...parsed.data, email: inv.email },
      headers: await headers(),
    });
    await db.update(user).set({ role: inv.role }).where(eq(user.id, res.user.id));
  } catch (err) {
    // Release the claim so the invitee can retry (e.g. after a server error).
    await db.update(invitations).set({ acceptedAt: null }).where(eq(invitations.id, inv.id));
    return { error: authErrorMessage(err) };
  }
  redirect("/");
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
