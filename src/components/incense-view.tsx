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
const SUGGESTIONS = ["Bình an cho gia đình", "Sức khỏe dồi dào", "Công việc thuận lợi", "Tâm luôn an tĩnh"];
const WELCOME = "Hãy thắp một nén nhang và gửi lời nguyện của bạn.";

const buttonDark =
  "inline-flex items-center justify-center rounded-full border border-[#c9a24a] bg-neutral-950 px-7 py-3 text-sm font-medium tracking-wide text-[#f6e9c0] transition hover:bg-neutral-800 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";

// ---------------------------------------------------------------------------------------------
// Flat 2D cartoon palette (solid fills + one dark outline colour, no gradients, no blur)
// ---------------------------------------------------------------------------------------------
const INK = "#1f1f1f";
const COLOR = {
  body: "#7a1d24",
  bodyLight: "#a8323b",
  bamboo: "#d4af5a",
  band: "#d4af5a",
  ash: "#d9d2c3",
  ember: "#f08a24",
  core: "#ffe08a",
  ray: "#e0b14a",
  spark: "#d9b04a",
};

// ---------------------------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------------------------
function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** One shared animation loop for every stick (capped at ~30fps, which also suits the cartoon look). */
type TickFn = (time: number) => void;
const tickers = new Set<TickFn>();
let rafId = 0;
let lastFrame = 0;
const FRAME_MS = 1000 / 30;

function loop(time: number) {
  rafId = requestAnimationFrame(loop);
  if (time - lastFrame < FRAME_MS - 2) return;
  lastFrame = time;
  if (document.hidden) return;
  tickers.forEach((fn) => fn(time));
}

function subscribeTick(fn: TickFn) {
  tickers.add(fn);
  if (tickers.size === 1) {
    lastFrame = 0;
    rafId = requestAnimationFrame(loop);
  }
  return () => {
    tickers.delete(fn);
    if (tickers.size === 0) cancelAnimationFrame(rafId);
  };
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

/** Keeps a canvas bitmap in sync with its CSS size (device pixel ratio capped at 2). */
function observeCanvasSize(canvas: HTMLCanvasElement, aspect: number, onResize: (cssWidth: number, dpr: number) => void) {
  const apply = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    if (w < 1) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * aspect * dpr);
    onResize(w, dpr);
  };
  apply();
  if (typeof ResizeObserver === "undefined") return () => undefined;
  const ro = new ResizeObserver(apply);
  ro.observe(canvas);
  return () => ro.disconnect();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Four-point twinkle, drawn as one flat shape. */
function twinkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------------------------
// Cartoon Buddha (inline SVG: flat fills + outline, so it matches the incense and never fails to load)
// ---------------------------------------------------------------------------------------------
function BuddhaArt() {
  const skin = "#f8d9b0";
  const hair = "#2b2b2b";
  return (
    <svg viewBox="0 0 240 230" className="pointer-events-none h-full w-full" role="img" aria-label="Tượng Phật ngồi thiền" strokeLinejoin="round" strokeLinecap="round">
      <circle className="halo-pulse" cx="120" cy="96" r="84" fill="#fff1b8" />
      <ellipse cx="120" cy="219" rx="84" ry="7" fill="#e5e5e5" />
      <g className="buddha-float" stroke={INK} strokeWidth="4">
        {/* lotus seat */}
        <ellipse cx="50" cy="198" rx="26" ry="13" fill="#f6a9bd" transform="rotate(-12 50 198)" />
        <ellipse cx="190" cy="198" rx="26" ry="13" fill="#f6a9bd" transform="rotate(12 190 198)" />
        <ellipse cx="82" cy="204" rx="28" ry="14" fill="#f9c3d1" transform="rotate(-5 82 204)" />
        <ellipse cx="158" cy="204" rx="28" ry="14" fill="#f9c3d1" transform="rotate(5 158 204)" />
        <ellipse cx="120" cy="206" rx="30" ry="13" fill="#f6a9bd" />
        {/* robe, crossed legs */}
        <path d="M52 192 C52 128 82 104 120 104 C158 104 188 128 188 192 Z" fill="#f2a93b" />
        <path d="M92 112 C104 150 134 176 170 186" fill="none" strokeWidth="3.5" />
        <ellipse cx="120" cy="186" rx="74" ry="17" fill="#e8932a" />
        {/* arms and hands */}
        <ellipse cx="78" cy="150" rx="17" ry="38" transform="rotate(-25 78 150)" fill="#f7b84a" />
        <ellipse cx="162" cy="150" rx="17" ry="38" transform="rotate(25 162 150)" fill="#f7b84a" />
        <ellipse cx="120" cy="170" rx="28" ry="11" fill={skin} />
        <path d="M104 171 Q120 177 136 171" fill="none" strokeWidth="3" />
        {/* head */}
        <ellipse cx="85" cy="78" rx="8" ry="17" fill={skin} />
        <ellipse cx="155" cy="78" rx="8" ry="17" fill={skin} />
        <circle cx="120" cy="40" r="12" fill={hair} />
        <circle cx="120" cy="72" r="34" fill={skin} />
        <path d="M87 64 C86 40 154 40 153 64 C146 54 132 50 120 50 C108 50 94 54 87 64 Z" fill={hair} strokeWidth="3.5" />
        <circle cx="120" cy="25" r="4.5" fill="#ff8a3d" strokeWidth="3" />
        {/* face */}
        <circle cx="98" cy="88" r="5" fill="#f5a89a" stroke="none" />
        <circle cx="142" cy="88" r="5" fill="#f5a89a" stroke="none" />
        <circle cx="120" cy="66" r="2.6" fill="#e2553a" stroke="none" />
        <path d="M101 76 Q107 82 113 76 M127 76 Q133 82 139 76 M112 90 Q120 97 128 90" fill="none" strokeWidth="3" />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// One burning incense stick: flat cartoon stick, ember with rays, flat smoke puffs, gold twinkles when blessed
// ---------------------------------------------------------------------------------------------
const LW = 96; // logical canvas width: wider than the stick so smoke and rays are never cut off
const LH = 420;
const CX = LW / 2;
const TOP0 = 170; // tip position when freshly lit
const BURN_END = 330; // tip position when fully burned
const BAMBOO_TOP = 335;
const BASE = LH;
const RAY_ANGLES = [-28, 8, 44].flatMap((a) => [(a * Math.PI) / 180, ((180 - a) * Math.PI) / 180]);

type Smoke = { x0: number; y: number; vy: number; r0: number; life: number; max: number; phase: number; amp: number; drift: number };
type Spark = { x: number; y: number; life: number; max: number; size: number; vy: number };

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
    const reduce = reducedMotion();
    const born = performance.now();
    const isFresh = freshRef.current && !reduce;
    const smoke: Smoke[] = [];
    const sparks: Spark[] = [];
    let drawScale = 1;
    let last = 0;

    const stopObserving = observeCanvasSize(cv, LH / LW, (cssW, dpr) => { drawScale = (cssW / LW) * dpr; });

    const tick = (time: number) => {
      if (!onScreen.current) { last = 0; return; }
      if (reduce && last !== 0 && time - last < 1000) return; // reduced motion: redraw about once a second
      const dt = last ? Math.min(4, (time - last) / 16.67) : 1;
      last = time;

      const toggle = reduce ? 0 : Math.floor(time / 220) % 2; // two-frame cartoon flicker
      const ignite = isFresh ? Math.min(1, (time - born) / 1400) : 1;
      const remaining = Math.max(0, Math.min(1, (expires - Date.now()) / BURN_MS));
      const ey = TOP0 + (BURN_END - TOP0) * (1 - remaining);
      const active = selectedRef.current;

      ctx.setTransform(drawScale, 0, 0, drawScale, 0, 0);
      ctx.clearRect(0, 0, LW, LH);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.3;

      // Bamboo core.
      ctx.fillStyle = COLOR.bamboo;
      ctx.beginPath();
      ctx.rect(CX - 1.8, BAMBOO_TOP - 2, 3.6, BASE - BAMBOO_TOP + 2);
      ctx.fill();
      ctx.stroke();

      // Incense body (shortens as it burns) with one flat highlight stripe.
      if (ey + 4 < BAMBOO_TOP) {
        ctx.fillStyle = COLOR.body;
        ctx.beginPath();
        ctx.rect(CX - 3, ey + 4, 6, BAMBOO_TOP - ey - 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = COLOR.bodyLight;
        ctx.fillRect(CX - 1.7, ey + 8, 1.1, Math.max(0, BAMBOO_TOP - ey - 12));
        // Gold band near the base.
        if (ey + 8 < BAMBOO_TOP - 22) {
          ctx.fillStyle = COLOR.band;
          ctx.beginPath();
          ctx.rect(CX - 3, BAMBOO_TOP - 20, 6, 4);
          ctx.fill();
          ctx.stroke();
        }
      }

      // Ash above the tip.
      const ashLen = 14 + 6 * (1 - remaining);
      ctx.fillStyle = COLOR.ash;
      ctx.beginPath();
      ctx.moveTo(CX - 3.2, ey);
      ctx.lineTo(CX - 2.4, ey - ashLen + 2);
      ctx.quadraticCurveTo(CX, ey - ashLen - 1.5, CX + 2.4, ey - ashLen + 2);
      ctx.lineTo(CX + 3.2, ey);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Ember: flat rays, flat orange dot, flat yellow core.
      const ex = CX;
      const eyc = ey + 1.5;
      if (ignite > 0.6) {
        ctx.strokeStyle = COLOR.ray;
        ctx.lineWidth = 1.4;
        const r1 = active ? 7.4 : 6.4;
        RAY_ANGLES.forEach((a, i) => {
          const len = (active ? 4.5 : 3) + ((i + toggle) % 2) * 1.6;
          ctx.beginPath();
          ctx.moveTo(ex + Math.cos(a) * r1, eyc + Math.sin(a) * r1);
          ctx.lineTo(ex + Math.cos(a) * (r1 + len), eyc + Math.sin(a) * (r1 + len));
          ctx.stroke();
        });
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.3;
      }
      const er = (3.9 + toggle * 0.5) * (0.4 + 0.6 * ignite);
      ctx.fillStyle = COLOR.ember;
      circle(ctx, ex, eyc, er);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLOR.core;
      circle(ctx, ex, eyc, er * 0.5);
      ctx.fill();

      // Smoke: a few flat grey puffs. Colour is blended toward the white page instead of using alpha or blur.
      if (!reduce && smoke.length < 16 && Math.random() < 0.05 * ignite * dt) {
        smoke.push({
          x0: CX, y: ey - ashLen - 2, vy: -(0.45 + Math.random() * 0.15), r0: 2 + Math.random() * 0.8, life: 0,
          max: 260 + Math.random() * 80, phase: Math.random() * 6.28, amp: 2 + Math.random() * 1.6, drift: (Math.random() - 0.5) * 0.02,
        });
      }
      for (let i = smoke.length - 1; i >= 0; i--) {
        const p = smoke[i];
        if (!p) continue;
        p.life += dt;
        p.y += p.vy * dt;
        const progress = p.life / p.max;
        if (progress >= 1 || p.y < -10) { smoke.splice(i, 1); continue; }
        const r = p.r0 + progress * 6.5;
        const x = p.x0 + p.drift * p.life + Math.sin(p.phase + p.life * 0.03) * p.amp * (0.3 + progress * 1.2);
        const strength = Math.sin(Math.PI * progress) * Math.max(0, Math.min(1, p.y / 60));
        const v = Math.round(255 - 72 * strength);
        ctx.fillStyle = `rgb(${v},${v - 3},${v - 9})`;
        circle(ctx, x, p.y, r);
        ctx.fill();
      }

      // Blessed sticks get a few flat gold twinkles around the tip.
      if (blessedRef.current && sparks.length < 8 && Math.random() < 0.05 * dt) {
        const side = Math.random() < 0.5 ? -1 : 1;
        sparks.push({ x: CX + side * (9 + Math.random() * 12), y: ey - 6 + (Math.random() - 0.5) * 24, life: 0, max: 40 + Math.random() * 30, size: 2.2 + Math.random() * 1.6, vy: -0.1 - Math.random() * 0.08 });
      }
      ctx.fillStyle = COLOR.spark;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        if (!s) continue;
        s.life += dt;
        s.y += s.vy * dt;
        const progress = s.life / s.max;
        if (progress >= 1) { sparks.splice(i, 1); continue; }
        twinkle(ctx, s.x, s.y, s.size * Math.sin(progress * Math.PI) * 1.6);
        ctx.fill();
      }
    };

    const unsubscribe = subscribeTick(tick);
    return () => {
      unsubscribe();
      stopObserving();
    };
  }, [expires, onScreen]);

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
      className={`relative z-10 h-[341px] w-[52px] shrink-0 cursor-pointer rounded-full transition-transform duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/40 sm:h-[420px] sm:w-16 ${fresh ? "incense-rise" : ""} ${selected ? "-translate-y-1" : ""}`}
    >
      {/* The canvas is 150% of the button width and centred, so smoke/rays have room on both sides. */}
      <canvas ref={canvasRef} className="pointer-events-none absolute left-1/2 top-0 h-full w-[150%] -translate-x-1/2" aria-hidden="true" />
    </button>
  );
});

