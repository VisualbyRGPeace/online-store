"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";

type Mode = "move" | "start" | "end";

type Props = {
  videoDuration: number;
  start: number;
  seconds: number;
  onChange: (next: { start: number; seconds: number }) => void;
  filmstrip?: string;
  minSeconds?: number;
  maxSeconds?: number;
  onScrub?: (time: number) => void;
  /** Vị trí đang phát thử (giây). Bỏ trống để ẩn vạch phát. */
  playhead?: number;
  /** Nội dung đặt ở bên trái hàng điều khiển dưới timeline (ví dụ nút xem thử). */
  footer?: ReactNode;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** m:ss.d, ví dụ 0:09.8 */
const formatPrecise = (s: number) => {
  const safe = Math.max(0, s);
  const m = Math.floor(safe / 60);
  const r = safe - m * 60;
  return `${m}:${r < 10 ? "0" : ""}${r.toFixed(1)}`;
};

/** m:ss, ví dụ 2:00 */
const formatClock = (s: number) => {
  const total = Math.round(Math.max(0, s));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const TIP_EDGE = 16; // nhãn được phép lấn ra lề hai bên bằng chừng này (px)

export default function TimelineTrimmer({
  videoDuration,
  start,
  seconds,
  onChange,
  filmstrip,
  minSeconds = 3,
  maxSeconds = 6,
  onScrub,
  playhead,
  footer,
}: Props) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: Mode;
    x: number;
    start: number;
    seconds: number;
    width: number;
  } | null>(null);

  const duration = Math.max(0, Number.isFinite(videoDuration) ? videoDuration : 0);
  const total = Math.max(duration, 0.001);
  const minLength = Math.min(Math.max(0, minSeconds), duration);
  const maxLength = Math.min(Math.max(minLength, maxSeconds), duration);
  const safeSeconds = clamp(Number.isFinite(seconds) ? seconds : minLength, minLength, maxLength);
  const safeStart = clamp(Number.isFinite(start) ? start : 0, 0, Math.max(0, duration - safeSeconds));
  const safeEnd = safeStart + safeSeconds;

  // Zero duration luôn ra 0% (không bao giờ NaN).
  const leftPct = duration ? clamp((safeStart / total) * 100, 0, 100) : 0;
  const widthPct = duration ? clamp((safeSeconds / total) * 100, 0, 100) : 0;
  const centerPct = clamp(leftPct + widthPct / 2, 0, 100);

  // Đặt nhãn thời gian: luôn nằm trong khung, mũi nhọn vẫn chỉ đúng giữa đoạn chọn.
  // Chỉnh trực tiếp style (không qua state) để nhãn bám theo ngón tay không bị trễ.
  const placeTip = useCallback(() => {
    const track = timelineRef.current;
    const tip = tipRef.current;
    if (!track || !tip) return;
    const trackWidth = track.clientWidth;
    const tipWidth = tip.offsetWidth;
    const center = (centerPct / 100) * trackWidth;
    const left = clamp(center, tipWidth / 2 - TIP_EDGE, trackWidth - tipWidth / 2 + TIP_EDGE);
    tip.style.left = `${left}px`;
    tip.style.setProperty("--ax", `${clamp(center - (left - tipWidth / 2), 12, Math.max(12, tipWidth - 12))}px`);
  }, [centerPct]);

  useLayoutEffect(() => {
    placeTip();
  });

  useEffect(() => {
    const track = timelineRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => placeTip());
    observer.observe(track);
    return () => observer.disconnect();
  }, [placeTip]);

  const beginTimeline = (event: ReactPointerEvent, mode: Mode) => {
    event.preventDefault();
    if (!duration) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = timelineRef.current?.getBoundingClientRect();
    dragRef.current = {
      mode,
      x: event.clientX,
      start: safeStart,
      seconds: safeSeconds,
      width: rect?.width || 1,
    };
    if (rect) onScrub?.(clamp(((event.clientX - rect.left) / rect.width) * duration, 0, duration));
  };

  const moveTimeline = (event: ReactPointerEvent) => {
    const d = dragRef.current;
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!d || !rect || !duration) return;

    const delta = ((event.clientX - d.x) / d.width) * duration;
    const end0 = d.start + d.seconds;
    onScrub?.(clamp(((event.clientX - rect.left) / rect.width) * duration, 0, duration));

    if (d.mode === "move") {
      onChange({
        start: round1(clamp(d.start + delta, 0, duration - d.seconds)),
        seconds: d.seconds,
      });
    } else if (d.mode === "start") {
      const lowerBound = Math.max(0, end0 - maxLength);
      const upperBound = Math.max(lowerBound, end0 - minLength);
      const nextStart = round1(clamp(d.start + delta, lowerBound, upperBound));
      onChange({ start: nextStart, seconds: round1(end0 - nextStart) });
    } else {
      const nextEnd = round1(clamp(end0 + delta, d.start + minLength, Math.min(duration, d.start + maxLength)));
      onChange({ start: d.start, seconds: round1(nextEnd - d.start) });
    }
  };

  const endTimeline = () => {
    dragRef.current = null;
  };

  // Bàn phím: ← → chỉnh 0.1 giây, giữ Shift để chỉnh 1 giây.
  const nudge = (event: ReactKeyboardEvent, mode: Mode) => {
    const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!direction || !duration) return;
    event.preventDefault();
    const step = direction * (event.shiftKey ? 1 : 0.1);
    if (mode === "move") {
      onChange({ start: round1(clamp(safeStart + step, 0, duration - safeSeconds)), seconds: safeSeconds });
    } else if (mode === "start") {
      const nextStart = round1(clamp(safeStart + step, Math.max(0, safeEnd - maxLength), safeEnd - minLength));
      onChange({ start: nextStart, seconds: round1(safeEnd - nextStart) });
    } else {
      const nextSeconds = round1(clamp(safeSeconds + step, minLength, Math.min(maxLength, duration - safeStart)));
      onChange({ start: safeStart, seconds: nextSeconds });
    }
  };

  const chooseLength = (next: number) => {
    onChange({ start: clamp(safeStart, 0, Math.max(0, duration - next)), seconds: next });
  };

  const hasChoice = maxLength - minLength > 0.05;
  const isShort = safeSeconds <= minLength + 0.05;
  const isLong = safeSeconds >= maxLength - 0.05;

  const handleClass =
    "absolute top-[34px] z-10 flex h-[60px] w-[14px] cursor-ew-resize touch-none items-center justify-center bg-white shadow-[0_0_0_0.5px_rgba(0,0,0,0.25),0_3px_10px_rgba(0,0,0,0.35)] transition-colors before:absolute before:inset-y-0 before:-inset-x-2.5 before:content-[''] hover:bg-neutral-100 active:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950";

  return (
    <div className="select-none">
      <div
        ref={timelineRef}
        className="relative mx-3.5 h-[122px] touch-none"
        onPointerMove={moveTimeline}
        onPointerUp={endTimeline}
        onPointerCancel={endTimeline}
      >
        {/* Nhãn thời gian: cầm kéo để dời cả đoạn cắt */}
        <div
          ref={tipRef}
          role="slider"
          tabIndex={0}
          aria-label="Kéo để dời đoạn cắt"
          aria-valuemin={0}
          aria-valuemax={round1(Math.max(0, duration - safeSeconds))}
          aria-valuenow={round1(safeStart)}
          aria-valuetext={`${formatPrecise(safeStart)} đến ${formatPrecise(safeEnd)}`}
          onPointerDown={(event) => beginTimeline(event, "move")}
          onKeyDown={(event) => nudge(event, "move")}
          className="absolute top-0 z-20 flex -translate-x-1/2 cursor-grab touch-none items-center gap-1.5 whitespace-nowrap rounded-lg bg-neutral-950 py-1 pl-2 pr-2.5 text-xs font-semibold tabular-nums text-white shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-colors hover:bg-neutral-800 active:cursor-grabbing active:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
        >
          <span aria-hidden="true" className="pointer-events-none grid grid-cols-2 gap-0.5 opacity-70">
            {[0, 1, 2, 3, 4, 5].map((dot) => (
              <i key={dot} className="block h-[3px] w-[3px] rounded-full bg-white" />
            ))}
          </span>
          <span className="pointer-events-none">
            {formatPrecise(safeStart)} <span className="opacity-55">→</span> {formatPrecise(safeEnd)} <span className="opacity-55">·</span> {safeSeconds.toFixed(1)}s
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-1 h-2 w-2 -translate-x-1/2 rotate-45 rounded-[1px] bg-neutral-950"
            style={{ left: "var(--ax, 50%)" }}
          />
        </div>

        {/* Dải ảnh khung hình + vùng được chọn (phần ngoài được phủ tối, cắt theo góc bo của dải ảnh) */}
        <div
          className="absolute inset-x-0 top-[34px] h-[60px] overflow-hidden rounded-xl bg-gradient-to-b from-[#ececea] to-[#dddcd9] shadow-[0_0_0_0.5px_rgba(0,0,0,0.2)]"
          style={{
            backgroundImage: filmstrip ? `url(${filmstrip})` : undefined,
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
          }}
        >
          <div
            className="absolute inset-y-0 box-border cursor-grab border-y-[3px] border-white shadow-[0_0_0_9999px_rgba(12,12,14,0.62)] active:cursor-grabbing"
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            onPointerDown={(event) => beginTimeline(event, "move")}
          />
        </div>

        {playhead !== undefined && duration > 0 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[30px] z-[15] h-[68px] w-0.5 -translate-x-1/2 rounded-[1px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.75),0_0_6px_rgba(0,0,0,0.4)]"
            style={{ left: `${clamp((playhead / total) * 100, 0, 100)}%` }}
          />
        )}

        {/* Hai tay nắm hai đầu đoạn chọn */}
        {(["start", "end"] as const).map((mode) => (
          <div
            key={mode}
            role="slider"
            tabIndex={0}
            aria-label={mode === "start" ? "Điểm bắt đầu" : "Điểm kết thúc"}
            aria-valuemin={0}
            aria-valuemax={round1(duration)}
            aria-valuenow={round1(mode === "start" ? safeStart : safeEnd)}
            aria-valuetext={formatPrecise(mode === "start" ? safeStart : safeEnd)}
            onPointerDown={(event) => beginTimeline(event, mode)}
            onKeyDown={(event) => nudge(event, mode)}
            className={`${handleClass} ${mode === "start" ? "-translate-x-full rounded-l-[9px]" : "rounded-r-[9px]"}`}
            style={{ left: `${mode === "start" ? leftPct : leftPct + widthPct}%` }}
          >
            <span aria-hidden="true" className="pointer-events-none block h-[18px] w-0.5 rounded-sm bg-neutral-400" />
          </div>
        ))}

        {/* Mốc đầu và tổng thời lượng */}
        <div className="pointer-events-none absolute inset-x-0 top-[102px] flex justify-between text-[11px] tabular-nums text-slate-500">
          <span>0:00</span>
          <span>{formatClock(duration)}</span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {footer}
        {hasChoice && (
          <div role="group" aria-label="Độ dài đoạn cắt" className="ml-auto inline-flex rounded-xl bg-slate-100 p-[3px]">
            {(
              [
                [minLength, isShort],
                [maxLength, isLong],
              ] as const
            ).map(([length, active]) => (
              <button
                key={length}
                type="button"
                aria-pressed={active}
                onClick={() => chooseLength(length)}
                className={`h-[30px] rounded-lg px-3.5 text-sm transition ${
                  active ? "bg-white font-semibold text-slate-950 shadow-[0_0_0_0.5px_#d4d4d0]" : "text-slate-600 hover:text-slate-950"
                }`}
              >
                {Math.round(length)}s
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
