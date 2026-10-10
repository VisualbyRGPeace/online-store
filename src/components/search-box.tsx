"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "@/components/ui/icons";

export function SearchBox({ defaultValue = "", className = "" }: { defaultValue?: string; className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = value.trim().slice(0, 100);
    router.push(q ? `/products/?q=${encodeURIComponent(q)}` : "/products/");
  }

  return (
    <form onSubmit={submit} role="search" className={`relative ${className}`}>
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Tìm tài nguyên..."
        aria-label="Tìm tài nguyên"
        maxLength={100}
        className="w-full rounded-full border border-slate-200 bg-white py-3 pl-12 pr-24 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
      />
      <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700">
        Tìm
      </button>
    </form>
  );
}
