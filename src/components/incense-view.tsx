"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/use-auth";
import { getProfile } from "@/services/account-service";
import { blessIncense, getIncenseOfferingEnabled, getIncensePermissions, lightIncense, listBurningIncense, subscribeToIncenseBlessings, type BurningIncense } from "@/services/incense-service";

const BURN_MS = 4 * 60 * 60 * 1000;
const BUDDHA_IMAGE = "https://raw.githubusercontent.com/VisualbyRGPeace/online-store/main/Phatthanh.png";

function BlessingSparkles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ctx = context;
    let width = 0;
    let height = 0;
    let frame = 0;
    const stars: { x: number; y: number; size: number; life: number; maxLife: number; rotation: number; vx: number; vy: number; color: string }[] = [];
    const colors = ["#fff6d6", "#ffe08a", "#ffffff", "#cfe8ff", "#ffd1ec"];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(x?: number, y?: number, burst = false) {
      if (x === undefined || y === undefined) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random());
        x = width / 2 + Math.cos(angle) * radius * width * 0.42;
        y = height / 2 + Math.sin(angle) * radius * height * 0.38;
      }
      if (stars.length > 140) stars.splice(0, stars.length - 140);
      stars.push({
        x, y,
        size: burst ? 4 + Math.random() * 6 : 3 + Math.random() * 7,
        life: 0,
        maxLife: 45 + Math.random() * 55,
        rotation: Math.random() * Math.PI,
        vx: burst ? (Math.random() - 0.5) * 1.5 : 0,
        vy: burst ? (Math.random() - 0.5) * 1.5 - 0.2 : -0.1,
        color: colors[Math.floor(Math.random() * colors.length)] ?? "#fff6d6",
      });
    }

    function drawStar(star: (typeof stars)[number], alpha: number) {
      const radius = star.size * alpha;
      ctx.save();
      ctx.translate(star.x, star.y);
      ctx.rotate(star.rotation + star.life * 0.02);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = star.color;
      ctx.shadowColor = star.color;
      ctx.shadowBlur = radius * 1.5;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const outer = i * Math.PI / 2;
        const inner = outer + Math.PI / 4;
        if (i === 0) ctx.moveTo(Math.cos(outer) * radius, Math.sin(outer) * radius);
        else ctx.lineTo(Math.cos(outer) * radius, Math.sin(outer) * radius);
        ctx.lineTo(Math.cos(inner) * radius * 0.22, Math.sin(inner) * radius * 0.22);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function pointerMove(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      if (Math.random() < 0.5) {
        spawn(event.clientX - rect.left + (Math.random() - 0.5) * 16, event.clientY - rect.top + (Math.random() - 0.5) * 16, true);
      }
    }

    function pointerDown(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      for (let i = 0; i < 14; i++) spawn(event.clientX - rect.left, event.clientY - rect.top, true);
    }

    function tick() {
      ctx.clearRect(0, 0, width, height);
      if (Math.random() < (reduceMotion ? 0.05 : 0.3)) spawn();
      for (let i = stars.length - 1; i >= 0; i--) {
        const star = stars[i];
        if (!star) continue;
        star.life++;
        star.x += star.vx;
        star.y += star.vy;
        const progress = star.life / star.maxLife;
        if (progress >= 1) {
          stars.splice(i, 1);
          continue;
        }
        const nx = (star.x - width / 2) / (width * 0.42);
        const ny = (star.y - height / 2) / (height * 0.38);
        const falloff = Math.max(0, 1 - Math.hypot(nx, ny));
        if (falloff > 0.01) drawStar(star, Math.sin(progress * Math.PI) * falloff);
      }
      frame = window.requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerdown", pointerDown);
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerdown", pointerDown);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={160}
      className="pointer-events-none absolute z-20 h-40 w-40"
      style={{ left: "41.875%", top: "33.17%", transform: "translate(-50%, -50%)" }}
      aria-hidden="true"
    />
  );
}

