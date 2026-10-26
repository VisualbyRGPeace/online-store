"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type RatioPreset = {
  id: string;
  label: string;
  ratio: number;
  usage: string;
};

type CropResult = {
  id: string;
  name: string;
  width: number;
  height: number;
  url: string;
};

const PRESETS: RatioPreset[] = [
  { id: "1-1", label: "1:1", ratio: 1, usage: "Bài vuông · ảnh đại diện" },
  { id: "4-5", label: "4:5", ratio: 4 / 5, usage: "Bài dọc Instagram" },
  { id: "3-4", label: "3:4", ratio: 3 / 4, usage: "Ảnh dọc" },
  { id: "2-3", label: "2:3", ratio: 2 / 3, usage: "Pinterest · poster" },
  { id: "9-16", label: "9:16", ratio: 9 / 16, usage: "Story · Reels · TikTok" },
  { id: "4-3", label: "4:3", ratio: 4 / 3, usage: "Ảnh ngang" },
  { id: "3-2", label: "3:2", ratio: 3 / 2, usage: "Ảnh phong cảnh" },
  { id: "16-9", label: "16:9", ratio: 16 / 9, usage: "Video cover · thumbnail" },
  { id: "191-100", label: "1.91:1", ratio: 1.91, usage: "Bài chia sẻ liên kết" },
  { id: "239-100", label: "2.39:1", ratio: 2.39, usage: "Ảnh panorama" },
  { id: "golden", label: "1:1.618", ratio: 1 / 1.61803398875, usage: "Tỷ lệ vàng dọc" },
  { id: "golden-landscape", label: "1.618:1", ratio: 1.61803398875, usage: "Tỷ lệ vàng ngang" },
];

type Point = { x: number; y: number };
type CropRect = { x: number; y: number; width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function getCropRect(width: number, height: number, ratio: number, zoom: number, center: Point): CropRect {
  const maxWidth = Math.min(width, height * ratio);
  const maxHeight = maxWidth / ratio;
  const cropWidth = maxWidth / zoom;
  const cropHeight = maxHeight / zoom;
  const centerX = clamp(center.x * width, cropWidth / 2, width - cropWidth / 2);
  const centerY = clamp(center.y * height, cropHeight / 2, height - cropHeight / 2);
  return {
    x: centerX - cropWidth / 2,
    y: centerY - cropHeight / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function fileBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-") || "anh";
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, mode: "thirds" | "golden" | "none") {
  if (mode === "none") return;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.82)";
  ctx.lineWidth = 1;
  ctx.shadowColor = "rgba(0,0,0,.5)";
  ctx.shadowBlur = 2;
  const points = mode === "thirds" ? [1 / 3, 2 / 3] : [0.381966, 0.618034];
  for (const p of points) {
    ctx.beginPath();
    ctx.moveTo(width * p, 0);
    ctx.lineTo(width * p, height);
    ctx.moveTo(0, height * p);
    ctx.lineTo(width, height * p);
    ctx.stroke();
  }
  ctx.restore();
}

function makeBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Không xuất được ảnh.")), type, 1);
  });
}

