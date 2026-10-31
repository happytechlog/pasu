import { Suspense } from "react";
import { asc, count, eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { alertChannels, monitorAlertChannels } from "@/lib/db/schema";
import { maskSecret } from "@/lib/notify/message";
import { requireUser } from "@/server/session";
import { ConfirmSubmit } from "../../monitors/confirm-submit";
import { createChannelAction, deleteChannelAction, testChannelAction, toggleChannelAction } from "./actions";
import { TestSendButton } from "./test-send-button";

const typeLabel = { slack: "Slack", email: "이메일" } as const;

export default function AlertChannelsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">알림채널</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        <AlertChannelsContent />
      </Suspense>
    </main>
  );
}

async function AlertChannelsContent() {
  await requireUser();
  const rows = await db
    .select({
      id: alertChannels.id,
      type: alertChannels.type,
      name: alertChannels.name,
      target: alertChannels.target,
      enabled: alertChannels.enabled,
      monitorCount: count(monitorAlertChannels.monitorId),
    })
    .from(alertChannels)
    .leftJoin(monitorAlertChannels, eq(monitorAlertChannels.channelId, alertChannels.id))
    .groupBy(alertChannels.id)
    .orderBy(asc(alertChannels.createdAt));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>채널 추가</CardTitle>
          <CardDescription>
            모니터가 다운되거나 복구되면 그 모니터에 연결된 채널로 알림을 보냅니다. 채널은 팀 전체가 함께 씁니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createChannelAction} submitLabel="채널 추가" pendingLabel="추가하는 중…" className="flex max-w-xl flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="type">종류</Label>
              <select id="type" name="type" defaultValue="slack" className="h-8 rounded-lg border bg-transparent px-2 text-sm">
                <option value="slack">Slack (Incoming Webhook)</option>
                <option value="email">이메일</option>
              </select>
            </div>
            <Field label="이름" id="name" required maxLength={50} placeholder="예: 운영팀 Slack" />
            <Field
              label="Webhook URL 또는 이메일 주소"
              id="target"
              required
              autoComplete="off"
              placeholder="https://hooks.slack.com/services/… 또는 ops@example.com"
            />
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>채널 ({rows.length})</CardTitle>
          <CardDescription>Slack webhook URL은 보안을 위해 끝 4자리만 표시합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 채널이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>종류</TableHead>
                  <TableHead>대상</TableHead>
                  <TableHead className="text-right">연결된 모니터</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} className={c.enabled ? undefined : "opacity-60"}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{typeLabel[c.type]}</TableCell>
                    <TableCell className="font-mono text-xs">{c.type === "slack" ? maskSecret(c.target) : c.target}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.monitorCount}개</TableCell>
                    <TableCell>
                      {c.enabled ? <Badge variant="secondary">켜짐</Badge> : <Badge variant="outline">꺼짐</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <TestSendButton id={c.id} action={testChannelAction} />
                        <form action={toggleChannelAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <Button type="submit" variant="outline" size="sm">
                            {c.enabled ? "끄기" : "켜기"}
                          </Button>
                        </form>
                        <form action={deleteChannelAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <ConfirmSubmit
                            variant="destructive"
                            size="sm"
                            message={`'${c.name}' 채널을 삭제할까요? 연결된 모니터 ${c.monitorCount}개에서도 빠집니다.`}
                          >
                            삭제
                          </ConfirmSubmit>
                        </form>
                      </div>
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
