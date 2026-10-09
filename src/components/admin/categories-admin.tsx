"use client";

import { useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { categorySchema, fieldErrors, formValues } from "@/lib/validation";
import { createCategory, deleteCategory, listAdminCategories, updateCategory } from "@/services/admin-catalog-service";
import { Field, FormMessage, primaryButton, secondaryButton } from "@/components/ui/form";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { adminErrorMessage } from "@/utils/errors";
import { slugify } from "@/utils/slug";

export function CategoriesAdmin() {
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const state = useQuery(`admin-categories:${version}`, listAdminCategories);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      setVersion((v) => v + 1);
    } catch (err) {
      console.error(err);
      setError(adminErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Danh mục</h1>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <NewCategoryForm onCreate={(values) => run(() => createCategory(values))} />

      {state.status === "loading" && <div className="h-32 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" && state.data.length === 0 && <EmptyState title="Chưa có danh mục" />}
      {state.status === "success" && state.data.length > 0 && (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 text-sm">
          {state.data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              {editing === c.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
                    if (!name || name.length > 100) return;
                    setEditing(null);
                    void run(() => updateCategory(c.id, { name }));
                  }}
                >
                  <input name="name" defaultValue={c.name} maxLength={100} aria-label="Tên danh mục" className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5" />
                  <button type="submit" className={primaryButton}>Lưu</button>
                  <button type="button" onClick={() => setEditing(null)} className={secondaryButton}>Hủy</button>
                </form>
              ) : (
                <>
                  <div>
                    <p className="font-medium">{c.name}{!c.is_active && <span className="ml-2 text-xs text-neutral-500">(đang ẩn)</span>}</p>
                    <p className="text-neutral-500">/{c.slug}</p>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" className="underline" onClick={() => setEditing(c.id)}>Đổi tên</button>
                    <button type="button" className="underline" onClick={() => run(() => updateCategory(c.id, { is_active: !c.is_active }))}>{c.is_active ? "Ẩn" : "Hiện"}</button>
                    <button
                      type="button"
                      className="text-red-600 underline"
                      onClick={() => {
                        if (window.confirm(`Xóa danh mục “${c.name}”? Sản phẩm trong danh mục sẽ chuyển thành “Chưa phân loại”.`)) {
                          void run(() => deleteCategory(c.id));
                        }
                      }}
                    >
                      Xóa
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewCategoryForm({ onCreate }: { onCreate: (values: { name: string; slug: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = categorySchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    await onCreate(parsed.data);
    setName("");
    setSlug("");
    setTouched(false);
  }

  return (
    <form onSubmit={submit} noValidate className="grid max-w-2xl items-start gap-4 rounded-lg border border-neutral-200 p-4 sm:grid-cols-[1fr_1fr_auto]">
      <Field label="Tên danh mục" name="name" value={name} maxLength={100} error={errors.name} onChange={(v) => { setName(v); if (!touched) setSlug(slugify(v)); }} />
      <Field label="Slug" name="slug" value={slug} maxLength={200} error={errors.slug} onChange={(v) => { setTouched(true); setSlug(v); }} />
      <button type="submit" className={`${primaryButton} sm:mt-6`}>Thêm</button>
    </form>
  );
}
