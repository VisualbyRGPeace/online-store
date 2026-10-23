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
  "inline-flex items-center justify-center rounded-full bg-black px-7 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50";

// ---------------------------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------------------------
/** Vietnamese text from the database may be decomposed (base letter + combining mark); NFC joins them. */
const nfc = (text: string) => text.normalize("NFC");

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

// Soft sprites are drawn once and stamped with drawImage: much cheaper than a gradient per particle.
// Every sprite fades to fully transparent before its edge, so nothing ever shows a hard cut.
let sprites: { smoke: HTMLCanvasElement; glow: HTMLCanvasElement; ember: HTMLCanvasElement; spark: HTMLCanvasElement } | null = null;
function getSprites() {
  sprites ??= {
    smoke: makeSprite(64, [[0, "rgba(110,110,110,1)"], [0.5, "rgba(110,110,110,.4)"], [1, "rgba(110,110,110,0)"]]),
    glow: makeSprite(64, [[0, "rgba(255,176,90,1)"], [0.35, "rgba(255,130,50,.45)"], [1, "rgba(255,100,30,0)"]]),
    ember: makeSprite(32, [[0, "rgba(255,244,196,1)"], [0.3, "rgba(255,190,90,1)"], [0.65, "rgba(232,89,26,.95)"], [1, "rgba(232,89,26,0)"]]),
    spark: makeSprite(32, [[0, "rgba(120,120,120,1)"], [0.4, "rgba(120,120,120,.4)"], [1, "rgba(120,120,120,0)"]]),
  };
  return sprites;
}

/** One shared animation loop for every stick (capped at ~30fps). */
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

