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
const SUGGESTIONS = ["Bình an cho gia đình", "Sức khỏe dồi dào", "Công việc thuận lợi", "Tâm luôn an tĩnh"];
const WELCOME = "Hãy thắp một nén nhang và gửi lời nguyện của bạn.";

type ActionKind = "bless" | "extinguish" | "relight";

// Flat 2D cartoon style: solid colours and one dark outline colour. No gradients, no blur, no shadows.
const INK = "#231c18";
const ORANGE = "#f08a24";
const ORANGE_DARK = "#c8650f";
const GOLD = "#f6c23e";
const SKIN = "#f6cfa6";
const PAPER = "#e7e3da";

const inkBorder = "border-[#231c18]";

/** Vietnamese text from the database may be decomposed (base letter + combining mark); NFC joins them. */
const nfc = (text: string) => text.normalize("NFC");

function actionErrorText(err: unknown, fallback: string): string {
  const message = (err as { message?: string } | null)?.message ?? "";
  if (message.includes("rate_limited")) return "Bạn thao tác hơi nhanh. Vui lòng thử lại sau ít phút.";
  if (message.includes("account_banned")) return "Tài khoản của bạn đang bị khóa.";
  if (message.includes("authentication_required")) return "Vui lòng đăng nhập để tiếp tục.";
  if (message.includes("cannot_extinguish")) return "Không dập được: nhang này đã tắt, đã hết hạn hoặc là nhang của bạn.";
  if (message.includes("cannot_relight")) return "Không thắp lại được nén nhang này.";
  return fallback;
}

