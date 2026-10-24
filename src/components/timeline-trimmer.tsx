"use client";

import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

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
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const formatTime = (s: number) => {
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};

export default function TimelineTrimmer({
  videoDuration,
  start,
  seconds,
  onChange,
  filmstrip,
  minSeconds = 3,
  maxSeconds = 6,
  onScrub,
}: Props) {
  const timelineRef = useRef<HTMLDivElement>(null);
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

  // Calculate positions once; zero duration always maps to 0% (never NaN).
  const leftPct = duration ? clamp((safeStart / total) * 100, 0, 100) : 0;
  const widthPct = duration ? clamp((safeSeconds / total) * 100, 0, 100) : 0;
  const rightPct = clamp(100 - leftPct - widthPct, 0, 100);
  const centerPct = clamp(leftPct + widthPct / 2, 0, 100);

  const beginTimeline = (event: ReactPointerEvent, mode: Mode) => {
    event.preventDefault();
    if (!duration) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode,
      x: event.clientX,
      start: safeStart,
      seconds: safeSeconds,
      width: timelineRef.current?.getBoundingClientRect().width || 1,
    };
    const rect = timelineRef.current?.getBoundingClientRect();
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
        start: clamp(d.start + delta, 0, duration - d.seconds),
        seconds: d.seconds,
      });
    } else if (d.mode === "start") {
      const lowerBound = Math.max(0, end0 - maxLength);
      const upperBound = Math.max(lowerBound, end0 - minLength);
      const nextStart = clamp(d.start + delta, lowerBound, upperBound);
      onChange({ start: nextStart, seconds: end0 - nextStart });
    } else {
      const nextEnd = clamp(end0 + delta, d.start + minLength, Math.min(duration, d.start + maxLength));
      onChange({ start: d.start, seconds: nextEnd - d.start });
    }
  };

  const endTimeline = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={timelineRef}
      className="relative h-[180px] w-full touch-none select-none"
      onPointerMove={moveTimeline}
      onPointerUp={endTimeline}
      onPointerCancel={endTimeline}
    >
      <div
        className="absolute inset-x-0 top-9 h-[76px] rounded-[3px] bg-gradient-to-b from-[#ececea] to-[#dddcd9]"
        style={{
          backgroundImage: filmstrip ? `url(${filmstrip})` : undefined,
          backgroundSize: "auto 100%",
          backgroundRepeat: "repeat-x",
        }}
      />

      <div
        className="absolute left-0 top-9 h-[76px] rounded-l-[3px] bg-white/80"
        style={{ width: `${leftPct}%` }}
      />
      <div
        className="absolute right-0 top-9 h-[76px] rounded-r-[3px] bg-white/80"
        style={{ width: `${rightPct}%` }}
      />

      <div
        className="absolute top-9 h-[76px] cursor-grab border-y border-neutral-950 shadow-[0_14px_30px_-14px_rgba(0,0,0,0.35)] active:cursor-grabbing"
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        onPointerDown={(event) => beginTimeline(event, "move")}
      />

      <div
        className="absolute top-2 flex h-7 w-14 -translate-x-1/2 cursor-grab flex-col items-center justify-center gap-1 bg-neutral-950 pt-1 active:cursor-grabbing"
        style={{
          left: `${centerPct}%`,
          clipPath:
            "polygon(0 100%, 9% 38%, 16% 6%, 24% 0, 76% 0, 84% 6%, 91% 38%, 100% 100%)",
        }}
        onPointerDown={(event) => beginTimeline(event, "move")}
      >
        <span className="h-px w-5 bg-white/90" />
        <span className="h-px w-5 bg-white/90" />
      </div>

      {(["start", "end"] as const).map((mode) => {
        const position = mode === "start" ? safeStart : safeStart + safeSeconds;
        const pct = duration ? clamp((position / total) * 100, 0, 100) : 0;

        return (
          <button
            key={mode}
            type="button"
            aria-label={mode === "start" ? "Điểm bắt đầu" : "Điểm kết thúc"}
            onPointerDown={(event) => beginTimeline(event, mode)}
            className="group absolute top-7 z-10 h-[92px] w-9 -translate-x-1/2 cursor-ew-resize touch-none focus-visible:outline-none"
            style={{ left: `${pct}%` }}
          >
            <span className="absolute left-1/2 top-0 h-full w-[9px] -translate-x-1/2 rounded-sm bg-neutral-950 shadow-[0_8px_18px_-4px_rgba(0,0,0,0.45)] transition-[width] duration-150 group-hover:w-[11px] group-active:w-[11px]">
              <span className="absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-white/85" />
            </span>
          </button>
        );
      })}

      <div
        className="pointer-events-none absolute top-[130px] -translate-x-1/2 whitespace-nowrap rounded-full border border-neutral-950 bg-white px-[26px] pb-[3px] pt-1 text-[20px] font-medium leading-[1.3] tracking-[0.04em] text-neutral-950 tabular-nums"
        style={{ left: `${clamp(centerPct, 9, 91)}%` }}
      >
        {formatTime(safeSeconds)}
      </div>
    </div>
  );
}
