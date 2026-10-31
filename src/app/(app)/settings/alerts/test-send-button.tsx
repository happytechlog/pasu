"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { TestSendState } from "./actions";

export function TestSendButton({
  id,
  action: send,
}: {
  id: string;
  action: (state: TestSendState, fd: FormData) => Promise<TestSendState>;
}) {
  const [state, action, pending] = useActionState(send, undefined);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {state && !pending && (
        <span role="status" className={`text-xs ${state.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {state.message}
        </span>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "보내는 중…" : "테스트 발송"}
      </Button>
    </form>
  );
}
