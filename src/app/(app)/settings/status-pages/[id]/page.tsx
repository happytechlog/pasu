import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/session";
import { getStatusPageForEdit, listMonitorOptions } from "@/server/status-pages";
import { ConfirmSubmit } from "../../../monitors/confirm-submit";
import { deleteStatusPageAction, updateStatusPageAction } from "../actions";
import { StatusPageForm } from "../status-page-form";

export default function EditStatusPagePage({ params }: PageProps<"/settings/status-pages/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">상태 페이지 수정</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        <EditStatusPageForm params={params} />
      </Suspense>
    </main>
  );
}

async function EditStatusPageForm({ params }: Pick<PageProps<"/settings/status-pages/[id]">, "params">) {
  await requireUser();
  const { id: raw } = await params;
  const id = z.uuid().safeParse(raw);
  if (!id.success) notFound();

  const [page, monitors] = await Promise.all([getStatusPageForEdit(id.data), listMonitorOptions()]);
  if (!page) notFound();

  return (
    <>
      <StatusPageForm
        action={updateStatusPageAction.bind(null, page.id)}
        initial={{ title: page.title, slug: page.slug, monitorIds: page.monitorIds }}
        monitors={monitors}
        submitLabel="저장"
      />
      <section className="flex max-w-xl flex-col gap-2 border-t pt-6">
        <h2 className="text-sm font-medium">상태 페이지 삭제</h2>
        <p className="text-sm text-muted-foreground">
          공개 주소가 더 이상 열리지 않습니다. 모니터와 체크 기록은 그대로 남습니다.
        </p>
        <form action={deleteStatusPageAction}>
          <input type="hidden" name="id" value={page.id} />
          <input type="hidden" name="from" value="edit" />
          <ConfirmSubmit variant="destructive" size="sm" message={`'${page.title}' 상태 페이지를 삭제할까요?`}>
            삭제
          </ConfirmSubmit>
        </form>
      </section>
    </>
  );
}
