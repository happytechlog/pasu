import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { countUsers, getCurrentUser } from "@/server/session";
import { signInAction } from "../actions";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>로그인</CardTitle>
        <CardDescription>파수에 로그인합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
          <LoginForm searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function LoginForm({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  if (await getCurrentUser()) redirect("/");
  if ((await countUsers()) === 0) redirect("/setup");
  const { next } = await searchParams;

  return (
    <ActionForm action={signInAction} submitLabel="로그인" pendingLabel="로그인 중…">
      <input type="hidden" name="next" value={typeof next === "string" ? next : "/"} />
      <Field label="이메일" id="email" type="email" autoComplete="email" required autoFocus />
      <Field label="비밀번호" id="password" type="password" autoComplete="current-password" required />
    </ActionForm>
  );
}
