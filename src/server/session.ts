import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { auth } from "./auth";

// Data Access Layer: every page/action that needs a user goes through here.
// proxy.ts only does an optimistic cookie check; this is the real check.
// Request-time read → callers must render inside <Suspense>.

export type Role = "admin" | "member";
export type CurrentUser = { id: string; name: string; email: string; role: Role };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const { id, name, email, role } = s.user;
  return { id, name, email, role: role === "admin" ? "admin" : "member" };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}

export async function countUsers(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(user);
  return row.n;
}
