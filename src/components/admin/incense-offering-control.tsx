"use client";

import { useEffect, useState } from "react";
import { FormMessage } from "@/components/ui/form";
import { getIncenseOfferingEnabled, setIncenseOfferingEnabled } from "@/services/incense-service";

export function IncenseOfferingControl() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getIncenseOfferingEnabled()
      .then((value) => { if (active) setEnabled(value); })
      .catch((err) => {
        console.error(err);
        if (active) setError("Chưa tải được trạng thái nhận bỏ phiếu. Hãy áp dụng migration Supabase mới nhất.");
      });
    return () => { active = false; };
  }, []);

  async function toggle() {
    if (enabled === null) return;
    if (enabled && !window.confirm("Ngưng nhận bỏ phiếu?")) return;
    setError(null);
    setBusy(true);
    try {
      await setIncenseOfferingEnabled(!enabled);
      setEnabled(!enabled);
    } catch (err) {
      console.error(err);
      setError("Chưa cập nhật được trạng thái. Hãy kiểm tra quyền admin và migration Supabase.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-slate-900">Nhận bỏ phiếu</p>
        <p className="mt-1 text-sm text-slate-500">
          {enabled === null ? "Đang tải trạng thái…" : enabled ? "Đang mở" : "Đang khóa"}
        </p>
        {error && <div className="mt-3"><FormMessage kind="error">{error}</FormMessage></div>}
      </div>
      <button
        type="button"
        disabled={enabled === null || busy}
        onClick={() => void toggle()}
        className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 ${enabled ? "bg-red-700 hover:bg-red-800" : "bg-stone-900 hover:bg-stone-700"}`}
      >
        {busy ? "Đang cập nhật…" : enabled ? "Ngưng nhận bỏ phiếu" : "Mở lại bỏ phiếu"}
      </button>
    </section>
  );
}
