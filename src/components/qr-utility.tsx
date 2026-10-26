"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "@/hooks/use-auth";
import { recordQrGeneration } from "@/services/qr-history-service";
import { CheckIcon, DownloadIcon } from "@/components/utilities/tool-icons";

type Mode = "text" | "wifi";
type Level = "M" | "Q" | "H";
type Security = "WPA" | "WEP" | "nopass";

const MAX_LENGTH = 4000;
const COLORS = [
  { name: "Đen", value: "#171717" },
  { name: "Xanh navy", value: "#1e3a8a" },
  { name: "Xanh lá", value: "#166534" },
  { name: "Đỏ rượu", value: "#9f1239" },
] as const;
const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: "M", label: "Tiêu chuẩn", hint: "Gọn, dễ quét" },
  { value: "Q", label: "Cao", hint: "Chịu được trầy xước" },
  { value: "H", label: "Rất cao", hint: "Dùng khi chèn logo" },
];
const EXAMPLES = ["https://", "Xin chào!", "tel:+84"];

const escapeWifi = (value: string) => value.replace(/([\\;,:"])/g, "\\$1");

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Thu hồi chậm để trình duyệt kịp bắt đầu tải.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-grid auto-cols-fr grid-flow-col rounded-2xl bg-slate-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition ${
            value === option.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100";

export function QrUtility() {
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [security, setSecurity] = useState<Security>("WPA");
  const [color, setColor] = useState<string>(COLORS[0].value);
  const [level, setLevel] = useState<Level>("M");
  const [svg, setSvg] = useState("");
  const [renderedKey, setRenderedKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState<"svg" | "png" | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const { user, loading } = useAuth();

  const payload = useMemo(() => {
    if (mode === "text") return text.trim();
    if (!ssid.trim()) return "";
    const pass = security === "nopass" ? "" : `P:${escapeWifi(password)};`;
    return `WIFI:T:${security};S:${escapeWifi(ssid.trim())};${pass};`;
  }, [mode, text, ssid, password, security]);

  const key = `${payload}|${color}|${level}`;
  const tooLong = payload.length > MAX_LENGTH;
  const active = Boolean(payload) && !tooLong;
  const ready = active && Boolean(svg) && renderedKey === key;
  const shownError = tooLong ? "Nội dung quá dài để tạo mã QR." : active ? error : "";

  useEffect(() => {
    if (!payload || tooLong) return;
    let current = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await QRCode.toString(payload, {
          type: "svg",
          margin: 2,
          errorCorrectionLevel: level,
          color: { dark: color, light: "#ffffff" },
        });
        if (!current) return;
        setSvg(result);
        setRenderedKey(`${payload}|${color}|${level}`);
        setError("");
      } catch {
        if (!current) return;
        setSvg("");
        setRenderedKey("");
        setError("Nội dung này quá dài để tạo mã QR ở độ bền đã chọn. Hãy rút gọn hoặc chọn độ bền thấp hơn.");
      }
    }, 150);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [payload, color, level, tooLong]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  function flash(message: string) {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 4000);
  }

  async function download(format: "svg" | "png") {
    if (!ready || saving) return;
    setSaving(format);
    setError("");
    try {
      if (format === "svg") {
        saveBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), "ma-qr.svg");
      } else {
        const dataUrl = await QRCode.toDataURL(payload, {
          width: 1024,
          margin: 2,
          errorCorrectionLevel: level,
          color: { dark: color, light: "#ffffff" },
        });
        saveBlob(await (await fetch(dataUrl)).blob(), "ma-qr.png");
      }
      if (!user) {
        flash("Đã tải mã. Đăng nhập để lưu vào lịch sử.");
        return;
      }
      try {
        // Không lưu mật khẩu Wi‑Fi vào lịch sử quản trị.
        await recordQrGeneration(user.id, mode === "wifi" ? `Wi-Fi: ${ssid.trim()}` : payload);
        flash("Đã tải mã và lưu vào lịch sử.");
      } catch (err) {
        console.error(err);
        flash("Đã tải mã, nhưng chưa lưu được lịch sử.");
      }
    } catch (err) {
      console.error(err);
      setError("Không tải được mã QR. Vui lòng thử lại.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">Bạn muốn mã QR chứa gì?</p>
          <Segmented
            label="Loại nội dung"
            value={mode}
            onChange={setMode}
            options={[
              { value: "text", label: "Liên kết / Văn bản" },
              { value: "wifi", label: "Wi‑Fi" },
            ]}
          />
        </div>

        {mode === "text" ? (
          <div>
            <label htmlFor="qr-content" className="mb-2 block text-sm font-semibold text-slate-900">
              Nội dung
            </label>
            <textarea
              id="qr-content"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Dán đường dẫn hoặc nhập nội dung…"
              maxLength={MAX_LENGTH}
              rows={4}
              className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setText((current) => current || example)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                  >
                    {example}
                  </button>
                ))}
              </div>
              <span className="text-xs tabular-nums text-slate-400">{text.length}/{MAX_LENGTH}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="qr-ssid" className="mb-2 block text-sm font-semibold text-slate-900">Tên Wi‑Fi (SSID)</label>
              <input id="qr-ssid" value={ssid} onChange={(event) => setSsid(event.target.value)} maxLength={64} placeholder="Ví dụ: Nha_Minh" className={inputClass} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="qr-security" className="mb-2 block text-sm font-semibold text-slate-900">Bảo mật</label>
                <select id="qr-security" value={security} onChange={(event) => setSecurity(event.target.value as Security)} className={inputClass}>
                  <option value="WPA">WPA / WPA2 / WPA3</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">Không mật khẩu</option>
                </select>
              </div>
              <div>
                <label htmlFor="qr-password" className="mb-2 block text-sm font-semibold text-slate-900">Mật khẩu</label>
                <input id="qr-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={security === "nopass"} maxLength={64} placeholder={security === "nopass" ? "Không cần" : "Nhập mật khẩu"} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`} />
              </div>
            </div>
            <p className="text-xs text-slate-500">Mật khẩu chỉ nằm trong mã QR, không được lưu vào lịch sử.</p>
          </div>
        )}

        <div className="grid gap-6 border-t border-slate-100 pt-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-900">Màu mã</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Màu mã QR">
              {COLORS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={color === item.value}
                  aria-label={item.name}
                  title={item.name}
                  onClick={() => setColor(item.value)}
                  className={`grid h-10 w-10 place-items-center rounded-full border-2 transition ${color === item.value ? "border-slate-900" : "border-transparent hover:border-slate-300"}`}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full text-white" style={{ background: item.value }}>
                    {color === item.value && <CheckIcon className="h-4 w-4" />}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-900">Độ bền</p>
            <Segmented label="Độ bền mã QR" value={level} onChange={setLevel} options={LEVELS.map(({ value, label }) => ({ value, label }))} />
            <p className="mt-2 text-xs text-slate-500">{LEVELS.find((item) => item.value === level)?.hint}</p>
          </div>
        </div>
      </div>

      <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-24">
        <div className="relative mx-auto grid aspect-square w-full max-w-[300px] place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
          {active && svg ? (
            <div
              className={`w-full transition duration-200 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full ${ready ? "opacity-100" : "opacity-40 blur-[1px]"}`}
              role="img"
              aria-label="Xem trước mã QR"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="px-6 text-center text-sm text-slate-400">
              {mode === "wifi" ? "Nhập tên Wi‑Fi để tạo mã" : "Mã QR sẽ hiện ở đây"}
            </div>
          )}
        </div>

        <p role="status" className={`mt-3 min-h-5 text-center text-xs ${shownError ? "text-red-600" : "text-slate-500"}`}>
          {shownError || notice || (ready ? "Quét thử bằng điện thoại trước khi in." : "")}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void download("svg")}
            disabled={!ready || saving !== null || loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <DownloadIcon className="h-4 w-4" />
            {saving === "svg" ? "Đang tải…" : "Tải SVG"}
          </button>
          <button
            type="button"
            onClick={() => void download("png")}
            disabled={!ready || saving !== null || loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            <DownloadIcon className="h-4 w-4" />
            {saving === "png" ? "Đang tải…" : "Tải PNG"}
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">
          {user ? "Mỗi lần tải sẽ được lưu vào lịch sử quản trị." : !loading && (
            <>
              <Link href="/login/" className="font-medium text-slate-700 underline">Đăng nhập</Link> để lưu lịch sử tạo mã.
            </>
          )}
        </p>
      </aside>
    </section>
  );
}
