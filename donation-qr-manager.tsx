"use client";

import { useRef, useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { getDonationQrUrl, removeDonationQr, uploadDonationQr } from "@/services/settings-service";
import { FormMessage, secondaryButton } from "@/components/ui/form";
import { adminErrorMessage } from "@/utils/errors";
import { validateImageFile } from "@/utils/image";

/** Upload / replace / remove the QR image that members see in the "Thanh toán để tải file" pop-up. */
export function DonationQrManager() {
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const state = useQuery(`donation-qr:${version}`, getDonationQrUrl);

  async function run(work: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ kind: "success", text: await work() });
      setVersion((v) => v + 1);
    } catch (err) {
      console.error(err);
      setMessage({ kind: "error", text: adminErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  function pick(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) return setMessage({ kind: "error", text: problem });
    void run(async () => {
      await uploadDonationQr(file);
      return "Đã cập nhật mã QR.";
    });
  }

  const url = state.status === "success" ? state.data : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Mã QR nhận thanh toán</h2>
      <p className="mt-1 text-sm text-slate-500">Ảnh này hiện trong cửa sổ “Thanh toán để tải file”. Dùng mã QR do ngân hàng hoặc ví của bạn cấp.</p>

      {message && <div className="mt-4"><FormMessage kind={message.kind}>{message.text}</FormMessage></div>}

      <div className="mt-4 flex flex-wrap items-center gap-5">
        <div className="grid h-40 w-40 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {state.status === "loading" ? (
            <span className="text-xs text-slate-400">Đang tải...</span>
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Mã QR thanh toán hiện tại" className="h-full w-full object-contain" />
          ) : (
            <span className="px-3 text-center text-xs text-slate-400">Chưa tải mã QR lên</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={secondaryButton}>
            {busy ? "Đang xử lý..." : url ? "Đổi mã QR" : "Chọn ảnh mã QR"}
          </button>
          {url && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Xóa mã QR hiện tại?")) void run(async () => { await removeDonationQr(); return "Đã xóa mã QR."; });
              }}
              className="text-left text-sm text-red-600 underline disabled:opacity-50"
            >
              Xóa mã QR
            </button>
          )}
          <p className="text-xs text-slate-400">JPG, PNG hoặc WebP, tối đa 15MB.</p>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        </div>
      </div>
    </section>
  );
}
