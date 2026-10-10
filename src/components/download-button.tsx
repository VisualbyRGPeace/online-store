"use client";

import { useState } from "react";
import { DownloadIcon, LockIcon } from "@/components/ui/icons";
import { getDownloadUrl } from "@/services/product-service";
import { toDownloadUrl } from "@/utils/drive";
import { formatVnd } from "@/utils/format";

/**
 * Free resource: asks the database for the Google Drive link and opens it.
 * Paid resource: shows the price. Online payment is not switched on yet; when it is, this button
 * will start checkout, and the database releases the link only after the order is paid.
 */
export function DownloadButton({ productId, price, large = false }: { productId: string; price: number; large?: boolean }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [link, setLink] = useState<string | null>(null);
  const base = `inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition ${large ? "py-3.5 text-base" : "py-2.5"}`;

  if (price > 0) {
    return (
      <div>
        <button type="button" disabled className={`${base} cursor-not-allowed bg-slate-100 text-slate-500`}>
          <LockIcon />
          Mua · {formatVnd(price)}
        </button>
        <p className="mt-1.5 text-center text-xs text-slate-400">Sắp mở bán</p>
      </div>
    );
  }

  async function download() {
    setStatus("loading");
    try {
      const raw = await getDownloadUrl(productId);
      const url = raw ? toDownloadUrl(raw) : null;
      if (!url) {
        setStatus("error");
        return;
      }
      setLink(url);
      setStatus("idle");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={download}
        disabled={status === "loading"}
        className={`${base} bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:opacity-60`}
      >
        <DownloadIcon className={large ? "h-5 w-5" : "h-4 w-4"} />
        {status === "loading" ? "Đang lấy liên kết..." : "Tải xuống"}
      </button>
      {status === "error" && (
        <p role="alert" className="mt-1.5 text-center text-xs text-red-600">
          Chưa lấy được liên kết tải. Vui lòng thử lại sau.
        </p>
      )}
      {link && (
        <p className="mt-1.5 text-center text-xs text-slate-500">
          Chưa thấy tải?{" "}
          <a href={link} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 underline">
            Bấm vào đây
          </a>
        </p>
      )}
    </div>
  );
}
