"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@/hooks/use-query";
import { getMyRole } from "@/services/admin-order-service";
import { createClient } from "@/lib/supabase/client";

type CropKey = "greens" | "sunflower" | "strawberry" | "lotus";
type Plot = {
  plot_no: number;
  crop_key: CropKey | null;
  planted_at: string | null;
  grow_seconds: number | null;
  watered: boolean;
};
type Farm = {
  is_mine: boolean;
  farm_name: string;
  owner_name: string;
  points: number;
  created_at: string;
  plots: Plot[];
};
type Rank = { owner_name: string; total_points: number; weekly_points: number };

const CROPS: { key: CropKey; name: string; icon: string; seconds: number; points: number }[] = [
  { key: "greens", name: "Cải xanh", icon: "🥬", seconds: 1800, points: 10 },
  { key: "sunflower", name: "Hướng dương", icon: "🌻", seconds: 7200, points: 25 },
  { key: "strawberry", name: "Dâu tây", icon: "🍓", seconds: 21600, points: 60 },
  { key: "lotus", name: "Hoa sen", icon: "🪷", seconds: 43200, points: 100 },
];

function timeLeft(seconds: number) {
  if (seconds <= 0) return "Đã chín";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours} giờ ${minutes} phút`;
  return `${Math.max(1, minutes)} phút`;
}

function growth(plot: Plot, now: number) {
  if (!plot.planted_at || !plot.grow_seconds) return { percent: 0, remaining: 0 };
  const elapsed = Math.max(0, (now - new Date(plot.planted_at).getTime()) / 1000);
  const remaining = Math.max(0, plot.grow_seconds - elapsed);
  return { percent: Math.min(100, (elapsed / plot.grow_seconds) * 100), remaining };
}

export function FarmGame() {
  const { user, loading: authLoading } = useAuth();
  const role = useQuery(
    user ? `farm-role:${user.id}` : "farm-role:anonymous",
    () => user ? getMyRole(user.id) : Promise.resolve(null),
  );
  const isAdmin = !!user && role.status === "success" && role.data === "admin";
  const [farms, setFarms] = useState<Farm[]>([]);
  const [ranking, setRanking] = useState<Rank[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [cropChoice, setCropChoice] = useState<Record<number, CropKey>>({});

  const load = useCallback(async () => {
    const supabase = createClient();
    const [farmResult, rankResult] = await Promise.all([
      supabase.rpc("farm_list_public", { p_limit: 36 }),
      supabase.rpc("farm_leaderboard", { p_limit: 10 }),
    ]);
    if (farmResult.error || rankResult.error) {
      setError("Chưa cài dữ liệu nông trại trên Supabase. Quản trị viên cần chạy migration nông trại.");
      setFarms([]);
      setRanking([]);
    } else {
      setError("");
      setFarms((farmResult.data ?? []) as Farm[]);
      setRanking((rankResult.data ?? []) as Rank[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    void load();
  }, [authLoading, isAdmin, user?.id, load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function act(name: string, args: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    const { error: actionError } = await createClient().rpc(name, args);
    if (actionError) {
      setError(actionError.message || "Thao tác chưa thành công.");
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  }

  const ownFarm = farms.find((farm) => farm.is_mine);

  if (authLoading || (user && role.status === "loading")) {
    return <div className="mx-auto h-40 max-w-6xl animate-pulse rounded-2xl bg-slate-100" aria-busy="true" />;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Nông trại đang thử nghiệm</h1>
        <p className="mt-2 text-sm text-slate-500">Tính năng này hiện chỉ dành cho quản trị viên, chưa mở công khai.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-sm font-medium text-slate-500">Chăm cây mỗi ngày</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Nông trại</h1>
          <p className="mt-2 text-sm text-slate-500">Trồng cây, quay lại thu hoạch và ghé thăm nông trại cộng đồng.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-slate-50">Làm mới</button>
          {user && !ownFarm && (
            <button type="button" disabled={busy} onClick={() => void act("farm_create")} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              Tạo nông trại
            </button>
          )}
          {!user && !authLoading && <a href="/login/" className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Đăng nhập để chơi</a>}
        </div>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</p>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">Nông trại cộng đồng</h2>
            <span className="text-sm text-slate-500">{farms.length} nông trại</span>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((item) => <div key={item} className="h-64 animate-pulse rounded-3xl bg-slate-100" />)}
            </div>
          ) : farms.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {farms.map((farm) => (
                <article key={farm.farm_name + farm.created_at} className={`rounded-3xl border bg-white p-4 shadow-sm ${farm.is_mine ? "border-emerald-300 ring-1 ring-emerald-100" : "border-slate-200"}`}>
                  <div className="mb-4 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-950">{farm.farm_name}</h3>
                      <p className="mt-0.5 truncate text-xs text-slate-500">Nghệ nhân {farm.owner_name}{farm.is_mine ? " · Nông trại của bạn" : ""}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">🌱 {farm.points} điểm</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {farm.plots.map((plot) => {
                      const crop = CROPS.find((item) => item.key === plot.crop_key);
                      const state = crop && plot.crop_key ? growth(plot, now) : null;
                      return (
                        <div key={plot.plot_no} className={`min-h-28 rounded-2xl border p-3 ${crop ? "border-emerald-100 bg-emerald-50/60" : "border-dashed border-stone-200 bg-stone-50"}`}>
                          {crop && state ? (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-2xl" aria-hidden="true">{crop.icon}</span>
                                <span className="text-[11px] text-slate-500">{state.remaining === 0 ? "✨" : "Ô " + plot.plot_no}</span>
                              </div>
                              <p className="mt-1 text-sm font-medium">{crop.name}</p>
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                                <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${state.percent}%` }} />
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500">{timeLeft(state.remaining)}</p>
                              {farm.is_mine && state.remaining > 0 && !plot.watered && (
                                <button disabled={busy} type="button" onClick={() => void act("farm_water", { p_plot_no: plot.plot_no })} className="mt-2 text-xs font-semibold text-sky-700 hover:underline">💧 Tưới · lớn nhanh hơn</button>
                              )}
                              {farm.is_mine && state.remaining === 0 && (
                                <button disabled={busy} type="button" onClick={() => void act("farm_harvest", { p_plot_no: plot.plot_no })} className="mt-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Thu hoạch +{crop.points}</button>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="text-2xl" aria-hidden="true">🟫</div>
                              <p className="mt-1 text-xs text-slate-500">Ô đất trống</p>
                              {farm.is_mine && (
                                <div className="mt-2 flex gap-1">
                                  <select aria-label={`Chọn cây cho ô ${plot.plot_no}`} value={cropChoice[plot.plot_no] ?? "greens"} onChange={(event) => setCropChoice((previous) => ({ ...previous, [plot.plot_no]: event.target.value as CropKey }))} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs">
                                    {CROPS.map((item) => <option key={item.key} value={item.key}>{item.icon} {item.name} · {timeLeft(item.seconds)}</option>)}
                                  </select>
                                  <button disabled={busy} type="button" onClick={() => void act("farm_plant", { p_plot_no: plot.plot_no, p_crop_key: cropChoice[plot.plot_no] ?? "greens" })} className="rounded-lg bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">Trồng</button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            !error && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Chưa có nông trại nào. Đăng nhập để tạo nông trại đầu tiên.</div>
          )}
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Bảng xếp hạng tuần</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">Nghệ nhân chăm cây</h2>
            </div>
            <span className="text-xl" aria-hidden="true">🏆</span>
          </div>
          {ranking.length ? (
            <ol className="mt-4 space-y-2">
              {ranking.map((entry, index) => (
                <li key={entry.owner_name + index} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${index === 0 ? "bg-amber-300 text-amber-950" : "bg-white text-slate-600"}`}>{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.owner_name}</span>
                  <span className="text-xs font-semibold text-slate-600">{entry.weekly_points} điểm</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Bảng xếp hạng sẽ hiện khi có lượt thu hoạch.</p>
          )}
          <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">Cây tự lớn theo thời gian. Mỗi cây có thể được tưới một lần để rút ngắn thời gian 15%.</p>
        </aside>
      </div>
    </div>
  );
}
