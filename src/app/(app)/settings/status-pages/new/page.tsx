import { Suspense } from "react";
import { requireUser } from "@/server/session";
import { listMonitorOptions } from "@/server/status-pages";
import { createStatusPageAction } from "../actions";
import { StatusPageForm } from "../status-page-form";

export default function NewStatusPagePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">상태 페이지 추가</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        <NewStatusPageForm />
      </Suspense>
    </main>
  );
}

async function NewStatusPageForm() {
  await requireUser();
  const monitors = await listMonitorOptions();
  return (
    <StatusPageForm
      action={createStatusPageAction}
      initial={{ title: "", slug: "", monitorIds: [] }}
      monitors={monitors}
      submitLabel="추가"
    />
  );
}
