import { Suspense } from "react";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { monitors } from "@/lib/db/schema";
import { requireUser } from "@/server/session";
import { deleteMonitorAction, toggleMonitorAction } from "./monitors/actions";
import { ConfirmSubmit } from "./monitors/confirm-submit";

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Seoul" });

// Monitor list. The full dashboard (uptime, heat bar, polling) comes in stage 5.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">모니터</h1>
        <Button render={<Link href="/monitors/new" />} nativeButton={false}>
          모니터 추가
        </Button>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        <MonitorList />
      </Suspense>
    </main>
  );
}

function StatusBadge({ enabled, status }: { enabled: boolean; status: "pending" | "up" | "down" }) {
  if (!enabled) return <Badge variant="outline">일시정지</Badge>;
  if (status === "up") return <Badge className="bg-green-600 text-white">정상</Badge>;
  if (status === "down") return <Badge variant="destructive">장애</Badge>;
  return <Badge variant="secondary">대기</Badge>;
}

async function MonitorList() {
  await requireUser();
  const rows = await db.select().from(monitors).orderBy(asc(monitors.name), asc(monitors.createdAt));

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
        아직 모니터가 없습니다. 오른쪽 위의 <strong>모니터 추가</strong>로 첫 모니터를 등록하세요.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>이름</TableHead>
          <TableHead>상태</TableHead>
          <TableHead>간격</TableHead>
          <TableHead>마지막 체크</TableHead>
          <TableHead className="text-right">관리</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((m) => (
          <TableRow key={m.id} className={m.enabled ? undefined : "opacity-60"}>
            <TableCell className="max-w-xs">
              <div className="font-medium">{m.name}</div>
              <div className="truncate text-xs text-muted-foreground" title={m.url}>
                {m.method !== "GET" && <span className="mr-1 font-mono">{m.method}</span>}
                {m.url}
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge enabled={m.enabled} status={m.status} />
            </TableCell>
            <TableCell>{m.intervalSec === 300 ? "5분" : "1분"}</TableCell>
            <TableCell className="text-muted-foreground">
              {m.lastCheckedAt ? fmt.format(m.lastCheckedAt) : "—"}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" render={<Link href={`/monitors/${m.id}/edit`} />} nativeButton={false}>
                  수정
                </Button>
                <form action={toggleMonitorAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <Button type="submit" variant="outline" size="sm">
                    {m.enabled ? "일시정지" : "재개"}
                  </Button>
                </form>
                <form action={deleteMonitorAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <ConfirmSubmit variant="destructive" size="sm" message={`'${m.name}' 모니터를 삭제할까요?`}>
                    삭제
                  </ConfirmSubmit>
                </form>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
