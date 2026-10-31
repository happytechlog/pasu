"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type FormState = { error?: string; message?: string; link?: string } | undefined;
export type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

// Thin wrapper around a Server Action form: pending state + result message.
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "처리 중…",
  className = "flex flex-col gap-4",
  children,
}: {
  action: FormAction;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state?.message && <p className="text-sm text-green-700 dark:text-green-500">{state.message}</p>}
      {state?.link && (
        <input
          readOnly
          value={state.link}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-md border bg-muted px-2 py-1 font-mono text-xs"
          aria-label="초대 링크"
        />
      )}
      <Button type="submit" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
