"use client";

import { useMemo } from "react";
import type { DownloadLog } from "@/types";

const DAYS = 30;

function buildDays(logs: DownloadLog[]) {
  const counts = new Map<string, number>();
  for (const l of logs) {
    const key = new Date(l.created_at).toLocaleDateString("en-CA"); // YYYY-MM-DD in the viewer's time zone
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = new Date();
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (DAYS - 1 - i));
    const key = d.toLocaleDateString("en-CA");
    return { key, label: d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }), count: counts.get(key) ?? 0 };
  });
}

/** Downloads per day over the last 30 days. Plain HTML bars: no chart library needed. */
export function DownloadsChart({ logs }: { logs: DownloadLog[] }) {
  const days = useMemo(() => buildDays(logs), [logs]);
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const first = days[0];

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-medium">{total} lượt tải trong {DAYS} ngày qua</span>
        <span className="text-xs text-slate-400">Cao nhất: {max} lượt/ngày</span>
      </div>
      <div className="flex h-32 items-end gap-[3px]" role="img" aria-label={`Biểu đồ lượt tải mỗi ngày, ${total} lượt trong ${DAYS} ngày qua`}>
        {days.map((d) => (
          <div
            key={d.key}
            title={`${d.label}: ${d.count} lượt tải`}
            className={`flex-1 rounded-t-sm ${d.count > 0 ? "bg-black" : "bg-slate-200"}`}
            style={{ height: d.count > 0 ? `${Math.max(6, (d.count / max) * 100)}%` : "2px" }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-slate-400">
        <span>{first?.label}</span>
        <span>Hôm nay</span>
      </div>
    </div>
  );
}

/** The resources this person downloaded most. */
export function TopResources({ logs }: { logs: DownloadLog[] }) {
  const top = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of logs) counts.set(l.product_name, (counts.get(l.product_name) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [logs]);
  const max = Math.max(1, ...top.map(([, n]) => n));

  if (top.length === 0) return null;
  return (
    <ul className="space-y-3">
      {top.map(([name, n]) => (
        <li key={name} className="text-sm">
          <div className="mb-1 flex justify-between gap-4">
            <span className="truncate">{name}</span>
            <span className="shrink-0 text-slate-500">{n}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-black" style={{ width: `${(n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
