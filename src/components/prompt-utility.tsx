"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deletePrompt,
  listSavedPrompts,
  savePrompt,
  type SavedPrompt,
} from "@/services/prompt-storage";

function findVariables(text: string): string[] {
  const names = new Set<string>();
  text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, name: string) => {
    const value = name.trim();
    if (value) names.add(value);
    return _match;
  });
  return [...names];
}

function fillPrompt(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name: string) => {
    const value = values[name.trim()]?.trim();
    return value || match;
  });
}

async function compressIllustration(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Chọn một tệp hình ảnh.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Ảnh tối đa 15 MB.");

  const bitmap = await createImageBitmap(file);
  try {
    let longestSide = Math.min(720, Math.max(bitmap.width, bitmap.height));
    let latest = "";
    while (longestSide >= 240) {
      const scale = Math.min(1, longestSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Không xử lý được hình ảnh.");

      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.78, 0.66, 0.54]) {
        latest = canvas.toDataURL("image/webp", quality);
        if (latest.length <= 480_000) return latest;
      }
      longestSide = Math.floor(longestSide * 0.78);
    }
    return latest;
  } finally {
    bitmap.close();
  }
}

export function PromptUtility() {
  const [templates, setTemplates] = useState<SavedPrompt[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [imageData, setImageData] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const variables = useMemo(() => findVariables(body), [body]);
  const result = useMemo(() => fillPrompt(body, values), [body, values]);

  useEffect(() => {
    let current = true;
    listSavedPrompts()
      .then((items) => {
        if (current) setTemplates(items);
      })
      .catch(() => {
        if (current) setError("Không tải được thư viện prompt trên thiết bị này.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  function startNew() {
    setSelectedId(null);
    setName("");
    setBody("");
    setValues({});
    setImageData(undefined);
    setError("");
    setCopied(false);
  }

  function useTemplate(template: SavedPrompt) {
    setSelectedId(template.id);
    setName(template.name);
    setBody(template.body);
    setValues(template.values ?? {});
    setImageData(template.imageData);
    setError("");
    setCopied(false);
  }

  async function handleImage(file?: File) {
    if (!file) return;
    setError("");
    try {
      setImageData(await compressIllustration(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xử lý được hình ảnh.");
    }
  }

  async function saveCurrent() {
    if (!name.trim() || !body.trim()) {
      setError("Nhập tên và nội dung prompt trước khi lưu.");
      return;
    }
    setSaving(true);
    setError("");
    const prompt: SavedPrompt = {
      id: selectedId ?? crypto.randomUUID(),
      name: name.trim(),
      body: body.trim(),
      values,
      imageData,
      updatedAt: new Date().toISOString(),
    };
    try {
      await savePrompt(prompt);
      const next = await listSavedPrompts();
      setTemplates(next);
      setSelectedId(prompt.id);
    } catch {
      setError("Không lưu được. Kiểm tra dung lượng lưu trữ của trình duyệt.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate(template: SavedPrompt) {
    if (!window.confirm(`Xóa prompt “${template.name}” khỏi thư viện?`)) return;
    try {
      await deletePrompt(template.id);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      if (selectedId === template.id) startNew();
    } catch {
      setError("Không xóa được prompt. Vui lòng thử lại.");
    }
  }

  async function copyResult() {
    if (!result.trim()) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Trình duyệt chưa cho phép sao chép. Hãy chọn và sao chép nội dung.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Prompt đã lưu</h2>
          <button type="button" onClick={startNew} className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700">
            Prompt mới
          </button>
        </div>
        {loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-slate-100" aria-busy="true" />
        ) : templates.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Chưa có prompt. Tạo và lưu mẫu đầu tiên.</p>
        ) : (
          <div className="max-h-[620px] space-y-2 overflow-y-auto">
            {templates.map((template) => (
              <div key={template.id} className={`flex items-center gap-2 rounded-2xl border p-2 transition ${selectedId === template.id ? "border-black bg-slate-50" : "border-slate-200 hover:border-slate-400"}`}>
                <button type="button" onClick={() => useTemplate(template)} className="flex min-w-0 flex-1 items-center gap-3 p-1 text-left">
                  {template.imageData ? (
                    <img src={template.imageData} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-slate-100 object-cover" />
                  ) : (
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg text-slate-500">Aa</span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">{template.name}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{template.body}</span>
                  </span>
                </button>
                <button type="button" onClick={() => void removeTemplate(template)} aria-label={`Xóa ${template.name}`} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-red-50 hover:text-red-600">×</button>
              </div>
            ))}
          </div>
        )}
      </aside>

      <section className="space-y-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5">
            <h2 className="text-lg font-semibold">Soạn prompt</h2>
            <p className="mt-1 text-sm text-slate-500">Đặt phần thay đổi trong ngoặc đôi, ví dụ: {"{{màu}}" }.</p>
          </div>

          <label htmlFor="prompt-name" className="mb-2 block text-sm font-medium">Tên prompt</label>
          <input
            id="prompt-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            placeholder="Ví dụ: Tạo ảnh sản phẩm"
            className="mb-5 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
          />

          <label htmlFor="prompt-body" className="mb-2 block text-sm font-medium">Nội dung mẫu</label>
          <textarea
            id="prompt-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
            rows={5}
            placeholder="Hãy tạo cho tôi một quả cam màu {{màu}}"
            className="w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
          />

          {variables.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-3 text-sm font-semibold">Thay nhanh</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {variables.map((variable) => (
                  <label key={variable} className="block">
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">{variable}</span>
                    <input
                      value={values[variable] ?? ""}
                      onChange={(event) => setValues((current) => ({ ...current, [variable]: event.target.value }))}
                      placeholder={`Nhập ${variable}`}
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-slate-200 px-4 text-sm font-medium transition hover:bg-slate-50">
              {imageData ? "Đổi ảnh minh họa" : "Thêm ảnh minh họa"}
              <input type="file" accept="image/*" className="sr-only" onChange={(event) => void handleImage(event.target.files?.[0])} />
            </label>
            {imageData && (
              <>
                <img src={imageData} alt="Ảnh minh họa đã nén" className="h-12 w-12 rounded-xl border border-slate-200 object-cover" />
                <button type="button" onClick={() => setImageData(undefined)} className="text-sm text-slate-500 underline">Bỏ ảnh</button>
              </>
            )}
            <span className="text-xs text-slate-500">Ảnh tự thu nhỏ và nén khi tải lên</span>
          </div>

          {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
          <button type="button" disabled={saving} onClick={() => void saveCurrent()} className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-black px-5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50">
            {saving ? "Đang lưu…" : selectedId ? "Lưu thay đổi" : "Lưu prompt"}
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 sm:p-7">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Prompt sử dụng</h2>
            <button type="button" disabled={!result.trim()} onClick={() => void copyResult()} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium transition hover:border-slate-400 disabled:opacity-40">
              {copied ? "Đã sao chép" : "Sao chép"}
            </button>
          </div>
          <p className="min-h-16 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{result || "Nội dung sau khi thay biến sẽ hiện ở đây."}</p>
        </div>
      </section>
    </div>
  );
}
