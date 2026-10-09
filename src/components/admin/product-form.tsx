"use client";

import { useState } from "react";
import { fieldErrors, formValues, productSchema } from "@/lib/validation";
import { adminErrorMessage } from "@/utils/errors";
import { slugify } from "@/utils/slug";
import { Field, FormMessage, primaryButton, SelectField, TextAreaField } from "@/components/ui/form";
import type { AdminCategory, AdminProduct, ProductInput } from "@/types";

const STATUS_OPTIONS = [
  { value: "draft", label: "Nháp (đang ẩn)" },
  { value: "active", label: "Đang bán" },
  { value: "archived", label: "Lưu trữ (ẩn)" },
];

export function ProductForm({
  categories,
  initial,
  submitLabel,
  onSubmit,
  children,
}: {
  categories: AdminCategory[];
  initial?: AdminProduct;
  submitLabel: string;
  onSubmit: (input: ProductInput) => Promise<void>;
  children?: React.ReactNode;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = productSchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const v = parsed.data;
    setErrors({});
    setMessage(null);
    setBusy(true);
    try {
      await onSubmit({
        name: v.name,
        slug: v.slug,
        description: v.description || null,
        price: Number(v.price),
        compare_at_price: v.compare_at_price === "" ? null : Number(v.compare_at_price),
        stock: Number(v.stock),
        category_id: v.category_id || null,
        status: v.status,
      });
      if (initial) setMessage({ kind: "success", text: "Đã lưu thay đổi." });
    } catch (err) {
      console.error(err);
      setMessage({ kind: "error", text: adminErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handle} noValidate className="max-w-2xl space-y-4">
      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}
      <Field
        label="Tên sản phẩm"
        name="name"
        value={name}
        maxLength={200}
        error={errors.name}
        onChange={(v) => {
          setName(v);
          if (!slugTouched) setSlug(slugify(v));
        }}
      />
      <Field
        label="Slug (đường dẫn, tự tạo từ tên)"
        name="slug"
        value={slug}
        maxLength={200}
        error={errors.slug}
        onChange={(v) => {
          setSlugTouched(true);
          setSlug(v);
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Giá bán (VND)" name="price" inputMode="numeric" defaultValue={initial ? String(initial.price) : ""} error={errors.price} />
        <Field label="Giá cũ (VND, có thể để trống)" name="compare_at_price" inputMode="numeric" defaultValue={initial?.compare_at_price != null ? String(initial.compare_at_price) : ""} error={errors.compare_at_price} />
        <Field label="Tồn kho" name="stock" inputMode="numeric" defaultValue={initial ? String(initial.stock) : "0"} error={errors.stock} />
        <SelectField
          label="Danh mục"
          name="category_id"
          defaultValue={initial?.category_id ?? ""}
          options={[{ value: "", label: "Chưa phân loại" }, ...categories.map((c) => ({ value: c.id, label: c.is_active ? c.name : `${c.name} (đang ẩn)` }))]}
        />
      </div>
      <TextAreaField label="Mô tả" name="description" defaultValue={initial?.description ?? ""} rows={6} maxLength={10000} error={errors.description} />
      <SelectField label="Trạng thái" name="status" defaultValue={initial?.status ?? "draft"} options={STATUS_OPTIONS} />
      {children}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Đang lưu..." : submitLabel}
      </button>
    </form>
  );
}
