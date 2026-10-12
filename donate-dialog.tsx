"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@/hooks/use-query";
import { claimDonation } from "@/services/product-service";
import { getDonationQrUrl } from "@/services/settings-service";
import { FormMessage, primaryButton, secondaryButton } from "@/components/ui/form";
import { formatVnd } from "@/utils/format";

/**
 * "Cúng dường để tải file": QR code + a confirm button. It relies on the member's honesty: pressing
 * "Xác nhận đã cúng dường" records the confirmation and unlocks the file. The admin can review and revoke it.
 * The QR image is set in Admin → Cúng dường (falls back to public/qr.png in the repository).
 */
export function DonateDialog({
  open,
  productId,
  productName,
  price,
  onClose,
  onConfirmed,
}: {
  open: boolean;
  productId: string;
  productName: string;
  price: number;
  onClose: () => void;
  onConfirmed: () => void;
}) {
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

// Only mounted while the pop-up is open, so the QR setting is read only when somebody actually needs it.
function DonateBody({
  productId,
  productName,
  price,
  onClose,
  onConfirmed,
}: {
  productId: string;
  productName: string;
  price: number;
  onClose: () => void;
  onConfirmed: () => void;
}) {
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
    <div role="dialog" aria-modal="true" aria-labelledby="donate-title" className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl sm:p-8">
      <button type="button" onClick={onClose} aria-label="Đóng" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-black">
        ×
      </button>
      <h2 id="donate-title" className="text-xl font-semibold tracking-tight">Cúng dường để tải file</h2>
      <p className="mt-1 truncate text-sm text-slate-500">{productName}</p>

      <div className="mx-auto mt-5 grid h-56 w-56 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {qr === null ? (
          <span className="text-xs text-slate-400">Đang tải mã QR...</span>
        ) : qrFailed ? (
          <p className="px-4 text-sm text-slate-500">Chưa có mã QR. Vui lòng liên hệ quản trị viên.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Mã QR cúng dường" width={224} height={224} onError={() => setQrFailed(true)} className="h-full w-full object-contain" />
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
          {busy ? "Đang xác nhận..." : "Xác nhận đã cúng dường"}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
          Đóng
        </button>
      </div>
    </div>
  );
}