/** Four-point glint. */
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
// One burning incense stick: black lacquered stick with silver bands, glowing red ember, soft smoke, silver glints when blessed
// ---------------------------------------------------------------------------------------------
const LW = 96; // logical canvas width: wider than the stick so glow and smoke are never cut off
const LH = 420;
const CX = LW / 2;
const TOP0 = 170; // tip position when freshly lit
const BURN_END = 330; // tip position when fully burned
const BAMBOO_TOP = 335;
const BASE = LH;

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
    const { smoke: smokeImg, glow: glowImg, ember: emberImg, spark: sparkImg } = getSprites();
    const reduce = reducedMotion();
    const born = performance.now();
    const isFresh = freshRef.current && !reduce;
    const smoke: Smoke[] = [];
    const sparks: Spark[] = [];
    let drawScale = 1;
    let last = 0;

    const stopObserving = observeCanvasSize(cv, LH / LW, (cssW, dpr) => { drawScale = (cssW / LW) * dpr; });

    // Materials, created once: black lacquer, polished silver trim, ash.
    const lacquer = ctx.createLinearGradient(CX - 3, 0, CX + 3, 0);
    lacquer.addColorStop(0, "#050505");
    lacquer.addColorStop(0.35, "#3c3c3c");
    lacquer.addColorStop(0.62, "#161616");
    lacquer.addColorStop(1, "#000000");
    const gold = ctx.createLinearGradient(CX - 3.2, 0, CX + 3.2, 0); // silver trim
    gold.addColorStop(0, "#6b6b6b");
    gold.addColorStop(0.38, "#f2f2f2");
    gold.addColorStop(0.66, "#a8a8a8");
    gold.addColorStop(1, "#555555");
    const rod = ctx.createLinearGradient(CX - 1.8, 0, CX + 1.8, 0);
    rod.addColorStop(0, "#666666");
    rod.addColorStop(0.45, "#e8e8e8");
    rod.addColorStop(1, "#8a8a8a");
    const ashGrad = ctx.createLinearGradient(CX - 3.2, 0, CX + 3.2, 0);
    ashGrad.addColorStop(0, "#999999");
    ashGrad.addColorStop(0.45, "#e9e9e9");
    ashGrad.addColorStop(1, "#a0a0a0");

    const tick = (time: number) => {
      if (!onScreen.current) { last = 0; return; }
      if (reduce && last !== 0 && time - last < 1000) return; // reduced motion: redraw about once a second
      const dt = last ? Math.min(4, (time - last) / 16.67) : 1;
      last = time;

      const flick = reduce ? 0.7 : Math.max(0.3, Math.min(1, 0.66 + 0.16 * Math.sin(time * 0.006) + 0.1 * Math.sin(time * 0.017 + 1.3) + (Math.random() - 0.5) * 0.06));
      const ignite = isFresh ? Math.min(1, (time - born) / 1600) : 1;
      const remaining = Math.max(0, Math.min(1, (expires - Date.now()) / BURN_MS));
      const ey = TOP0 + (BURN_END - TOP0) * (1 - remaining);
      const active = selectedRef.current;

      ctx.setTransform(drawScale, 0, 0, drawScale, 0, 0);
      ctx.clearRect(0, 0, LW, LH);

      // Warm glow around the tip. Capped below the canvas width and faded to zero at its edge, so it is never cut.
      const glowSize = Math.min(92, (44 + 26 * flick + (active ? 16 : 0)) * (1 + (1 - ignite) * 0.5));
      ctx.globalAlpha = Math.min(1, (0.28 + 0.4 * flick) * (0.35 + 0.65 * ignite) + (active ? 0.14 : 0));
      ctx.drawImage(glowImg, CX - glowSize / 2, ey + 1.5 - glowSize / 2, glowSize, glowSize);
      ctx.globalAlpha = 1;

      // Silver rod at the base.
      ctx.fillStyle = rod;
      ctx.fillRect(CX - 1.8, BAMBOO_TOP - 2, 3.6, BASE - BAMBOO_TOP + 2);

      // Lacquered body (shortens as it burns) with a soft sheen and two silver bands.
      if (ey + 4 < BAMBOO_TOP) {
        ctx.fillStyle = lacquer;
        ctx.fillRect(CX - 3, ey + 4, 6, BAMBOO_TOP - ey - 2);
        ctx.fillStyle = "rgba(255,255,255,.2)";
        ctx.fillRect(CX - 1.9, ey + 8, 0.9, Math.max(0, BAMBOO_TOP - ey - 12));
        if (ey + 8 < BAMBOO_TOP - 22) {
          ctx.fillStyle = gold;
          ctx.fillRect(CX - 3.2, BAMBOO_TOP - 20, 6.4, 3.4);
        }
        if (ey + 8 < BAMBOO_TOP - 30) {
          ctx.fillStyle = gold;
          ctx.fillRect(CX - 3.1, BAMBOO_TOP - 27, 6.2, 1.3);
        }
      }

      // Ash above the tip.
      const ashLen = 14 + 6 * (1 - remaining);
      ctx.fillStyle = ashGrad;
      ctx.beginPath();
      ctx.moveTo(CX - 3.2, ey);
      ctx.lineTo(CX - 2.4, ey - ashLen + 2);
      ctx.quadraticCurveTo(CX, ey - ashLen - 1.5, CX + 2.4, ey - ashLen + 2);
      ctx.lineTo(CX + 3.2, ey);
      ctx.closePath();
      ctx.fill();

      // Glowing ember.
      const emberSize = (15 + 4 * flick) * (0.4 + 0.6 * ignite);
      ctx.drawImage(emberImg, CX - emberSize / 2, ey + 1.5 - emberSize / 2, emberSize, emberSize);

      // Smoke: soft sprites that widen, sway and fade as they rise (and fade out before the canvas edge).
      if (!reduce && smoke.length < 28 && Math.random() < 0.1 * ignite * dt) {
        smoke.push({
          x0: CX, y: ey - ashLen - 2, vy: -(0.4 + Math.random() * 0.22), r0: 2.2 + Math.random() * 1.4, life: 0,
          max: 300 + Math.random() * 140, phase: Math.random() * 6.28, amp: 2 + Math.random() * 2.6, drift: (Math.random() - 0.5) * 0.05,
        });
      }
      for (let i = smoke.length - 1; i >= 0; i--) {
        const p = smoke[i];
        if (!p) continue;
        p.life += dt;
        p.y += p.vy * dt;
        const progress = p.life / p.max;
        if (progress >= 1 || p.y < -10) { smoke.splice(i, 1); continue; }
        const r = p.r0 + progress * 10;
        const x = p.x0 + p.drift * p.life + Math.sin(p.phase + p.life * 0.034) * p.amp * (0.3 + progress * 1.6);
        const edgeFade = Math.max(0, Math.min(1, p.y / 70));
        ctx.globalAlpha = 0.22 * Math.pow(Math.sin(Math.PI * progress), 1.2) * edgeFade;
        ctx.drawImage(smokeImg, x - r, p.y - r, r * 2, r * 2);
      }

      // Blessed sticks get a few silver glints around the tip.
      if (blessedRef.current && sparks.length < 10 && Math.random() < 0.07 * dt) {
        const side = Math.random() < 0.5 ? -1 : 1;
        sparks.push({ x: CX + side * (8 + Math.random() * 14), y: ey - 6 + (Math.random() - 0.5) * 26, life: 0, max: 50 + Math.random() * 40, size: 2.4 + Math.random() * 2.2, vy: -0.12 - Math.random() * 0.1 });
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        if (!s) continue;
        s.life += dt;
        s.y += s.vy * dt;
        const progress = s.life / s.max;
        if (progress >= 1) { sparks.splice(i, 1); continue; }
        const k = Math.sin(progress * Math.PI);
        ctx.globalAlpha = k;
        ctx.drawImage(sparkImg, s.x - s.size * 2, s.y - s.size * 2, s.size * 4, s.size * 4);
        ctx.fillStyle = "#262626";
        twinkle(ctx, s.x, s.y, s.size * 0.75 * k + 0.4);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
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
      {/* The canvas is 150% of the button width and centred, so glow and smoke have room on both sides. */}
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
      <p className="text-sm font-semibold tracking-wide text-neutral-900">{nfc(incense.donor_name)}</p>
      <p className="mt-1.5 max-w-md text-[15px] leading-6 text-neutral-600">“{nfc(incense.message_text)}”</p>
      <div className="mt-3 h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-neutral-200" aria-hidden>
        <div className="h-full bg-neutral-900 transition-[width] duration-1000" style={{ width: `${pct}%` }} />
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
          className="mt-3 rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
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
      className="dialog-fade fixed inset-0 z-50 grid place-items-end bg-black/50 backdrop-blur-sm sm:place-items-center sm:p-4"
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
        className="dialog-pop relative w-full max-w-md rounded-t-3xl border border-neutral-200 bg-white p-6 pb-8 shadow-2xl sm:rounded-3xl sm:pb-6"
      >
        <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-xl text-neutral-400 transition hover:bg-neutral-100 hover:text-black">
          ×
        </button>
        <h2 id="light-title" className="text-xl font-semibold tracking-wide">Thắp một nén nhang</h2>
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
          <h1 className="text-2xl font-semibold tracking-wide sm:text-3xl">Cúng dường</h1>
          <div className="mx-auto mt-3 flex items-center justify-center gap-3 text-neutral-400" aria-hidden>
            <span className="h-px w-12 bg-current" />
            <span className="text-[10px]">◆</span>
            <span className="h-px w-12 bg-current" />
          </div>
          <p className="mt-2 text-sm text-neutral-500" aria-live="polite">
            {loading ? "Đang tải…" : active.length === 0 ? "Chưa có nén nhang nào đang cháy" : `${active.length} nén nhang đang cháy`}
          </p>
        </header>

        <div className="relative mx-auto mt-6 h-44 w-[min(60vw,14rem)] sm:h-56 sm:w-[18rem]">
          {/* Soft grey aura with two fine rings. */}
          <span className="pointer-events-none absolute left-1/2 top-[48%] aspect-square w-[82%] -translate-x-1/2 -translate-y-1/2" aria-hidden>
            <span className="halo-pulse stage-glow absolute -inset-[24%] rounded-full" />
            <span className="absolute inset-0 rounded-full border border-neutral-200" />
            <span className="absolute inset-[8%] rounded-full border border-neutral-300" />
          </span>
          {!imageFailed && (
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

        <p key={message} className="fade-up mx-auto mt-4 min-h-[3.5rem] max-w-md text-center text-[15px] leading-6 text-neutral-600" role="status" aria-live="polite">
          {nfc(message)}
          {npcMessage && <span className="mt-1 block font-sans text-[11px] uppercase tracking-widest text-neutral-400">Thích Khoai Tây</span>}
        </p>

        {loadError && <p role="alert" className="mx-auto mt-4 max-w-md rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700">{loadError}</p>}

        {/* Sticks stand on a single thin line */}
        {loading ? (
          <div className="mx-auto mt-8 h-48 w-full max-w-md animate-pulse rounded-2xl bg-neutral-100" aria-busy="true" />
        ) : (
          <div className="-mt-6 overflow-x-auto overflow-y-hidden pb-5 pt-8" aria-label={`${active.length} nén nhang đang cháy`}>
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
              {/* Censer: silver rim around ash (behind the sticks), black bowl with silver edge (in front), silver feet. */}
              <span className="pointer-events-none absolute inset-x-2 bottom-3 z-0 h-4 rounded-full bg-silver-h p-[2px]" aria-hidden>
                <span className="block h-full w-full rounded-full bg-ash" />
              </span>
              <span className="pointer-events-none absolute inset-x-2.5 bottom-0 z-20 h-5 rounded-b-3xl bg-silver-h p-[2px] pt-0 shadow-[0_10px_16px_-8px_rgba(0,0,0,.45)]" aria-hidden>
                <span className="block h-full w-full rounded-b-[22px] bg-lacquer" />
              </span>
              <span className="pointer-events-none absolute -bottom-1.5 left-[18%] z-10 h-2 w-4 rounded-b-lg bg-silver" aria-hidden />
              <span className="pointer-events-none absolute -bottom-1.5 right-[18%] z-10 h-2 w-4 rounded-b-lg bg-silver" aria-hidden />
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
          className={`toast-in fixed bottom-6 left-1/2 z-40 w-[min(92%,24rem)] -translate-x-1/2 rounded-full px-5 py-3 text-center text-sm shadow-xl ${toast.kind === "error" ? "bg-red-600 text-white" : "bg-neutral-900 text-white"}`}
        >
          {toast.text}
        </div>
      )}

      <LightDialog open={dialogOpen} donorName={donorName} busy={busy} error={dialogError} onClose={closeDialog} onSubmit={lightOne} />
    </div>
  );
}
