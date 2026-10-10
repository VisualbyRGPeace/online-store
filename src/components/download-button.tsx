"use client";

import { useState } from "react";
import { getDownloadUrl } from "@/services/product-service";
import { toDownloadUrl } from "@/utils/drive";
import { formatVnd } from "@/utils/format";

/**
 * Free resource: asks the database for the Google Drive link and opens it.
 * Paid resource: shows the price. Online payment is not switched on yet; when it is, this button
 * will start checkout, and the database will release the link only after the order is paid.
 */
export function DownloadButton({ productId, price, large = false }: { productId: string; price: number; large?: boolean }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [link, setLink] = useState<string | null>(null);
  const base = `w-full rounded-md px-4 text-sm ${large ? "py-3" : "py-2"}`;

  if (price > 0) {
    return (
      <div>
        <button type="button" disabled className={`${base} cursor-not-allowed bg-neutral-200 text-neutral-500`}>
          Mua · {formatVnd(price)}
        </button>
        <p className="mt-1 text-center text-xs text-neutral-500">Sắp mở bán</p>
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
        className={`${base} bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-60`}
      >
        {status === "loading" ? "Đang lấy liên kết..." : "Tải xuống"}
      </button>
      {status === "error" && (
        <p role="alert" className="mt-1 text-center text-xs text-red-600">
          Chưa lấy được liên kết tải. Vui lòng thử lại sau.
        </p>
      )}
      {link && (
        <p className="mt-1 text-center text-xs text-neutral-600">
          Chưa thấy tải?{" "}
          <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
            Bấm vào đây
          </a>
        </p>
      )}
    </div>
  );
}
