"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import type { StatusPageFormValues } from "@/lib/status-page/input";
import type { StatusPageFormState } from "./actions";

export type MonitorOption = { id: string; name: string; enabled: boolean };

export function StatusPageForm({
  action,
  initial,
  monitors,
  submitLabel,
}: {
  action: (state: StatusPageFormState, fd: FormData) => Promise<StatusPageFormState>;
  initial: StatusPageFormValues;
  monitors: MonitorOption[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  // Remount the fields with the submitted values so input survives an error.
  const v = state?.values ?? initial;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <div key={JSON.stringify(state ?? null)} className="flex flex-col gap-5">
        <Field label="제목" id="title" defaultValue={v.title} required maxLength={80} placeholder="예: Acme 서비스 상태" />
        <div className="flex flex-col gap-1.5">
          <Field label="주소" id="slug" defaultValue={v.slug} required maxLength={40} autoComplete="off" placeholder="acme" />
          <p className="text-xs text-muted-foreground">
            <code>/status/주소</code>로 로그인 없이 열립니다. 영문 소문자, 숫자, 하이픈(-)을 쓸 수 있습니다.
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">표시할 모니터</legend>
          <p className="text-xs text-muted-foreground">
            공개 페이지에는 모니터 이름, 현재 상태, 일별 가동률만 표시됩니다. URL과 에러 내용은 보이지 않습니다.
          </p>
          {monitors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              등록된 모니터가 없습니다.{" "}
              <Link href="/monitors/new" className="underline underline-offset-2">
                모니터 추가
              </Link>
            </p>
          ) : (
            monitors.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="monitorIds"
                  value={m.id}
                  defaultChecked={v.monitorIds.includes(m.id)}
                  className="size-4"
                />
                <span>{m.name}</span>
                {!m.enabled && <span className="text-muted-foreground">· 일시정지</span>}
              </label>
            ))
          )}
        </fieldset>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중…" : submitLabel}
        </Button>
        <Button variant="outline" render={<Link href="/settings/status-pages" />} nativeButton={false}>
          취소
        </Button>
      </div>
    </form>
  );
}
