"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/use-auth";
import { getProfile } from "@/services/account-service";
import {
  blessIncense,
  getIncenseOfferingEnabled,
  getIncensePermissions,
  lightIncense,
  listBurningIncense,
  subscribeToIncenseBlessings,
  type BurningIncense,
} from "@/services/incense-service";

const BURN_MS = 4 * 60 * 60 * 1000;
const BUDDHA_IMAGE = "https://raw.githubusercontent.com/VisualbyRGPeace/online-store/main/Phatthanh.png";
const SUGGESTIONS = ["Bình an cho gia đình", "Sức khỏe dồi dào", "Công việc thuận lợi", "Học hành tấn tới", "Tâm luôn an tĩnh"];

// ---------------------------------------------------------------------------------------------
// Canvas helpers (shared by every animation on this page)
// ---------------------------------------------------------------------------------------------
function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function makeSprite(size: number, stops: [number, string][]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (!g) return c;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) grad.addColorStop(offset, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

// Soft sprites are drawn once and stamped with drawImage: far cheaper than a gradient per particle.
let sprites: { smoke: HTMLCanvasElement; glow: HTMLCanvasElement; mote: HTMLCanvasElement } | null = null;
function getSprites() {
  sprites ??= {
    smoke: makeSprite(64, [[0, "rgba(236,230,222,1)"], [0.5, "rgba(236,230,222,.45)"], [1, "rgba(236,230,222,0)"]]),
    glow: makeSprite(64, [[0, "rgba(255,196,120,1)"], [0.32, "rgba(255,112,52,.55)"], [1, "rgba(255,70,30,0)"]]),
    mote: makeSprite(32, [[0, "rgba(255,236,170,1)"], [0.4, "rgba(255,205,115,.5)"], [1, "rgba(255,180,80,0)"]]),
  };
  return sprites;
}

/** A ref that says whether the element is on screen, so off-screen canvases stop drawing. */
function useOnScreen(ref: React.RefObject<Element | null>) {
  const visible = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => { visible.current = entry?.isIntersecting ?? true; }, { rootMargin: "160px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}

/** Keeps a canvas' bitmap in sync with its CSS size (capped device pixel ratio). Returns the current CSS width. */
function observeCanvasSize(canvas: HTMLCanvasElement, aspect: number | null, onResize: (cssWidth: number, cssHeight: number, dpr: number) => void) {
  const apply = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = aspect ? w * aspect : canvas.clientHeight;
    if (w < 1 || h < 1) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    onResize(w, h, dpr);
  };
  apply();
  if (typeof ResizeObserver === "undefined") return () => undefined;
  const ro = new ResizeObserver(apply);
  ro.observe(canvas);
  return () => ro.disconnect();
}

// ---------------------------------------------------------------------------------------------
// Ambient golden dust drifting up behind the whole altar
// ---------------------------------------------------------------------------------------------
function AmbientMotes() {
  const ref = useRef<HTMLCanvasElement>(null);
  const onScreen = useOnScreen(ref);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const cv: HTMLCanvasElement = canvas;
    const ctx: CanvasRenderingContext2D = context;
    const { mote } = getSprites();
    const reduce = reducedMotion();
    let w = 0;
    let h = 0;
    let frame = 0;
    let last = 0;
    const motes = Array.from({ length: reduce ? 10 : 34 }, () => ({
      x: Math.random(), y: Math.random(), r: 2 + Math.random() * 5, vy: 0.012 + Math.random() * 0.03, phase: Math.random() * 6.28, tw: 0.6 + Math.random() * 1.6,
    }));

    const stopObserving = observeCanvasSize(cv, null, (cssW, cssH, dpr) => {
      w = cssW;
      h = cssH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });

    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      if (!onScreen.current || document.hidden || w === 0) return;
      const dt = Math.min(3, (time - last) / 16.67 || 1);
      last = time;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const m of motes) {
        if (!reduce) {
          m.y -= (m.vy * dt) / (h / 600);
          if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
        }
        const twinkle = 0.5 + 0.5 * Math.sin(time * 0.001 * m.tw + m.phase);
        const x = m.x * w + Math.sin(time * 0.0004 + m.phase) * 14;
        const y = m.y * h;
        ctx.globalAlpha = 0.1 + 0.4 * twinkle;
        ctx.drawImage(mote, x - m.r * 2, y - m.r * 2, m.r * 4, m.r * 4);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      stopObserving();
    };
  }, [onScreen]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden="true" />;
}

