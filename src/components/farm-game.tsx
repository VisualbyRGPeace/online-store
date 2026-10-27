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

const CROPS: { key: CropKey; name: string; icon: string; seconds: number; points: number; color: string }[] = [
  { key: "greens", name: "Cải xanh", icon: "🥬", seconds: 1800, points: 10, color: "#75a94c" },
  { key: "sunflower", name: "Hướng dương", icon: "🌻", seconds: 7200, points: 25, color: "#e7b838" },
  { key: "strawberry", name: "Dâu tây", icon: "🍓", seconds: 21600, points: 60, color: "#d94b63" },
  { key: "lotus", name: "Hoa sen", icon: "🪷", seconds: 43200, points: 100, color: "#bd7d9d" },
];

function timeLeft(seconds: number) {
  if (seconds <= 0) return "Đã chín";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return hours + " giờ " + minutes + " phút";
  return Math.max(1, minutes) + " phút";
}

function growth(plot: Plot, now: number) {
  if (!plot.planted_at || !plot.grow_seconds) return { percent: 0, remaining: 0 };
  const elapsed = Math.max(0, (now - new Date(plot.planted_at).getTime()) / 1000);
  const remaining = Math.max(0, plot.grow_seconds - elapsed);
  return { percent: Math.min(100, (elapsed / plot.grow_seconds) * 100), remaining };
}

