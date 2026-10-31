import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatUptime, uptimePercent } from "@/lib/monitor/stats";
import { listMonitorSummaries } from "@/server/dashboard";
import { requireUser } from "@/server/session";
import { deleteMonitorAction, toggleMonitorAction } from "./monitors/actions";
import { ConfirmSubmit } from "./monitors/confirm-submit";
import { dateTimeFmt, HeatBar, SslDays, StatusBadge } from "./monitors/monitor-bits";

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

async function MonitorList() {
  await requireUser();
  const rows = await listMonitorSummaries();

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
        아직 모니터가 없습니다. 오른쪽 위의 <strong>모니터 추가</strong>로 첫 모니터를 등록하세요.
        <AutoRefresh />
      </div>
    );
  }

  const down = rows.filter((m) => m.enabled && m.status === "down").length;

  return (
    <>
      <AutoRefresh />
      <p className="text-sm text-muted-foreground">
        모니터 {rows.length}개 · 장애{" "}
        <span className={down > 0 ? "font-medium text-destructive" : undefined}>{down}</span>개 · 30초마다 자동 갱신
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>최근 체크</TableHead>
            <TableHead className="text-right">응답시간</TableHead>
            <TableHead className="text-right">24h 가동률</TableHead>
            <TableHead className="text-right">SSL</TableHead>
            <TableHead className="text-right">관리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <TableRow key={m.id} className={m.enabled ? undefined : "opacity-60"}>
              <TableCell className="max-w-xs">
                <Link href={`/monitors/${m.id}`} className="font-medium hover:underline">
                  {m.name}
                </Link>
                <div className="truncate text-xs text-muted-foreground" title={m.url}>
                  {m.method !== "GET" && <span className="mr-1 font-mono">{m.method}</span>}
                  {m.url}
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge enabled={m.enabled} status={m.status} />
              </TableCell>
              <TableCell>
                <HeatBar recent={m.recent} />
                <div className="mt-1 text-xs text-muted-foreground">
                  {m.intervalSec === 300 ? "5분" : "1분"} 간격 · {m.lastCheckedAt ? dateTimeFmt.format(m.lastCheckedAt) : "체크 전"}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {m.recent[0]?.ok && m.recent[0].responseTimeMs !== null ? `${m.recent[0].responseTimeMs}ms` : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatUptime(uptimePercent(m.ok24h, m.total24h))}</TableCell>
              <TableCell className="text-right tabular-nums">
                <SslDays expiresAt={m.sslExpiresAt} />
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
    </>
  );
}
