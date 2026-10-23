"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/use-auth";
import { getProfile } from "@/services/account-service";
import { lightIncense, listBurningIncense, type BurningIncense } from "@/services/incense-service";

const BURN_MS = 4 * 60 * 60 * 1000;
const BUDDHA_IMAGE = "https://raw.githubusercontent.com/VisualbyRGPeace/online-store/main/Phatthanh.png";

function IncenseStick({ incense, now }: { incense: BurningIncense; now: number }) {
  const expires = new Date(incense.expires_at).getTime();
  const remaining = Math.max(0, Math.min(1, (expires - now) / BURN_MS));
  const minutes = Math.max(0, Math.ceil((expires - now) / 60000));

  return (
    <div className="incense-item group relative flex h-64 w-12 shrink-0 items-end justify-center sm:h-72">
      <div className="absolute bottom-0 h-[78%] w-[3px] rounded-t-sm bg-[#604a2c]" style={{ height: `calc(78% * ${remaining})` }} />
      <div className="incense-ember absolute z-10 h-2.5 w-2.5 rounded-full bg-red-500" style={{ bottom: `calc(78% * ${remaining})` }} />
      <div className="incense-smoke absolute z-10 h-10 w-3 rounded-full bg-gradient-to-t from-stone-400/30 to-transparent blur-sm" style={{ bottom: `calc(78% * ${remaining} + 8px)` }} aria-hidden />
      <div className="pointer-events-none absolute bottom-[82%] left-1/2 z-20 w-56 -translate-x-1/2 translate-y-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-center opacity-0 shadow-lg transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <p className="text-sm font-semibold text-stone-900">{incense.donor_name}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-stone-400">Khẩn cầu</p>
        <p className="mt-1 text-sm leading-6 text-stone-600">{incense.message_text}</p>
        <p className="mt-2 text-[11px] text-stone-400">Còn {Math.floor(minutes / 60)} giờ {minutes % 60} phút</p>
      </div>
      <button type="button" className="absolute inset-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" aria-label={`Nhang do ${incense.donor_name} cúng dường. Khẩn cầu: ${incense.message_text}`} />
    </div>
  );
}