export function ImageCropExpandUtility() {
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [ratioId, setRatioId] = useState(PRESETS[0]!.id);
  const [center, setCenter] = useState<Point>({ x: 0.5, y: 0.5 });
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState<"thirds" | "golden" | "none">("thirds");
  const [selectedRatios, setSelectedRatios] = useState<string[]>(["1-1", "4-5", "9-16"]);
  const [results, setResults] = useState<CropResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previewTick, setPreviewTick] = useState(0);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; center: Point } | null>(null);

  const currentPreset = useMemo(() => PRESETS.find((preset) => preset.id === ratioId) ?? PRESETS[0]!, [ratioId]);
  const selectedPresets = useMemo(() => PRESETS.filter((preset) => selectedRatios.includes(preset.id)), [selectedRatios]);

  useEffect(() => {
    if (!imageUrl) return;
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      setCenter({ x: 0.5, y: 0.5 });
      setZoom(1);
      setPreviewTick((n) => n + 1);
    };
    image.onerror = () => setMessage("Không đọc được ảnh này. Hãy chọn PNG, JPG hoặc WebP.");
    image.src = imageUrl;
    return () => { imageRef.current = null; };
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = canvasWrapRef.current;
    const image = imageRef.current;
    if (!canvas || !wrap || !image || !imageSize) return;

    const render = () => {
      const availableWidth = Math.max(220, wrap.getBoundingClientRect().width);
      const displayWidth = Math.min(availableWidth, 960, 480 * currentPreset.ratio);
      const displayHeight = displayWidth / currentPreset.ratio;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(displayWidth * dpr);
      canvas.height = Math.round(displayHeight * dpr);
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const crop = getCropRect(imageSize.width, imageSize.height, currentPreset.ratio, zoom, center);
      ctx.clearRect(0, 0, displayWidth, displayHeight);
      ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, displayWidth, displayHeight);
      drawGrid(ctx, displayWidth, displayHeight, grid);
    };

    const observer = new ResizeObserver(render);
    observer.observe(wrap);
    render();
    return () => observer.disconnect();
  }, [imageUrl, imageSize, currentPreset, zoom, center, grid, previewTick]);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  useEffect(() => () => {
    results.forEach((item) => URL.revokeObjectURL(item.url));
  }, [results]);

  function chooseFile(next?: File) {
    if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setMessage("Chọn ảnh JPG, PNG hoặc WebP để giữ độ phân giải gốc khi xuất.");
      return;
    }
    if (next.size > 25 * 1024 * 1024) {
      setMessage("Ảnh tối đa 25 MB.");
      return;
    }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    results.forEach((item) => URL.revokeObjectURL(item.url));
    setFile(next);
    setImageUrl(URL.createObjectURL(next));
    setResults([]);
    setMessage("");
  }

  function selectPreset(id: string) {
    setRatioId(id);
    setZoom(1);
    setCenter({ x: 0.5, y: 0.5 });
  }

  function toggleRatio(id: string) {
    setSelectedRatios((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function beginPan(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, center };
  }

  function pan(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas || !imageSize) return;
    const rect = canvas.getBoundingClientRect();
    const crop = getCropRect(imageSize.width, imageSize.height, currentPreset.ratio, zoom, drag.center);
    setCenter({
      x: clamp(drag.center.x - ((event.clientX - drag.x) / rect.width) * crop.width / imageSize.width, 0, 1),
      y: clamp(drag.center.y - ((event.clientY - drag.y) / rect.height) * crop.height / imageSize.height, 0, 1),
    });
  }

  function endPan() {
    dragRef.current = null;
  }

  async function createCrops() {
    const image = imageRef.current;
    if (!file || !image || !imageSize || !selectedPresets.length) {
      setMessage("Chọn ít nhất một tỷ lệ cần cắt.");
      return;
    }
    setBusy(true);
    setMessage("");
    results.forEach((item) => URL.revokeObjectURL(item.url));
    setResults([]);
    try {
      const next: CropResult[] = [];
      for (const preset of selectedPresets) {
        const crop = getCropRect(imageSize.width, imageSize.height, preset.ratio, zoom, center);
        const output = document.createElement("canvas");
        output.width = Math.max(1, Math.round(crop.width));
        output.height = Math.max(1, Math.round(crop.height));
        const ctx = output.getContext("2d");
        if (!ctx) throw new Error("Không thể xử lý ảnh trên trình duyệt.");
        ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, output.width, output.height);
        const blob = await makeBlob(output, file.type);
        const url = URL.createObjectURL(blob);
        const name = `${fileBaseName(file.name)}-${preset.label.replace(/[:.]/g, "-")}.${extensionFor(file.type)}`;
        next.push({ id: preset.id, name, width: output.width, height: output.height, url });
      }
      setResults(next);
      setMessage(`Đã cắt ${next.length} ảnh ở độ phân giải gốc. Chọn Tải ảnh để lưu từng bản.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Chưa cắt được ảnh.");
    } finally {
      setBusy(false);
    }
  }

  function download(url: string, name: string) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="mb-2 text-sm font-medium text-slate-500">Tiện ích</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Cắt ảnh social</h1>
        <p className="mt-2 text-sm text-slate-500">
          Cắt nhiều tỷ lệ cùng lúc, giữ nguyên ảnh gốc và xuất theo số điểm ảnh tối đa của từng vùng cắt.
        </p>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-500 hover:bg-slate-50">
          {file ? "Chọn ảnh khác" : "Tải ảnh lên"}
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        <p className="mt-2 text-center text-xs text-slate-500">JPG, PNG hoặc WebP · tối đa 25 MB · ảnh gốc không bị thay đổi</p>
      </section>

      {file && imageSize && (
        <>
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div ref={canvasWrapRef} className="flex min-h-56 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 p-2">
                <canvas
                  ref={canvasRef}
                  aria-label={`Khung cắt ảnh tỷ lệ ${currentPreset.label}; kéo ảnh để đổi vùng cắt`}
                  className="max-h-[480px] max-w-full cursor-grab touch-none rounded-md shadow-sm active:cursor-grabbing"
                  onPointerDown={beginPan}
                  onPointerMove={pan}
                  onPointerUp={endPan}
                  onPointerCancel={endPan}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  Phóng vùng cắt
                  <input aria-label="Phóng vùng cắt" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
                </label>
                <span className="text-xs text-slate-500">{zoom.toFixed(1)}×</span>
                <select aria-label="Lưới căn ảnh" value={grid} onChange={(event) => setGrid(event.target.value as typeof grid)} className="ml-auto rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="thirds">Lưới 1/3</option>
                  <option value="golden">Lưới tỷ lệ vàng</option>
                  <option value="none">Ẩn lưới</option>
                </select>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Gợi ý: đặt chủ thể gần giao điểm của lưới; để khoảng trống quanh mặt và tránh cắt sát mép.
              </p>
            </div>

            <aside className="space-y-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div>
                <h2 className="font-semibold text-slate-950">Tỷ lệ ảnh</h2>
                <p className="mt-1 text-xs text-slate-500">Chọn khung xem trước, rồi chọn các bản muốn xuất.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((preset) => (
                  <button key={preset.id} type="button" onClick={() => selectPreset(preset.id)} className={`rounded-xl border px-2 py-2 text-sm transition ${ratioId === preset.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 hover:bg-slate-50"}`}>
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="min-h-12 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                <strong className="block text-slate-900">{currentPreset.usage}</strong>
                {Math.round(getCropRect(imageSize.width, imageSize.height, currentPreset.ratio, zoom, center).width)} × {Math.round(getCropRect(imageSize.width, imageSize.height, currentPreset.ratio, zoom, center).height)} px
              </div>
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold">Xuất nhiều tỷ lệ</h3>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((preset) => (
                    <button key={preset.id} type="button" aria-pressed={selectedRatios.includes(preset.id)} onClick={() => toggleRatio(preset.id)} className={`rounded-full px-3 py-1.5 text-xs ${selectedRatios.includes(preset.id) ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>
                      {preset.label}
                    </button>
                  ))}
                </div>
                <button type="button" disabled={busy || !selectedPresets.length} onClick={() => void createCrops()} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? "Đang cắt ảnh…" : `Cắt ${selectedPresets.length} bản`}
                </button>
              </div>
            </aside>
          </section>

          {message && <p role="status" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{message}</p>}

          {results.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-slate-950">Ảnh đã cắt</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((result) => (
                  <article key={result.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <img src={result.url} alt={`Ảnh cắt tỷ lệ ${result.id}`} className="mb-3 max-h-56 w-full rounded-xl bg-slate-50 object-contain" />
                    <p className="font-medium">{result.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{result.width} × {result.height} px · {file?.type === "image/png" ? "PNG lossless" : "xuất ở chất lượng tối đa"}</p>
                    <a href={result.url} download={result.name} className="mt-3 inline-flex rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">Tải ảnh</a>
                  </article>
                ))}
              </div>
            </section>
          )}

        </>
      )}
    </div>
  );
}
