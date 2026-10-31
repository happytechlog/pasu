import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AutoRefresh } from "@/components/auto-refresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CHART_RANGES, formatDuration, formatUptime, parseRange, uptimePercent, type ChartRange } from "@/lib/monitor/stats";
import { getMonitor, getResponseBuckets, getUptimeWindows, listIncidents, listRecentChecks } from "@/server/dashboard";
import { requireUser } from "@/server/session";
import { toggleMonitorAction } from "../actions";
import { dateTimeFmt, HeatBar, SslDays, StatusBadge } from "../monitor-bits";
import { ResponseChart } from "./response-chart";

export default function MonitorDetailPage({ params, searchParams }: PageProps<"/monitors/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← 모니터 목록
      </Link>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        <MonitorDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold">{children}</span>
    </div>
  );
}

async function MonitorDetail({ params, searchParams }: Pick<PageProps<"/monitors/[id]">, "params" | "searchParams">) {
  await requireUser();
  const [{ id: raw }, sp] = await Promise.all([params, searchParams]);
  const id = z.uuid().safeParse(raw);
  if (!id.success) notFound();
  const range = parseRange(sp.range);

  const m = await getMonitor(id.data);
  if (!m) notFound();

  const now = new Date();
  const [uptime, buckets, incidents, recent] = await Promise.all([
    getUptimeWindows(m.id),
    getResponseBuckets(m.id, range, now),
    listIncidents(m.id),
    listRecentChecks(m.id),
  ]);
  const latest = recent[0];
  const { bucketMs } = CHART_RANGES[range];

  return (
    <>
      <AutoRefresh />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-semibold">{m.name}</h1>
            <StatusBadge enabled={m.enabled} status={m.status} />
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {m.method !== "GET" && <span className="mr-1 font-mono">{m.method}</span>}
            {m.url} · {m.intervalSec === 300 ? "5분" : "1분"} 간격 · 기대 상태코드 {m.expectedStatus}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<Link href={`/monitors/${m.id}/edit`} />} nativeButton={false}>
            수정
          </Button>
          <form action={toggleMonitorAction}>
            <input type="hidden" name="id" value={m.id} />
            <Button type="submit" variant="outline" size="sm">
              {m.enabled ? "일시정지" : "재개"}
            </Button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="현재 응답시간">{latest?.ok && latest.responseTimeMs !== null ? `${latest.responseTimeMs}ms` : "—"}</Stat>
        {(Object.keys(CHART_RANGES) as ChartRange[]).map((r) => (
          <Stat key={r} label={`가동률 (${CHART_RANGES[r].label})`}>
            {formatUptime(uptimePercent(uptime[r].ok, uptime[r].total))}
          </Stat>
        ))}
        <Stat label="SSL 남은 기간">
          <SslDays expiresAt={m.sslExpiresAt} />
        </Stat>
        <Stat label="마지막 체크">
          <span className="text-sm font-normal">{m.lastCheckedAt ? dateTimeFmt.format(m.lastCheckedAt) : "—"}</span>
        </Stat>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>평균 응답시간</CardTitle>
          <nav className="flex gap-1" aria-label="기간">
            {(Object.keys(CHART_RANGES) as ChartRange[]).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={r === range ? "default" : "outline"}
                render={<Link href={`/monitors/${m.id}?range=${r}`} scroll={false} aria-current={r === range ? "page" : undefined} />}
                nativeButton={false}
              >
                {CHART_RANGES[r].label}
              </Button>
            ))}
          </nav>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ResponseChart
            buckets={buckets.map((b) => ({ t: b.bucket.getTime(), total: b.total, failed: b.failed, avgMs: b.avgMs }))}
            bucketMs={bucketMs}
            showDate={range !== "24h"}
          />
          <p className="text-xs text-muted-foreground">
            {formatDuration(bucketMs)} 단위 평균(성공한 체크만). 아래 띠의 빨간색은 실패가 있던 구간, 회색은 체크 기록이 없는 구간입니다.
          </p>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">장애 이력</h2>
        {incidents.length === 0 ? (
          <p className="text-sm text-muted-foreground">기록된 장애가 없습니다.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>시작</TableHead>
                <TableHead>복구</TableHead>
                <TableHead>지속 시간</TableHead>
                <TableHead>원인</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="tabular-nums">{dateTimeFmt.format(i.startedAt)}</TableCell>
                  <TableCell className="tabular-nums">
                    {i.resolvedAt ? dateTimeFmt.format(i.resolvedAt) : <span className="font-medium text-destructive">진행 중</span>}
                  </TableCell>
                  <TableCell>{formatDuration((i.resolvedAt ?? now).getTime() - i.startedAt.getTime())}</TableCell>
                  <TableCell className="max-w-sm truncate" title={i.reason ?? undefined}>
                    {i.reason ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">최근 체크</h2>
          <HeatBar recent={recent} />
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 체크 기록이 없습니다.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>시각</TableHead>
                <TableHead>결과</TableHead>
                <TableHead className="text-right">상태코드</TableHead>
                <TableHead className="text-right">응답시간</TableHead>
                <TableHead>에러</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((c) => (
                <TableRow key={c.checkedAt.toISOString()}>
                  <TableCell className="tabular-nums">{dateTimeFmt.format(c.checkedAt)}</TableCell>
                  <TableCell>{c.ok ? "● 성공" : <span className="font-medium text-destructive">▲ 실패</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.statusCode ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.responseTimeMs !== null ? `${c.responseTimeMs}ms` : "—"}</TableCell>
                  <TableCell className="max-w-sm truncate" title={c.error ?? undefined}>
                    {c.error ?? ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