function FarmIllustration({
  farm,
  now,
  selectedPlot,
  onSelectPlot,
  compact = false,
}: {
  farm: Farm | null;
  now: number;
  selectedPlot?: number;
  onSelectPlot?: (plotNo: number) => void;
  compact?: boolean;
}) {
  const positions = [
    { x: 350, y: 112 },
    { x: 542, y: 112 },
    { x: 350, y: 270 },
    { x: 542, y: 270 },
  ];
  const plots = [1, 2, 3, 4].map((plotNo) => farm?.plots.find((plot) => plot.plot_no === plotNo) ?? {
    plot_no: plotNo, crop_key: null, planted_at: null, grow_seconds: null, watered: false,
  });
  const plotArt = (plot: Plot, index: number) => {
    const pos = positions[index];
    const crop = CROPS.find((item) => item.key === plot.crop_key);
    const state = crop ? growth(plot, now) : null;
    const stage = state ? (state.percent >= 100 ? 3 : state.percent >= 65 ? 2 : state.percent >= 25 ? 1 : 0) : -1;
    const selected = selectedPlot === plot.plot_no;
    const plants = Array.from({ length: stage < 0 ? 0 : stage === 0 ? 2 : stage === 1 ? 3 : 4 }, (_, plantIndex) => {
      const px = pos.x + 35 + plantIndex * 29;
      const py = pos.y + 74 + (plantIndex % 2) * 16;
      return (
        <g key={plantIndex} transform={"translate(" + px + " " + py + ")"}>
          <ellipse cy="5" rx="13" ry="4" fill="#382514" opacity=".18" />
          <path d="M0 2 C-2 -7 -1 -14 0 -20" fill="none" stroke={crop?.color ?? "#7cae56"} strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="-6" cy="-11" rx="7" ry="3.5" fill={crop?.color ?? "#7cae56"} transform="rotate(-28 -6 -11)" />
          <ellipse cx="7" cy="-16" rx="7" ry="3.5" fill="#91bd63" transform="rotate(28 7 -16)" />
          {stage >= 2 && <ellipse cx="0" cy="-23" rx="4" ry="7" fill="#a7c962" />}
          {stage === 3 && <text x="0" y="-23" textAnchor="middle" fontSize="18">{crop?.icon}</text>}
        </g>
      );
    });
    return (
      <g
        key={plot.plot_no}
        role={onSelectPlot ? "button" : undefined}
        tabIndex={onSelectPlot ? 0 : undefined}
        aria-label={"Luống " + plot.plot_no + (crop ? ", " + crop.name : ", đất trống")}
        aria-pressed={onSelectPlot ? selected : undefined}
        onClick={onSelectPlot ? () => onSelectPlot(plot.plot_no) : undefined}
        onKeyDown={onSelectPlot ? (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectPlot(plot.plot_no);
          }
        } : undefined}
        className={onSelectPlot ? "cursor-pointer outline-none" : undefined}
      >
        <rect x={pos.x - 7} y={pos.y - 7} width="170" height="132" rx="17" fill="#79512f" opacity=".24" />
        <rect x={pos.x} y={pos.y} width="156" height="118" rx="14" fill="url(#farmWood)" />
        <rect x={pos.x + 6} y={pos.y + 6} width="144" height="106" rx="10" fill="url(#farmSoil)" />
        {[0, 1, 2].map((row) => (
          <path key={row} d={"M" + (pos.x + 14) + " " + (pos.y + 43 + row * 23) + " Q" + (pos.x + 78) + " " + (pos.y + 35 + row * 23) + " " + (pos.x + 142) + " " + (pos.y + 43 + row * 23)} fill="none" stroke="#5e3d25" strokeWidth="5" strokeLinecap="round" opacity=".58" />
        ))}
        {plants}
        <rect x={pos.x + 13} y={pos.y + 10} width="130" height="20" rx="10" fill="#3b281b" opacity=".72" />
        <text x={pos.x + 78} y={pos.y + 24} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
          {crop ? crop.name + (state?.remaining === 0 ? " · Chín rồi" : " · " + timeLeft(state?.remaining ?? 0)) : "Đất trống"}
        </text>
        {crop && state && state.remaining > 0 && (
          <>
            <rect x={pos.x + 15} y={pos.y + 102} width="126" height="5" rx="3" fill="#3b281b" opacity=".65" />
            <rect x={pos.x + 15} y={pos.y + 102} width={126 * state.percent / 100} height="5" rx="3" fill="#b6d87b" />
          </>
        )}
        {plot.watered && <path d={"M" + (pos.x + 137) + " " + (pos.y + 38) + "q7 9 0 14q-7-5 0-14z"} fill="#81c9df" stroke="#fff" strokeWidth="1.5" />}
        {selected && <rect x={pos.x - 5} y={pos.y - 5} width="166" height="128" rx="16" fill="none" stroke="#fff8d8" strokeWidth="3" strokeDasharray="7 5" />}
        {onSelectPlot && <rect x={pos.x - 7} y={pos.y - 7} width="170" height="132" rx="17" fill="transparent" stroke="transparent" className="focus-visible:stroke-white" />}
      </g>
    );
  };

  return (
    <div className={"relative overflow-hidden " + (compact ? "aspect-[1.55] rounded-xl" : "aspect-[1.72] rounded-2xl sm:rounded-[22px]")}>
      <svg viewBox="0 0 760 450" preserveAspectRatio="xMidYMid meet" role="img" aria-label={"Khung cảnh " + (farm?.farm_name ?? "nông trại")} className="h-full w-full">
        <defs>
          <linearGradient id="farmGrass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b2d98b" />
            <stop offset="1" stopColor="#82b663" />
          </linearGradient>
          <linearGradient id="farmPath" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4e5bf" />
            <stop offset="1" stopColor="#ddc58f" />
          </linearGradient>
          <linearGradient id="farmSoil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a8794c" />
            <stop offset="1" stopColor="#70492e" />
          </linearGradient>
          <linearGradient id="farmWood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c99c66" />
            <stop offset="1" stopColor="#8c623a" />
          </linearGradient>
          <pattern id="farmGrassLines" width="32" height="30" patternUnits="userSpaceOnUse">
            <path d="M7 22l2-6m1 6 4-4m11-7 2-5" stroke="#5f994b" strokeWidth="1.5" strokeLinecap="round" opacity=".36" />
          </pattern>
          <pattern id="farmSoilRows" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M0 11h12" stroke="#5f3c25" strokeWidth="1.5" opacity=".4" />
          </pattern>
        </defs>
        <rect width="760" height="450" fill="url(#farmGrass)" />
        <rect width="760" height="450" fill="url(#farmGrassLines)" />
        <ellipse cx="645" cy="58" rx="145" ry="72" fill="#d5e9aa" opacity=".38" />
        <ellipse cx="58" cy="390" rx="120" ry="44" fill="#6fa958" opacity=".3" />
        <path d="M203 167 C267 178 270 250 314 267 C334 276 329 299 329 330" fill="none" stroke="#b89c68" strokeWidth="52" strokeLinecap="round" />
        <path d="M203 167 C267 178 270 250 314 267 C334 276 329 299 329 330" fill="none" stroke="url(#farmPath)" strokeWidth="42" strokeLinecap="round" />
        <path d="M297 244 C344 210 366 205 415 207" fill="none" stroke="#cbb27d" strokeWidth="34" strokeLinecap="round" />
        <path d="M297 244 C344 210 366 205 415 207" fill="none" stroke="#f2e4bf" strokeWidth="26" strokeLinecap="round" />
        <ellipse cx="75" cy="321" rx="52" ry="28" fill="#d8c08e" />
        <ellipse cx="75" cy="318" rx="44" ry="20" fill="#79bed0" />
        <path d="M51 313q16-13 34-7" fill="none" stroke="#dff7f4" strokeWidth="3" strokeLinecap="round" opacity=".8" />
        <ellipse cx="75" cy="343" rx="48" ry="9" fill="#426938" opacity=".17" />
        <g transform="translate(40 97)">
          <ellipse cx="105" cy="150" rx="126" ry="16" fill="#446739" opacity=".22" />
          <rect x="7" y="48" width="195" height="95" rx="12" fill="#f7edda" stroke="#805b3d" strokeWidth="4" />
          <path d="M0 57 105 0l105 57" fill="#b85f4b" stroke="#894633" strokeWidth="8" strokeLinejoin="round" />
          <path d="M105 7 200 58v17l-95-50z" fill="#9d4b3d" opacity=".5" />
          <rect x="24" y="74" width="35" height="28" rx="4" fill="#a7d7e6" stroke="#805b3d" strokeWidth="4" />
          <path d="M41 74v28M24 88h35" stroke="#fff3d7" strokeWidth="3" />
          <rect x="146" y="74" width="35" height="28" rx="4" fill="#a7d7e6" stroke="#805b3d" strokeWidth="4" />
          <path d="M163 74v28M146 88h35" stroke="#fff3d7" strokeWidth="3" />
          <rect x="83" y="86" width="43" height="57" rx="5" fill="#a8794c" stroke="#805b3d" strokeWidth="4" />
          <circle cx="117" cy="114" r="3" fill="#f7d881" />
          <rect x="159" y="18" width="24" height="36" rx="3" fill="#a55a42" stroke="#894633" strokeWidth="3" />
        </g>
        <g aria-hidden="true">
          <g transform="translate(38 286)"><circle r="28" fill="#4b8c46" /><circle cx="-11" cy="-9" r="16" fill="#70aa56" /><circle cx="12" cy="7" r="17" fill="#5b9c4c" /><rect x="-3" y="23" width="6" height="20" rx="3" fill="#8c633c" /></g>
          <g transform="translate(273 95)"><circle r="24" fill="#4b8c46" /><circle cx="-10" cy="-7" r="14" fill="#70aa56" /><circle cx="11" cy="6" r="15" fill="#5b9c4c" /><rect x="-3" y="20" width="6" height="18" rx="3" fill="#8c633c" /></g>
          <g transform="translate(723 260)"><circle r="31" fill="#4b8c46" /><circle cx="-13" cy="-10" r="18" fill="#70aa56" /><circle cx="13" cy="8" r="18" fill="#5b9c4c" /><rect x="-4" y="26" width="8" height="22" rx="3" fill="#8c633c" /></g>
          <path d="M681 104a27 27 0 1 1 50 14h-50z" fill="#999e9b" /><ellipse cx="706" cy="108" rx="20" ry="9" fill="#7fc5d7" /><path d="M684 97q20-14 38-5" fill="none" stroke="#eafcff" strokeWidth="3" />
          <g fill="#f4d05f"><circle cx="315" cy="80" r="4" /><circle cx="326" cy="92" r="3" /><circle cx="293" cy="385" r="4" /></g>
          <g fill="#e9a5b4"><circle cx="305" cy="81" r="3" /><circle cx="338" cy="82" r="3" /><circle cx="279" cy="391" r="3" /></g>
        </g>
        {plots.map(plotArt)}
        <g transform="translate(22 20)">
          <rect width="164" height="31" rx="16" fill="#fff" fillOpacity=".78" />
          <circle cx="16" cy="15.5" r="5" fill="#e6ad45" />
          <text x="29" y="20" fontSize="13" fontWeight="800" fill="#385d34">{farm?.farm_name ?? "Nông trại mới"}</text>
        </g>
      </svg>
    </div>
  );
}

