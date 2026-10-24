"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "@/hooks/use-auth";
import { recordQrGeneration } from "@/services/qr-history-service";

export function QrUtility() {
  const [value, setValue] = useState("");
  const [svg, setSvg] = useState("");
  const [generatedFor, setGeneratedFor] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const { user, loading } = useAuth();

  useEffect(() => {
    const text = value.trim();
    if (!text) {
      setSvg("");
      setGeneratedFor("");
      setError("");
      return;
    }

    let current = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await QRCode.toString(text, {
          type: "svg",
          width: 280,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#171717", light: "#ffffff" },
        });
        if (current) {
          setSvg(result);
          setGeneratedFor(text);
          setError("");
        }
      } catch {
        if (current) {
          setSvg("");
          setError("Nội dung này quá dài để tạo mã QR.");
        }
      }
    }, 180);

    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [value]);

  async function downloadSvg() {
    if (!svg || saving) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      if (user) await recordQrGeneration(user.id, generatedFor);
      const file = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ma-qr.svg";
      link.click();
      URL.revokeObjectURL(url);
      setNotice(user ? "Đã lưu vào lịch sử admin." : "Đã tải mã. Đăng nhập để lưu lịch sử.");
    } catch (err) {
      console.error(err);
      setError("Chưa lưu được lịch sử. Mã chưa được tải, vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <label htmlFor="qr-content" className="mb-2 block text-sm font-semibold text-slate-900">
          Nội dung mã QR
        </label>
        <textarea
          id="qr-content"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Nhập đường dẫn hoặc nội dung"
          maxLength={4000}
          rows={5}
          className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>{error || notice || "Mã QR cập nhật tự động"}</span>
          <span>{value.length}/4000</span>
        </div>
        <button
          type="button"
          onClick={() => void downloadSvg()}
          disabled={!svg || generatedFor !== value.trim() || saving || loading}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-black px-5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {saving ? "Đang lưu…" : "Tải mã SVG"}
        </button>
        {user && <p className="mt-3 text-xs text-slate-500">Nội dung sẽ được lưu trong lịch sử quản trị khi tải mã.</p>}
        {!loading && !user && (
          <p className="mt-3 text-xs text-slate-500">
            <Link href="/login/" className="font-medium text-slate-800 underline">Đăng nhập</Link> để lưu nội dung vào lịch sử quản trị.
          </p>
        )}
      </div>

      <aside className="flex min-h-[340px] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid aspect-square w-full max-w-[280px] place-items-center overflow-hidden rounded-2xl bg-white p-3">
          {svg ? (
            <div
              className="w-full [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
              role="img"
              aria-label="Xem trước mã QR"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="grid h-full w-full place-items-center rounded-xl border border-dashed border-slate-200 text-center text-sm text-slate-400">
              Mã QR sẽ hiện ở đây
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}
