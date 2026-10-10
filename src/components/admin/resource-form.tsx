"use client";

import { useState } from "react";
import { fieldErrors, formValues, resourceSchema } from "@/lib/validation";
import { adminErrorMessage } from "@/utils/errors";
import { slugify } from "@/utils/slug";
import { Field, FormMessage, primaryButton, SelectField, TextAreaField } from "@/components/ui/form";
import type { AdminCategory, AdminProduct, ResourceInput } from "@/types";

export function ResourceForm({
  categories,
  initial,
  initialDriveUrl = "",
  submitLabel,
  onSubmit,
  children,
}: {
  categories: AdminCategory[];
  initial?: AdminProduct;
  initialDriveUrl?: string;
  submitLabel: string;
  onSubmit: (input: ResourceInput, driveUrl: string) => Promise<void>;
  children?: React.ReactNode;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [kind, setKind] = useState<"free" | "paid">(initial && initial.price > 0 ? "paid" : "free");
  const [price, setPrice] = useState(initial && initial.price > 0 ? String(initial.price) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = resourceSchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      setMessage({ kind: "error", text: `Vui lòng kiểm tra lại: ${Object.values(errs).join("; ")}` });
      return;
    }
    const v = parsed.data;
    setErrors({});
    setMessage(null);
    setBusy(true);
    try {
      await onSubmit(
        {
          name: v.name,
          slug: v.slug,
          description: v.description || null,
          price: v.kind === "free" ? 0 : Number(v.price ?? ""),
          category_id: v.category_id || null,
          status: v.status,
        },
        v.drive_url,
      );
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
        label="Tiêu đề"
        name="name"
        value={name}
        maxLength={200}
        error={errors.name}
        onChange={(v) => {
          setName(v);
          if (!slugTouched) setSlug(slugify(v));
        }}
      />
      <TextAreaField label="Mô tả" name="description" defaultValue={initial?.description ?? ""} rows={4} maxLength={2000} error={errors.description} />

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Loại</legend>
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="kind" value="free" checked={kind === "free"} onChange={() => setKind("free")} /> Miễn phí (ai cũng tải được)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="kind" value="paid" checked={kind === "paid"} onChange={() => setKind("paid")} /> Trả phí
          </label>
        </div>
      </fieldset>
      {kind === "paid" && (
        <Field label="Giá (VND)" name="price" inputMode="numeric" value={price} onChange={setPrice} error={errors.price} />
      )}

      <Field
        label="Liên kết Google Drive"
        name="drive_url"
        defaultValue={initialDriveUrl}
        error={errors.drive_url}
      />
      <p className="-mt-2 text-xs text-neutral-500">
        Trong Google Drive: bấm chuột phải vào file → Chia sẻ → “Bất kỳ ai có đường liên kết” → Sao chép liên kết, rồi dán vào đây.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Danh mục"
          name="category_id"
          defaultValue={initial?.category_id ?? ""}
          options={[{ value: "", label: "Chưa phân loại" }, ...categories.map((c) => ({ value: c.id, label: c.is_active ? c.name : `${c.name} (đang ẩn)` }))]}
        />
        <SelectField
          label="Hiển thị"
          name="status"
          defaultValue={initial?.status === "active" ? "active" : initial ? "draft" : "active"}
          options={[
            { value: "active", label: "Hiện (công khai)" },
            { value: "draft", label: "Ẩn (chưa công khai)" },
          ]}
        />
      </div>

      <Field
        label="Slug (đường dẫn, tự tạo từ tiêu đề)"
        name="slug"
        value={slug}
        maxLength={200}
        error={errors.slug}
        onChange={(v) => {
          setSlugTouched(true);
          setSlug(v);
        }}
      />

      {children}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Đang lưu..." : submitLabel}
      </button>
    </form>
  );
}
