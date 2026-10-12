"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { DonateDialog } from "@/components/donate-dialog";
import { DownloadIcon, HeartIcon, LockIcon } from "@/components/ui/icons";
import { getDownloadUrl } from "@/services/product-service";
import { toDownloadUrl } from "@/utils/drive";
import { formatVnd } from "@/utils/format";

/**
 * Signed-out visitor: "Đăng nhập để tải" (returns to this page after login).
 * Signed-in member: asks the database for the Google Drive link and opens it.
 *   - Free ("Có sẵn") resource: any signed-in member.
 *   - Cúng dường resource: a member who already confirmed a donation. If not yet, a pop-up shows the QR code
 *     and the "Xác nhận đã cúng dường" button; after confirming, the file opens by itself.
 * The database enforces all of this too (and refuses blocked members).
 */
export function DownloadButton({
  productId,
  productName,
  price,
  large = false,
}: {
  productId: string;
  productName: string;
  price: number;
  large?: boolean;
}) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [link, setLink] = useState<string | null>(null);
  const [showDonate, setShowDonate] = useState(false);
  const paid = price > 0;
  const base = `inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition ${large ? "py-3.5 text-base" : "py-2.5"}`;
  const icon = large ? "h-5 w-5" : "h-4 w-4";

  function goLogin() {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const { pathname, search } = window.location;
    const path = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
    router.push(`/login/?next=${encodeURIComponent(path + search)}`);
  }

  async function download(afterDonation = false) {
    setStatus("loading");
    try {
      const raw = await getDownloadUrl(productId);
      const url = raw ? toDownloadUrl(raw) : null;
      if (!url) {
        if (paid && !afterDonation) {
          setStatus("idle");
          setShowDonate(true); // not unlocked yet: show the QR code
          return;
        }
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
        onClick={() => download()}
        disabled={loading || status === "loading"}
        className={`${base} bg-black text-white hover:bg-slate-700 disabled:opacity-60`}
      >
        {paid ? <HeartIcon className={icon} /> : <DownloadIcon className={icon} />}
        {status === "loading" ? "Đang lấy liên kết..." : paid ? `Cúng dường · ${formatVnd(price)}` : "Tải xuống"}
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
      {paid && (
        <DonateDialog
          open={showDonate}
          productId={productId}
          productName={productName}
          price={price}
          onClose={() => setShowDonate(false)}
          onConfirmed={() => {
            setShowDonate(false);
            void download(true);
          }}
        />
      )}
    </div>
  );
}
