"use client";

import { useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { fieldErrors, formValues, settingsSchema } from "@/lib/validation";
import { getShopSettings, updateShopSettings } from "@/services/settings-service";
import { Field, FormMessage, primaryButton } from "@/components/ui/form";
import { ErrorState } from "@/components/ui/states";
import { adminErrorMessage } from "@/utils/errors";
import type { ShopSettings } from "@/types";

export function SettingsAdmin() {
  const state = useQuery("admin-settings", getShopSettings);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Cài đặt cửa hàng</h1>
      {state.status === "loading" && <div className="h-32 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" && <SettingsForm initial={state.data} />}
    </div>
  );
}

function SettingsForm({ initial }: { initial: ShopSettings }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = settingsSchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const v = parsed.data;
    setErrors({});
    setMessage(null);
    setBusy(true);
    try {
      await updateShopSettings({
        shipping_fee: Number(v.shipping_fee),
        free_shipping_threshold: v.free_shipping_threshold === "" ? null : Number(v.free_shipping_threshold),
      });
      setMessage({ kind: "success", text: "Đã lưu cài đặt. Áp dụng cho các đơn hàng mới." });
    } catch (err) {
      console.error(err);
      setMessage({ kind: "error", text: adminErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-sm space-y-4">
      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}
      <Field label="Phí vận chuyển (VND)" name="shipping_fee" inputMode="numeric" defaultValue={String(initial.shipping_fee)} error={errors.shipping_fee} />
      <Field
        label="Miễn phí vận chuyển từ (VND, để trống nếu không áp dụng)"
        name="free_shipping_threshold"
        inputMode="numeric"
        defaultValue={initial.free_shipping_threshold === null ? "" : String(initial.free_shipping_threshold)}
        error={errors.free_shipping_threshold}
      />
      <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Đang lưu..." : "Lưu cài đặt"}</button>
    </form>
  );
}
