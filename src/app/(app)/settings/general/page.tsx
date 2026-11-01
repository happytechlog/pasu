import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { checks } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, getSettings, RETENTION_MAX_DAYS, RETENTION_MIN_DAYS } from "@/lib/settings";
import { requireAdmin } from "@/server/session";
import { saveSettingsAction } from "./actions";

const dateFmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

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
  const [settings, { rows }] = await Promise.all([
    getSettings(),
    db.execute<{ total: number; oldest: Date | null }>(
      sql`select count(*)::int as total, min(checked_at) as oldest from ${checks}`,
    ),
  ]);
  const { total, oldest } = rows[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>체크 기록 보관 기간</CardTitle>
        <CardDescription>
          이 기간이 지난 체크 기록은 워커가 1시간마다 삭제합니다. 공개 상태 페이지의 90일 가동률 막대는 일별 집계를 따로
          보관하므로 이 설정과 관계없이 유지됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ActionForm action={saveSettingsAction} submitLabel="저장" pendingLabel="저장하는 중…" className="flex max-w-xs flex-col gap-4">
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
  );
}
