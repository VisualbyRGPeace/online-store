"use client";

import { useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { fieldErrors, formValues, paymentSettingsSchema } from "@/lib/validation";
import { getPaymentSettings, updatePaymentSettings } from "@/services/payment-service";
import { Field, FormMessage, primaryButton } from "@/components/ui/form";
import { ErrorState } from "@/components/ui/states";
import { adminErrorMessage } from "@/utils/errors";
import type { PaymentSettings } from "@/types";

/** Switch between self-confirmation and automatic bank-transfer confirmation (SePay), and set the bank account. */
export function PaymentSettingsManager() {
  const state = useQuery("admin-payment-settings", getPaymentSettings);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Cách nhận cúng dường</h2>
      {state.status === "loading" && <div className="mt-4 h-24 animate-pulse rounded-xl bg-slate-100" />}
      {state.status === "error" && <div className="mt-4"><ErrorState /></div>}
      {state.status === "success" && <SettingsForm initial={state.data} />}
    </section>
  );
}

function SettingsForm({ initial }: { initial: PaymentSettings }) {
  const [mode, setMode] = useState<"manual" | "auto">(initial.payment_mode);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const webhookUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/sepay-webhook`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = paymentSettingsSchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const v = parsed.data;
    setErrors({});
    setMessage(null);
    setBusy(true);
    try {
      await updatePaymentSettings({
        payment_mode: v.payment_mode,
        bank_name: v.bank_name || null,
        bank_account: v.bank_account || null,
        bank_account_name: v.bank_account_name || null,
      });
      setMessage({ kind: "success", text: "Đã lưu." });
    } catch (err) {
      console.error(err);
      setMessage({ kind: "error", text: adminErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 max-w-xl space-y-4">
      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Chế độ</legend>
        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" name="payment_mode" value="manual" checked={mode === "manual"} onChange={() => setMode("manual")} className="mt-1" />
            <span>
              <span className="font-medium">Thủ công</span>
              <span className="block text-slate-500">Khách quét mã QR bên dưới rồi tự bấm “Xác nhận đã cúng dường” (dựa vào sự trung thực).</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="payment_mode" value="auto" checked={mode === "auto"} onChange={() => setMode("auto")} className="mt-1" />
            <span>
              <span className="font-medium">Tự động (SePay)</span>
              <span className="block text-slate-500">Mỗi lần cúng dường có mã QR riêng kèm số tiền và mã thanh toán; nhận tiền xong file tự mở khóa.</span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên ngân hàng (viết như SePay, ví dụ Vietcombank)" name="bank_name" defaultValue={initial.bank_name ?? ""} maxLength={40} error={errors.bank_name} />
        <Field label="Số tài khoản" name="bank_account" inputMode="numeric" defaultValue={initial.bank_account ?? ""} maxLength={24} error={errors.bank_account} />
      </div>
      <Field label="Tên chủ tài khoản (hiển thị cho khách, không bắt buộc)" name="bank_account_name" defaultValue={initial.bank_account_name ?? ""} maxLength={100} error={errors.bank_account_name} />

      <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-800">Địa chỉ webhook để dán vào SePay</p>
        <p className="mt-1 break-all font-mono">{webhookUrl}</p>
        <button
          type="button"
          className="mt-2 underline"
          onClick={() => navigator.clipboard.writeText(webhookUrl).then(() => setCopied(true), () => setCopied(false))}
        >
          {copied ? "Đã chép" : "Chép địa chỉ"}
        </button>
      </div>

      <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Đang lưu..." : "Lưu"}</button>
    </form>
  );
}
