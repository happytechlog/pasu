"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/components/action-form";
import { alertTimeZoneInputSchema, retentionInputSchema, saveSettings } from "@/lib/settings";
import { requireAdmin } from "@/server/session";

// Settings apply to the whole team (data deletion, alert text), so only admins can change them.

export async function saveRetentionAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = retentionInputSchema.safeParse({ checkRetentionDays: fd.get("checkRetentionDays") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await saveSettings(parsed.data);
  refresh();
  return {
    message: `저장했습니다. 체크 기록을 ${parsed.data.checkRetentionDays}일 보관합니다. 워커가 1시간 안에 반영합니다.`,
  };
}

export async function saveAlertTimeZoneAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = alertTimeZoneInputSchema.safeParse({ alertTimeZone: fd.get("alertTimeZone") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await saveSettings(parsed.data);
  refresh();
  return { message: `저장했습니다. 다음 알림부터 ${parsed.data.alertTimeZone} 시간으로 표시합니다.` };
}
