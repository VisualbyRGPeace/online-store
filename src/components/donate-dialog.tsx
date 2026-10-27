"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@/hooks/use-query";
import { claimDonation } from "@/services/product-service";
import { createDonationPayment, getDonationPaymentStatus, getPaymentSettings } from "@/services/payment-service";
import { getDonationQrUrl } from "@/services/settings-service";
import { FormMessage, primaryButton, secondaryButton } from "@/components/ui/form";
import { formatVnd } from "@/utils/format";
import type { PaymentSettings } from "@/types";

type Props = {
  open: boolean;
  productId: string;
  productName: string;
  price: number;
  onClose: () => void;
  onConfirmed: () => void; // the file may be downloaded now
};

/**
 * "Thanh toán để tải file". Two modes, chosen by the admin:
 *  - automatic: a QR with the exact amount and a unique code; the bank webhook confirms the payment
 *    and this window unlocks the download by itself.
 *  - manual: the admin's QR image + "Xác nhận đã thanh toán" (honor system).
 */
export function DonateDialog({ open, productId, productName, price, onClose, onConfirmed }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <DonateBody productId={productId} productName={productName} price={price} onClose={onClose} onConfirmed={onConfirmed} />
    </div>,
    document.body,
  );
}

function Frame({ productName, onClose, children }: { productName: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="donate-title" className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl sm:p-8">
      <button type="button" onClick={onClose} aria-label="Đóng" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-black">
        ×
      </button>
      <h2 id="donate-title" className="text-xl font-semibold tracking-tight">Thanh toán để tải file</h2>
      <p className="mt-1 truncate text-sm text-slate-500">{productName}</p>
      {children}
    </div>
  );
}

// Only mounted while the pop-up is open, so settings are read only when somebody needs them.
function DonateBody(props: Omit<Props, "open">) {
  const settings = useQuery("payment-settings", getPaymentSettings);

  if (settings.status === "loading") {
    return (
      <Frame productName={props.productName} onClose={props.onClose}>
        <p className="mt-8 text-sm text-slate-400">Đang tải...</p>
      </Frame>
    );
  }
  const s = settings.status === "success" ? settings.data : null;
  if (s && s.payment_mode === "auto" && s.bank_name && s.bank_account) {
    return <AutoPay {...props} settings={s} />;
  }
  return <ManualPay {...props} />;
}

