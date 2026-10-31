import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { alertChannels } from "@/lib/db/schema";
import { requireUser } from "@/server/session";
import { createMonitorAction } from "../actions";
import { DEFAULT_VALUES, MonitorForm } from "../monitor-form";

export default function NewMonitorPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">모니터 추가</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        <NewMonitorForm />
      </Suspense>
    </main>
  );
}

async function NewMonitorForm() {
  await requireUser();
  const channels = await db
    .select({ id: alertChannels.id, name: alertChannels.name, type: alertChannels.type, enabled: alertChannels.enabled })
    .from(alertChannels)
    .orderBy(asc(alertChannels.createdAt));
  return <MonitorForm action={createMonitorAction} initial={DEFAULT_VALUES} channels={channels} submitLabel="추가" />;
}
