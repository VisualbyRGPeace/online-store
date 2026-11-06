"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./tool-icons";

type Props = {
  value: string; // yyyy-MM-dd hoặc ""
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
};

const WEEK_HEAD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const MONTH_NAMES = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];
const WEEKDAY_FULL = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parse(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

function todayIso(): string {
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDaysIso(iso: string, days: number): string {
  const p = parse(iso);
  if (!p) return iso;
  const date = new Date(p.y, p.m, p.d + days);
  return toIso(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Ô chọn ngày: bấm mở lịch nhỏ gọn, chọn nhanh Hôm nay / Ngày mai / Tuần sau. */
export function DatePicker({ value, onChange, label = "Chọn ngày", placeholder = "Chọn ngày", required = false, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const popId = useId();
  const parsed = parse(value);
  const today = todayIso();

  const [view, setView] = useState(() => {
    const p = parse(value) ?? parse(todayIso())!;
    return { y: p.y, m: p.m };
  });

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) popRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  function toggle() {
    if (!open) {
      const p = parse(value) ?? parse(today)!;
      setView({ y: p.y, m: p.m });
    }
    setOpen((current) => !current);
  }

  function shiftMonth(delta: number) {
    setView((current) => {
      const date = new Date(current.y, current.m + delta, 1);
      return { y: date.getFullYear(), m: date.getMonth() };
    });
  }

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  // Lưới 6 tuần, bắt đầu từ thứ Hai.
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(view.y, view.m, 1 - offset + index);
      return { iso: toIso(date.getFullYear(), date.getMonth(), date.getDate()), day: date.getDate(), inMonth: date.getMonth() === view.m, weekday: date.getDay() };
    });
  }, [view]);

  const display = parsed ? `${WEEKDAY_FULL[new Date(parsed.y, parsed.m, parsed.d).getDay()]}, ${pad(parsed.d)}/${pad(parsed.m + 1)}/${parsed.y}` : "";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={label}
        className={`flex h-11 w-full items-center gap-2.5 rounded-xl border bg-white px-3.5 text-left text-sm transition focus:outline-none focus:ring-4 focus:ring-slate-100 ${
          open ? "border-slate-500 ring-4 ring-slate-100" : "border-slate-200 hover:border-slate-400"
        }`}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-slate-500" />
        <span className={`min-w-0 flex-1 truncate ${display ? "text-slate-900" : "text-slate-400"}`}>{display || placeholder}</span>
        {value && !required && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Xóa ngày"
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
            }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
      {/* Giữ ràng buộc "bắt buộc" của biểu mẫu mà không hiện ô nhập thật */}
      {required && <input tabIndex={-1} aria-hidden="true" required value={value} onChange={() => undefined} className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0" />}

      {open && (
        <div
          ref={popRef}
          id={popId}
          role="dialog"
          aria-label={label}
          className="pop-in absolute left-0 top-[calc(100%+6px)] z-40 w-[19rem] max-w-[calc(100vw-3rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Tháng trước" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-950">
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold text-slate-950">
              {MONTH_NAMES[view.m]} <span className="font-medium text-slate-500">{view.y}</span>
            </p>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Tháng sau" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-950">
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-medium uppercase text-slate-400">
            {WEEK_HEAD.map((name) => (
              <span key={name} className={`py-1 ${name === "CN" ? "text-red-400" : ""}`}>
                {name}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5" role="grid">
            {cells.map((cell) => {
              const selected = cell.iso === value;
              const isToday = cell.iso === today;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => pick(cell.iso)}
                  aria-pressed={selected}
                  aria-label={cell.iso}
                  className={`mx-auto grid h-9 w-9 place-items-center rounded-full text-sm transition ${
                    selected
                      ? "bg-black font-semibold text-white"
                      : isToday
                        ? "font-semibold text-slate-950 ring-1 ring-inset ring-slate-900 hover:bg-slate-100"
                        : cell.inMonth
                          ? `${cell.weekday === 0 ? "text-red-500" : "text-slate-800"} hover:bg-slate-100`
                          : "text-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2.5">
            {(
              [
                ["Hôm nay", today],
                ["Ngày mai", addDaysIso(today, 1)],
                ["Tuần sau", addDaysIso(today, 7)],
              ] as const
            ).map(([text, iso]) => (
              <button
                key={text}
                type="button"
                onClick={() => pick(iso)}
                className={`h-8 flex-1 rounded-lg text-xs font-medium transition ${value === iso ? "bg-black text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