// ---------------------------------------------------------------------------------------------
// Flat illustrations
// ---------------------------------------------------------------------------------------------
function Heart({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.8-8 11-8 11z" fill={GOLD} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** A meditating monk drawn with flat shapes and a single outline colour. */
function Monk() {
  const line = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg viewBox="0 0 240 262" className="h-full w-full overflow-visible" role="img" aria-label="Tượng Phật ngồi thiền">
      <ellipse className="monk-shadow" cx="120" cy="252" rx="74" ry="6" fill="#e8e5df" />
      <g className="monk-body">
        {/* halo */}
        <circle cx="120" cy="78" r="60" fill="#fde9a8" {...line} />
        <circle className="halo-ring" cx="120" cy="78" r="72" fill="none" stroke={GOLD} strokeWidth="3.5" strokeLinecap="round" strokeDasharray="2 10" />

        {/* ears, neck */}
        <circle cx="90" cy="80" r="7" fill={SKIN} {...line} />
        <circle cx="150" cy="80" r="7" fill={SKIN} {...line} />
        <path d="M108 98h24v20h-24z" fill={SKIN} {...line} />

        {/* torso: bare shoulder on the left, robe over the right */}
        <path d="M80 196C72 142 90 114 120 110c30 4 48 32 40 86z" fill={SKIN} {...line} />
        <path d="M102 112c30-3 56 8 58 34l-2 50H82c8-30 12-58 20-84z" fill={ORANGE} {...line} />
        <path d="M118 138c-7 12-7 28-2 44M138 134c7 16 9 32 6 50" fill="none" stroke={ORANGE_DARK} strokeWidth="3" strokeLinecap="round" />

        {/* arms */}
        <path d="M88 134C62 156 54 184 60 208" fill="none" stroke={INK} strokeWidth="22" strokeLinecap="round" />
        <path d="M88 134C62 156 54 184 60 208" fill="none" stroke={SKIN} strokeWidth="16" strokeLinecap="round" />
        <path d="M154 136C178 156 186 184 180 208" fill="none" stroke={INK} strokeWidth="22" strokeLinecap="round" />
        <path d="M154 136C178 156 186 184 180 208" fill="none" stroke={ORANGE} strokeWidth="16" strokeLinecap="round" />

        {/* lap and crossed legs */}
        <path d="M22 218c0-32 44-44 98-44s98 12 98 44c0 22-44 32-98 32S22 240 22 218z" fill={ORANGE} {...line} />
        <path d="M62 218c36 14 80 14 116 0M98 184c-6 14-4 28 4 38M142 184c6 14 4 28-4 38" fill="none" stroke={ORANGE_DARK} strokeWidth="3" strokeLinecap="round" />

        {/* hands */}
        <circle cx="60" cy="210" r="10" fill={SKIN} {...line} />
        <circle cx="180" cy="210" r="10" fill={SKIN} {...line} />

        {/* head and face */}
        <circle cx="120" cy="78" r="31" fill={SKIN} {...line} />
        <path d="M106 80q6 6 12 0M122 80q6 6 12 0M106 70q6-3 12 0M122 70q6-3 12 0M110 94q10 8 20 0" fill="none" {...line} />
        <circle cx="100" cy="90" r="4.5" fill="#f4a08a" />
        <circle cx="140" cy="90" r="4.5" fill="#f4a08a" />
      </g>
    </svg>
  );
}

function starPath(s: number): string {
  const k = s * 0.28;
  return `M0 ${-s}L${k} ${-k}L${s} 0L${k} ${k}L0 ${s}L${-k} ${k}L${-s} 0L${-k} ${-k}Z`;
}

// ---------------------------------------------------------------------------------------------
// Incense table: ONE svg for the whole table, so every shape (smoke included) lives inside its
// viewBox and can never be cut off. A wavy line of dashes drifting upward is the smoke.
// ---------------------------------------------------------------------------------------------
const TIP0 = 124; // tip position of a freshly lit stick (leaves room above it for the smoke)
const TIP_END = 324; // tip position when the stick has burned down
const BAMBOO_TOP = 332;
const BAMBOO_END = 420;
const ASH = 14;
const VIEW_H = 468;

function Stick({ incense, x, now, hitW, fresh, selected, onSelect, onHover }: {
  incense: BurningIncense;
  x: number;
  now: number;
  hitW: number;
  fresh: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const remaining = Math.max(0, Math.min(1, (new Date(incense.expires_at).getTime() - now) / BURN_MS));
  const tip = TIP0 + (TIP_END - TIP0) * (1 - remaining);
  const out = Boolean(incense.extinguished_at);
  const blessed = incense.blessing_count > 0 && !out;
  const y0 = tip - ASH - 6; // where the smoke starts
  const body = Math.max(6, BAMBOO_TOP - tip - 2);
  const hitTop = tip - ASH - 70;

  return (
    <g transform={`translate(${x} 0)`}>
      <g className={fresh ? "inc-drop" : undefined}>
        {/* bamboo core and incense body */}
        <rect x="-1.9" y={BAMBOO_TOP - 4} width="3.8" height={BAMBOO_END - BAMBOO_TOP + 4} fill="#f0cf7a" stroke={INK} strokeWidth="2" />
        <rect x="-4" y={tip + 3} width="8" height={body} rx="2" fill="#b5532b" stroke={INK} strokeWidth="2.4" />
        <rect x="-2.2" y={tip + 10} width="1.8" height={Math.max(0, body - 14)} rx="0.9" fill="#d8764a" />

        {/* ash */}
        <rect x="-3.8" y={tip - ASH} width="7.6" height={ASH + 3} rx="2.8" fill={PAPER} stroke={INK} strokeWidth="2" />

        {out ? (
          // Put out: a cold grey tip, no smoke.
          <circle cx="0" cy={tip + 2} r="5" fill="#8d867c" stroke={INK} strokeWidth="2" />
        ) : (
          <>
            <g className={fresh ? "inc-flare" : undefined}>
              <circle className="inc-ember" cx="0" cy={tip + 2} r="5.4" fill="#ff6a3d" stroke={INK} strokeWidth="2" />
              <circle cx="0" cy={tip + 1.2} r="2" fill="#ffd166" />
            </g>
            <g className="inc-smoke" fill="none" strokeLinecap="round">
              <path d={`M0 ${y0} Q8 ${y0 - 10} 0 ${y0 - 20} T0 ${y0 - 40} T0 ${y0 - 60} T0 ${y0 - 80}`} stroke="#a9a39a" strokeWidth="3" />
              <path className="inc-short" d={`M0 ${y0 - 4} Q-7 ${y0 - 13} 0 ${y0 - 22} T0 ${y0 - 40}`} stroke="#cfcac2" strokeWidth="2.5" />
            </g>
          </>
        )}

        {selected && <circle className="inc-ring" cx="0" cy={tip + 2} r="13" fill="none" stroke={out ? "#8d867c" : GOLD} strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round" />}

        {blessed && (
          <>
            <g transform={`translate(-15 ${tip - 8})`}><path className="inc-star" d={starPath(4.2)} fill={GOLD} /></g>
            <g transform={`translate(15 ${tip - 16})`}><path className="inc-star" style={{ animationDelay: ".5s" }} d={starPath(3.4)} fill={GOLD} /></g>
            <g transform={`translate(11 ${tip + 12})`}><path className="inc-star" style={{ animationDelay: "1s" }} d={starPath(2.8)} fill={GOLD} /></g>
          </>
        )}
      </g>

      <rect
        className="inc-hit"
        x={-hitW / 2}
        y={hitTop}
        width={hitW}
        height={BAMBOO_END + 30 - hitTop}
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
  );
}

function IncenseTable({ items, now, freshIds, shownId, onSelect, onHover }: {
  items: BurningIncense[];
  now: number;
  freshIds: ReadonlySet<string>;
  shownId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const n = items.length;
  const spacing = n <= 3 ? 92 : n <= 6 ? 72 : 56;
  const trayW = Math.max(300, (Math.max(n, 1) - 1) * spacing + 160);
  const vbW = trayW + 24;
  const cx = vbW / 2;
  const L = 12;
  const R = vbW - 12;
  const viewBox = n === 0 ? `0 360 ${vbW} ${VIEW_H - 360}` : `0 0 ${vbW} ${VIEW_H}`;
  const hitW = Math.min(64, spacing - 4);

  return (
    <div className="overflow-x-auto" aria-label={`${n} nén nhang`}>
      <svg
        viewBox={viewBox}
        className="mx-auto block h-auto overflow-visible"
        style={{ width: vbW, maxWidth: "100%", minWidth: Math.round(vbW * 0.6) }}
        role="group"
        aria-label="Khay nhang với các nén nhang đang cháy"
      >
        {/* ash bed the sticks stand in */}
        <rect x={L + 14} y="386" width={R - L - 28} height="18" rx="9" fill={PAPER} stroke={INK} strokeWidth="3" />

        {items.map((item, i) => (
          <Stick
            key={item.id}
            incense={item}
            x={cx + (i - (n - 1) / 2) * spacing}
            now={now}
            hitW={hitW}
            fresh={freshIds.has(item.id)}
            selected={item.id === shownId}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}

        {/* tray: feet, body, gold rim (drawn last so it hides the stick bases) */}
        <rect x={L + 30} y="440" width="44" height="18" rx="6" fill={INK} />
        <rect x={R - 74} y="440" width="44" height="18" rx="6" fill={INK} />
        <path d={`M${L} 402H${R}V430Q${R} 446 ${R - 18} 446H${L + 18}Q${L} 446 ${L} 430Z`} fill="#8a5a34" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        <rect x={L + 16} y="424" width={R - L - 32} height="4" rx="2" fill="#6e4527" />
        <rect x={L} y="396" width={R - L} height="14" rx="7" fill={GOLD} stroke={INK} strokeWidth="3.5" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Details of the stick being hovered / tapped
// ---------------------------------------------------------------------------------------------
function Plaque({ incense, now, canBless, canExtinguish, locked, busyKind, onBless, onExtinguish, onRelight }: {
  incense: BurningIncense | null;
  now: number;
  canBless: boolean;
  canExtinguish: boolean;
  locked: boolean; // some action is running, so every button waits
  busyKind: ActionKind | null; // the action running on this stick
  onBless: (id: string) => void;
  onExtinguish: (item: BurningIncense) => void;
  onRelight: (item: BurningIncense) => void;
}) {
  if (!incense) {
    return <div className="flex min-h-[132px] items-center justify-center px-6 text-center text-sm text-neutral-500">Chạm vào một nén nhang để đọc lời khẩn cầu.</div>;
  }
  const out = Boolean(incense.extinguished_at);
  const left = Math.max(0, new Date(incense.expires_at).getTime() - now);
  const minutes = Math.ceil(left / 60000);
  const pct = Math.max(0, Math.min(100, (left / BURN_MS) * 100));
  return (
    <div className="fade-up flex min-h-[132px] flex-col items-center justify-center px-5 py-2 text-center">
      <p className="text-base font-extrabold text-[#231c18]">{nfc(incense.donor_name)}</p>
      <p className="mt-1 max-w-md text-[15px] leading-6 text-neutral-600">“{nfc(incense.message_text)}”</p>

      {out ? (
        <>
          <p className="mt-3 text-sm text-neutral-600">
            Nhang đã bị dập tắt bởi <span className="font-bold text-[#231c18]">{nfc(incense.extinguished_by_name ?? "một người")}</span>
          </p>
          {incense.is_mine ? (
            <button type="button" disabled={locked} onClick={() => onRelight(incense)} className="btn-cartoon mt-3">
              {busyKind === "relight" ? "Đang thắp lại…" : "Thắp lại nhang"}
            </button>
          ) : (
            <p className="mt-1.5 text-xs text-neutral-500">Chỉ người thắp nhang mới có thể thắp lại.</p>
          )}
        </>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2.5">
            <div className={`h-3 w-36 overflow-hidden rounded-full border-2 ${inkBorder} bg-white`} aria-hidden>
              <div className="h-full bg-[#f08a24] transition-[width] duration-1000" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-neutral-500">Còn {Math.floor(minutes / 60)} giờ {minutes % 60} phút</span>
          </div>
          {incense.blessing_count > 0 && (
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-neutral-500">
              <Heart className="h-4 w-4" /> {incense.blessing_count} lượt ban phước
            </p>
          )}
          {(canBless || (canExtinguish && !incense.is_mine)) && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {canBless && (
                <button type="button" disabled={locked} onClick={() => onBless(incense.id)} className="btn-ghost">
                  <Heart className="h-4 w-4" /> {busyKind === "bless" ? "Đang ban phước…" : "Ban phước"}
                </button>
              )}
              {canExtinguish && !incense.is_mine && (
                <button type="button" disabled={locked} onClick={() => onExtinguish(incense)} className="btn-ghost">
                  {busyKind === "extinguish" ? "Đang dập…" : `Dập nhang của ${nfc(incense.donor_name)}`}
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
      className="mb-btn mx-auto block w-[150px] rounded-2xl text-center transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#f6c23e]/60"
    >
      <svg viewBox="0 0 200 150" className="block h-auto w-full" aria-hidden>
        <ellipse cx="100" cy="140" rx="70" ry="6" fill="#e8e5df" />
        <rect x="46" y="128" width="26" height="12" rx="4" fill={INK} />
        <rect x="128" y="128" width="26" height="12" rx="4" fill={INK} />
        {/* the coin falls into the slot on hover; it is drawn behind the lid, so it disappears into it */}
        <circle className="mb-coin" cx="100" cy="16" r="8" fill={GOLD} stroke={INK} strokeWidth="2.5" />
        <rect x="34" y="56" width="132" height="76" rx="10" fill="#e8432e" stroke={INK} strokeWidth="3.5" />
        <rect x="26" y="36" width="148" height="28" rx="9" fill="#c93a26" stroke={INK} strokeWidth="3.5" />
        <rect x="76" y="46" width="48" height="8" rx="4" fill={INK} />
        <rect x="34" y="66" width="132" height="8" fill={GOLD} stroke={INK} strokeWidth="2.5" />
        <rect x="56" y="84" width="88" height="38" rx="8" fill="#fde9a8" stroke={INK} strokeWidth="3" />
        <text x="100" y="109" textAnchor="middle" fontSize="16" fontWeight="800" fill={INK} style={{ fontFamily: "inherit" }}>Công đức</text>
      </svg>
      <span className="mt-1 block text-xs font-bold text-neutral-500">Hòm công đức</span>
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
      className="dialog-fade fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="merit-title" className={`dialog-pop relative w-full max-w-sm rounded-t-3xl border-[2.5px] ${inkBorder} bg-white p-6 pb-8 text-center sm:rounded-3xl sm:pb-6 sm:shadow-[0_6px_0_#231c18]`}>
        <button type="button" onClick={onClose} aria-label="Đóng" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-xl text-neutral-500 transition hover:bg-[#fde9a8] hover:text-[#231c18]">
          ×
        </button>
        <h2 id="merit-title" className="text-xl font-extrabold tracking-tight text-[#231c18]">Hòm công đức</h2>
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
                className={`mx-auto h-64 w-64 rounded-2xl border-[2.5px] ${inkBorder} bg-white object-contain p-3`}
              />
              {state.qr.title && <p className="mt-3 text-sm font-bold text-[#231c18]">{nfc(state.qr.title)}</p>}
              {state.qr.note && <p className="mt-1 whitespace-pre-line text-sm text-neutral-500">{nfc(state.qr.note)}</p>}
            </>
          )}
          {state.status === "empty" && <p className="px-4 py-10 text-sm text-neutral-500">Hiện chưa có mã QR công đức.</p>}
          {state.status === "error" && (
            <div>
              <p role="alert" className="rounded-xl border-2 border-[#e8432e] bg-white px-3 py-2 text-sm font-medium text-[#e8432e]">Chưa tải được mã QR. Vui lòng thử lại.</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="btn-ghost mt-3">Thử lại</button>
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
        className={`dialog-pop relative w-full max-w-md rounded-t-3xl border-[2.5px] ${inkBorder} bg-white p-6 pb-8 sm:rounded-3xl sm:pb-6 sm:shadow-[0_6px_0_#231c18]`}
      >
        <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-xl text-neutral-500 transition hover:bg-[#fde9a8] hover:text-[#231c18]">
          ×
        </button>
        <h2 id="light-title" className="text-xl font-extrabold tracking-tight text-[#231c18]">Thắp một nén nhang</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Người cúng: <span className="font-bold text-[#231c18]">{donorName}</span> · cháy trong 4 giờ
        </p>

        <label htmlFor="prayer" className="mt-5 block text-sm font-bold text-[#231c18]">Lời khẩn cầu</label>
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
          className={`mt-1.5 w-full resize-none rounded-xl border-2 ${inkBorder} px-3.5 py-3 text-[15px] leading-6 outline-none transition placeholder:text-neutral-400 focus:ring-4 focus:ring-[#f6c23e]/60`}
        />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => addSuggestion(s)} className={`rounded-full border-2 ${inkBorder} bg-white px-2.5 py-1 text-xs font-medium text-[#231c18] transition hover:bg-[#fde9a8]`}>
                {s}
              </button>
            ))}
          </div>
          <span className="shrink-0 pt-1 text-xs tabular-nums text-neutral-400">{prayer.length}/240</span>
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl border-2 border-[#e8432e] bg-white px-3 py-2 text-sm font-medium text-[#e8432e]">{error}</p>}

        <button type="submit" disabled={busy || trimmed.length < 2} className="btn-cartoon mt-5 w-full">
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
  const closeMerit = useCallback(() => setMeritOpen(false), []);
  const selectStick = useCallback((id: string) => setSelectedId((current) => (current === id ? null : id)), []);

  /** Runs one action on a stick (bless / put out / relight), then reloads the table and shows a toast. */
  async function runAction(id: string, kind: ActionKind, work: () => Promise<void>, okText: string, errText: string) {
    if (actionBusy) return;
    setActionBusy({ id, kind });
    try {
      await work();
      try {
        await refresh();
      } catch {
        // the next poll will catch up
      }
      setToast({ kind: "success", text: okText });
    } catch (err) {
      console.error(err);
      setToast({ kind: "error", text: actionErrorText(err, errText) });
      await refresh().catch(() => undefined);
    } finally {
      setActionBusy(null);
    }
  }

  function giveBlessing(offeringId: string) {
    if (!canBless) return;
    void runAction(offeringId, "bless", () => blessIncense(offeringId), "Đã ban phước cho nén nhang này.", "Chưa ban phước được. Vui lòng thử lại sau.");
  }

  function putOut(item: BurningIncense) {
    if (!user || item.is_mine) return;
    void runAction(item.id, "extinguish", () => extinguishIncense(item.id), `Đã dập nén nhang của ${nfc(item.donor_name)}.`, "Chưa dập được nhang. Vui lòng thử lại sau.");
  }

  function relight(item: BurningIncense) {
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
    if (loading || authLoading) return <button type="button" disabled className="btn-cartoon">Đang kiểm tra…</button>;
    if (!user) return <Link href="/login/?next=%2Fincense%2F" className="btn-cartoon">Đăng nhập để cúng dường</Link>;
    if (!canDonate) return <p role="status" className={note}>Tài khoản này không được phép cúng dường.</p>;
    if (acceptingIncense === false) return <p role="status" className={note}>Hiện đang tạm ngưng nhận cúng dường.</p>;
    return (
      <button type="button" disabled={nameLoading || !donorName} onClick={() => { setDialogError(null); setDialogOpen(true); }} className="btn-cartoon">
        Thắp nhang cúng dường
      </button>
    );
  })();

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-4 sm:pt-8">
      <section aria-label="Bàn hương cúng dường">
        {/* Hidden from view, kept for screen readers. */}
        <header className="sr-only">
          <h1>Cúng dường</h1>
          <p aria-live="polite">
            {loading ? "Đang tải…" : active.length === 0 ? "Chưa có nén nhang nào đang cháy" : `${litCount} nén nhang đang cháy${active.length > litCount ? ` · ${active.length - litCount} đã tắt` : ""}`}
          </p>
        </header>

        <div className="mx-auto h-52 w-[min(62vw,14rem)] sm:h-64 sm:w-[17rem]">
          <Monk />
        </div>

        <p key={message} className="fade-up mx-auto mt-3 min-h-[4.5rem] max-w-md px-2 text-center text-[15px] leading-6 text-[#231c18]" role="status" aria-live="polite">
          {npcMessage && <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#c8650f]">Thích Khoai Tây</span>}
          {nfc(message)}
        </p>

        {loadError && <p role="alert" className="mx-auto mt-4 max-w-md rounded-xl border-2 border-[#e8432e] bg-white px-3 py-2 text-center text-sm font-medium text-[#e8432e]">{loadError}</p>}

        {loading ? (
          <div className="mx-auto mt-8 h-48 w-full max-w-md animate-pulse rounded-3xl bg-neutral-100" aria-busy="true" />
        ) : (
          <div className="mt-2">
            <IncenseTable items={active} now={now} freshIds={freshIds} shownId={shownId} onSelect={selectStick} onHover={setHoverId} />
          </div>
        )}

        <div className="mx-auto mt-8 max-w-md">
          {!loading &&
            (active.length === 0 ? (
              <div className="flex min-h-[132px] items-center justify-center px-6 text-center text-sm text-neutral-500">Hãy là người thắp nén nhang đầu tiên.</div>
            ) : (
              <Plaque
                key={shown?.id ?? "none"}
                incense={shown}
                now={now}
                canBless={canBless}
                canExtinguish={Boolean(user)}
                locked={actionBusy !== null}
                busyKind={actionBusy && actionBusy.id === shown?.id ? actionBusy.kind : null}
                onBless={giveBlessing}
                onExtinguish={putOut}
                onRelight={relight}
              />
            ))}
        </div>

        <div className="mt-8">
          <MeritBoxButton onClick={() => setMeritOpen(true)} />
        </div>

        <div className="mt-6 flex flex-col items-center gap-2.5">
          {cta}
          <p className="text-xs text-neutral-400">Mỗi nén nhang cháy trong 4 giờ.</p>
        </div>
      </section>

      {toast && (
        <div
          role={toast.kind === "error" ? "alert" : "status"}
          className={`toast-in fixed bottom-6 left-1/2 z-40 w-[min(92%,24rem)] -translate-x-1/2 rounded-full px-5 py-3 text-center text-sm font-medium text-white ${toast.kind === "error" ? "bg-[#e8432e]" : "bg-[#231c18]"}`}
        >
          {toast.text}
        </div>
      )}

      <MeritBoxDialog open={meritOpen} onClose={closeMerit} />
      <LightDialog open={dialogOpen} donorName={donorName} busy={busy} error={dialogError} onClose={closeDialog} onSubmit={lightOne} />
    </div>
  );
}
