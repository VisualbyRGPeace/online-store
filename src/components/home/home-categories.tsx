"use client";

import Link from "next/link";
import { useQuery } from "@/hooks/use-query";
import { listCategories } from "@/services/product-service";

/** Real categories from the database; the section stays hidden when there are none. */
export function HomeCategories() {
  const state = useQuery("home-categories", listCategories);
  if (state.status !== "success" || state.data.length === 0) return null;

  return (
    <section className="mt-14">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">Danh mục</h2>
      <div className="flex flex-wrap gap-2">
        {state.data.map((c) => (
          <Link
            key={c.id}
            href={`/products/?category=${encodeURIComponent(c.slug)}`}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-black hover:text-black"
          >
            {c.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
