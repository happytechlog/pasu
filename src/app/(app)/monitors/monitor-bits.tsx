import { Badge } from "@/components/ui/badge";
import { HEAT_BAR_SIZE, type RecentCheck } from "@/server/dashboard";
import { sslDaysLeft } from "@/lib/monitor/stats";
import { dateTimeFormat } from "@/lib/timezone";

// Small presentational pieces shared by the monitor list and detail pages.
// `timeZone` is the viewer's (getViewerTimeZone in src/server/timezone.ts).

export function formatDateTime(d: Date, timeZone: string): string {
  return dateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "medium", timeZone }).format(d);
}

export function StatusBadge({ enabled, status }: { enabled: boolean; status: "pending" | "up" | "down" }) {
  if (!enabled) return <Badge variant="outline">일시정지</Badge>;
  if (status === "up") return <Badge className="bg-status-up text-white">● 정상</Badge>;
  if (status === "down") return <Badge className="bg-status-down text-white">▲ 장애</Badge>;
  return <Badge variant="secondary">대기</Badge>;
}

export function checkSummary(c: RecentCheck, timeZone: string): string {
  const when = formatDateTime(c.checkedAt, timeZone);
  if (c.ok) return `${when} · 정상 · ${c.statusCode ?? ""} · ${c.responseTimeMs ?? "?"}ms`;
  return `${when} · 실패 · ${c.error ?? (c.statusCode ? `HTTP ${c.statusCode}` : "알 수 없음")}`;
}

/** Last HEAT_BAR_SIZE checks, oldest left → newest right. Empty slots pad the left. */
export function HeatBar({ recent, timeZone }: { recent: RecentCheck[]; timeZone: string }) {
  const slots: (RecentCheck | null)[] = [
    ...Array<null>(Math.max(0, HEAT_BAR_SIZE - recent.length)).fill(null),
    ...[...recent].reverse(),
  ];
  const failed = recent.filter((c) => !c.ok).length;
  return (
    <div
      className="flex h-6 items-stretch gap-0.5"
      role="img"
      aria-label={recent.length ? `최근 ${recent.length}회 중 실패 ${failed}회` : "체크 기록 없음"}
    >
      {slots.map((c, i) => (
        <span
          key={i}
          title={c ? checkSummary(c, timeZone) : undefined}
          className={`w-1.5 rounded-sm ${c === null ? "bg-status-empty" : c.ok ? "bg-status-up" : "bg-status-down"}`}
        />
      ))}
    </div>
  );
}

export function SslDays({ expiresAt }: { expiresAt: Date | null }) {
  const days = sslDaysLeft(expiresAt);
  if (days === null) return <span className="text-muted-foreground">—</span>;
  if (days < 0) return <span className="font-medium text-destructive">만료됨</span>;
  if (days <= 14) return <span className="font-medium text-destructive">{days}일</span>;
  return <span>{days}일</span>;
}
