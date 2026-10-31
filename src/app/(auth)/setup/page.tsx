import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { countUsers } from "@/server/session";
import { setupAdminAction } from "../actions";

export default function SetupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>초기 설정</CardTitle>
        <CardDescription>첫 관리자 계정을 만듭니다. 이후 사용자는 초대로만 가입할 수 있습니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
          <SetupForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function SetupForm() {
  await connection();
  if ((await countUsers()) > 0) redirect("/login");

  return (
    <ActionForm action={setupAdminAction} submitLabel="관리자 만들기" pendingLabel="만드는 중…">
      <Field label="이름" id="name" autoComplete="name" required autoFocus />
      <Field label="이메일" id="email" type="email" autoComplete="email" required />
      <Field label="비밀번호 (8자 이상)" id="password" type="password" autoComplete="new-password" minLength={8} required />
    </ActionForm>
  );
}
