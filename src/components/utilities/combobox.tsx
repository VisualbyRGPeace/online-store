"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "./tool-icons";

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  label: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  /** Cho phép gõ giá trị mới ngoài danh sách (mặc định: có). */
  allowCustom?: boolean;
  className?: string;
};

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

/** Ô nhập kèm danh sách xổ xuống: gõ để lọc, ↑ ↓ Enter để chọn, Esc để đóng. */
export function Combobox({ value, onChange, options, label, placeholder, required, maxLength, autoFocus, allowCustom = true, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typed, setTyped] = useState(false); // chỉ lọc khi người dùng đang gõ, mở ra là hiện đủ danh sách
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const term = fold(value.trim());
    if (!typed || term === "") return options;
    return options.filter((option) => fold(option).includes(term));
  }, [options, value, typed]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  useEffect(() => {
    if (!open || active < 0) return;
    (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(option: string) {
    onChange(option);
    setTyped(false);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((current) => (filtered.length === 0 ? -1 : (current + 1) % filtered.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((current) => (filtered.length === 0 ? -1 : (current - 1 + filtered.length) % filtered.length));
    } else if (event.key === "Enter") {
      if (open && active >= 0 && filtered[active] !== undefined) {
        event.preventDefault();
        choose(filtered[active]);
      } else if (open) {
        setOpen(false);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.stopPropagation();
        setOpen(false);
      }
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  const exact = options.some((option) => fold(option) === fold(value.trim()));
  const showCreate = allowCustom && typed && value.trim() !== "" && !exact;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-label={label}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setTyped(true);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setTyped(false)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        maxLength={maxLength}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        className={`h-11 w-full rounded-xl border bg-white pl-4 pr-10 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100 ${
          open ? "border-slate-500 ring-4 ring-slate-100" : "border-slate-200 hover:border-slate-400"
        }`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Đóng danh sách" : "Mở danh sách"}
        onClick={() => setOpen((current) => !current)}
        className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (filtered.length > 0 || showCreate) && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          className="pop-in absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {filtered.map((option, index) => {
            const selected = option === value;
            return (
              <li
                key={option}
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(index)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition ${
                  index === active ? "bg-slate-100" : ""
                } ${selected ? "font-semibold text-slate-950" : "text-slate-700"}`}
              >
                <span className="truncate">{option}</span>
                {selected && <CheckIcon className="h-4 w-4 shrink-0" />}
              </li>
            );
          })}
          {showCreate && (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(value.trim())}
              className="cursor-pointer rounded-xl px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Dùng “<span className="font-semibold text-slate-950">{value.trim()}</span>”
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
