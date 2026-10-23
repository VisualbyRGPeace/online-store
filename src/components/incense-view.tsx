"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/use-auth";
import { getProfile } from "@/services/account-service";
import { lightIncense, listBurningIncense, type BurningIncense } from "@/services/incense-service";

const BURN_MS = 4 * 60 * 60 * 1000;
const BUDDHA_IMAGE = "https://raw.githubusercontent.com/VisualbyRGPeace/online-store/main/Phatthanh.png";

function IncenseStick({ incense, now }: { incense: BurningIncense; now: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const expires = new Date(incense.expires_at).getTime();
  const minutes = Math.max(0, Math.ceil((expires - now) / 60000));

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context) return;
    const ctx: CanvasRenderingContext2D = context;

    type SmokeParticle = { x: number; y: number; vx: number; vy: number; radius: number; life: number; maxLife: number; phase: number };
    const smoke: SmokeParticle[] = [];
    let frame = 0;

    function flicker(t: number) {
      return 0.65
        + 0.18 * Math.sin(t * 0.006)
        + 0.1 * Math.sin(t * 0.017 + 1.3)
        + 0.07 * Math.sin(t * 0.041 + 2.1)
        + (Math.random() - 0.5) * 0.08;
    }

    function draw(t: number) {
      const f = Math.max(0.25, Math.min(1, flicker(t)));
      const remaining = Math.max(0, Math.min(1, (expires - Date.now()) / BURN_MS));
      const redTop = 72 + (581 - 84) * (1 - remaining);
      const stickTop = redTop + 12;

      ctx.clearRect(0, 0, 320, 800);

      // Chập chờn ánh đỏ quanh đầu nhang.
      const glowRadius = 70 + f * 40;
      const glow = ctx.createRadialGradient(134, redTop + 6, 2, 134, redTop + 6, glowRadius);
      glow.addColorStop(0, `rgba(255,110,50,${0.4 * f})`);
      glow.addColorStop(0.4, `rgba(255,60,30,${0.14 * f})`);
      glow.addColorStop(1, "rgba(255,60,30,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 320, 400);

      // Chân tre và thân nhang ngắn dần về phía chân nhang trong 4 giờ.
      ctx.fillStyle = "#a8782f";
      ctx.fillRect(131, 581, 6, 184);
      ctx.fillStyle = "#5f4720";
      if (stickTop < 581) ctx.fillRect(128, stickTop, 12, 581 - stickTop);

      // Than hồng đỏ và lõi sáng rung nhẹ.
      const red = 200 + 55 * f;
      const green = 25 + 70 * f;
      const blue = 20 + 20 * f;
      ctx.fillStyle = `rgb(${red | 0},${green | 0},${blue | 0})`;
      ctx.fillRect(128, redTop, 12, 12);
      ctx.fillStyle = `rgba(255,${180 + (60 * f) | 0},120,${0.5 * f})`;
      ctx.fillRect(131, redTop, 6, 6);

      // Tàn tro xám phía trên than.
      ctx.fillStyle = "#c9c4ba";
      ctx.fillRect(128, redTop - 6, 12, 6);
      ctx.fillStyle = "#9d988e";
      ctx.fillRect(130, redTop - 8, 7, 2);

      if (Math.random() < 0.22) {
        smoke.push({
          x: 134,
          y: redTop - 6,
          vx: 0,
          vy: -(0.5 + Math.random() * 0.25),
          radius: 2 + Math.random() * 2,
          life: 0,
          maxLife: 260 + Math.random() * 120,
          phase: Math.random() * 6.28,
        });
      }

      for (let i = smoke.length - 1; i >= 0; i--) {
        const particle = smoke[i];
        if (!particle) continue;
        particle.life++;
        particle.phase += 0.03;
        particle.x += Math.sin(particle.phase) * 0.45 + particle.life * 0.0012;
        particle.y += particle.vy;
        particle.radius += 0.07;
        const progress = particle.life / particle.maxLife;
        if (progress >= 1) {
          smoke.splice(i, 1);
          continue;
        }
        ctx.fillStyle = `rgba(130,125,118,${0.22 * Math.sin(Math.PI * progress) * 1.3})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      frame = window.requestAnimationFrame(draw);
    }

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [expires]);

  return (
    <div className="incense-item group relative flex h-60 w-24 shrink-0 items-end justify-center sm:h-72 sm:w-[115px]">
      <canvas ref={canvasRef} width={320} height={800} className="h-60 w-24 sm:h-72 sm:w-[115px]" aria-hidden="true" />
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
        <div className="buddha-portrait absolute left-1/2 top-2 z-0 h-48 w-[min(72vw,18rem)] -translate-x-1/2 sm:top-4 sm:h-64 sm:w-[22rem]">
          <div className="buddha-halo" aria-hidden="true">
            <span className="buddha-halo-orbit buddha-halo-orbit-one" />
            <span className="buddha-halo-orbit buddha-halo-orbit-two" />
          </div>
          <img
            src={BUDDHA_IMAGE}
            alt="Phật"
            className="buddha-float pointer-events-none relative z-10 h-full w-full object-contain object-top"
          />
          <span className="buddha-shine pointer-events-none absolute inset-0 z-20" aria-hidden="true" />
        </div>
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
