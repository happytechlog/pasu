import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AutoRefresh } from "@/components/auto-refresh";
import { dayLevel, formatUptime, uptimePercent, type DayRow } from "@/lib/monitor/stats";
import { SLUG_PATTERN } from "@/lib/status-page/input";
import { dateTimeFormat, timeZoneLabel } from "@/lib/timezone";
import { getPublicStatusPage, getStatusPageTitle, type PublicMonitor, type PublicMonitorStatus } from "@/server/status-pages";
import { getViewerTimeZone } from "@/server/timezone";

// Public, no login (see PUBLIC_PREFIXES in src/proxy.ts). Only the fields in
// PublicMonitor are ever read here: never monitor URLs or check errors.

export async function generateMetadata({ params }: PageProps<"/status/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const title = SLUG_PATTERN.test(slug) ? await getStatusPageTitle(slug) : null;
  return { title: title ?? "상태 페이지" };
}

export default function PublicStatusPage({ params }: PageProps<"/status/[slug]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12">
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        <StatusContent params={params} />
      </Suspense>
    </main>
  );
}

async function StatusContent({ params }: Pick<PageProps<"/status/[slug]">, "params">) {
  await connection(); // "today" and the footer time are per request
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) notFound();
  const [page, tz] = await Promise.all([getPublicStatusPage(slug), getViewerTimeZone()]);
  if (!page) notFound();
  const now = new Date();
  const updatedAt = dateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(now);

  const active = page.monitors.filter((m) => m.status !== "paused");
  const down = active.filter((m) => m.status === "down").length;

  return (
    <>
      <AutoRefresh />
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold">{page.title}</h1>
        <OverallBanner down={down} total={active.length} />
      </header>

      {page.monitors.length === 0 ? (
        <p className="rounded-lg border p-10 text-center text-sm text-muted-foreground">표시할 서비스가 없습니다.</p>
      ) : (
        <section className="flex flex-col divide-y rounded-lg border">
          {page.monitors.map((m, i) => (
            <MonitorRow key={i} m={m} />
          ))}
        </section>
      )}

      <footer className="text-center text-xs text-muted-foreground">
        30초마다 자동 갱신 · 마지막 갱신 {updatedAt} ({timeZoneLabel(tz, now)}) · 일별 막대는 한국 시간(KST) 날짜 기준
      </footer>
    </>
  );
}

function OverallBanner({ down, total }: { down: number; total: number }) {
  if (total === 0) return null;
  if (down === 0) {
    return <p className="rounded-lg bg-status-up px-4 py-3 font-medium text-white">● 모든 서비스가 정상 운영 중입니다</p>;
  }
  return (
    <p className="rounded-lg bg-status-down px-4 py-3 font-medium text-white">
      ▲ {down === total ? "모든 서비스에 장애가 있습니다" : `${total}개 중 ${down}개 서비스에 장애가 있습니다`}
    </p>
  );
}

const statusLabel: Record<PublicMonitorStatus, { text: string; className: string }> = {
  up: { text: "정상", className: "text-status-up" },
  down: { text: "장애", className: "text-status-down" },
  pending: { text: "확인 중", className: "text-muted-foreground" },
  paused: { text: "일시정지", className: "text-muted-foreground" },
};

const levelClass = {
  empty: "bg-status-empty",
  up: "bg-status-up",
  partial: "bg-status-partial",
  down: "bg-status-down",
} as const;

function dayTitle(d: DayRow): string {
  if (d.total === 0) return `${d.day} · 데이터 없음`;
  return `${d.day} · 가동률 ${formatUptime(uptimePercent(d.ok, d.total))}`;
}

function MonitorRow({ m }: { m: PublicMonitor }) {
  const s = statusLabel[m.status];
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium">{m.name}</span>
        <span className={`text-sm font-medium ${s.className}`}>{s.text}</span>
      </div>
      <div className="flex h-8 items-stretch gap-px" role="img" aria-label={`최근 ${m.days.length}일 일별 가동률`}>
        {m.days.map((d) => (
          <span key={d.day} title={dayTitle(d)} className={`min-w-0 flex-1 rounded-[1px] ${levelClass[dayLevel(d.ok, d.total)]}`} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{m.days.length}일 전</span>
        <span>{m.total > 0 ? `가동률 ${formatUptime(uptimePercent(m.ok, m.total))}` : "데이터 없음"}</span>
        <span>오늘</span>
      </div>
    </div>
  );
}