// ---------------------------------------------------------------------------------------------
// Details of the stick being hovered / tapped
// ---------------------------------------------------------------------------------------------
function Plaque({ incense, now, canBless, busy, onBless }: { incense: BurningIncense | null; now: number; canBless: boolean; busy: boolean; onBless: (id: string) => void }) {
  if (!incense) {
    return (
      <div className="flex min-h-[132px] items-center justify-center px-6 text-center text-sm text-neutral-400">
        Chạm vào một nén nhang để đọc lời khẩn cầu.
      </div>
    );
  }
  const left = Math.max(0, new Date(incense.expires_at).getTime() - now);
  const minutes = Math.ceil(left / 60000);
  const pct = Math.max(0, Math.min(100, (left / BURN_MS) * 100));
  return (
    <div className="fade-up flex min-h-[132px] flex-col items-center justify-center px-5 py-4 text-center">
      <p className="text-sm font-semibold tracking-wide text-neutral-900">{incense.donor_name}</p>
      <p className="mt-1.5 max-w-md font-serif text-base italic leading-6 text-neutral-600">“{incense.message_text}”</p>
      <div className="mt-3 h-3 w-full max-w-[200px] overflow-hidden rounded-full border-2 border-neutral-900 bg-white" aria-hidden>
        <div className="h-full bg-[#c9a24a] transition-[width] duration-1000" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-neutral-400">
        Còn {Math.floor(minutes / 60)} giờ {minutes % 60} phút
        {incense.blessing_count > 0 && <> · ✦ {incense.blessing_count}</>}
      </p>
      {canBless && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onBless(incense.id)}
          className="mt-3 rounded-full border-2 border-neutral-900 bg-[#d8b45a] px-4 py-1.5 text-xs font-semibold text-neutral-900 shadow-[2px_2px_0_#171717] transition active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-50"
        >
          {busy ? "Đang ban phước…" : "✦ Ban phước"}
        </button>
      )}
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
    setPrayer((current) => (current.trim() ? `${current.trim()}. ${text}` : text).slice(0, 240));
    areaRef.current?.focus();
  }

  return createPortal(
    <div
      className="dialog-fade fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center sm:p-4"
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
        className="dialog-pop relative w-full max-w-md rounded-t-3xl border-2 border-neutral-900 bg-white p-6 pb-8 sm:rounded-3xl sm:pb-6 sm:shadow-[6px_6px_0_#c9a24a]"
      >
        <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-xl text-neutral-400 transition hover:bg-neutral-100 hover:text-black">
          ×
        </button>
        <h2 id="light-title" className="font-serif text-xl font-semibold tracking-wide">Thắp một nén nhang</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Người cúng: <span className="font-medium text-neutral-900">{donorName}</span> · cháy trong 4 giờ
        </p>

        <label htmlFor="prayer" className="mt-5 block text-sm font-medium text-neutral-700">Lời khẩn cầu</label>
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
          className="mt-1.5 w-full resize-none rounded-xl border border-neutral-300 px-3.5 py-3 text-[15px] leading-6 outline-none transition placeholder:text-neutral-400 focus:border-black focus:ring-4 focus:ring-black/10"
        />
        <div className="mt-1.5 flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => addSuggestion(s)} className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition hover:border-neutral-900 hover:text-black">
                {s}
              </button>
            ))}
          </div>
          <span className="shrink-0 pt-1 text-xs tabular-nums text-neutral-400">{prayer.length}/240</span>
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={busy || trimmed.length < 2} className={`${buttonDark} mt-5 w-full`}>
          {busy ? "Đang thắp…" : "Thắp nhang"}
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
    const timer = window.setTimeout(() => setToast(null), 4000);
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
      setToast({ kind: "success", text: "Nén nhang đã được thắp." });
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
  const message = npcMessage || WELCOME;

  const cta = (() => {
    const note = "text-sm text-neutral-500";
    if (loading || authLoading) return <button type="button" disabled className={buttonDark}>Đang kiểm tra…</button>;
    if (!user) return <Link href="/login/?next=%2Fincense%2F" className={buttonDark}>Đăng nhập để cúng dường</Link>;
    if (!canDonate) return <p role="status" className={note}>Tài khoản này không được phép cúng dường.</p>;
    if (acceptingIncense === false) return <p role="status" className={note}>Hiện đang tạm ngưng nhận cúng dường.</p>;
    return (
      <button type="button" disabled={nameLoading || !donorName} onClick={() => { setDialogError(null); setDialogOpen(true); }} className={buttonDark}>
        Thắp nhang cúng dường
      </button>
    );
  })();

  return (
    <div className="mx-auto max-w-3xl">
      <section className="px-4 pb-10 pt-10 sm:px-10" aria-label="Bàn hương cúng dường">
        <header className="text-center">
          <h1 className="font-serif text-2xl font-semibold tracking-wide sm:text-3xl">Cúng dường</h1>
          <div className="mx-auto mt-3 flex items-center justify-center gap-3 text-[#b8913a]" aria-hidden>
            <span className="h-px w-12 bg-current" />
            <span className="text-[10px]">◆</span>
            <span className="h-px w-12 bg-current" />
          </div>
          <p className="mt-2 text-sm text-neutral-500" aria-live="polite">
            {loading ? "Đang tải…" : active.length === 0 ? "Chưa có nén nhang nào đang cháy" : `${active.length} nén nhang đang cháy`}
          </p>
        </header>

        <div className="relative mx-auto mt-6 h-44 w-[min(60vw,14rem)] sm:h-56 sm:w-[18rem]">
          {/* Flat gold halo: solid cream disc with two thin gold rings (no gradient, no blur). */}
          <span className="pointer-events-none absolute left-1/2 top-[48%] aspect-square w-[82%] -translate-x-1/2 -translate-y-1/2" aria-hidden>
            <span className="halo-pulse absolute inset-0 rounded-full border border-[#e3cf9a] bg-[#fcf6e4]" />
            <span className="absolute inset-[8%] rounded-full border border-[#c9a24a]" />
          </span>
          {imageFailed ? (
            <BuddhaArt />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={BUDDHA_IMAGE}
              alt="Tượng Phật"
              decoding="async"
              onError={() => setImageFailed(true)}
              className="buddha-float pointer-events-none relative h-full w-full object-contain object-top"
            />
          )}
        </div>

        <p key={message} className="fade-up mx-auto mt-4 min-h-[3.5rem] max-w-md text-center font-serif text-base italic leading-6 text-neutral-600" role="status" aria-live="polite">
          {message}
          {npcMessage && <span className="mt-1 block font-sans text-[11px] not-italic uppercase tracking-widest text-[#a98532]">Thích Khoai Tây</span>}
        </p>

        {loadError && <p role="alert" className="mx-auto mt-4 max-w-md rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700">{loadError}</p>}

        {/* Sticks stand on a single thin line */}
        {loading ? (
          <div className="mx-auto mt-8 h-48 w-full max-w-md animate-pulse rounded-2xl bg-neutral-100" aria-busy="true" />
        ) : (
          <div className="-mt-6 overflow-x-auto overflow-y-hidden pb-1 pt-8" aria-label={`${active.length} nén nhang đang cháy`}>
            <div className="relative mx-auto flex w-max min-w-[16rem] items-end justify-center gap-3 px-8 sm:min-w-[24rem] sm:gap-5">
              {active.length === 0 && <div className="h-[180px]" aria-hidden />}
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
              <div className="pointer-events-none absolute inset-x-3 bottom-0 z-20 h-4 rounded-full border-2 border-[#c9a24a] bg-neutral-900" aria-hidden>
                <span className="absolute inset-x-5 top-[3px] h-px bg-[#c9a24a]" />
              </div>
            </div>
          </div>
        )}

        <div className="mx-auto mt-8 max-w-md">
          {!loading &&
            (active.length === 0 ? (
              <div className="flex min-h-[132px] items-center justify-center px-6 text-center text-sm text-neutral-400">
                Hãy là người thắp nén nhang đầu tiên.
              </div>
            ) : (
              <Plaque key={shown?.id ?? "none"} incense={shown} now={now} canBless={canBless} busy={blessingBusy === shown?.id} onBless={giveBlessing} />
            ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-2">
          {cta}
          <p className="text-xs text-neutral-400">Mỗi nén nhang cháy trong 4 giờ.</p>
        </div>
      </section>

      {toast && (
        <div
          role={toast.kind === "error" ? "alert" : "status"}
          className={`toast-in fixed bottom-6 left-1/2 z-40 w-[min(92%,24rem)] -translate-x-1/2 rounded-full border-2 border-[#c9a24a] px-5 py-3 text-center text-sm shadow-[3px_3px_0_#171717] ${toast.kind === "error" ? "bg-red-600 text-white" : "bg-neutral-900 text-white"}`}
        >
          {toast.text}
        </div>
      )}

      <LightDialog open={dialogOpen} donorName={donorName} busy={busy} error={dialogError} onClose={closeDialog} onSubmit={lightOne} />
    </div>
  );
}
