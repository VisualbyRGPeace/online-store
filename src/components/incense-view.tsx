"use client";

import { useCallback, useEffect, useState } from "react";
import { FormMessage } from "@/components/ui/form";
import { lightIncense, listActiveIncenseMessages, listBurningIncense, type BurningIncense, type IncenseMessage } from "@/services/incense-service";

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
        <p className="mt-1 text-sm leading-6 text-stone-600">{incense.message_text}</p>
        <p className="mt-2 text-[11px] text-stone-400">Còn {Math.floor(minutes / 60)} giờ {minutes % 60} phút</p>
      </div>
      <button type="button" className="absolute inset-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" aria-label={`Nhang do ${incense.donor_name} cúng dường. Lời nguyện: ${incense.message_text}`} />
    </div>
  );
}

export function IncenseView() {
  const [messages, setMessages] = useState<IncenseMessage[]>([]);
  const [incense, setIncense] = useState<BurningIncense[]>([]);
  const [name, setName] = useState("");
  const [messageId, setMessageId] = useState("");
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [nextMessages, nextIncense] = await Promise.all([listActiveIncenseMessages(), listBurningIncense()]);
    setMessages(nextMessages);
    setIncense(nextIncense);
    setMessageId((current) => nextMessages.some((message) => message.id === current) ? current : nextMessages[0]?.id || "");
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [nextMessages, nextIncense] = await Promise.all([listActiveIncenseMessages(), listBurningIncense()]);
        if (!alive) return;
        setMessages(nextMessages);
        setIncense(nextIncense);
        setMessageId((current) => nextMessages.some((message) => message.id === current) ? current : nextMessages[0]?.id || "");
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
    setBusy(true);
    try {
      await lightIncense(name, messageId);
      setName("");
      setSuccess(true);
      await refresh();
    } catch (err) {
      const message = (err as { message?: string } | null)?.message ?? "";
      setError(message.includes("message_unavailable") ? "Thông điệp vừa được cập nhật. Vui lòng chọn lại." : "Chưa cúng dường được. Vui lòng thử lại.");
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
        {error && <div className="absolute left-0 right-0 top-0 mx-auto max-w-md"><FormMessage kind="error">{error}</FormMessage></div>}
        {loading ? (
          <div className="mb-16 h-56 w-full animate-pulse rounded-2xl bg-stone-50" aria-busy="true" />
        ) : (
          <div className="relative z-10 flex min-h-72 w-full items-end justify-center gap-1 pb-8 sm:gap-3" aria-label={`${active.length} nén nhang đang cháy`}>
            {active.map((item) => <IncenseStick key={item.id} incense={item} now={now} />)}
            {active.length === 0 && (
              <div className="absolute bottom-0 left-1/2 h-px w-4/5 -translate-x-1/2 bg-stone-200" />
            )}
          </div>
        )}
        {success && <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-md"><FormMessage kind="success">Nén nhang đã được thắp.</FormMessage></div>}
      </section>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => { setFormOpen((open) => !open); setSuccess(false); }}
          className="rounded-full bg-stone-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-2"
        >
          Cúng dường
        </button>
      </div>

      {formOpen && (
        <form onSubmit={submit} className="mx-auto mt-5 grid w-full max-w-xl gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <label className="block text-sm text-stone-700">
            Tên
            <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên người cúng" className="mt-1.5 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-500" />
          </label>
          <label className="block text-sm text-stone-700">
            Thông điệp
            <select required value={messageId} onChange={(e) => setMessageId(e.target.value)} disabled={!messages.length} className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-stone-500">
              {!messages.length ? <option value="">Chưa có thông điệp</option> : messages.map((message) => <option key={message.id} value={message.id}>{message.content}</option>)}
            </select>
          </label>
          <button type="submit" disabled={busy || !messageId || loading} className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50">
            {busy ? "Đang thắp…" : "Thắp nhang"}
          </button>
          {!messages.length && !loading && <p className="text-xs text-stone-500 sm:col-span-3">Hiện chưa có thông điệp để chọn.</p>}
          {error && <div className="sm:col-span-3"><FormMessage kind="error">{error}</FormMessage></div>}
        </form>
      )}
    </main>
  );
}
