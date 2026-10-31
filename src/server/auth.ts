import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { account, session, user, verification } from "@/lib/db/schema";

// Web-only (depends on next via nextCookies). The worker never touches auth.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  // No public sign-up: the HTTP endpoint is disabled. Accounts are created
  // only server-side via auth.api.signUpEmail from /setup and /invite/[token]
  // (disabledPaths is enforced by the HTTP router, not by auth.api calls).
  disabledPaths: ["/sign-up/email"],
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "member", input: false },
    },
  },
  // Lets auth.api.* calls inside Server Actions set/clear the session cookie.
  plugins: [nextCookies()],
});
