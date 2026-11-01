"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/components/action-form";
import { saveSettings, settingsInputSchema } from "@/lib/settings";
import { requireAdmin } from "@/server/session";

// Settings affect data deletion for the whole team, so only admins can change them.

export async function saveSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = settingsInputSchema.safeParse({ checkRetentionDays: fd.get("checkRetentionDays") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await saveSettings(parsed.data);
  refresh();
  return {
    message: `저장했습니다. 체크 기록을 ${parsed.data.checkRetentionDays}일 보관합니다. 워커가 1시간 안에 반영합니다.`,
  };
}
