import { Suspense } from "react";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { alertChannels, monitorAlertChannels, monitors } from "@/lib/db/schema";
import { requireUser } from "@/server/session";
import { deleteMonitorAction, updateMonitorAction } from "../../actions";
import { ConfirmSubmit } from "../../confirm-submit";
import { MonitorForm } from "../../monitor-form";

export default function EditMonitorPage({ params }: PageProps<"/monitors/[id]/edit">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">모니터 수정</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        <EditMonitorForm params={params} />
      </Suspense>
    </main>
  );
}

async function EditMonitorForm({ params }: Pick<PageProps<"/monitors/[id]/edit">, "params">) {
  await requireUser();
  const { id: raw } = await params;
  const id = z.uuid().safeParse(raw);
  if (!id.success) notFound();

  const [[m], linked, channels] = await Promise.all([
    db.select().from(monitors).where(eq(monitors.id, id.data)).limit(1),
    db
      .select({ id: monitorAlertChannels.channelId })
      .from(monitorAlertChannels)
      .where(eq(monitorAlertChannels.monitorId, id.data)),
    db
      .select({ id: alertChannels.id, name: alertChannels.name, type: alertChannels.type, enabled: alertChannels.enabled })
      .from(alertChannels)
      .orderBy(asc(alertChannels.createdAt)),
  ]);
  if (!m) notFound();

  return (
    <>
      <MonitorForm
        action={updateMonitorAction.bind(null, m.id)}
        initial={{
          name: m.name,
          url: m.url,
          intervalSec: String(m.intervalSec),
          method: m.method,
          timeoutSec: String(Math.round(m.timeoutMs / 1000)),
          expectedStatus: m.expectedStatus,
          channelIds: linked.map((l) => l.id),
        }}
        channels={channels}
        submitLabel="저장"
      />
      <section className="flex max-w-xl flex-col gap-2 border-t pt-6">
        <h2 className="text-sm font-medium">모니터 삭제</h2>
        <p className="text-sm text-muted-foreground">체크 기록과 장애 이력도 함께 삭제됩니다.</p>
        <form action={deleteMonitorAction}>
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="from" value="edit" />
          <ConfirmSubmit variant="destructive" size="sm" message={`'${m.name}' 모니터를 삭제할까요?`}>
            삭제
          </ConfirmSubmit>
        </form>
      </section>
    </>
  );
}