function IncenseStick({ incense, now, canBless, blessingBusy, onBless }: { incense: BurningIncense; now: number; canBless: boolean; blessingBusy: boolean; onBless: (id: string) => void }) {
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

      // Canvas có thêm khoảng trống phía trên để khói không bị cắt ở mép.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 320, 1200);
      ctx.translate(0, 320);

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
    <div className="incense-item group relative flex h-[360px] w-24 shrink-0 items-end justify-center sm:h-[432px] sm:w-[115px]">
      <canvas ref={canvasRef} width={320} height={1200} className="h-[360px] w-24 sm:h-[432px] sm:w-[115px]" aria-hidden="true" />
      {incense.blessing_count > 0 && <BlessingSparkles />}
      {incense.blessing_count > 0 && (
        <div
          className="absolute bottom-1 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-200 bg-white/95 px-2.5 py-1 text-[10px] font-medium text-amber-800 shadow-sm"
          title={`Thích Khoai Tây đã ban phước · ${incense.blessing_count} lượt`}
          aria-label={`Đã ban phước ${incense.blessing_count} lượt`}
        >
          💛 Đã ban phước × {incense.blessing_count}
        </div>
      )}
      {canBless && (
        <div className="group/blessing absolute z-30 h-10 w-10" style={{ left: "calc(41.875% + 58px)", top: "33.17%", transform: "translate(-50%, -50%)" }}>
          <button type="button" disabled={blessingBusy} onClick={() => onBless(incense.id)} className="absolute inset-0 rounded-full border border-amber-200 bg-white px-1 text-xl shadow-md transition hover:scale-110 hover:border-amber-400 disabled:opacity-50" aria-label={`Ban phước cho nhang của ${incense.donor_name}`}>
            {blessingBusy ? "…" : "💛"}
          </button>
          <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full border border-stone-200 bg-white/95 px-2 py-0.5 text-[10px] text-stone-600 shadow-sm">Hãy ban phước</span>
          <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-max -translate-x-1/2 rounded-lg bg-stone-900 px-3 py-1.5 text-xs text-white opacity-0 shadow transition group-hover/blessing:opacity-100">
            Thích Khoai Tây đã ban phước · {incense.blessing_count}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-[82%] left-1/2 z-20 w-56 -translate-x-1/2 translate-y-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-center opacity-0 shadow-lg transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <p className="text-sm font-semibold text-stone-900">{incense.donor_name}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-stone-400">Khẩn cầu</p>
        <p className="mt-1 text-sm leading-6 text-stone-600">{incense.message_text}</p>
        <p className="mt-2 text-[11px] text-stone-400">Còn {Math.floor(minutes / 60)} giờ {minutes % 60} phút</p>
      </div>
      <button type="button" className="absolute inset-0 z-10 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" aria-label={`Nhang do ${incense.donor_name} cúng dường. Khẩn cầu: ${incense.message_text}`} />
    </div>
  );
}
export function IncenseView() {
  const { loading: authLoading, user } = useAuth();
  const [incense, setIncense] = useState<BurningIncense[]>([]);
  const [canDonate, setCanDonate] = useState(false);
  const [canBless, setCanBless] = useState(false);
  const [blessingBusy, setBlessingBusy] = useState<string | null>(null);
  const [acceptingIncense, setAcceptingIncense] = useState<boolean | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
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

  useEffect(() => subscribeToIncenseBlessings(() => { void refresh().catch(() => undefined); }), [refresh]);

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
      const [incenseResult, availabilityResult, permissionsResult] = await Promise.allSettled([
        listBurningIncense(),
        getIncenseOfferingEnabled(),
        getIncensePermissions(),
      ]);
      if (!alive) return;
      if (incenseResult.status === "fulfilled") {
        setIncense(incenseResult.value);
        if (incenseResult.value[0]?.npc_message_text) setNpcMessage(incenseResult.value[0].npc_message_text);
        setError(null);
      } else {
        setError("Không tải được bàn hương. Vui lòng thử lại.");
      }
      if (availabilityResult.status === "fulfilled") {
        setAcceptingIncense(availabilityResult.value);
        setAvailabilityError(null);
      } else {
        setAcceptingIncense(false);
        setAvailabilityError("Chưa thể kiểm tra trạng thái nhận cúng dường.");
      }
      if (permissionsResult.status === "fulfilled") {
        setCanDonate(permissionsResult.value.canDonate);
        setCanBless(permissionsResult.value.canBless);
      } else {
        setCanDonate(true);
        setCanBless(false);
        setAvailabilityError("Cần chạy mã SQL quyền ban phước trong Supabase.");
      }
      setLoading(false);
    };
    void load();
    const poll = window.setInterval(() => void load(), 15000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; window.clearInterval(poll); window.clearInterval(clock); };
  }, []);

  async function giveBlessing(offeringId: string) {
    if (!canBless || blessingBusy) return;
    setBlessingBusy(offeringId);
    setError(null);
    try {
      await blessIncense(offeringId);
      await refresh();
    } catch (err) {
      console.error(err);
      setError("Chưa ban phước được. Hãy kiểm tra cấu hình Supabase.");
    } finally {
      setBlessingBusy(null);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!canDonate || user?.email?.toLowerCase() === "hdt10102002@gmail.com") {
      setError("Tài khoản này không được phép cúng dường.");
      return;
    }
    if (acceptingIncense !== true) {
      setError("Hiện đang tạm ngưng nhận cúng dường.");
      return;
    }
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
      if (message.includes("incense_closed")) {
        setAcceptingIncense(false);
        setError("Hiện đang tạm ngưng nhận cúng dường.");
      } else if (message.includes("incense_donation_not_allowed")) {
        setCanDonate(false);
        setError("Tài khoản này không được phép cúng dường.");
      } else {
        setError(message.includes("invalid_prayer") ? "Khẩn cầu cần từ 2 đến 240 ký tự." : message.includes("npc_message_unavailable") ? "Hiện chưa có thông điệp hiển thị. Vui lòng quay lại sau." : "Chưa cúng dường được. Vui lòng thử lại.");
      }
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const active = incense.filter((item) => new Date(item.expires_at).getTime() > now);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-4 sm:px-8 sm:pt-8">
      <section className="relative flex min-h-[620px] flex-col items-center justify-end sm:min-h-[720px]" aria-label="Bàn hương cúng dường">
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Thích Khoai Tây</p>
            <p className="mt-1">{npcMessage}</p>
            <span className="absolute -bottom-1.5 left-6 h-3 w-3 rotate-45 border-b border-r border-stone-200 bg-white" aria-hidden />
          </div>
        )}
        {error && <div className="absolute left-0 right-0 top-0 mx-auto max-w-md"><FormMessage kind="error">{error}</FormMessage></div>}
        {loading ? (
          <div className="mb-16 h-56 w-full animate-pulse rounded-2xl bg-stone-50" aria-busy="true" />
        ) : (
          <div className="relative z-10 flex min-h-72 w-full items-end justify-center gap-1 overflow-x-auto pb-8 pt-36 sm:gap-3 sm:pt-40" aria-label={`${active.length} nén nhang đang cháy`}>
            {active.map((item) => <IncenseStick key={item.id} incense={item} now={now} canBless={canBless} blessingBusy={blessingBusy === item.id} onBless={giveBlessing} />)}
            {active.length === 0 && <div className="absolute bottom-0 left-1/2 h-px w-4/5 -translate-x-1/2 bg-stone-200" />}
          </div>
        )}
        {availabilityError && <div className="absolute left-0 right-0 top-0 mx-auto max-w-md"><FormMessage kind="error">{availabilityError}</FormMessage></div>}
        {success && <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-md"><FormMessage kind="success">Nén nhang đã được thắp.</FormMessage></div>}
      </section>

      <div className="mt-8 flex justify-center">
        {!authLoading && user && (!canDonate || user?.email?.toLowerCase() === "hdt10102002@gmail.com") ? (
          <p role="status" className="rounded-full border border-stone-200 px-6 py-3 text-sm text-stone-500">Tài khoản này không được phép cúng dường.</p>
        ) : acceptingIncense === false ? (
          <p role="status" className="rounded-full border border-stone-200 px-6 py-3 text-sm text-stone-500">Hiện đang tạm ngưng nhận cúng dường.</p>
        ) : acceptingIncense === null ? (
          <button type="button" disabled className="rounded-full bg-stone-900 px-7 py-3 text-sm font-medium text-white opacity-50">Đang kiểm tra…</button>
        ) : !authLoading && !user ? (
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

      {formOpen && acceptingIncense && user && (
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