// ---------------------------------------------------------------------------------------------
// One burning incense stick (single small canvas: ember, ash, smoke, blessing sparkles)
// ---------------------------------------------------------------------------------------------
const LW = 84; // logical canvas size in "units"; CSS scales it
const LH = 440;
const CX = LW / 2;
const TOP0 = 170; // ember position when freshly lit
const BURN_END = 340; // ember position when fully burned
const BAMBOO_TOP = 345;
const BASE = 412;

type Smoke = { x0: number; y: number; vy: number; r0: number; life: number; max: number; phase: number; amp: number; drift: number };
type Spark = { x: number; y: number; life: number; max: number; size: number; vy: number; rot: number };

const IncenseStick = memo(function IncenseStick({
  incense, fresh, selected, onSelect, onHover,
}: {
  incense: BurningIncense;
  fresh: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onScreen = useOnScreen(buttonRef);
  const expires = useMemo(() => new Date(incense.expires_at).getTime(), [incense.expires_at]);
  const selectedRef = useRef(selected);
  const blessedRef = useRef(incense.blessing_count > 0);
  const freshRef = useRef(fresh);

  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { blessedRef.current = incense.blessing_count > 0; }, [incense.blessing_count]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const cv: HTMLCanvasElement = canvas;
    const ctx: CanvasRenderingContext2D = context;
    const { smoke: smokeImg, glow: glowImg, mote: moteImg } = getSprites();
    const reduce = reducedMotion();
    const born = performance.now();
    const isFresh = freshRef.current && !reduce;
    const smoke: Smoke[] = [];
    const sparks: Spark[] = [];
    let scale = 1;
    let dprScale = 1;
    let frame = 0;
    let last = 0;

    const stopObserving = observeCanvasSize(cv, LH / LW, (cssW, _h, dpr) => {
      scale = cssW / LW;
      dprScale = dpr * scale;
    });

    const bodyGradient = ctx.createLinearGradient(CX - 3, 0, CX + 3, 0);
    bodyGradient.addColorStop(0, "#6e2d1c");
    bodyGradient.addColorStop(0.45, "#c35a31");
    bodyGradient.addColorStop(1, "#7d3520");
    const bambooGradient = ctx.createLinearGradient(CX - 1.8, 0, CX + 1.8, 0);
    bambooGradient.addColorStop(0, "#b98d45");
    bambooGradient.addColorStop(0.5, "#ecd493");
    bambooGradient.addColorStop(1, "#b58d45");

    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      if (!onScreen.current || document.hidden) return;
      const dt = Math.min(3, (time - last) / 16.67 || 1);
      last = time;

      const flick = Math.max(
        0.3,
        Math.min(1, 0.66 + 0.16 * Math.sin(time * 0.006) + 0.1 * Math.sin(time * 0.017 + 1.3) + 0.06 * Math.sin(time * 0.041 + 2.1) + (Math.random() - 0.5) * 0.06),
      );
      const ignite = isFresh ? Math.min(1, (time - born) / 1700) : 1;
      const remaining = Math.max(0, Math.min(1, (expires - Date.now()) / BURN_MS));
      const ey = TOP0 + (BURN_END - TOP0) * (1 - remaining);
      const sway = Math.sin(time * 0.0009 + incense.id.charCodeAt(0)) * 0.9;
      const active = selectedRef.current;

      ctx.setTransform(dprScale, 0, 0, dprScale, 0, 0);
      ctx.clearRect(0, 0, LW, LH);

      // Warm glow around the ember. A newly lit stick flares up, then settles.
      ctx.globalCompositeOperation = "lighter";
      const glowSize = (74 + 40 * flick + (active ? 26 : 0)) * (1 + (1 - ignite) * 0.9);
      ctx.globalAlpha = Math.min(1, (0.28 + 0.5 * flick) * (0.35 + 0.65 * ignite) + (active ? 0.18 : 0));
      ctx.drawImage(glowImg, CX - glowSize / 2, ey - glowSize / 2 + 4, glowSize, glowSize);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // Bamboo core and the incense body (it shortens as it burns).
      ctx.fillStyle = bambooGradient;
      ctx.fillRect(CX - 1.8, BAMBOO_TOP - 2, 3.6, BASE - BAMBOO_TOP + 2);
      if (ey + 4 < BAMBOO_TOP) {
        ctx.fillStyle = bodyGradient;
        ctx.fillRect(CX - 3, ey + 4, 6, BAMBOO_TOP - ey - 4 + 2);
      }

      // Glowing tip.
      ctx.fillStyle = `rgb(${200 + (55 * flick) | 0},${(70 + 110 * flick) | 0},${(28 + 34 * flick) | 0})`;
      ctx.beginPath();
      ctx.ellipse(CX, ey + 2, 3.7, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,${(205 + 40 * flick) | 0},150,${0.55 + 0.4 * flick})`;
      ctx.beginPath();
      ctx.ellipse(CX, ey + 1, 1.7, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ash column above the tip.
      const ashLen = 15 + 6 * (1 - remaining);
      const ash = ctx.createLinearGradient(0, ey - ashLen, 0, ey);
      ash.addColorStop(0, "#f0ebe2");
      ash.addColorStop(1, "#8d877e");
      ctx.fillStyle = ash;
      ctx.beginPath();
      ctx.moveTo(CX - 3.1, ey);
      ctx.quadraticCurveTo(CX - 2.6 + sway * 0.4, ey - ashLen * 0.55, CX - 2 + sway, ey - ashLen);
      ctx.lineTo(CX + 2 + sway, ey - ashLen);
      ctx.quadraticCurveTo(CX + 2.6 + sway * 0.4, ey - ashLen * 0.55, CX + 3.1, ey);
      ctx.closePath();
      ctx.fill();

      // Smoke: soft sprites that widen, sway and fade as they rise.
      const spawnRate = (reduce ? 0.05 : 0.36) * ignite;
      if (smoke.length < 120 && Math.random() < spawnRate * dt) {
        smoke.push({
          x0: CX + sway, y: ey - ashLen - 2, vy: -(0.42 + Math.random() * 0.22), r0: 2.4 + Math.random() * 1.6,
          life: 0, max: 320 + Math.random() * 160, phase: Math.random() * 6.28, amp: 2.2 + Math.random() * 3.2, drift: (Math.random() - 0.5) * 0.06,
        });
      }
      for (let i = smoke.length - 1; i >= 0; i--) {
        const p = smoke[i];
        if (!p) continue;
        p.life += dt;
        p.y += p.vy * dt;
        const progress = p.life / p.max;
        if (progress >= 1 || p.y < -20) { smoke.splice(i, 1); continue; }
        const r = p.r0 + progress * 17;
        const x = p.x0 + p.drift * p.life + Math.sin(p.phase + p.life * 0.034) * p.amp * (0.4 + progress * 2.4);
        ctx.globalAlpha = 0.17 * Math.pow(Math.sin(Math.PI * progress), 1.2);
        ctx.drawImage(smokeImg, x - r, p.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;

      // Blessed sticks shimmer with tiny gold stars around the tip.
      if (blessedRef.current) {
        if (sparks.length < 28 && Math.random() < (reduce ? 0.02 : 0.24) * dt) {
          const a = Math.random() * Math.PI * 2;
          const d = 6 + Math.random() * 20;
          sparks.push({ x: CX + Math.cos(a) * d, y: ey - 6 + Math.sin(a) * d, life: 0, max: 40 + Math.random() * 50, size: 2.4 + Math.random() * 3.6, vy: -0.12 - Math.random() * 0.12, rot: Math.random() });
        }
      }
      ctx.globalCompositeOperation = "lighter";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        if (!s) continue;
        s.life += dt;
        s.y += s.vy * dt;
        const progress = s.life / s.max;
        if (progress >= 1) { sparks.splice(i, 1); continue; }
        const k = Math.sin(progress * Math.PI);
        ctx.globalAlpha = 0.9 * k;
        ctx.drawImage(moteImg, s.x - s.size * 2.2, s.y - s.size * 2.2, s.size * 4.4, s.size * 4.4);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot + s.life * 0.03);
        ctx.fillStyle = "#fff6d6";
        ctx.beginPath();
        const rr = s.size * k;
        ctx.moveTo(0, -rr);
        ctx.lineTo(rr * 0.2, -rr * 0.2);
        ctx.lineTo(rr, 0);
        ctx.lineTo(rr * 0.2, rr * 0.2);
        ctx.lineTo(0, rr);
        ctx.lineTo(-rr * 0.2, rr * 0.2);
        ctx.lineTo(-rr, 0);
        ctx.lineTo(-rr * 0.2, -rr * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      stopObserving();
    };
  }, [expires, incense.id, onScreen]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => onSelect(incense.id)}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") onHover(incense.id); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") onHover(null); }}
      onFocus={() => onHover(incense.id)}
      onBlur={() => onHover(null)}
      aria-pressed={selected}
      aria-label={`Nhang do ${incense.donor_name} cúng dường. Khẩn cầu: ${incense.message_text}`}
      className={`relative z-10 h-[357px] w-[68px] shrink-0 cursor-pointer rounded-full transition-transform duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 sm:h-[440px] sm:w-[84px] ${fresh ? "incense-rise" : ""} ${selected ? "-translate-y-1" : "hover:-translate-y-0.5"}`}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
    </button>
  );
});

// ---------------------------------------------------------------------------------------------
// Details of the stick being hovered / tapped
// ---------------------------------------------------------------------------------------------
function Plaque({ incense, now, canBless, busy, onBless }: { incense: BurningIncense | null; now: number; canBless: boolean; busy: boolean; onBless: (id: string) => void }) {
  if (!incense) {
    return (
      <div className="plaque flex min-h-[148px] items-center justify-center rounded-2xl border border-dashed border-amber-200/15 px-6 text-center text-sm text-amber-100/50">
        Chạm hoặc rê chuột vào một nén nhang để đọc lời khẩn cầu.
      </div>
    );
  }
  const left = Math.max(0, new Date(incense.expires_at).getTime() - now);
  const minutes = Math.ceil(left / 60000);
  const pct = Math.max(0, Math.min(100, (left / BURN_MS) * 100));
  return (
    <div className="plaque plaque-in flex min-h-[148px] flex-col items-center justify-center rounded-2xl border border-amber-200/20 bg-white/[0.05] px-5 py-4 text-center backdrop-blur-md">
      <p className="text-sm font-semibold text-amber-50">{incense.donor_name}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-amber-200/60">Khẩn cầu</p>
      <p className="mt-1.5 max-w-md text-[15px] leading-6 text-amber-50/90">“{incense.message_text}”</p>
      <div className="mt-3 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-200 transition-[width] duration-1000" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-amber-100/55">
        Còn {Math.floor(minutes / 60)} giờ {minutes % 60} phút
        {incense.blessing_count > 0 && <> · 💛 {incense.blessing_count} lượt ban phước</>}
      </p>
      {canBless && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onBless(incense.id)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-200/30 bg-amber-200/10 px-4 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-200/20 disabled:opacity-50"
        >
          {busy ? "Đang ban phước…" : "💛 Ban phước"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Typewriter line for the Buddha's message
// ---------------------------------------------------------------------------------------------
function useTypewriter(text: string): string {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (reducedMotion()) { setShown(text); return; }
    setShown("");
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(timer);
    }, 26);
    return () => window.clearInterval(timer);
  }, [text]);
  return shown;
}

function BuddhaMessage({ text }: { text: string }) {
  const shown = useTypewriter(text);
  return (
    <div role="status" aria-live="polite" className="speech-bubble relative mx-auto mt-3 min-h-[96px] w-full max-w-md rounded-2xl border border-amber-200/20 bg-white/[0.06] px-5 py-3.5 text-center backdrop-blur-md">
      <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-amber-200/20 bg-[#1c1610]" aria-hidden />
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-200/70">Thích Khoai Tây</p>
      <p className="mt-1 text-[15px] leading-6 text-amber-50/90" aria-label={text}>
        <span aria-hidden>{shown}</span>
        <span className="typing-caret" aria-hidden />
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Dialog: write a prayer and light the stick
// ---------------------------------------------------------------------------------------------
function LightDialog({ open, donorName, busy, error, onClose, onSubmit }: {
  open: boolean;
  donorName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (prayer: string) => Promise<boolean>;
}) {
  const [prayer, setPrayer] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) areaRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  const trimmed = prayer.trim();
  function addSuggestion(text: string) {
    setPrayer((current) => {
      const next = current.trim() ? `${current.trim()}. ${text}` : text;
      return next.slice(0, 240);
    });
    areaRef.current?.focus();
  }

  return createPortal(
    <div
      className="dialog-fade fixed inset-0 z-50 grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="light-title"
        onSubmit={async (e) => {
          e.preventDefault();
          if (trimmed.length < 2 || busy) return;
          if (await onSubmit(trimmed)) setPrayer("");
        }}
        className="dialog-pop relative w-full max-w-md rounded-t-3xl border border-amber-200/15 bg-gradient-to-b from-[#211a11] to-[#120e09] p-6 pb-8 text-amber-50 shadow-2xl sm:rounded-3xl sm:pb-6"
      >
        <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-xl text-amber-100/60 transition hover:bg-white/10 hover:text-amber-50">
          ×
        </button>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15 sm:hidden" aria-hidden />
        <h2 id="light-title" className="text-xl font-semibold tracking-tight">Thắp một nén nhang</h2>
        <p className="mt-1 text-sm text-amber-100/60">
          Người cúng: <span className="font-medium text-amber-100">{donorName}</span> · nhang cháy trong 4 giờ
        </p>

        <label htmlFor="prayer" className="mt-5 block text-sm font-medium text-amber-100/80">Lời khẩn cầu</label>
        <textarea
          id="prayer"
          ref={areaRef}
          required
          minLength={2}
          maxLength={240}
          rows={4}
          value={prayer}
          onChange={(e) => setPrayer(e.target.value)}
          placeholder="Viết điều bạn muốn gửi gắm…"
          className="mt-1.5 w-full resize-none rounded-xl border border-amber-200/20 bg-black/30 px-3.5 py-3 text-[15px] leading-6 text-amber-50 outline-none transition placeholder:text-amber-100/30 focus:border-amber-300/60 focus:ring-4 focus:ring-amber-300/10"
        />
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => addSuggestion(s)} className="rounded-full border border-amber-200/20 px-2.5 py-1 text-[11px] text-amber-100/70 transition hover:border-amber-200/50 hover:bg-amber-200/10 hover:text-amber-50">
                {s}
              </button>
            ))}
          </div>
          <span className={`shrink-0 pt-1 text-xs tabular-nums ${prayer.length > 220 ? "text-amber-300" : "text-amber-100/40"}`}>{prayer.length}/240</span>
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

        <button type="submit" disabled={busy || trimmed.length < 2} className="cta-gold mt-5 w-full">
          {busy ? "Đang thắp…" : "🔥 Thắp nhang"}
        </button>
      </form>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------
type Toast = { kind: "success" | "error"; text: string };

export function IncenseView() {
  const { loading: authLoading, user } = useAuth();
  const [incense, setIncense] = useState<BurningIncense[]>([]);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
  const [canDonate, setCanDonate] = useState(false);
  const [canBless, setCanBless] = useState(false);
  const [blessingBusy, setBlessingBusy] = useState<string | null>(null);
  const [acceptingIncense, setAcceptingIncense] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [donorName, setDonorName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [npcMessage, setNpcMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const knownIds = useRef<Set<string> | null>(null);

  // Every list update goes through here so newly appeared sticks get their "ignite" animation.
  const applyIncense = useCallback((list: BurningIncense[]) => {
    const known = knownIds.current;
    if (known === null) {
      knownIds.current = new Set(list.map((item) => item.id));
    } else {
      const added = list.filter((item) => !known.has(item.id)).map((item) => item.id);
      if (added.length) {
        added.forEach((id) => known.add(id));
        setFreshIds((prev) => new Set([...prev, ...added]));
      }
    }
    setIncense(list);
    const latest = list[0]?.npc_message_text;
    if (latest) setNpcMessage(latest);
  }, []);

  const refresh = useCallback(async () => {
    const list = await listBurningIncense();
    applyIncense(list);
    return list;
  }, [applyIncense]);

  useEffect(() => subscribeToIncenseBlessings(() => { void refresh().catch(() => undefined); }), [refresh]);

  useEffect(() => {
    if (!user) {
      setDonorName("");
      return;
    }
    let alive = true;
    const metadataName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
    const fallback = metadataName || user.email?.split("@")[0] || "";
    setNameLoading(true);
    getProfile(user.id)
      .then((profile) => { if (alive) setDonorName(profile.full_name?.trim() || fallback); })
      .catch(() => { if (alive) setDonorName(fallback); })
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
      let problem: string | null = null;
      if (incenseResult.status === "fulfilled") applyIncense(incenseResult.value);
      else problem = "Không tải được bàn hương. Vui lòng thử lại.";
      if (availabilityResult.status === "fulfilled") setAcceptingIncense(availabilityResult.value);
      else {
        setAcceptingIncense(false);
        problem ??= "Chưa kiểm tra được trạng thái nhận cúng dường.";
      }
      if (permissionsResult.status === "fulfilled") {
        setCanDonate(permissionsResult.value.canDonate);
        setCanBless(permissionsResult.value.canBless);
      } else {
        setCanDonate(true); // the database still enforces who may donate
        setCanBless(false);
      }
      setLoadError(problem);
      setLoading(false);
    };
    void load();
    const poll = window.setInterval(() => void load(), 15000);
    const clock = window.setInterval(() => setNow(Date.now()), 10000);
    return () => { alive = false; window.clearInterval(poll); window.clearInterval(clock); };
  }, [applyIncense]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const selectStick = useCallback((id: string) => setSelectedId((current) => (current === id ? null : id)), []);

  async function giveBlessing(offeringId: string) {
    if (!canBless || blessingBusy) return;
    setBlessingBusy(offeringId);
    try {
      await blessIncense(offeringId);
      await refresh();
      setToast({ kind: "success", text: "Đã ban phước cho nén nhang này." });
    } catch (err) {
      console.error(err);
      setToast({ kind: "error", text: "Chưa ban phước được. Vui lòng thử lại sau." });
    } finally {
      setBlessingBusy(null);
    }
  }

  async function lightOne(prayer: string): Promise<boolean> {
    setDialogError(null);
    if (!user) { setDialogError("Vui lòng đăng nhập để cúng dường."); return false; }
    if (!canDonate) { setDialogError("Tài khoản này không được phép cúng dường."); return false; }
    if (acceptingIncense !== true) { setDialogError("Hiện đang tạm ngưng nhận cúng dường."); return false; }
    setBusy(true);
    try {
      const offeringId = await lightIncense(prayer);
      try {
        const next = await refresh();
        const own = next.find((item) => item.id === offeringId);
        if (own?.npc_message_text) setNpcMessage(own.npc_message_text);
      } catch {
        // the next poll will show the new stick
      }
      setSelectedId(offeringId);
      setDialogOpen(false);
      setToast({ kind: "success", text: "Nén nhang đã được thắp. Nguyện điều lành đến với bạn." });
      return true;
    } catch (err) {
      const message = (err as { message?: string } | null)?.message ?? "";
      if (message.includes("incense_closed")) {
        setAcceptingIncense(false);
        setDialogError("Hiện đang tạm ngưng nhận cúng dường.");
      } else if (message.includes("incense_donation_not_allowed")) {
        setCanDonate(false);
        setDialogError("Tài khoản này không được phép cúng dường.");
      } else if (message.includes("invalid_prayer")) {
        setDialogError("Khẩn cầu cần từ 2 đến 240 ký tự.");
      } else if (message.includes("npc_message_unavailable")) {
        setDialogError("Hiện chưa có thông điệp hiển thị. Vui lòng quay lại sau.");
      } else {
        setDialogError("Chưa cúng dường được. Vui lòng thử lại.");
      }
      await refresh().catch(() => undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const active = useMemo(() => incense.filter((item) => new Date(item.expires_at).getTime() > now), [incense, now]);
  const shownId = hoverId ?? selectedId;
  const shown = active.find((item) => item.id === shownId) ?? null;
  const welcome = "Hãy thắp một nén nhang và gửi lời nguyện của bạn. Nguyện cho mọi người đều được bình an.";

  const cta = (() => {
    const pill = "rounded-full border border-amber-200/20 px-6 py-3 text-sm text-amber-100/60";
    if (loading || authLoading) return <button type="button" disabled className="cta-gold opacity-60">Đang kiểm tra…</button>;
    if (!user) return <Link href="/login/?next=%2Fincense%2F" className="cta-gold">Đăng nhập để cúng dường</Link>;
    if (!canDonate) return <p role="status" className={pill}>Tài khoản này không được phép cúng dường.</p>;
    if (acceptingIncense === false) return <p role="status" className={pill}>Hiện đang tạm ngưng nhận cúng dường.</p>;
    return (
      <button
        type="button"
        disabled={nameLoading || !donorName}
        onClick={() => { setDialogError(null); setDialogOpen(true); }}
        className="cta-gold"
      >
        <span aria-hidden>🔥</span> Thắp nhang cúng dường
      </button>
    );
  })();

  return (
    <div className="mx-auto max-w-4xl">
      <section className="sanctuary relative isolate overflow-hidden rounded-[2rem] px-3 pb-8 pt-6 sm:px-8 sm:pt-8" aria-label="Bàn hương cúng dường">
        <div className="sanctuary-stars" aria-hidden />
        <AmbientMotes />

        {toast && (
          <div
            role={toast.kind === "error" ? "alert" : "status"}
            className={`toast-in absolute left-1/2 top-4 z-40 w-[min(92%,26rem)] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-center text-sm shadow-lg backdrop-blur-md ${toast.kind === "error" ? "border-red-300/30 bg-red-950/70 text-red-100" : "border-amber-200/30 bg-amber-950/70 text-amber-50"}`}
          >
            {toast.text}
          </div>
        )}

        <div className="relative z-10 flex flex-col items-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-white/[0.04] px-3.5 py-1.5 text-xs text-amber-100/75 backdrop-blur" aria-live="polite">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_8px_2px_rgba(251,146,60,.8)]" aria-hidden />
            {loading ? "Đang thắp đèn…" : `${active.length} nén nhang đang cháy`}
          </p>

          <div className="buddha-portrait relative mt-4 h-52 w-[min(70vw,17rem)] sm:h-64 sm:w-[21rem]">
            <span className="buddha-aura" aria-hidden />
            <div className="buddha-halo" aria-hidden="true">
              <span className="buddha-halo-orbit buddha-halo-orbit-one" />
              <span className="buddha-halo-orbit buddha-halo-orbit-two" />
            </div>
            {!imageFailed && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={BUDDHA_IMAGE}
                alt="Tượng Phật"
                decoding="async"
                onError={() => setImageFailed(true)}
                className="buddha-float pointer-events-none relative z-10 h-full w-full object-contain object-top"
              />
            )}
            <span className="buddha-shine pointer-events-none absolute inset-0 z-20" aria-hidden="true" />
          </div>

          <BuddhaMessage text={npcMessage || welcome} />
        </div>

        {loadError && (
          <p role="alert" className="relative z-10 mx-auto mt-4 max-w-md rounded-xl border border-red-300/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-200">{loadError}</p>
        )}

        {/* Altar: lamps, incense burner and sticks */}
        <div className="relative z-10 mt-2">
          <span className="lamp left-1 sm:left-4" aria-hidden><i /></span>
          <span className="lamp right-1 sm:right-4" aria-hidden><i /></span>

          {loading ? (
            <div className="mx-auto mb-10 mt-16 h-40 w-full max-w-md animate-pulse rounded-2xl bg-white/[0.04]" aria-busy="true" />
          ) : (
            <div className="altar-scroll overflow-x-auto overflow-y-hidden" aria-label={`${active.length} nén nhang đang cháy`}>
              <div className="relative mx-auto flex w-max min-w-[19rem] items-end justify-center gap-1 px-6 sm:min-w-[28rem] sm:gap-3 sm:px-12">
                <div className="censer-back" aria-hidden />
                {active.length === 0 && <div className="h-[220px] sm:h-[260px]" aria-hidden />}
                {active.map((item) => (
                  <IncenseStick
                    key={item.id}
                    incense={item}
                    fresh={freshIds.has(item.id)}
                    selected={item.id === shownId}
                    onSelect={selectStick}
                    onHover={setHoverId}
                  />
                ))}
                <div className="censer-front" aria-hidden />
              </div>
            </div>
          )}
          <div className="altar-table" aria-hidden />
        </div>

        <div className="relative z-10 mx-auto mt-6 max-w-md">
          {!loading &&
            (active.length === 0 ? (
              <div className="plaque flex min-h-[148px] items-center justify-center rounded-2xl border border-dashed border-amber-200/15 px-6 text-center text-sm text-amber-100/55">
                Bàn hương đang trống. Hãy là người thắp nén nhang đầu tiên.
              </div>
            ) : (
              <Plaque key={shown?.id ?? "none"} incense={shown} now={now} canBless={canBless} busy={blessingBusy === shown?.id} onBless={giveBlessing} />
            ))}
        </div>

        <div className="relative z-10 mt-7 flex flex-col items-center gap-2">
          {cta}
          <p className="text-xs text-amber-100/40">Mỗi nén nhang cháy trong 4 giờ.</p>
        </div>
      </section>

      <LightDialog open={dialogOpen} donorName={donorName} busy={busy} error={dialogError} onClose={closeDialog} onSubmit={lightOne} />
    </div>
  );
}
