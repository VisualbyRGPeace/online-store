"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/use-auth";
import { getProfile } from "@/services/account-service";
import {
  blessIncense,
  extinguishIncense,
  getIncenseOfferingEnabled,
  getIncensePermissions,
  lightIncense,
  listBurningIncense,
  relightIncense,
  subscribeToIncenseBlessings,
  type BurningIncense,
} from "@/services/incense-service";
import { getMeritBoxQr, type MeritBoxQr } from "@/services/merit-box-service";

const BURN_MS = 4 * 60 * 60 * 1000;

/** A stick as the page uses it. The extra fields come from the service (see docs/incense-extinguish.md). */
type Incense = BurningIncense & {
  is_mine?: boolean; // the signed-in user is the one who lit this stick
  extinguished_at?: string | null; // set while the stick is put out
  extinguished_by_name?: string | null; // who put it out
};
type ActionKind = "bless" | "extinguish" | "relight";
const BUDDHA_IMAGE = "https://raw.githubusercontent.com/VisualbyRGPeace/online-store/main/Phatthanh.png";
const SUGGESTIONS = ["Bình an cho gia đình", "Sức khỏe dồi dào", "Công việc thuận lợi", "Tâm luôn an tĩnh"];
const WELCOME = "Hãy thắp một nén nhang và gửi lời nguyện của bạn.";

const buttonDark =
  "inline-flex items-center justify-center rounded-full bg-black px-7 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50";

// ---------------------------------------------------------------------------------------------
// Vietnamese text helper
// ---------------------------------------------------------------------------------------------
/** Vietnamese text from the database may be decomposed (base letter + combining mark); NFC joins them. */
const nfc = (text: string) => text.normalize("NFC");

// ---------------------------------------------------------------------------------------------
// Incense table (SVG): black lacquer tray with a gold rim, burning sticks, thin wavering smoke
// ---------------------------------------------------------------------------------------------
const TOP_Y = 74; // top of a freshly lit stick
const BODY_BOTTOM = 406;
const BURN_RANGE = 250; // how far the tip travels while the stick burns down
const STAR = "M0 -7 Q0 0 7 0 Q0 0 0 7 Q0 0 -7 0 Q0 0 0 -7Z";
const STARS = [[-20, 52, 0], [19, 44, 0.9], [-13, 90, 1.7], [15, 80, 2.4]] as const;
const SMOKE_PATHS = [
  ["M0 0 C-18 -34 20 -62 0 -100 S-22 -152 4 -204", "M0 0 C16 -30 -18 -70 2 -104 S24 -150 -5 -198", "M0 0 C-12 -40 16 -56 -2 -98 S-18 -158 7 -206"],
  ["M0 0 C20 -32 -16 -66 2 -102 S22 -150 -4 -202", "M0 0 C-16 -36 18 -60 0 -100 S-20 -154 6 -200", "M0 0 C12 -38 -14 -64 2 -104 S20 -148 -7 -206"],
] as const;
const SMOKE_WIDTH = [[2.4, 2, 2.2], [2.2, 2, 2.4]] as const;