// ---------------------------------------------------------------------------------------------
// Automatic: QR with amount + code, then wait for the bank webhook
// ---------------------------------------------------------------------------------------------
function AutoPay({ productId, productName, onClose, onConfirmed, settings }: Omit<Props, "open" | "price"> & { price: number; settings: PaymentSettings }) {
  const [payment, setPayment] = useState<{ code: string; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createDonationPayment(productId)
      .then((p) => {
        if (!cancelled) setPayment({ code: p.code, amount: p.amount });
      })
      .catch((err) => {
        console.error(err);
        const msg = (err as { message?: string } | null)?.message ?? "";
        if (!cancelled) setError(msg.includes("account_banned") ? "Tài khoản của bạn đang bị khóa." : "Chưa tạo được mã thanh toán, vui lòng thử lại.");
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Ask the database every 3 seconds whether the bank has reported this payment.
  useEffect(() => {
    if (!payment || paid) return;
    const timer = setInterval(async () => {
      try {
        if ((await getDonationPaymentStatus(payment.code)) === "paid") setPaid(true);
      } catch (err) {
        console.error(err);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [payment, paid]);

  const qr = payment
    ? `https://qr.sepay.vn/img?acc=${encodeURIComponent(settings.bank_account ?? "")}&bank=${encodeURIComponent(settings.bank_name ?? "")}&amount=${payment.amount}&des=${encodeURIComponent(payment.code)}`
    : null;

  return (
    <Frame productName={productName} onClose={onClose}>
      {error ? (
        <div className="mt-6 text-left">
          <FormMessage kind="error">{error}</FormMessage>
        </div>
      ) : !payment ? (
        <p className="mt-8 text-sm text-slate-400">Đang tạo mã thanh toán...</p>
      ) : paid ? (
        <>
          <div className="mx-auto mt-6 grid h-16 w-16 place-items-center rounded-full bg-black text-3xl text-white" aria-hidden>✓</div>
          <p className="mt-4 text-lg font-semibold">Đã nhận thanh toán. Cảm ơn bạn!</p>
          <button type="button" onClick={onConfirmed} className={`${primaryButton} mt-6 w-full`}>
            Tải xuống ngay
          </button>
        </>
      ) : (
        <>
          <div className="mx-auto mt-5 grid h-56 w-56 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr ?? ""} alt="Mã QR thanh toán" width={224} height={224} className="h-full w-full object-contain" />
          </div>
          <p className="mt-4 text-sm text-slate-600">
            Số tiền: <span className="font-semibold text-black">{formatVnd(payment.amount)}</span>
          </p>
          <div className="mt-2 flex items-center justify-center gap-2 text-sm">
            <span className="text-slate-500">Nội dung:</span>
            <code className="rounded bg-slate-100 px-2 py-0.5 font-semibold tracking-wider">{payment.code}</code>
            <button
              type="button"
              className="text-xs text-slate-500 underline"
              onClick={() => navigator.clipboard.writeText(payment.code).then(() => setCopied(true), () => setCopied(false))}
            >
              {copied ? "Đã chép" : "Chép"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {settings.bank_name} · STK {settings.bank_account}
            {settings.bank_account_name ? ` · ${settings.bank_account_name}` : ""}
          </p>
          <p className="mt-4 animate-pulse text-sm text-slate-600">Đang chờ thanh toán... file sẽ tự mở khóa sau khi nhận tiền.</p>
          <p className="mt-1 text-xs text-slate-400">Giữ nguyên nội dung chuyển khoản như trên.</p>
        </>
      )}
      <div className="mt-6">
        <button type="button" onClick={onClose} className={`${secondaryButton} w-full`}>
          Đóng
        </button>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------
// Manual: the admin's QR image + honor-system confirmation
// ---------------------------------------------------------------------------------------------
function ManualPay({ productId, productName, price, onClose, onConfirmed }: Omit<Props, "open">) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const qrSetting = useQuery("donation-qr", getDonationQrUrl);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await claimDonation(productId);
      onConfirmed();
    } catch (err) {
      console.error(err);
      const msg = (err as { message?: string } | null)?.message ?? "";
      setError(msg.includes("account_banned") ? "Tài khoản của bạn đang bị khóa." : "Chưa xác nhận được, vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  const fallback = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/qr.png`;
  const qr = qrSetting.status === "success" ? (qrSetting.data ?? fallback) : null;

  return (
    <Frame productName={productName} onClose={onClose}>
      <div className="mx-auto mt-5 grid h-56 w-56 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {qr === null ? (
          <span className="text-xs text-slate-400">Đang tải mã QR...</span>
        ) : qrFailed ? (
          <p className="px-4 text-sm text-slate-500">Chưa có mã QR. Vui lòng liên hệ quản trị viên.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Mã QR thanh toán" width={224} height={224} onError={() => setQrFailed(true)} className="h-full w-full object-contain" />
        )}
      </div>

      <p className="mt-4 text-sm text-slate-600">
        Số tiền gợi ý: <span className="font-semibold text-black">{formatVnd(price)}</span>
      </p>
      {user?.email && (
        <p className="mt-1 text-xs text-slate-400">
          Nội dung chuyển khoản gợi ý: <span className="break-all">{user.email}</span>
        </p>
      )}
      <p className="mt-4 text-sm text-slate-500">Sau khi chuyển khoản, bấm xác nhận để tải file. Dựa vào sự trung thực của bạn.</p>

      {error && <div className="mt-4 text-left"><FormMessage kind="error">{error}</FormMessage></div>}

      <div className="mt-6 flex flex-col gap-2">
        <button type="button" onClick={confirm} disabled={busy} className={primaryButton}>
          {busy ? "Đang xác nhận..." : "Xác nhận đã thanh toán"}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
          Đóng
        </button>
      </div>
    </Frame>
  );
}
