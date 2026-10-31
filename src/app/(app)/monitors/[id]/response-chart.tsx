"use client";

import { useEffect, useRef, useState } from "react";

export type ChartBucket = { t: number; total: number; failed: number; avgMs: number | null };

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 44, left: 52 };
const STRIP_H = 6; // failure strip under the plot

/** Clean y ticks (1/2/5 × 10^k steps) covering 0..max, about 4 intervals. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 25, 50, 75, 100];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

const fmtNum = new Intl.NumberFormat("ko-KR");

export function ResponseChart({ buckets, bucketMs, showDate }: { buckets: ChartBucket[]; bucketMs: number; showDate: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const timeFmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    ...(showDate ? { month: "numeric", day: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const n = buckets.length;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const yTicks = niceTicks(Math.max(0, ...buckets.map((b) => b.avgMs ?? 0)));
  const max = yTicks[yTicks.length - 1];
  const step = n > 0 ? plotW / n : 0;
  const x = (i: number) => PAD.left + (i + 0.5) * step;
  const y = (ms: number) => PAD.top + plotH - (ms / max) * plotH;

  // Line segments, broken where a bucket has no successful checks.
  const segments: string[] = [];
  let cur = "";
  buckets.forEach((b, i) => {
    if (b.avgMs === null) {
      if (cur) segments.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(b.avgMs).toFixed(1)}`;
  });
  if (cur) segments.push(cur);
  // Isolated points (single-bucket segments) get a dot so they stay visible.
  const isolated = buckets
    .map((b, i) => ({ b, i }))
    .filter(
      ({ b, i }) => b.avgMs !== null && (buckets[i - 1]?.avgMs ?? null) === null && (buckets[i + 1]?.avgMs ?? null) === null,
    );

  const xTickCount = Math.max(2, Math.min(6, Math.floor(plotW / 110)));
  const xTicks = n > 1 ? Array.from({ length: xTickCount }, (_, k) => Math.round((k * (n - 1)) / (xTickCount - 1))) : [];
  const stripY = PAD.top + plotH + 8;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left) / step);
    setHover(i >= 0 && i < n ? i : null);
  }

  const hb = hover !== null ? buckets[hover] : null;
  const tipLeft = hover !== null ? Math.min(Math.max(x(hover) + 12, 0), Math.max(0, width - 200)) : 0;

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label="평균 응답시간 차트" className="block select-none">
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {fmtNum.format(v)}ms
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={HEIGHT - 8}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {timeFmt.format(buckets[i].t)}
            </text>
          ))}

          {/* Failure strip: red where any check in the bucket failed, gray where there were no checks. */}
          {buckets.map((b, i) =>
            b.failed > 0 || b.total === 0 ? (
              <rect
                key={i}
                x={PAD.left + i * step + (step > 4 ? 1 : 0)}
                y={stripY}
                width={Math.max(1, step - (step > 4 ? 2 : 0))}
                height={STRIP_H}
                rx={1}
                className={b.failed > 0 ? "fill-status-down" : "fill-status-empty"}
              />
            ) : null,
          )}

          {segments.map((d, k) => (
            <path key={k} d={d} fill="none" className="stroke-series-1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {isolated.map(({ b, i }) => (
            <circle key={i} cx={x(i)} cy={y(b.avgMs!)} r={2.5} className="fill-series-1" />
          ))}

          {hb && hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-muted-foreground" strokeWidth={1} />
              {hb.avgMs !== null && (
                <circle cx={x(hover)} cy={y(hb.avgMs)} r={4} className="fill-series-1 stroke-background" strokeWidth={2} />
              )}
            </g>
          )}

          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotW}
            height={plotH + 8 + STRIP_H}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}

      {hb && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-48 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ left: tipLeft }}
        >
          <div className="text-muted-foreground">
            {timeFmt.format(hb.t)} – {timeFmt.format(hb.t + bucketMs)}
          </div>
          {hb.total === 0 ? (
            <div className="mt-1">체크 기록 없음</div>
          ) : (
            <>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-block h-0.5 w-3 rounded bg-series-1" />
                <span className="font-semibold tabular-nums">{hb.avgMs !== null ? `${fmtNum.format(hb.avgMs)}ms` : "—"}</span>
                <span className="text-muted-foreground">평균 응답</span>
              </div>
              <div className="mt-0.5 tabular-nums">
                체크 {hb.total}회
                {hb.failed > 0 && <span className="font-medium text-destructive"> · 실패 {hb.failed}회</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