function Stick({ incense, index, x, remaining, fresh, selected, fancy, onSelect, onHover }: {
  incense: Incense;
  index: number;
  x: number;
  remaining: number;
  fresh: boolean;
  selected: boolean;
  fancy: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const topY = TOP_Y + BURN_RANGE * (1 - remaining);
  const dy = topY - TOP_Y;
  const out = Boolean(incense.extinguished_at);
  const blessed = incense.blessing_count > 0 && !out;
  const variant = index % 2;
  const delay = (base: number) => ({ animationDelay: `${-(base + index * 1.3)}s` });
  const hitTop = topY - 40;

  return (
    <g transform={`translate(${x} 0)`} className={selected ? "inc-sel" : undefined}>
      <g className={fresh ? "inc-drop" : undefined}>
        <ellipse cx="0" cy="546" rx="8" ry="3" fill="url(#incGoldRod)" />
        <rect x="-1.8" y="404" width="3.6" height="142" fill="url(#incBamboo)" />
        <rect x="-3" y={topY} width="6" height={BODY_BOTTOM - topY} fill="url(#incBrown)" />
        <rect x="-3" y="400" width="6" height="6" fill="#5a3520" opacity=".7" />

        <g transform={`translate(0 ${dy})`}>
          <path d="M-3.2 69 L-3 59 L-2 55 L-.6 53 L1 56 L2.6 54 L3.2 60 L3.2 69Z" fill="url(#incAsh)" />
          <path d="M-1.6 62 L-.4 60 L.8 63 M1.2 58 L2.4 59" stroke="#7d7870" strokeWidth=".7" fill="none" opacity=".8" />
          <rect x="-3" y="68" width="6" height="6" fill="#2a1a12" />
          {out ? (
            // Put out: dark, cold tip, no glow and no smoke.
            <rect x="-3" y="68" width="6" height="6" fill="#4a3a32" />
          ) : (
            <>
              <g className="inc-ember">
                <circle className="inc-halo inc-flick-h" cx="0" cy="71" r="20" fill="url(#incHalo)" style={delay(0.4)} />
                <rect x="-3" y="74" width="6" height="12" fill="url(#incCoal)" />
                <rect x="-3" y="68" width="6" height="6" fill="#d9300e" />
                <rect className="inc-flick" x="-3" y="68" width="6" height="6" fill="#ff8a3a" style={delay(1.1)} />
              </g>
              <g transform="translate(0 50)">
                <g filter={fancy ? "url(#incSmokeFx)" : undefined}>
                  {SMOKE_PATHS[variant]?.map((d, i) => (
                    <path key={i} className="inc-wisp" strokeWidth={SMOKE_WIDTH[variant]?.[i] ?? 2.2} d={d} style={delay(2.7 * i)} />
                  ))}
                </g>
              </g>
            </>
          )}
          {blessed && STARS.map(([sx, sy, dl], i) => (
            <g key={i} transform={`translate(${sx} ${sy})`}>
              <g className="inc-star" style={{ animationDelay: `${-(dl + index * 0.6)}s` }}>
                <circle r="11" fill="url(#incSparkGlow)" />
                <path d={STAR} fill="#e8a91f" />
                <path d={STAR} fill="#fff3c4" transform="scale(.5)" />
              </g>
            </g>
          ))}
        </g>

        <rect
          className="inc-hit"
          x="-45"
          y={hitTop}
          width="90"
          height={560 - hitTop}
          tabIndex={0}
          role="button"
          aria-pressed={selected}
          aria-label={`Nhang do ${nfc(incense.donor_name)} cúng dường${out ? `, đã bị ${nfc(incense.extinguished_by_name ?? "một người")} dập tắt` : ""}. Khẩn cầu: ${nfc(incense.message_text)}`}
          onClick={() => onSelect(incense.id)}
          onPointerEnter={(e) => { if (e.pointerType === "mouse") onHover(incense.id); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") onHover(null); }}
          onFocus={() => onHover(incense.id)}
          onBlur={() => onHover(null)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(incense.id); } }}
        />
      </g>
    </g>
  );
}

function IncenseTable({ items, now, freshIds, shownId, onSelect, onHover }: {
  items: Incense[];
  now: number;
  freshIds: ReadonlySet<string>;
  shownId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const n = items.length;
  const spacing = n <= 2 ? 260 : n === 3 ? 200 : 150;
  const trayW = Math.max(860, (Math.max(n, 1) - 1) * spacing + 360);
  const vbW = trayW + 340;
  const cx = vbW / 2;
  const L = 170;
  const R = vbW - 170;
  const fancy = items.filter((item) => !item.extinguished_at).length <= 6; // the animated smoke distortion is the costly part, so it is limited to a few sticks
  const displayW = Math.round(vbW * 0.62);
  const viewBox = n === 0 ? `0 330 ${vbW} 390` : `0 -190 ${vbW} 890`;

  return (
    <div className="overflow-x-auto" aria-label={`${n} nén nhang`}>
      <svg viewBox={viewBox} className="mx-auto block h-auto overflow-visible" style={{ width: `max(560px, min(100%, ${displayW}px))` }} role="group" aria-label="Bàn cúng đen viền vàng với các cây nhang đang cháy">
        <defs>
          <linearGradient id="incLacquer" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b3b41" /><stop offset=".18" stopColor="#1b1b1e" /><stop offset=".7" stopColor="#0a0a0b" /><stop offset="1" stopColor="#000" />
          </linearGradient>
          <linearGradient id="incGoldH" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7a5524" /><stop offset=".25" stopColor="#e6bd77" /><stop offset=".5" stopColor="#fbe3b0" /><stop offset=".75" stopColor="#d2a35a" /><stop offset="1" stopColor="#7a5524" />
          </linearGradient>
          <linearGradient id="incGoldRod" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8a622b" /><stop offset=".35" stopColor="#f7dba5" /><stop offset=".6" stopColor="#cf9f55" /><stop offset="1" stopColor="#7a5524" />
          </linearGradient>
          <linearGradient id="incSheen" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".22" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="incFoot" cx=".4" cy=".35" r=".8">
            <stop offset="0" stopColor="#fbe3b0" /><stop offset=".6" stopColor="#c8964b" /><stop offset="1" stopColor="#6e4a1f" />
          </radialGradient>
          <radialGradient id="incHalo">
            <stop offset="0" stopColor="#ff9a2e" stopOpacity=".65" /><stop offset=".45" stopColor="#ff8a20" stopOpacity=".22" /><stop offset="1" stopColor="#ff8a20" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="incSparkGlow">
            <stop offset="0" stopColor="#ffd25a" stopOpacity=".6" /><stop offset="1" stopColor="#ffd25a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="incSmoke" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#b9b2a8" stopOpacity=".95" /><stop offset=".6" stopColor="#d9d4cc" stopOpacity=".6" /><stop offset="1" stopColor="#ece8e1" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="incBrown" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3b2213" /><stop offset=".35" stopColor="#8d5a38" /><stop offset=".62" stopColor="#6a3f25" /><stop offset="1" stopColor="#36200f" />
          </linearGradient>
          <linearGradient id="incBamboo" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8a6234" /><stop offset=".4" stopColor="#e2c28a" /><stop offset="1" stopColor="#9a7040" />
          </linearGradient>
          <linearGradient id="incAsh" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8d8880" /><stop offset=".45" stopColor="#cfcac2" /><stop offset="1" stopColor="#85807a" />
          </linearGradient>
          <linearGradient id="incCoal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff5a1f" stopOpacity=".85" /><stop offset="1" stopColor="#8d5a38" stopOpacity="0" />
          </linearGradient>
          {/* The soft shadow needs a tall filter region, otherwise the blur is cut off above and below it. */}
          <filter id="incSoft" x="-10%" y="-400%" width="120%" height="900%"><feGaussianBlur stdDeviation="14" /></filter>
          <filter id="incBlur2" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="1.6" /></filter>
          <filter id="incSmokeFx" x="-120%" y="-30%" width="340%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed="7" result="n">
              <animate attributeName="baseFrequency" dur="10s" repeatCount="indefinite" values="0.012 0.03;0.017 0.022;0.012 0.03" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="34" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur in="d" stdDeviation="2.2" />
          </filter>
        </defs>

        {/* ground shadow */}
        <ellipse cx={cx} cy="624" rx={trayW / 2 + 40} ry="13" fill="#000" opacity=".28" filter="url(#incSoft)" />
        <ellipse cx={cx} cy="618" rx={trayW * 0.35} ry="5" fill="#c9a15a" opacity=".25" filter="url(#incBlur2)" />

        {/* feet */}
        <ellipse cx={L + 102} cy="608" rx="17" ry="7" fill="url(#incFoot)" />
        <ellipse cx={R - 102} cy="608" rx="17" ry="7" fill="url(#incFoot)" />

        {/* tray body, side highlight, top face, sheen, gold rim */}
        <path d={`M${L} 562 Q${L} 540 ${L + 32} 540 H${R - 32} Q${R} 540 ${R} 562 Q${R} 606 ${R - 36} 606 H${L + 36} Q${L} 606 ${L} 562Z`} fill="url(#incLacquer)" />
        <path d={`M${L + 6} 566 Q${L + 8} 598 ${L + 38} 600 H${R - 38}`} fill="none" stroke="#fff" strokeOpacity=".08" strokeWidth="2" />
        <path d={`M${L + 14} 541 H${R - 14} Q${R - 6} 541 ${R - 6} 548 Q${R - 6} 556 ${R - 18} 556 H${L + 18} Q${L + 6} 556 ${L + 6} 548 Q${L + 6} 541 ${L + 14} 541Z`} fill="#26262a" />
        <rect x={L + 40} y="543" width={trayW - 80} height="6" rx="3" fill="url(#incSheen)" />
        <path d={`M${L + 6} 550 Q${L + 6} 541 ${L + 34} 541 H${R - 34} Q${R - 6} 541 ${R - 6} 550`} fill="none" stroke="url(#incGoldH)" strokeWidth="3.2" strokeLinecap="round" />
        <path d={`M${L + 12} 556 H${R - 12}`} stroke="url(#incGoldH)" strokeWidth="2" opacity=".85" />

        {items.map((item, i) => {
          const remaining = Math.max(0, Math.min(1, (new Date(item.expires_at).getTime() - now) / BURN_MS));
          return (
            <Stick
              key={item.id}
              incense={item}
              index={i}
              x={cx + (i - (n - 1) / 2) * spacing}
              remaining={remaining}
              fresh={freshIds.has(item.id)}
              selected={item.id === shownId}
              fancy={fancy}
              onSelect={onSelect}
              onHover={onHover}
            />
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Details of the stick being hovered / tapped
// ---------------------------------------------------------------------------------------------
function Plaque({ incense, now, canBless, canExtinguish, locked, busyKind, onBless, onExtinguish, onRelight }: {
  incense: Incense | null;
  now: number;
  canBless: boolean;
  canExtinguish: boolean;
  locked: boolean; // some action is running, so every button waits
  busyKind: ActionKind | null; // the action running on this stick
  onBless: (id: string) => void;
  onExtinguish: (item: Incense) => void;
  onRelight: (item: Incense) => void;
}) {
  if (!incense) {
    return (
      <div className="flex min-h-[132px] items-center justify-center px-6 text-center text-sm text-neutral-400">
        Chạm vào một nén nhang để đọc lời khẩn cầu.
      </div>
    );
  }
  const out = Boolean(incense.extinguished_at);
  const left = Math.max(0, new Date(incense.expires_at).getTime() - now);
  const minutes = Math.ceil(left / 60000);
  const pct = Math.max(0, Math.min(100, (left / BURN_MS) * 100));
  const outline = "rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50";
  const dark = "rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50";
  return (
    <div className="fade-up flex min-h-[132px] flex-col items-center justify-center px-5 py-4 text-center">
      <p className="text-sm font-semibold tracking-wide text-neutral-900">{nfc(incense.donor_name)}</p>
      <p className="mt-1.5 max-w-md text-[15px] leading-6 text-neutral-600">“{nfc(incense.message_text)}”</p>

      {out ? (
        <>
          <p className="mt-3 text-sm text-neutral-600">
            Nhang đã bị dập tắt bởi <span className="font-semibold text-neutral-900">{nfc(incense.extinguished_by_name ?? "một người")}</span>
          </p>
          {incense.is_mine ? (
            <button type="button" disabled={locked} onClick={() => onRelight(incense)} className={`mt-3 ${dark}`}>
              {busyKind === "relight" ? "Đang thắp lại…" : "Thắp lại nhang"}
            </button>
          ) : (
            <p className="mt-1.5 text-xs text-neutral-400">Chỉ người thắp nhang mới có thể thắp lại.</p>
          )}
        </>
      ) : (
        <>
          <div className="mt-3 h-1 w-full max-w-[200px] overflow-hidden rounded-full bg-neutral-200" aria-hidden>
            <div className="h-full bg-neutral-900 transition-[width] duration-1000" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-neutral-400">
            Còn {Math.floor(minutes / 60)} giờ {minutes % 60} phút
            {incense.blessing_count > 0 && <> · ✦ {incense.blessing_count}</>}
          </p>
          {(canBless || (canExtinguish && !incense.is_mine)) && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {canBless && (
                <button type="button" disabled={locked} onClick={() => onBless(incense.id)} className={outline}>
                  {busyKind === "bless" ? "Đang ban phước…" : "✦ Ban phước"}
                </button>
              )}
              {canExtinguish && !incense.is_mine && (
                <button type="button" disabled={locked} onClick={() => onExtinguish(incense)} className={outline}>
                  {busyKind === "extinguish" ? "Đang dập…" : "Dập nhang"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Merit box (Hòm công đức): tap it to see the QR code the admin manages
// ---------------------------------------------------------------------------------------------
function MeritBoxButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Mở hòm công đức để xem mã QR"
      className="mb-btn mx-auto block w-[150px] rounded-2xl text-center transition-transform duration-300 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/40"
    >
      <svg viewBox="0 0 200 150" className="block h-auto w-full" aria-hidden>
        <defs>
          <linearGradient id="mbLacquer" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b3b41" /><stop offset=".2" stopColor="#1b1b1e" /><stop offset=".75" stopColor="#0a0a0b" /><stop offset="1" stopColor="#000" />
          </linearGradient>
          <linearGradient id="mbGoldH" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7a5524" /><stop offset=".25" stopColor="#e6bd77" /><stop offset=".5" stopColor="#fbe3b0" /><stop offset=".75" stopColor="#d2a35a" /><stop offset="1" stopColor="#7a5524" />
          </linearGradient>
          <radialGradient id="mbCoinFill" cx=".4" cy=".35" r=".8">
            <stop offset="0" stopColor="#fbe3b0" /><stop offset=".6" stopColor="#d2a35a" /><stop offset="1" stopColor="#8a622b" />
          </radialGradient>
          {/* Tall filter region so the soft shadow is not cut off. */}
          <filter id="mbSoft" x="-10%" y="-400%" width="120%" height="900%"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>
        <ellipse cx="100" cy="138" rx="70" ry="7" fill="#000" opacity=".2" filter="url(#mbSoft)" />
        <ellipse cx="54" cy="133" rx="10" ry="4" fill="url(#mbGoldH)" />
        <ellipse cx="146" cy="133" rx="10" ry="4" fill="url(#mbGoldH)" />
        {/* the coin falls into the slot on hover (it is drawn behind the lid, so it disappears into it) */}
        <circle className="mb-coin" cx="100" cy="18" r="7" fill="url(#mbCoinFill)" />
        <rect x="34" y="52" width="132" height="80" rx="10" fill="url(#mbLacquer)" />
        <rect x="28" y="38" width="144" height="24" rx="8" fill="url(#mbLacquer)" />
        <rect x="31" y="40" width="138" height="8" rx="4" fill="#26262a" />
        <path d="M30 49 Q30 39 52 39 H148 Q170 39 170 49" fill="none" stroke="url(#mbGoldH)" strokeWidth="2.6" strokeLinecap="round" />
        <rect x="30" y="59" width="140" height="3" rx="1.5" fill="url(#mbGoldH)" />
        <rect x="76" y="43" width="48" height="5" rx="2.5" fill="#000" stroke="url(#mbGoldH)" strokeWidth=".8" />
        <rect x="58" y="76" width="84" height="36" rx="7" fill="#0c0c0d" stroke="url(#mbGoldH)" strokeWidth="1.6" />
        <text x="100" y="99" textAnchor="middle" fontSize="15" fontWeight="500" fill="#ecd29a" style={{ fontFamily: "inherit" }}>Công đức</text>
      </svg>
      <span className="mt-1 block text-xs text-neutral-400">Hòm công đức</span>
    </button>
  );
}

type MeritState = { status: "loading" } | { status: "error" } | { status: "empty" } | { status: "ready"; qr: MeritBoxQr };

function MeritBoxDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<MeritState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  // Load the QR each time the dialog opens, so a change made by the admin shows up straight away.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setState({ status: "loading" });
    getMeritBoxQr()
      .then((qr) => { if (alive) setState(qr ? { status: "ready", qr } : { status: "empty" }); })
      .catch((err) => {
        console.error(err);
        if (alive) setState({ status: "error" });
      });
    return () => { alive = false; };
  }, [open, attempt]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="dialog-fade fixed inset-0 z-50 grid place-items-end bg-black/40 backdrop-blur-sm sm:place-items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="merit-title" className="dialog-pop relative w-full max-w-sm rounded-t-3xl bg-white p-6 pb-8 text-center shadow-2xl sm:rounded-3xl sm:pb-6">
        <button type="button" onClick={onClose} aria-label="Đóng" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-xl text-neutral-400 transition hover:bg-neutral-100 hover:text-black">
          ×
        </button>
        <h2 id="merit-title" className="text-xl font-semibold tracking-wide">Hòm công đức</h2>
        <p className="mt-1 text-sm text-neutral-500">Quét mã để gửi công đức.</p>

        <div className="mt-5">
          {state.status === "loading" && <div className="mx-auto h-64 w-64 animate-pulse rounded-2xl bg-neutral-100" aria-busy="true" />}
          {state.status === "ready" && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.qr.imageUrl}
                alt="Mã QR hòm công đức"
                decoding="async"
                onError={() => setState({ status: "error" })}
                className="mx-auto h-64 w-64 rounded-2xl border border-neutral-200 bg-white object-contain p-3"
              />
              {state.qr.title && <p className="mt-3 text-sm font-semibold text-neutral-900">{nfc(state.qr.title)}</p>}
              {state.qr.note && <p className="mt-1 whitespace-pre-line text-sm text-neutral-500">{nfc(state.qr.note)}</p>}
            </>
          )}
          {state.status === "empty" && <p className="px-4 py-10 text-sm text-neutral-400">Hiện chưa có mã QR công đức.</p>}
          {state.status === "error" && (
            <div>
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Chưa tải được mã QR. Vui lòng thử lại.</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-3 rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-900">
                Thử lại
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
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
      className="dialog-fade fixed inset-0 z-50 grid place-items-end bg-black/40 backdrop-blur-sm sm:place-items-center sm:p-4"
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
        className="dialog-pop relative w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 shadow-2xl sm:rounded-3xl sm:pb-6"
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
  const [incense, setIncense] = useState<Incense[]>([]);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
  const [canDonate, setCanDonate] = useState(false);
  const [canBless, setCanBless] = useState(false);
  const [actionBusy, setActionBusy] = useState<{ id: string; kind: ActionKind } | null>(null);
  const [acceptingIncense, setAcceptingIncense] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [donorName, setDonorName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [npcMessage, setNpcMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [meritOpen, setMeritOpen] = useState(false);
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

  /** Runs one action on a stick (bless / put out / relight), then reloads the table and shows a toast. */
  async function runAction(id: string, kind: ActionKind, work: () => Promise<void>, okText: string, errText: string) {
    if (actionBusy) return;
    setActionBusy({ id, kind });
    try {
      await work();
      await refresh();
      setToast({ kind: "success", text: okText });
    } catch (err) {
      console.error(err);
      setToast({ kind: "error", text: errText });
    } finally {
      setActionBusy(null);
    }
  }

  function giveBlessing(offeringId: string) {
    if (!canBless) return;
    void runAction(offeringId, "bless", () => blessIncense(offeringId), "Đã ban phước cho nén nhang này.", "Chưa ban phước được. Vui lòng thử lại sau.");
  }

  function putOut(item: Incense) {
    if (!user || item.is_mine) return;
    void runAction(item.id, "extinguish", () => extinguishIncense(item.id), `Đã dập nén nhang của ${nfc(item.donor_name)}.`, "Chưa dập được nhang. Vui lòng thử lại sau.");
  }

  function relight(item: Incense) {
    if (!item.is_mine) return;
    void runAction(item.id, "relight", () => relightIncense(item.id), "Đã thắp lại nén nhang.", "Chưa thắp lại được. Vui lòng thử lại sau.");
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
  const litCount = active.filter((item) => !item.extinguished_at).length;
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
        {/* Hidden from view, kept for screen readers. */}
        <header className="sr-only">
          <h1>Cúng dường</h1>
          <p aria-live="polite">
            {loading ? "Đang tải…" : active.length === 0 ? "Chưa có nén nhang nào đang cháy" : `${litCount} nén nhang đang cháy${active.length > litCount ? ` · ${active.length - litCount} đã tắt` : ""}`}
          </p>
        </header>

        <div className="relative mx-auto mt-0 h-44 w-[min(60vw,14rem)] sm:h-56 sm:w-[18rem]">
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
          {npcMessage && <span className="mt-1 block text-xs text-neutral-400">Thích Khoai Tây</span>}
        </p>

        {loadError && <p role="alert" className="mx-auto mt-4 max-w-md rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700">{loadError}</p>}

        {loading ? (
          <div className="mx-auto mt-8 h-48 w-full max-w-md animate-pulse rounded-2xl bg-neutral-100" aria-busy="true" />
        ) : (
          <div className="mt-2">
            <IncenseTable items={active} now={now} freshIds={freshIds} shownId={shownId} onSelect={selectStick} onHover={setHoverId} />
          </div>
        )}

        <div className="mx-auto mt-8 max-w-md">
          {!loading &&
            (active.length === 0 ? (
              <div className="flex min-h-[132px] items-center justify-center px-6 text-center text-sm text-neutral-400">
                Hãy là người thắp nén nhang đầu tiên.
              </div>
            ) : (
              <Plaque key={shown?.id ?? "none"} incense={shown} now={now} canBless={canBless} canExtinguish={Boolean(user)} locked={actionBusy !== null} busyKind={actionBusy && actionBusy.id === shown?.id ? actionBusy.kind : null} onBless={giveBlessing} onExtinguish={putOut} onRelight={relight} />
            ))}
        </div>

        <div className="mt-8">
          <MeritBoxButton onClick={() => setMeritOpen(true)} />
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
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

      <MeritBoxDialog open={meritOpen} onClose={() => setMeritOpen(false)} />
      <LightDialog open={dialogOpen} donorName={donorName} busy={busy} error={dialogError} onClose={closeDialog} onSubmit={lightOne} />
    </div>
  );
}
