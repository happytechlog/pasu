"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { MonitorFormValues } from "@/lib/monitor/input";
import type { MonitorFormState } from "./actions";

export type ChannelOption = { id: string; name: string; type: "slack" | "email"; enabled: boolean };

export const DEFAULT_VALUES: MonitorFormValues = {
  name: "",
  url: "https://",
  intervalSec: "60",
  method: "GET",
  timeoutSec: "10",
  expectedStatus: "2xx",
  channelIds: [],
};

const selectClass = "h-8 rounded-lg border bg-transparent px-2 text-sm";
const channelTypeLabel = { slack: "Slack", email: "이메일" } as const;

export function MonitorForm({
  action,
  initial,
  channels,
  submitLabel,
}: {
  action: (state: MonitorFormState, fd: FormData) => Promise<MonitorFormState>;
  initial: MonitorFormValues;
  channels: ChannelOption[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  // React resets the form after an action; remounting the fields with the
  // submitted values (keyed on the state object) keeps the user's input on errors.
  const v = state?.values ?? initial;
  const advancedChanged =
    v.method !== DEFAULT_VALUES.method ||
    v.timeoutSec !== DEFAULT_VALUES.timeoutSec ||
    v.expectedStatus !== DEFAULT_VALUES.expectedStatus;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <div key={JSON.stringify(state ?? null)} className="flex flex-col gap-5">
        <Field label="이름" id="name" defaultValue={v.name} required maxLength={100} placeholder="API 서버" />
        <Field label="URL" id="url" type="url" defaultValue={v.url} required placeholder="https://example.com" />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="intervalSec">체크 간격</Label>
          <select id="intervalSec" name="intervalSec" defaultValue={v.intervalSec} className={selectClass}>
            <option value="60">1분</option>
            <option value="300">5분</option>
          </select>
        </div>

        <details open={advancedChanged} className="rounded-lg border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">고급 설정</summary>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="method">HTTP 메서드</Label>
              <select id="method" name="method" defaultValue={v.method} className={selectClass}>
                <option value="GET">GET</option>
                <option value="HEAD">HEAD</option>
              </select>
            </div>
            <Field
              label="타임아웃(초, 1~30)"
              id="timeoutSec"
              type="number"
              min={1}
              max={30}
              step={1}
              defaultValue={v.timeoutSec}
              required
            />
            <div className="flex flex-col gap-1.5">
              <Field label="기대 상태코드" id="expectedStatus" defaultValue={v.expectedStatus} required />
              <p className="text-xs text-muted-foreground">
                쉼표로 구분합니다. 예: <code>2xx</code>, <code>200,301</code>, <code>2xx,3xx</code>
              </p>
            </div>
          </div>
        </details>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">알림 채널</legend>
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              등록된 알림 채널이 없습니다. 채널은{" "}
              <Link href="/settings/alerts" className="underline underline-offset-2">
                알림채널
              </Link>
              에서 추가할 수 있습니다.
            </p>
          ) : (
            channels.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="channelIds"
                  value={c.id}
                  defaultChecked={v.channelIds.includes(c.id)}
                  className="size-4"
                />
                <span>{c.name}</span>
                <span className="text-muted-foreground">({channelTypeLabel[c.type]})</span>
                {!c.enabled && <span className="text-muted-foreground">· 꺼짐</span>}
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
        <Button variant="outline" render={<Link href="/" />} nativeButton={false}>
          취소
        </Button>
      </div>
    </form>
  );
}
