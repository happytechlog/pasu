import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findUsableInvitation } from "@/server/invitations";
import { acceptInviteAction } from "../../actions";

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>초대 수락</CardTitle>
        <CardDescription>계정을 만들어 팀에 참여합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-sm text-muted-foreground">초대를 확인하는 중…</p>}>
          <InviteForm params={params} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function InviteForm({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  await connection();
  const { token } = await params;
  const inv = await findUsableInvitation(token);

  if (!inv) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-destructive">초대 링크가 유효하지 않거나 만료되었습니다(유효기간 7일).</p>
        <p className="text-muted-foreground">관리자에게 새 초대를 요청하세요.</p>
        <Link href="/login" className="underline underline-offset-4">
          로그인으로 이동
        </Link>
      </div>
    );
  }

  return (
    <ActionForm action={acceptInviteAction} submitLabel="가입하기" pendingLabel="가입 중…">
      <input type="hidden" name="token" value={token} />
      <Field label="이메일" id="email" type="email" value={inv.email} readOnly disabled />
      <Field label="이름" id="name" autoComplete="name" required autoFocus />
      <Field label="비밀번호 (8자 이상)" id="password" type="password" autoComplete="new-password" minLength={8} required />
    </ActionForm>
  );
}