export function IncenseView() {
  const { loading: authLoading, user } = useAuth();
  const [incense, setIncense] = useState<BurningIncense[]>([]);
  const [donorName, setDonorName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [prayer, setPrayer] = useState("");
  const [npcMessage, setNpcMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const refresh = useCallback(async () => {
    const nextIncense = await listBurningIncense();
    setIncense(nextIncense);
    if (nextIncense[0]?.npc_message_text) setNpcMessage(nextIncense[0].npc_message_text);
    return nextIncense;
  }, []);

  useEffect(() => {
    if (!user) {
      setDonorName("");
      return;
    }
    let alive = true;
    setNameLoading(true);
    getProfile(user.id)
      .then((profile) => {
        if (!alive) return;
        const metadataName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
        setDonorName(profile.full_name?.trim() || metadataName.trim() || user.email?.split("@")[0] || "");
      })
      .catch(() => {
        if (!alive) return;
        const metadataName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
        setDonorName(metadataName.trim() || user.email?.split("@")[0] || "");
      })
      .finally(() => { if (alive) setNameLoading(false); });
    return () => { alive = false; };
  }, [user]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const nextIncense = await listBurningIncense();
        if (!alive) return;
        setIncense(nextIncense);
        if (nextIncense[0]?.npc_message_text) setNpcMessage(nextIncense[0].npc_message_text);
        setError(null);
      } catch {
        if (alive) setError("Không tải được bàn hương. Vui lòng thử lại.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const poll = window.setInterval(() => void load(), 15000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; window.clearInterval(poll); window.clearInterval(clock); };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!user) {
      setError("Vui lòng đăng nhập để cúng dường.");
      return;
    }
    setBusy(true);
    try {
      const offeringId = await lightIncense(prayer);
      setPrayer("");
      setSuccess(true);
      const nextIncense = await refresh();
      const ownOffering = nextIncense.find((item) => item.id === offeringId);
      if (ownOffering?.npc_message_text) setNpcMessage(ownOffering.npc_message_text);
    } catch (err) {
      const message = (err as { message?: string } | null)?.message ?? "";
      setError(message.includes("invalid_prayer") ? "Khẩn cầu cần từ 2 đến 240 ký tự." : message.includes("npc_message_unavailable") ? "Hiện chưa có thông điệp hiển thị. Vui lòng quay lại sau." : "Chưa cúng dường được. Vui lòng thử lại.");
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const active = incense.filter((item) => new Date(item.expires_at).getTime() > now);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-4 sm:px-8 sm:pt-8">
      <section className="relative flex min-h-[620px] flex-col items-center justify-end overflow-hidden sm:min-h-[720px]" aria-label="Bàn hương cúng dường">
        <img
          src={BUDDHA_IMAGE}
          alt="Phật"
          className="pointer-events-none absolute top-2 h-48 max-w-[72vw] object-contain object-top sm:top-4 sm:h-64"
        />
        {npcMessage && (
          <div role="status" aria-live="polite" className="absolute right-1 top-[42%] z-10 w-52 rounded-2xl border border-stone-200 bg-white/95 px-4 py-3 text-sm leading-6 text-stone-700 shadow-md sm:right-[5%] sm:top-[35%] sm:w-64">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Phật</p>
            <p className="mt-1">{npcMessage}</p>
            <span className="absolute -bottom-1.5 left-6 h-3 w-3 rotate-45 border-b border-r border-stone-200 bg-white" aria-hidden />
          </div>
        )}
        {error && <div className="absolute left-0 right-0 top-0 mx-auto max-w-md"><FormMessage kind="error">{error}</FormMessage></div>}
        {loading ? (
          <div className="mb-16 h-56 w-full animate-pulse rounded-2xl bg-stone-50" aria-busy="true" />
        ) : (
          <div className="relative z-10 flex min-h-72 w-full items-end justify-center gap-1 overflow-x-auto pb-8 sm:gap-3" aria-label={`${active.length} nén nhang đang cháy`}>
            {active.map((item) => <IncenseStick key={item.id} incense={item} now={now} />)}
            {active.length === 0 && <div className="absolute bottom-0 left-1/2 h-px w-4/5 -translate-x-1/2 bg-stone-200" />}
          </div>
        )}
        {success && <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-md"><FormMessage kind="success">Nén nhang đã được thắp.</FormMessage></div>}
      </section>

      <div className="mt-8 flex justify-center">
        {!authLoading && !user ? (
          <Link href="/login/?next=%2Fincense%2F" className="rounded-full bg-stone-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-stone-700">
            Đăng nhập để cúng dường
          </Link>
        ) : (
          <button
            type="button"
            disabled={authLoading || nameLoading || !donorName}
            onClick={() => { setFormOpen((open) => !open); setSuccess(false); }}
            className="rounded-full bg-stone-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
          >
            Cúng dường
          </button>
        )}
      </div>

      {formOpen && user && (
        <form onSubmit={submit} className="mx-auto mt-5 grid w-full max-w-xl gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-3">
            <p className="text-sm text-stone-500">Người cúng</p>
            <p className="text-sm font-semibold text-stone-900">{donorName}</p>
            <label className="block text-sm text-stone-700">
              Khẩn cầu
              <textarea required minLength={2} maxLength={240} rows={3} value={prayer} onChange={(e) => setPrayer(e.target.value)} placeholder="Viết lời khẩn cầu của bạn" className="mt-1.5 w-full resize-y rounded-xl border border-stone-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-stone-500" />
              <span className="mt-1 block text-right text-xs text-stone-400">{prayer.length}/240</span>
            </label>
          </div>
          <button type="submit" disabled={busy || authLoading || nameLoading || prayer.trim().length < 2} className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50">
            {busy ? "Đang thắp…" : "Thắp nhang"}
          </button>
          {error && <div className="sm:col-span-2"><FormMessage kind="error">{error}</FormMessage></div>}
        </form>
      )}
    </main>
  );
}
