"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { LoginDialog } from "@/components/login-dialog";
import { DownloadIcon, LockIcon } from "@/components/ui/icons";
import { getDownloadUrl } from "@/services/product-service";
import { isDirectDownload, toDownloadUrl } from "@/utils/drive";
import { formatVnd } from "@/utils/format";

/**
 * Signed-out visitor: pressing the button opens a sign-in pop-up; after signing in the file downloads by itself.
 * Signed-in user: pressing the button asks the database for the Google Drive link and the download starts
 * right away in the same tab (no new window).
 * Cúng dường (paid) resources show the price (online payment is not switched on yet).
 * The database enforces the rules too: it only hands out the link to people who are allowed to download.
 */
export function DownloadButton({ productId, price, large = false }: { productId: string; price: number; large?: boolean }) {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [showLogin, setShowLogin] = useState(false);
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

  async function download() {
    setStatus("loading");
    try {
      const raw = await getDownloadUrl(productId);
      const url = raw ? toDownloadUrl(raw) : null;
      if (!url) {
        setStatus("error");
        return;
      }
      setStatus("idle");
      if (isDirectDownload(url)) window.location.assign(url); // starts the download, the page stays open
      else window.open(url, "_blank", "noopener,noreferrer"); // folders / other pages need a tab
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  const signedOut = !loading && !user;

  return (
    <div>
      <button
        type="button"
        onClick={signedOut ? () => setShowLogin(true) : download}
        disabled={loading || status === "loading"}
        className={`${base} bg-black text-white hover:bg-slate-700 disabled:opacity-60`}
      >
        {signedOut ? <LockIcon className={icon} /> : <DownloadIcon className={icon} />}
        {status === "loading" ? "Đang chuẩn bị..." : "Tải xuống"}
      </button>
      {status === "error" && (
        <p role="alert" className="mt-1.5 text-center text-xs text-red-600">
          Chưa lấy được liên kết tải. Vui lòng thử lại sau.
        </p>
      )}
      <LoginDialog
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={() => {
          setShowLogin(false);
          void download();
        }}
      />
    </div>
  );
}
