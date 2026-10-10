"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { DownloadIcon, LockIcon } from "@/components/ui/icons";
import { getDownloadUrl } from "@/services/product-service";
import { toDownloadUrl } from "@/utils/drive";
import { formatVnd } from "@/utils/format";

/**
 * Signed-out visitor: "Đăng nhập để tải" (returns to this page after login).
 * Signed-in user, free resource: asks the database for the Google Drive link and opens it.
 * Paid resource: shows the price (online payment is not switched on yet).
 * The database enforces all of this too: it only hands out the link to signed-in users.
 */
export function DownloadButton({ productId, price, large = false }: { productId: string; price: number; large?: boolean }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [link, setLink] = useState<string | null>(null);
  const base = `inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition ${large ? "py-3.5 text-base" : "py-2.5"}`;
  const icon = large ? "h-5 w-5" : "h-4 w-4";

  if (price > 0) {
    return (
      <div>
        <button type="button" disabled className={`${base} cursor-not-allowed bg-slate-100 text-slate-500`}>
          <LockIcon className={icon} />
          Mua · {formatVnd(price)}
        </button>
        <p className="mt-1.5 text-center text-xs text-slate-400">Sắp mở bán</p>
      </div>
    );
  }

  function goLogin() {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const { pathname, search } = window.location;
    const path = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
    router.push(`/login/?next=${encodeURIComponent(path + search)}`);
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

  if (!loading && !user) {
    return (
      <button type="button" onClick={goLogin} className={`${base} border border-black bg-white text-black hover:bg-black hover:text-white`}>
        <LockIcon className={icon} />
        Đăng nhập để tải
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={download}
        disabled={loading || status === "loading"}
        className={`${base} bg-black text-white hover:bg-slate-700 disabled:opacity-60`}
      >
        <DownloadIcon className={icon} />
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
          <a href={link} target="_blank" rel="noopener noreferrer" className="font-medium text-black underline">
            Bấm vào đây
          </a>
        </p>
      )}
    </div>
  );
}
