import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";
import { checks } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, getSettings, RETENTION_MAX_DAYS, RETENTION_MIN_DAYS } from "@/lib/settings";
import { allTimeZones, COMMON_TIME_ZONES, dateTimeFormat, timeZoneOffset } from "@/lib/timezone";
import { requireAdmin } from "@/server/session";
import { getViewerTimeZone } from "@/server/timezone";
import { saveAlertTimeZoneAction, saveRetentionAction } from "./actions";

export default function GeneralSettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">설정</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        <GeneralSettingsContent />
      </Suspense>
    </main>
  );
}

async function GeneralSettingsContent() {
  await requireAdmin();
  const [settings, tz, { rows }] = await Promise.all([
    getSettings(),
    getViewerTimeZone(),
    db.execute<{ total: number; oldest: Date | null }>(
      sql`select count(*)::int as total, min(checked_at) as oldest from ${checks}`,
    ),
  ]);
  const { total, oldest } = rows[0];
  const dateFmt = dateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: tz });

  return (
    <>
      <AlertTimeZoneCard current={settings.alertTimeZone} />
      <Card>
        <CardHeader>
          <CardTitle>체크 기록 보관 기간</CardTitle>
          <CardDescription>
            이 기간이 지난 체크 기록은 워커가 1시간마다 삭제합니다. 공개 상태 페이지의 90일 가동률 막대는 일별 집계를 따로
            보관하므로 이 설정과 관계없이 유지됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ActionForm action={saveRetentionAction} submitLabel="저장" pendingLabel="저장하는 중…" className="flex max-w-xs flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Field
                label="보관 기간(일)"
                id="checkRetentionDays"
                type="number"
                min={RETENTION_MIN_DAYS}
                max={RETENTION_MAX_DAYS}
                step={1}
                required
                defaultValue={settings.checkRetentionDays}
              />
              <p className="text-xs text-muted-foreground">
                {RETENTION_MIN_DAYS}~{RETENTION_MAX_DAYS}일, 기본값 {DEFAULT_SETTINGS.checkRetentionDays}일. 30일보다 짧으면
                모니터 상세의 30일 차트와 가동률에 빈 구간이 생깁니다.
              </p>
            </div>
          </ActionForm>
          <p className="text-sm text-muted-foreground">
            현재 체크 기록 {total.toLocaleString("ko-KR")}건
            {oldest && ` · 가장 오래된 기록 ${dateFmt.format(new Date(oldest))}`}
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function AlertTimeZoneCard({ current }: { current: string }) {
  const now = new Date();
  const label = (z: string) => `${z} (${timeZoneOffset(z, now)})`;
  const all = allTimeZones();
  // Keep the saved value selectable even if this runtime's list lacks it.
  const others = all.includes(current) ? all : [current, ...all];

  return (
    <Card>
      <CardHeader>
        <CardTitle>알림 시간대</CardTitle>
        <CardDescription>
          이메일 알림에 적는 시각의 시간대입니다. Slack 알림의 시각은 Slack이 읽는 사람의 시간대로 바꿔 보여주므로, 이 설정은
          Slack이 시각을 표시하지 못할 때(푸시 알림 미리보기 등)만 쓰입니다. 대시보드 화면은 각자 브라우저의 시간대로
          표시합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={saveAlertTimeZoneAction} submitLabel="저장" pendingLabel="저장하는 중…" className="flex max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="alertTimeZone">시간대</Label>
            {/* key: React resets the form after the action and doesn't re-apply a
                select's defaultValue, so remount it when the saved value changes. */}
            <select
              key={current}
              id="alertTimeZone"
              name="alertTimeZone"
              defaultValue={current}
              className="h-8 rounded-lg border bg-transparent px-2 text-sm"
            >
              <optgroup label="자주 쓰는 시간대">
                {COMMON_TIME_ZONES.map((z) => (
                  <option key={z} value={z}>
                    {label(z)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="전체">
                {others
                  .filter((z) => !(COMMON_TIME_ZONES as readonly string[]).includes(z))
                  .map((z) => (
                    <option key={z} value={z}>
                      {label(z)}
                    </option>
                  ))}
              </optgroup>
            </select>
            <p className="text-xs text-muted-foreground">
              기본값 {DEFAULT_SETTINGS.alertTimeZone}. 서머타임은 자동으로 반영됩니다. 일별 가동률 집계는 이 설정과 관계없이
              한국 시간 날짜 기준입니다.
            </p>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
