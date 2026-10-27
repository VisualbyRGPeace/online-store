"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@/hooks/use-query";
import { getMyRole } from "@/services/admin-order-service";
import { createClient } from "@/lib/supabase/client";
import { FARM_PREVIEW_HTML } from "@/components/farm-preview-html";

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

const CROP_KEYS: CropKey[] = ["greens", "sunflower", "strawberry", "lotus"];

function growth(plot: Plot, now: number) {
  if (!plot.planted_at || !plot.grow_seconds) return { percent: 0, remaining: 0 };
  const elapsed = Math.max(0, (now - new Date(plot.planted_at).getTime()) / 1000);
  const remaining = Math.max(0, plot.grow_seconds - elapsed);
  return { percent: Math.min(100, (elapsed / plot.grow_seconds) * 100), remaining };
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
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  const [frameHeight, setFrameHeight] = useState(1200);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [farmResult, rankResult] = await Promise.all([
      supabase.rpc("farm_list_public", { p_limit: 36 }),
      supabase.rpc("farm_leaderboard", { p_limit: 10 }),
    ]);
    if (farmResult.error || rankResult.error) {
      setError("Chưa tải được dữ liệu nông trại. Hãy kiểm tra migration trên Supabase.");
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

  const ownFarm = farms.find((farm) => farm.is_mine);
  const community = farms.filter((farm) => !farm.is_mine);

  const sendFarmData = useCallback(() => {
    const emptyPlots = [1, 2, 3, 4].map((plotNo) => ({
      plot_no: plotNo,
      crop: null as CropKey | null,
      start: 0,
      ready: 0,
      w: false,
    }));
    const previewPlots = ownFarm
      ? [1, 2, 3, 4].map((plotNo) => {
          const plot = ownFarm.plots.find((item) => item.plot_no === plotNo);
          if (!plot?.crop_key || !plot.planted_at) {
            return { plot_no: plotNo, crop: null as CropKey | null, start: 0, ready: 0, w: false };
          }
          const start = new Date(plot.planted_at).getTime();
          return {
            plot_no: plotNo,
            crop: plot.crop_key,
            start,
            ready: start + (plot.grow_seconds ?? 0) * 1000,
            w: plot.watered,
          };
        })
      : emptyPlots;
    const previewOthers = community.map((farm) => ({
      n: farm.farm_name,
      s: farm.points,
      st: [1, 2, 3, 4].map((plotNo) => {
        const plot = farm.plots.find((item) => item.plot_no === plotNo);
        if (!plot?.crop_key) return -1;
        const progress = growth(plot, now).percent;
        return progress >= 100 ? 3 : progress >= 65 ? 2 : progress >= 25 ? 1 : 0;
      }),
    }));
    frameRef.current?.contentWindow?.postMessage({
      type: "farm:update",
      farm: {
        exists: !!ownFarm,
        name: ownFarm?.farm_name ?? "Nông trại mới",
        score: ownFarm?.points ?? 0,
        plots: previewPlots,
      },
      others: previewOthers,
      board: ranking.map((entry) => [entry.owner_name, entry.weekly_points]),
      message: error ? "Không tải được dữ liệu. Vui lòng thử lại." : notice,
    }, "*");
  }, [community, error, notice, now, ownFarm, ranking]);

  useEffect(() => {
    sendFarmData();
  }, [sendFarmData]);

  const act = useCallback(async (name: string, args: Record<string, unknown>, successText: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: actionError } = await createClient().rpc(name, args);
      if (actionError) {
        setError(actionError.message || "Thao tác chưa thành công.");
        return;
      }
      await load();
      setNotice(successText);
    } catch {
      setError("Không thể kết nối. Vui lòng thử lại.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [load]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; height?: number; action?: string; plotNo?: number; crop?: string } | null;
      if (!data) return;
      if (data.type === "farm:height" && typeof data.height === "number") {
        setFrameHeight(Math.min(24000, Math.max(700, Math.ceil(data.height))));
        return;
      }
      if (data.type === "farm:ready") {
        sendFarmData();
        return;
      }
      if (data.type === "farm:refresh") {
        setLoading(true);
        void load();
        return;
      }
      if (data.type !== "farm:action") return;
      if (data.action === "create") {
        void act("farm_create", {}, "Đã tạo nông trại.");
        return;
      }
      const plotNo = Number(data.plotNo);
      if (!Number.isInteger(plotNo) || plotNo < 1 || plotNo > 4) return;
      if (data.action === "plant" && CROP_KEYS.includes(data.crop as CropKey)) {
        void act("farm_plant", { p_plot_no: plotNo, p_crop_key: data.crop }, "Đã gieo cây.");
      } else if (data.action === "water") {
        void act("farm_water", { p_plot_no: plotNo }, "Đã tưới nước.");
      } else if (data.action === "harvest") {
        void act("farm_harvest", { p_plot_no: plotNo }, "Đã thu hoạch.");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [act, load, sendFarmData]);

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
    <div className="mx-auto max-w-6xl">
      {error && <p role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
      <iframe
        ref={frameRef}
        title="Nông trại"
        srcDoc={FARM_PREVIEW_HTML}
        sandbox="allow-scripts"
        onLoad={sendFarmData}
        className="block w-full border-0"
        style={{ height: frameHeight, background: "transparent" }}
        aria-busy={loading || busy}
      />
    </div>
  );
}
