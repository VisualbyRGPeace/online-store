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

const BURN_MS = 4 * 60 * 60 * 1000;
const RELIGHT_WINDOW_MS = 60 * 60 * 1000;

/** A ballot record displayed on the page. The extra fields come from the service. */
type Incense = BurningIncense & {
  is_mine?: boolean; // the signed-in user is the one who lit this stick
  extinguished_at?: string | null; // set while the stick is put out
  extinguished_by_name?: string | null; // who put it out
};
type ActionKind = "bless" | "extinguish" | "relight";

const buttonDark =
  "inline-flex items-center justify-center rounded-full bg-black px-7 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50";

// ---------------------------------------------------------------------------------------------
// Vietnamese text helper
// ---------------------------------------------------------------------------------------------
/** Vietnamese text from the database may be decomposed (base letter + combining mark); NFC joins them. */
const nfc = (text: string) => text.normalize("NFC");

// ---------------------------------------------------------------------------------------------
// Ballot display: paper ballots shown on a presentation tray
// ---------------------------------------------------------------------------------------------
function Stick({ ballot, index, x, remaining, fresh, selected, onSelect, onHover }: {
  incense: Incense;
  index: number;
  x: number;
  remaining: number;
  fresh: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const withdrawn = Boolean(incense.extinguished_at);
  const slide = Math.round((1 - remaining) * 34);
  return (
    <g transform={`translate(${x} 0)`} className={selected ? "inc-sel" : undefined}>
      <g className={fresh ? "inc-drop" : undefined} transform={`translate(0 ${slide})`}>
        <ellipse cx="0" cy="532" rx="56" ry="8" fill="#000" opacity=".12" />
        <rect x="-58" y="308" width="116" height="178" rx="5" fill={withdrawn ? "#e5e7eb" : "#fffdf7"} stroke={withdrawn ? "#9ca3af" : "#1e3a8a"} strokeWidth="4" />
        <path d="M-53 313 H53 V343 H-53Z" fill={withdrawn ? "#6b7280" : "#b91c1c"} />
        <text x="0" y="334" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" style={{ fontFamily: "inherit", letterSpacing: "1px" }}>UNITED STATES</text>
        <text x="0" y="370" textAnchor="middle" fontSize="13" fontWeight="800" fill="#1e3a8a" style={{ fontFamily: "inherit", letterSpacing: "1px" }}>BALLOT</text>
        <text x="0" y="392" textAnchor="middle" fontSize="10" fontWeight="700" fill="#374151" style={{ fontFamily: "inherit" }}>PRESIDENT</text>
        <path d="M-37 409 H37 M-37 424 H37 M-37 439 H23" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
        <rect x="-35" y="452" width="13" height="13" rx="2" fill="none" stroke="#1e3a8a" strokeWidth="2" />
        <path d="M-33 458 l4 4 8-10" fill="none" stroke={withdrawn ? "#9ca3af" : "#b91c1c"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <text x="-13" y="463" textAnchor="start" fontSize="9" fontWeight="700" fill="#374151" style={{ fontFamily: "inherit" }}>YOUR CHOICE</text>
        <path d="M-43 478 H43" stroke="#d1d5db" strokeWidth="1.5" />
        <rect
          className="inc-hit"
          x="-70"
          y="288"
          width="140"
          height="218"
          tabIndex={0}
          role="button"
          aria-pressed={selected}
          aria-label={`Phiếu bầu của ${nfc(incense.donor_name)}${withdrawn ? `, đã được rút khỏi hòm bởi ${nfc(incense.extinguished_by_name ?? "một người")}` : ""}. Lựa chọn: ${nfc(incense.message_text)}`}
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
  const displayW = Math.round(vbW * 0.62);
  const viewBox = n === 0 ? `0 330 ${vbW} 390` : `0 -190 ${vbW} 890`;

  return (
    <div className="overflow-hidden" aria-label={`${n} phiếu bầu`}>
      <svg viewBox={viewBox} className="mx-auto block h-auto overflow-visible" style={{ width: "100%", maxWidth: `${displayW}px` }} role="group" aria-label="Khu vực trưng bày phiếu bầu">
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
              x={cx + (i - (n - 1) / 2) * spacing}
              remaining={remaining}
              fresh={freshIds.has(item.id)}
              selected={item.id === shownId}
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
// Details of the ballot being hovered / tapped
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
        Chọn một lá phiếu để xem chi tiết.
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
            Đã được rút khỏi hòm bởi <span className="font-semibold text-neutral-900">{nfc(incense.extinguished_by_name ?? "một người")}</span>
          </p>
          {incense.is_mine && (
            <button type="button" disabled={locked} onClick={() => onRelight(incense)} className={`mt-3 ${dark}`}>
              {busyKind === "relight" ? "Đang khôi phục…" : "Khôi phục phiếu"}
            </button>
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
                  {busyKind === "bless" ? "Đang ghi nhận ủng hộ…" : "✦ Ủng hộ"}
                </button>
              )}
              {canExtinguish && !incense.is_mine && (
                <button type="button" disabled={locked} onClick={() => onExtinguish(incense)} className={outline}>
                  {busyKind === "extinguish" ? "Đang rút phiếu…" : "Rút phiếu"}
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
// Ballot box: opens the ballot form
// ---------------------------------------------------------------------------------------------
function BallotBoxButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Mở hòm bỏ phiếu"
      className="mb-btn mx-auto block w-[170px] rounded-2xl text-center transition-transform duration-300 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700/40"
    >
      <svg viewBox="0 0 200 150" className="block h-auto w-full" aria-hidden>
        <defs>
          <linearGradient id="mbLacquer" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2563eb" /><stop offset=".2" stopColor="#1d4ed8" /><stop offset=".75" stopColor="#1e3a8a" /><stop offset="1" stopColor="#172554" />
          </linearGradient>
          <linearGradient id="mbGoldH" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#bfdbfe" /><stop offset=".5" stopColor="#fff" /><stop offset="1" stopColor="#93c5fd" />
          </linearGradient>
          <filter id="mbSoft" x="-10%" y="-400%" width="120%" height="900%"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>
        <ellipse cx="100" cy="138" rx="70" ry="7" fill="#000" opacity=".2" filter="url(#mbSoft)" />
        <ellipse cx="54" cy="133" rx="10" ry="4" fill="#1e3a8a" />
        <ellipse cx="146" cy="133" rx="10" ry="4" fill="#1e3a8a" />
        <rect className="mb-coin" x="91" y="12" width="18" height="26" rx="2" fill="#fffdf7" stroke="#1e3a8a" strokeWidth="2" transform="rotate(-8 100 25)" />
        <rect x="34" y="52" width="132" height="80" rx="10" fill="url(#mbLacquer)" />
        <rect x="28" y="38" width="144" height="24" rx="5" fill="#1e3a8a" />
        <rect x="31" y="40" width="138" height="8" rx="3" fill="#2563eb" />
        <rect x="30" y="59" width="140" height="4" rx="2" fill="#b91c1c" />
        <rect x="76" y="43" width="48" height="5" rx="2.5" fill="#111827" stroke="#fff" strokeWidth="1" />
        <rect x="58" y="76" width="84" height="36" rx="7" fill="#172554" stroke="#bfdbfe" strokeWidth="1.6" />
        <text x="100" y="99" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" style={{ fontFamily: "inherit", letterSpacing: "1px" }}>BỎ PHIẾU</text>
      </svg>
      <span className="mt-1 block text-xs font-medium text-neutral-500">Hòm bỏ phiếu</span>
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// Dialog: write a ballot and cast it
// ---------------------------------------------------------------------------------------------
function BallotDialog({ open, donorName, busy, error, onClose, onSubmit }: {
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
        <h2 id="light-title" className="text-xl font-semibold tracking-wide">Gửi phiếu bầu</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Cử tri: <span className="font-medium text-neutral-900">{donorName}</span>
        </p>

        <label htmlFor="prayer" className="mt-5 block text-sm font-medium text-neutral-700">Tên ứng viên hoặc lựa chọn của bạn</label>
        <textarea
          id="prayer"
          ref={areaRef}
          required
          minLength={2}
          maxLength={240}
          rows={4}
          value={prayer}
          onChange={(e) => setPrayer(e.target.value)}
          placeholder="Nhập tên ứng viên bạn muốn bầu…"
          className="mt-1.5 w-full resize-none rounded-xl border border-neutral-300 px-3.5 py-3 text-[15px] leading-6 outline-none transition placeholder:text-neutral-400 focus:border-black focus:ring-4 focus:ring-black/10"
        />
        <div className="mt-1.5 text-right text-xs tabular-nums text-neutral-400">{prayer.length}/240</div>

        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={busy || trimmed.length < 2} className={`${buttonDark} mt-5 w-full`}>
          {busy ? "Đang gửi…" : "Gửi phiếu bầu"}
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
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const knownIds = useRef<Set<string> | null>(null);

  // Every list update goes through here so newly arrived ballots get their entrance animation.
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
      else problem = "Không tải được danh sách phiếu. Vui lòng thử lại.";
      if (availabilityResult.status === "fulfilled") setAcceptingIncense(availabilityResult.value);
      else {
        setAcceptingIncense(false);
        problem ??= "Chưa kiểm tra được trạng thái nhận bỏ phiếu.";
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

  /** Runs one action on a ballot (bless / put out / relight), then reloads the table and shows a toast. */
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
    void runAction(offeringId, "bless", () => blessIncense(offeringId), "Đã ghi nhận ủng hộ.", "Chưa ghi nhận ủng hộ được. Vui lòng thử lại sau.");
  }

  function putOut(item: Incense) {
    if (!user || item.is_mine) return;
    void runAction(item.id, "extinguish", () => extinguishIncense(item.id), `Đã rút phiếu của ${nfc(item.donor_name)}.`, "Chưa rút phiếu được. Vui lòng thử lại.");
  }

  function relight(item: Incense) {
    if (!item.is_mine) return;
    void runAction(item.id, "relight", () => relightIncense(item.id), "Đã khôi phục phiếu.", "Chưa khôi phục được phiếu. Vui lòng thử lại sau.");
  }

  async function lightOne(prayer: string): Promise<boolean> {
    setDialogError(null);
    if (!user) { setDialogError("Vui lòng đăng nhập để bỏ phiếu."); return false; }
    if (!canDonate) { setDialogError("Tài khoản này không được phép bỏ phiếu."); return false; }
    if (acceptingIncense !== true) { setDialogError("Hiện đang tạm ngưng nhận phiếu bầu."); return false; }
    setBusy(true);
    try {
      const offeringId = await lightIncense(prayer);
      try {
        await refresh();
      } catch {
        // the next refresh will show the new ballot
      }
      setSelectedId(offeringId);
      setDialogOpen(false);
      setToast({ kind: "success", text: "Đã gửi phiếu bầu." });
      return true;
    } catch (err) {
      const message = (err as { message?: string } | null)?.message ?? "";
      if (message.includes("incense_closed")) {
        setAcceptingIncense(false);
        setDialogError("Hiện đang tạm ngưng nhận phiếu bầu.");
      } else if (message.includes("incense_donation_not_allowed")) {
        setCanDonate(false);
        setDialogError("Tài khoản này không được phép bỏ phiếu.");
      } else if (message.includes("invalid_prayer")) {
        setDialogError("Phiếu bầu cần từ 2 đến 240 ký tự.");
      } else if (message.includes("npc_message_unavailable")) {
        setDialogError("Hiện chưa có thông điệp hiển thị. Vui lòng quay lại sau.");
      } else {
        setDialogError("Chưa gửi được phiếu bầu. Vui lòng thử lại.");
      }
      await refresh().catch(() => undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const active = useMemo(() => incense.filter((item) => {
    const notExpired = new Date(item.expires_at).getTime() > now;
    const relightOpen = !item.extinguished_at || new Date(item.extinguished_at).getTime() + RELIGHT_WINDOW_MS > now;
    return notExpired && relightOpen;
  }), [incense, now]);
  const litCount = active.filter((item) => !item.extinguished_at).length;
  const shownId = hoverId ?? selectedId;
  const shown = active.find((item) => item.id === shownId) ?? null;
  
  const cta = (() => {
    const note = "text-sm text-neutral-500";
    if (loading || authLoading) return <button type="button" disabled className={buttonDark}>Đang kiểm tra…</button>;
    if (!user) return <Link href="/login/?next=%2Fincense%2F" className={buttonDark}>Đăng nhập để bỏ phiếu</Link>;
    if (!canDonate) return <p role="status" className={note}>Tài khoản này không được phép bỏ phiếu.</p>;
    if (acceptingIncense === false) return <p role="status" className={note}>Hiện đang tạm ngưng nhận phiếu bầu.</p>;
    return (
      <button type="button" disabled={nameLoading || !donorName} onClick={() => { setDialogError(null); setDialogOpen(true); }} className={buttonDark}>
        Bỏ phiếu
      </button>
    );
  })();

  return (
    <div className="mx-auto max-w-3xl">
      <section className="px-4 pb-10 pt-10 sm:px-10" aria-label="Trang bỏ phiếu">
        <header className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-blue-950 sm:text-4xl">
            Ai sẽ là tổng thống tiếp theo của nước Mỹ nào?
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-600 sm:text-base">Gửi lá phiếu của bạn vào hòm bỏ phiếu.</p>
        </header>

        <div className="mx-auto mt-8 grid h-36 w-36 place-items-center rounded-full bg-blue-50 ring-1 ring-blue-100 sm:h-44 sm:w-44" aria-hidden="true">
          <svg viewBox="0 0 120 120" className="h-28 w-28 sm:h-32 sm:w-32">
            <path d="M22 100h76M30 91h60M36 84h48V52H36zM29 52l31-22 31 22z" fill="#fff" stroke="#1e3a8a" strokeWidth="3" strokeLinejoin="round" />
            <path d="M43 84V62m11 22V62m12 22V62m11 22V62" stroke="#1e3a8a" strokeWidth="3" />
            <path d="M60 30V18" stroke="#1e3a8a" strokeWidth="2" />
            <path d="M60 18h23v14H60z" fill="#b91c1c" />
            <path d="M60 18h12v14H60z" fill="#fff" />
            <path d="M72 18h11v14H72z" fill="#1d4ed8" />
            <circle cx="60" cy="47" r="4" fill="#b91c1c" />
          </svg>
        </div>

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
                Hãy gửi lá phiếu đầu tiên.
              </div>
            ) : (
              <Plaque key={shown?.id ?? "none"} incense={shown} now={now} canBless={canBless} canExtinguish={Boolean(user)} locked={actionBusy !== null} busyKind={actionBusy && actionBusy.id === shown?.id ? actionBusy.kind : null} onBless={giveBlessing} onExtinguish={putOut} onRelight={relight} />
            ))}
        </div>

        <div className="mt-8">
          <BallotBoxButton onClick={() => { setDialogError(null); setDialogOpen(true); }} />
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
          {cta}
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

      <BallotDialog open={dialogOpen} donorName={donorName} busy={busy} error={dialogError} onClose={closeDialog} onSubmit={lightOne} />
    </div>
  );
}
