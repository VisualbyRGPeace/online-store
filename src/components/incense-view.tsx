"use client";

import { useCallback, useEffect, useState } from "react";
import { FormMessage, primaryButton } from "@/components/ui/form";
import { addIncenseMessage, lightIncense, listActiveIncenseMessages, listBurningIncense, type BurningIncense, type IncenseMessage } from "@/services/incense-service";

const BURN_MS = 4 * 60 * 60 * 1000;

function IncenseStick({ incense, now }: { incense: BurningIncense; now: number }) {
  const lit = new Date(incense.lit_at).getTime();
  const expires = new Date(incense.expires_at).getTime();
  const remaining = Math.max(0, Math.min(1, (expires - now) / BURN_MS));
  const minutes = Math.max(0, Math.ceil((expires - now) / 60000));
  return (
    <button
      type="button"
      className="group flex min-h-52 w-full flex-col items-center justify-end rounded-2xl border border-amber-100 bg-gradient-to-b from-orange-50/60 to-amber-50 px-3 py-5 text-center transition hover:border-amber-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-400"
      title={`${incense.donor_name}: ${incense.message_text}`}
      aria-label={`Nhang của ${incense.donor_name}. Lời nguyện: ${incense.message_text}`}
    >
      <span className="mb-auto flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[11px] text-amber-800">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" aria-hidden />
        Còn {Math.floor(minutes / 60)} giờ {minutes % 60} phút
      </span>
      <span className="relative mb-1 block h-32 w-5">
        <span className="absolute inset-x-1 bottom-0 rounded-b-md rounded-t-sm bg-[#b9824e] shadow-inner transition-[height] duration-1000" style={{ height: `${remaining * 100}%` }} />
        <span className="incense-flame absolute left-1/2 h-5 w-3 -translate-x-1/2 rounded-[100%_0_100%_100%] rotate-45 bg-gradient-to-br from-yellow-200 via-orange-400 to-red-500 shadow-[0_0_16px_5px_rgba(251,146,60,.4)]" style={{ bottom: `${remaining * 100}%` }} aria-hidden />
        <span className="incense-smoke absolute left-1/2 h-7 w-3 -translate-x-1/2 rounded-full bg-gradient-to-t from-stone-400/30 to-transparent blur-[2px]" style={{ bottom: `calc(${remaining * 100}% + 1rem)` }} aria-hidden />
      </span>
      <span className="text-sm font-semibold text-stone-800">{incense.donor_name}</span>
      <span className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">{incense.message_text}</span>
      <span className="mt-2 text-[10px] uppercase tracking-[0.16em] text-stone-400">Chạm để đọc lời nguyện</span>
      <span className="sr-only">Thắp lúc {new Date(lit).toLocaleString("vi-VN")}</span>
    </button>
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
        setMessageId((current) => current || nextMessages[0]?.id || "");
        setError(null);
      } catch {
        if (alive) setError("Chưa tải được bàn thắp nhang. Vui lòng thử tải lại trang.");
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
      setError(message.includes("message_unavailable") ? "Lời nguyện vừa được cập nhật. Vui lòng chọn lại." : "Chưa thắp được nhang. Vui lòng thử lại.");
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const active = incense.filter((item) => new Date(item.expires_at).getTime() > now);

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-amber-100 bg-gradient-to-br from-[#fffaf0] via-white to-[#fff4e5] px-6 py-10 sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full bg-orange-100/50 blur-3xl" aria-hidden />
        <div className="relative mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">Góc an yên</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">Thắp một nén nhang</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-stone-600 sm:text-base">
            Dành một phút tĩnh tâm, gửi lời nguyện lành và hồi hướng điều thiện đến người bạn thương quý.
            Mỗi nén nhang sẽ cháy trong bốn giờ.
          </p>
          <div className="mx-auto mt-7 max-w-xl rounded-2xl border border-amber-100 bg-white/80 p-5 text-left">
            <p className="text-sm font-semibold text-stone-800">Nghi thức thắp nhang</p>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-stone-600">
              <li><span className="mr-2 font-semibold text-amber-700">01</span>Tĩnh tâm, nghĩ về điều lành bạn muốn gửi gắm.</li>
              <li><span className="mr-2 font-semibold text-amber-700">02</span>Nhập tên hiển thị và chọn lời nguyện phù hợp.</li>
              <li><span className="mr-2 font-semibold text-amber-700">03</span>Nhấn “Thắp nhang” để gửi lời nguyện lên bàn hương.</li>
            </ol>
            <p className="mt-3 border-t border-amber-100 pt-3 text-center text-xs italic text-stone-500">Nguyện đem lòng thành kính, gửi theo làn hương an lành.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-stone-900">Bàn hương</h2>
              <p className="mt-1 text-sm text-slate-500">Những nén nhang đang cháy · {active.length}</p>
            </div>
            <span className="text-xs text-slate-400">Nhang tự tàn sau 4 giờ</span>
          </div>
          {error && <div className="mt-4"><FormMessage kind="error">{error}</FormMessage></div>}
          {loading ? (
            <div className="mt-5 h-48 animate-pulse rounded-2xl bg-amber-50" aria-busy="true" />
          ) : active.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 p-10 text-center text-sm text-stone-500">Bàn hương đang chờ nén nhang đầu tiên.</div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {active.map((item) => <IncenseStick key={item.id} incense={item} now={now} />)}
            </div>
          )}
        </div>

        <aside className="h-fit rounded-3xl border border-amber-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-stone-900">Thành tâm dâng hương</h2>
          <p className="mt-1 text-sm leading-6 text-stone-500">Tên và lời nguyện sẽ hiển thị trên bàn hương trong thời gian nén nhang cháy.</p>
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <label className="block text-sm font-medium text-stone-700">
              Tên hiển thị
              <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên của bạn" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </label>
            <label className="block text-sm font-medium text-stone-700">
              Lời nguyện
              <select required value={messageId} onChange={(e) => setMessageId(e.target.value)} disabled={!messages.length} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-6 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100">
                {!messages.length ? <option value="">Chưa có lời nguyện</option> : messages.map((message) => <option key={message.id} value={message.id}>{message.content}</option>)}
              </select>
            </label>
            {success && <FormMessage kind="success">Nén nhang đã được thắp. Nguyện lành theo làn hương.</FormMessage>}
            {error && <FormMessage kind="error">{error}</FormMessage>}
            <button type="submit" disabled={busy || !messageId || loading} className={`${primaryButton} w-full rounded-xl !bg-amber-700 hover:!bg-amber-800 disabled:opacity-50`}>
              {busy ? "Đang thắp nhang..." : "🪔  Thắp nhang"}
            </button>
            {!messages.length && !loading && <p className="text-xs leading-5 text-amber-800">Quản trị viên chưa thêm lời nguyện. Vui lòng quay lại sau.</p>}
            <p className="text-center text-xs text-slate-400">Không cần đăng nhập. Vui lòng dùng tên phù hợp và lời nguyện thiện lành.</p>
          </form>
        </aside>
      </section>
    </div>
  );
}