export function FarmGame() {
  const { user, loading: authLoading } = useAuth();
  const role = useQuery(
    user ? "farm-role:" + user.id : "farm-role:anonymous",
    () => user ? getMyRole(user.id) : Promise.resolve(null),
  );
  const isAdmin = !!user && role.status === "success" && role.data === "admin";
  const [farms, setFarms] = useState<Farm[]>([]);
  const [ranking, setRanking] = useState<Rank[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [cropChoice, setCropChoice] = useState<CropKey>("greens");
  const [selectedPlot, setSelectedPlot] = useState(1);

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
  const selected = ownFarm?.plots.find((plot) => plot.plot_no === selectedPlot);
  const selectedCrop = selected?.crop_key ? CROPS.find((crop) => crop.key === selected.crop_key) : null;
  const selectedGrowth = selected && selectedCrop ? growth(selected, now) : null;
  const community = farms.filter((farm) => !farm.is_mine);

  if (authLoading || (user && role.status === "loading")) {
    return <div className="mx-auto h-40 max-w-6xl animate-pulse rounded-2xl bg-emerald-50" aria-busy="true" />;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-emerald-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Nông trại đang thử nghiệm</h1>
        <p className="mt-2 text-sm text-slate-500">Tính năng này hiện chỉ dành cho quản trị viên, chưa mở công khai.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-sm font-semibold text-emerald-800">Chăm cây mỗi ngày</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#263b28]">Nông trại</h1>
          <p className="mt-2 text-sm text-slate-600">Gieo trồng, chăm sóc và thu hoạch cùng mọi người.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-50">Làm mới</button>
          {user && !ownFarm && (
            <button type="button" disabled={busy} onClick={() => void act("farm_create")} className="rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-900 disabled:opacity-50">
              Tạo nông trại
            </button>
          )}
        </div>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="space-y-4">
          <article className="overflow-hidden rounded-[24px] border border-[#d9e6c8] bg-white shadow-[0_14px_35px_rgba(51,83,42,.12)]">
            <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
              <div>
                <h2 className="text-lg font-extrabold text-[#263b28]">{ownFarm?.farm_name ?? "Mảnh đất của bạn"}</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {ownFarm ? "Nghệ nhân " + ownFarm.owner_name + " · " + ownFarm.points + " điểm" : "Tạo nông trại để bắt đầu gieo trồng."}
                </p>
              </div>
              {ownFarm && <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-900">🌱 {ownFarm.points} điểm</span>}
            </div>

            <div className="p-2 pt-0 sm:p-3 sm:pt-0">
              {loading ? (
                <div className="aspect-[1.72] animate-pulse rounded-2xl bg-emerald-100" />
              ) : (
                <FarmIllustration farm={ownFarm ?? null} now={now} selectedPlot={selectedPlot} onSelectPlot={setSelectedPlot} />
              )}
            </div>

            {ownFarm ? (
              <div className="border-t border-emerald-100 bg-[#fbfcf8] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-[#2d432d]">Luống {selectedPlot}</h3>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {selectedCrop && selectedGrowth
                        ? selectedCrop.name + (selectedGrowth.remaining === 0 ? " đã chín, sẵn sàng thu hoạch." : " đang lớn · còn " + timeLeft(selectedGrowth.remaining))
                        : "Đất đang nghỉ. Chọn cây để gieo trồng."}
                    </p>
                  </div>
                  {selectedCrop && selectedGrowth && selectedGrowth.remaining > 0 && !selected?.watered && (
                    <button disabled={busy} type="button" onClick={() => void act("farm_water", { p_plot_no: selectedPlot })} className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-900 hover:bg-sky-100 disabled:opacity-50">💧 Tưới nước</button>
                  )}
                  {selectedCrop && selectedGrowth?.remaining === 0 && (
                    <button disabled={busy} type="button" onClick={() => void act("farm_harvest", { p_plot_no: selectedPlot })} className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-extrabold text-amber-950 hover:bg-amber-300 disabled:opacity-50">Thu hoạch +{selectedCrop.points}</button>
                  )}
                </div>

                {!selectedCrop ? (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Chọn cây giống</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {CROPS.map((crop) => (
                        <button key={crop.key} type="button" onClick={() => setCropChoice(crop.key)} aria-pressed={cropChoice === crop.key} className={"rounded-xl border px-3 py-2.5 text-left text-sm font-bold transition " + (cropChoice === crop.key ? "border-emerald-700 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-600" : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300")}>
                          <span className="mr-1.5">{crop.icon}</span>{crop.name}
                          <span className="mt-0.5 block text-xs font-medium text-slate-500">{timeLeft(crop.seconds)} · {crop.points} điểm</span>
                        </button>
                      ))}
                    </div>
                    <button disabled={busy} type="button" onClick={() => void act("farm_plant", { p_plot_no: selectedPlot, p_crop_key: cropChoice })} className="mt-3 rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-50">Gieo cây</button>
                  </div>
                ) : selectedGrowth && selectedGrowth.remaining > 0 ? (
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs font-semibold text-slate-500"><span>Tiến độ lớn</span><span>{Math.round(selectedGrowth.percent)}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: selectedGrowth.percent + "%" }} /></div>
                    {selected?.watered && <p className="mt-2 text-xs font-medium text-sky-800">Luống này đã được tưới.</p>}
                  </div>
                ) : null}
              </div>
            ) : !loading && (
              <div className="border-t border-emerald-100 bg-[#fbfcf8] p-4 text-sm text-slate-600 sm:p-5">
                Chưa có nông trại riêng. Nhấn <strong>Tạo nông trại</strong> để nhận mảnh đất đầu tiên.
              </div>
            )}
          </article>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-[#263b28]">Nông trại cộng đồng</h2>
                <p className="text-sm text-slate-500">Ghé xem những mảnh vườn khác.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-900">{community.length}</span>
            </div>
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map((item) => <div key={item} className="aspect-[1.55] animate-pulse rounded-2xl bg-emerald-50" />)}</div>
            ) : community.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {community.map((farm) => (
                  <article key={farm.farm_name + farm.created_at} className="overflow-hidden rounded-2xl border border-emerald-100 bg-white p-2 shadow-sm">
                    <FarmIllustration farm={farm} now={now} compact />
                    <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-[#263b28]">{farm.farm_name}</h3>
                        <p className="truncate text-xs text-slate-500">Nghệ nhân {farm.owner_name}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">🌱 {farm.points}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : !error ? (
              <div className="rounded-2xl border border-dashed border-emerald-200 bg-white p-6 text-center text-sm text-slate-500">Các nông trại cộng đồng sẽ xuất hiện tại đây.</div>
            ) : null}
          </section>
        </section>

        <aside className="rounded-[22px] border border-[#e5e7dc] bg-white p-4 shadow-[0_8px_24px_rgba(51,83,42,.07)] sm:p-5">
          <p className="text-xs font-extrabold uppercase tracking-[.14em] text-emerald-800">Xếp hạng tuần</p>
          <h2 className="mt-1 text-lg font-extrabold text-[#263b28]">Người chăm cây</h2>
          {ranking.length ? (
            <ol className="mt-4 space-y-2">
              {ranking.map((entry, index) => (
                <li key={entry.owner_name + index} className={"flex items-center gap-3 rounded-xl px-3 py-2.5 " + (index === 0 ? "bg-amber-50" : "bg-[#f7f8f4]")}>
                  <span className={"grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold " + (index === 0 ? "bg-amber-300 text-amber-950" : "bg-white text-slate-600")}>{index === 0 ? "♛" : index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{entry.owner_name}</span>
                  <span className="shrink-0 text-xs font-bold text-emerald-900">{entry.weekly_points} điểm</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 rounded-xl bg-[#f7f8f4] p-4 text-sm text-slate-500">Bảng xếp hạng sẽ hiện khi có lượt thu hoạch.</p>
          )}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-sm font-bold text-slate-700">Chăm cây mỗi ngày</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Cây tự lớn theo thời gian. Tưới một lần để rút ngắn thời gian phát triển.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
