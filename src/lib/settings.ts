import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { appSettings } from "./db/schema";

// Team-wide settings (single app_settings row). Shared by web and worker:
// no Next/React imports.

export const RETENTION_MIN_DAYS = 7; // the detail page's 7-day chart needs a week of checks
export const RETENTION_MAX_DAYS = 365;
export const DEFAULT_SETTINGS = { checkRetentionDays: 30 };

export type AppSettings = typeof DEFAULT_SETTINGS;

export const settingsInputSchema = z.object({
  checkRetentionDays: z.coerce
    .number({ error: "보관 기간을 숫자로 입력하세요." })
    .int("보관 기간은 정수(일)로 입력하세요.")
    .min(RETENTION_MIN_DAYS, `보관 기간은 ${RETENTION_MIN_DAYS}일 이상이어야 합니다.`)
    .max(RETENTION_MAX_DAYS, `보관 기간은 ${RETENTION_MAX_DAYS}일 이하여야 합니다.`),
});

/** Current settings; defaults if the row is missing (e.g. a DB migrated without the seed). */
export async function getSettings(): Promise<AppSettings> {
  const [row] = await db
    .select({ checkRetentionDays: appSettings.checkRetentionDays })
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  return row ?? DEFAULT_SETTINGS;
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await db
    .insert(appSettings)
    .values({ id: 1, ...s })
    .onConflictDoUpdate({ target: appSettings.id, set: { ...s, updatedAt: sql`now()` } });
}
