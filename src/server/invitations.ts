import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitations } from "@/lib/db/schema";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteUrl(token: string) {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/invite/${token}`;
}

/** Returns the invitation if the token is valid, unused and not expired. */
export async function findUsableInvitation(token: string) {
  const [inv] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.tokenHash, hashInviteToken(token)),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return inv ?? null;
}
