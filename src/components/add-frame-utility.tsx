"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { CATEGORIES, framesOf, frameUrl, logoUrl, type Frame } from "@/lib/add-frame-library";
import {
  cleanName,
  compose,
  createPreviewPhoto,
  exportFrames,
  loadPreviewAsset,
  type ExportFormat,
  type LogoSide,
  type Photo,
} from "@/utils/add-frame";
import { validateImageFile } from "@/utils/image";
import { CheckIcon, CloseIcon, DownloadIcon, UploadIcon } from "@/components/utilities/tool-icons";

const PREVIEW_SIZE = 720;

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-2xl bg-slate-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${
            value === option.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function FramePreview({
  frame,
  photo,
  logo,
  selectable,
  checked,
  canExport,
  onToggle,
  onDownload,
}: {
  frame: Frame;
  photo: Photo | null;
  logo: HTMLCanvasElement | null;
  selectable: boolean;
  checked: boolean;
  canExport: boolean;
  onToggle: () => void;
  onDownload: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [asset, setAsset] = useState<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    loadPreviewAsset(frameUrl(frame), PREVIEW_SIZE).then(
      (canvas) => current && setAsset(canvas),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [frame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !asset) return;
    compose(ctx, canvas.width, photo, asset, logo);
  }, [asset, photo, logo]);

  return (
    <figure className="group min-w-0">
      <div
        className={`relative aspect-square overflow-hidden rounded-2xl border bg-slate-50 transition ${
          checked ? "border-slate-900 ring-2 ring-slate-900" : "border-slate-200"
        }`}
      >
        <canvas
          ref={canvasRef}
          width={PREVIEW_SIZE}
          height={PREVIEW_SIZE}
          role="img"
          aria-label={`Xem trước frame ${frame.name}`}
          className={`block h-full w-full transition-opacity duration-300 ${asset ? "opacity-100" : "opacity-0"}`}
        />
        {!asset && (
          <div className={`absolute inset-0 grid place-items-center text-xs ${failed ? "text-red-600" : "animate-pulse text-slate-400"}`}>
            {failed ? "Không tải được frame" : "Đang tải…"}
          </div>
        )}
        {selectable && (
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={`Chọn frame ${frame.name}`}
            onClick={onToggle}
            className={`absolute left-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full border-2 shadow-sm transition ${
              checked ? "border-black bg-black text-white" : "border-white bg-white/90 text-transparent hover:border-slate-900"
            }`}
          >
            <CheckIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      <figcaption className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-slate-800">{frame.name}</span>
        {selectable && (
          <button
            type="button"
            onClick={onDownload}
            disabled={!canExport}
            aria-label={`Tải riêng frame ${frame.name}`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:border-slate-200 disabled:hover:bg-transparent"
          >
            <DownloadIcon className="h-4 w-4" />
          </button>
        )}
      </figcaption>
    </figure>
  );
}

export function AddFrameUtility() {
  const [file, setFile] = useState<File | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [thumb, setThumb] = useState("");
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [categoryId, setCategoryId] = useState(CATEGORIES[0]?.id ?? "all");
  const [name, setName] = useState("");
  const [logoSide, setLogoSide] = useState<LogoSide>("none");
  const [logoAssets, setLogoAssets] = useState<{ left: HTMLCanvasElement | null; right: HTMLCanvasElement | null }>({ left: null, right: null });
  const [format, setFormat] = useState<ExportFormat>("jpg");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<number | undefined>(undefined);
  const loadToken = useRef(0);

  const category = CATEGORIES.find((item) => item.id === categoryId) ?? CATEGORIES[0]!;
  const frames = useMemo(() => framesOf(category), [category]);
  const isAll = category.id === "all";
  const busy = progress !== null;
  const chosen = useMemo(() => (isAll ? frames.filter((frame) => selected.has(frame.id)) : frames), [isAll, frames, selected]);
  const logo = logoSide === "none" ? null : logoAssets[logoSide];
  const exportName = cleanName(name);
  const canExport = !!photo && exportName !== "" && !busy;

  useEffect(() => {
    let current = true;
    for (const side of ["left", "right"] as const) {
      loadPreviewAsset(logoUrl(side), PREVIEW_SIZE).then(
        (canvas) => current && setLogoAssets((prev) => ({ ...prev, [side]: canvas })),
        () => undefined,
      );
    }
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);

  function flash(message: string) {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 4000);
  }

  async function chooseFile(next: File | undefined) {
    if (!next || busy) return;
    const problem = validateImageFile(next);
    if (problem) {
      setError(problem);
      return;
    }
    const token = ++loadToken.current;
    setError("");
    setLoadingPhoto(true);
    try {
      const preview = await createPreviewPhoto(next);
      if (token !== loadToken.current) return;
      setFile(next);
      setPhoto(preview);
      setName("");
      setThumb(URL.createObjectURL(next));
    } catch (err) {
      console.error(err);
      if (token === loadToken.current) setError("Không đọc được ảnh này.");
    } finally {
      if (token === loadToken.current) setLoadingPhoto(false);
    }
  }

  function removePhoto() {
    if (busy) return;
    loadToken.current++;
    setFile(null);
    setPhoto(null);
    setName("");
    setThumb("");
    setError("");
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    void chooseFile(event.dataTransfer.files[0]);
  }

  function pickCategory(id: string) {
    if (busy) return;
    setCategoryId(id);
    setSelected(new Set());
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(list: Frame[]) {
    if (!file || !exportName || list.length === 0 || busy) return;
    setError("");
    setProgress({ done: 0, total: list.length });
    try {
      await exportFrames({
        file,
        name: exportName,
        frames: list,
        logo: logoSide,
        format,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      flash(list.length === 1 ? "Đã xuất ảnh 3000 × 3000 px." : `Đã xuất ${list.length} ảnh 3000 × 3000 px (ZIP).`);
    } catch (err) {
      console.error(err);
      setError("Không xuất được ảnh. Ảnh quá lớn hoặc trình duyệt thiếu bộ nhớ, hãy thử lại với ít frame hơn.");
    } finally {
      setProgress(null);
    }
  }

  const count = frames.length;
  const gridClass =
    count === 1 ? "mx-auto max-w-sm grid-cols-1" : count === 2 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3";
  const exportLabel = busy
    ? `Đang xuất ${progress.done}/${progress.total}…`
    : isAll
      ? chosen.length === 0
        ? "Chọn frame để xuất"
        : chosen.length === 1
          ? `Xuất 1 frame (${format.toUpperCase()})`
          : `Xuất ${chosen.length} frame (ZIP)`
      : count === 1
        ? `Xuất frame (${format.toUpperCase()})`
        : `Xuất ${count} frame (ZIP)`;

  return (
    <section className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
      <aside className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-24">
        <Section title="Ảnh">
          {!photo ? (
            <label
              onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
                dragOver ? "border-slate-900 bg-slate-50" : "border-slate-300 hover:border-slate-500 hover:bg-slate-50"
              }`}
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white">
                <UploadIcon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-slate-900">{loadingPhoto ? "Đang đọc ảnh…" : "Chọn ảnh"}</span>
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = ""; }}
              />
            </label>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{file?.name}</p>
                <div className="mt-1 flex gap-1.5">
                  <label className={`cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-900 ${busy ? "pointer-events-none opacity-50" : ""}`}>
                    Đổi ảnh
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = ""; }}
                    />
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={removePhoto}
                disabled={busy}
                aria-label="Bỏ ảnh"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </Section>

        <Section title="Tên ảnh">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            maxLength={100}
            placeholder="Nhập tên"
            aria-label="Tên ảnh"
            aria-invalid={!!photo && exportName === ""}
            className={`h-11 w-full rounded-2xl border bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-900 disabled:opacity-60 ${
              photo && exportName === "" ? "border-red-300" : "border-slate-200"
            }`}
          />
        </Section>

        <Section title="Logo">
          <Segmented
            label="Vị trí logo"
            value={logoSide}
            onChange={setLogoSide}
            disabled={busy}
            options={[
              { value: "none", label: "Không logo" },
              { value: "left", label: "Trái" },
              { value: "right", label: "Phải" },
            ]}
          />
        </Section>

        <Section title="Định dạng">
          <Segmented
            label="Định dạng tệp"
            value={format}
            onChange={setFormat}
            disabled={busy}
            options={[
              { value: "jpg", label: "JPG" },
              { value: "png", label: "PNG" },
            ]}
          />
        </Section>
      </aside>

      <div className="min-w-0 space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="mb-3 text-sm font-semibold text-slate-900">Danh mục frame</p>
          <div role="radiogroup" aria-label="Danh mục frame" className="flex flex-wrap gap-2">
            {CATEGORIES.map((item) => {
              const active = item.id === category.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => pickCategory(item.id)}
                  disabled={busy}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${
                    active ? "border-black bg-black text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-900"
                  }`}
                >
                  {item.name}
                  <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {item.frameIds.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Xem trước <span className="font-normal text-slate-500">· {category.name} · {count} frame</span>
              </h2>
              {isAll && (
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                  <span>{selected.size > 0 ? `Đã chọn ${selected.size}/${count}` : ""}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setSelected(selected.size === count ? new Set() : new Set(frames.map((frame) => frame.id)))}
                    className="font-medium text-slate-700 underline-offset-2 hover:text-slate-950 hover:underline disabled:opacity-40"
                  >
                    {selected.size === count ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void run(chosen)}
              disabled={!canExport || chosen.length === 0}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <DownloadIcon className="h-4 w-4" />
              {exportLabel}
            </button>
          </div>

          {busy && (
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
              <div className="h-full rounded-full bg-black transition-all duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          )}

          <p role="status" className={`mb-4 min-h-5 text-xs ${error ? "text-red-600" : "text-slate-500"}`}>
            {error || notice}
          </p>

          <div className={`grid gap-4 ${gridClass}`}>
            {frames.map((frame) => (
              <FramePreview
                key={frame.id}
                frame={frame}
                photo={photo}
                logo={logo}
                selectable={isAll}
                checked={selected.has(frame.id)}
                canExport={canExport}
                onToggle={() => toggle(frame.id)}
                onDownload={() => void run([frame])}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
