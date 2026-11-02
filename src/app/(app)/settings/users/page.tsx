import { Suspense } from "react";
import { and, asc, gt, isNull } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { invitations, user } from "@/lib/db/schema";
import { dateTimeFormat } from "@/lib/timezone";
import { requireAdmin } from "@/server/session";
import { getViewerTimeZone } from "@/server/timezone";
import {
  cancelInvitationAction,
  changeRoleAction,
  deleteUserAction,
  inviteUserAction,
} from "./actions";

const roleLabel = { admin: "관리자", member: "멤버" } as const;

export default function UsersPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">사용자</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        <UsersContent />
      </Suspense>
    </main>
  );
}

async function UsersContent() {
  const me = await requireAdmin();
  const [users, pending, tz] = await Promise.all([
    db.select().from(user).orderBy(asc(user.createdAt)),
    db
      .select()
      .from(invitations)
      .where(and(isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
      .orderBy(asc(invitations.createdAt)),
    getViewerTimeZone(),
  ]);
  const fmt = dateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: tz });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>초대하기</CardTitle>
          <CardDescription>초대 링크는 7일 동안 유효합니다. 같은 이메일로 다시 초대하면 이전 링크는 무효가 됩니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={inviteUserAction}
            submitLabel="초대 메일 보내기"
            pendingLabel="보내는 중…"
            className="flex max-w-md flex-col gap-4"
          >
            <Field label="이메일" id="email" type="email" required />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role">권한</Label>
              <select id="role" name="role" defaultValue="member" className="h-8 rounded-lg border bg-transparent px-2 text-sm">
                <option value="member">멤버</option>
                <option value="admin">관리자</option>
              </select>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>사용자 ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>권한</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isMe = u.id === me.id;
                const other = u.role === "admin" ? "member" : "admin";
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      {u.name}
                      {isMe && <span className="ml-1 text-muted-foreground">(나)</span>}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>{roleLabel[u.role]}</Badge>
                    </TableCell>
                    <TableCell>{fmt.format(u.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {!isMe && (
                        <div className="flex justify-end gap-2">
                          <form action={changeRoleAction}>
                            <input type="hidden" name="id" value={u.id} />
                            <input type="hidden" name="role" value={other} />
                            <Button type="submit" variant="outline" size="sm">
                              {roleLabel[other]}로 변경
                            </Button>
                          </form>
                          <form action={deleteUserAction}>
                            <input type="hidden" name="id" value={u.id} />
                            <Button type="submit" variant="destructive" size="sm">
                              삭제
                            </Button>
                          </form>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>대기 중인 초대 ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">대기 중인 초대가 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이메일</TableHead>
                  <TableHead>권한</TableHead>
                  <TableHead>만료</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>{roleLabel[inv.role]}</TableCell>
                    <TableCell>{fmt.format(inv.expiresAt)}</TableCell>
                    <TableCell className="text-right">
                      <form action={cancelInvitationAction}>
                        <input type="hidden" name="id" value={inv.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          취소
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
