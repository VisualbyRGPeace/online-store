"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "./tool-icons";

type Option = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  label: string; // tiêu đề nhỏ phía trước giá trị, ví dụ "Designer"
  className?: string;
};

/** Thanh xổ xuống dạng nút (chọn một giá trị trong danh sách có sẵn). */
export function SelectMenu({ value, onChange, options, label, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={`flex h-11 w-full items-center gap-2 rounded-xl border bg-white pl-3.5 pr-2.5 text-sm transition focus:outline-none focus:ring-4 focus:ring-slate-100 ${
          open ? "border-slate-500 ring-4 ring-slate-100" : "border-slate-200 hover:border-slate-400"
        }`}
      >
        <span className="shrink-0 text-xs font-medium text-slate-400">{label}</span>
        <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-900">{current?.label}</span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="pop-in absolute right-0 top-[calc(100%+6px)] z-40 max-h-64 min-w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value || "all"} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm transition hover:bg-slate-100 ${
                    selected ? "font-semibold text-slate-950" : "text-slate-700"
                  }`}
                >
                  {option.label}
                  {selected && <CheckIcon className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
