"use client";

import { useEffect, useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from "react";
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import TimelineTrimmer from "./timeline-trimmer";
import { useAuth } from "@/hooks/use-auth";
import { recordGifGeneration } from "@/services/gif-history-service";
import { DownloadIcon, FilmIcon, PauseIcon, PlayIcon, UploadIcon } from "@/components/utilities/tool-icons";

type CropBox = { x: number; y: number; size: number };
type CaptionPosition = { x: number; y: number };
type Edge = "nw" | "ne" | "sw" | "se";
type QualityId = "light" | "balanced" | "sharp";

const LIMIT = 1_000_000;
const MAX_VIDEO_MB = 100;
const MAX_SECONDS = 6;

// [cạnh ảnh (px), khung hình/giây, số màu] — thử lần lượt từ trên xuống đến khi GIF < 1 MB.
const PROFILES = [
  [240, 10, 192], [200, 8, 160], [160, 8, 128], [144, 7, 112], [128, 6, 96],
  [112, 5, 80], [96, 4, 64], [80, 3, 48], [64, 2, 32], [48, 1, 16], [32, 1, 8],
] as const;
type Profile = (typeof PROFILES)[number];

const QUALITIES: { id: QualityId; label: string; start: number }[] = [
  { id: "light", label: "Gọn nhẹ", start: 4 },
  { id: "balanced", label: "Cân bằng", start: 2 },
  { id: "sharp", label: "Nét", start: 0 },
];

const CAPTION_SPOTS: { label: string; y: number }[] = [
  { label: "Trên", y: 0.16 },
  { label: "Giữa", y: 0.5 },
  { label: "Dưới", y: 0.84 },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function formatTime(value: number) {
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = (value % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${seconds}`;
}

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    let timer = 0;
    const clean = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => { clean(); resolve(); };
    const onError = () => { clean(); reject(new Error("Không đọc được video.")); };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    // Phòng trường hợp trình duyệt không bắn sự kiện "seeked" thì không bị treo mãi.
    timer = window.setTimeout(() => { clean(); resolve(); }, 4000);
    if (!video.seeking && Math.abs(video.currentTime - time) < 0.001) { clean(); resolve(); return; }
    video.currentTime = time;
  });
}

function loadVideo(src: string) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.addEventListener("loadeddata", () => resolve(video), { once: true });
    video.addEventListener("error", () => reject(new Error("Không đọc được video.")), { once: true });
    video.src = src;
  });
}

function releaseVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  video.load();
}

async function makeFilmstrip(src: string, duration: number, isCancelled: () => boolean) {
  const video = await loadVideo(src);
  try {
    const count = 16;
    const thumb = 64;
    const canvas = document.createElement("canvas");
    canvas.width = count * thumb;
    canvas.height = thumb;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    for (let i = 0; i < count; i++) {
      if (isCancelled()) return "";
      await seek(video, clamp(duration * ((i + 0.5) / count), 0, Math.max(0, duration - 0.05)));
      ctx.drawImage(video, sx, sy, side, side, i * thumb, 0, thumb, thumb);
    }
    return canvas.toDataURL("image/jpeg", 0.7);
  } finally {
    releaseVideo(video);
  }
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, size: number, position: CaptionPosition, fontPercent: number) {
  if (!text.trim()) return;
  ctx.save();
  const font = Math.max(5, Math.round(size * fontPercent / 100));
  ctx.font = `bold ${font}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, size * 0.012);
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#fff";
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    const next = line ? line + " " + word : word;
    if (line && ctx.measureText(next).width > size * 0.9) {
      lines.push(line);
      line = word;
      if (lines.length === 2) break;
    } else line = next;
  }
  if (line && lines.length < 3) lines.push(line);
  const step = font * 1.15;
  const centerX = position.x * size;
  const centerY = position.y * size;
  lines.forEach((item, i) => {
    const y = centerY + (i - (lines.length - 1) / 2) * step;
    ctx.strokeText(item, centerX, y, size * 0.92);
    ctx.fillText(item, centerX, y, size * 0.92);
  });
  ctx.restore();
}

function encode(frames: ImageData[], profile: Profile, seconds: number) {
  const [size, fps, colors] = profile;
  const count = Math.max(1, Math.min(frames.length, Math.ceil(seconds * fps)));
  const chosen = Array.from({ length: count }, (_, i) =>
    frames[Math.round(i * (frames.length - 1) / Math.max(1, count - 1))]!,
  );
  const sample: number[] = [];
  chosen.forEach((frame, fi) => {
    if (fi % Math.max(1, Math.floor(chosen.length / 6))) return;
    const step = Math.max(4, Math.floor(frame.data.length / 1600 / 4) * 4);
    for (let i = 0; i < frame.data.length; i += step) {
      sample.push(frame.data[i]!, frame.data[i + 1]!, frame.data[i + 2]!, frame.data[i + 3]!);
    }
  });
  const palette = quantize(new Uint8Array(sample), colors, { format: "rgb565" });
  const gif = GIFEncoder();
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  const source = document.createElement("canvas");
  const sourceCtx = source.getContext("2d")!;
  chosen.forEach((frame, i) => {
    source.width = source.height = frame.width;
    sourceCtx.putImageData(frame, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(source, 0, 0, size, size);
    gif.writeFrame(applyPalette(ctx.getImageData(0, 0, size, size).data, palette), size, size, {
      palette, delay: Math.max(20, Math.round(1000 / fps)), repeat: i === 0 ? 0 : undefined,
    });
  });
  gif.finish();
  const bytes = gif.bytes();
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "image/gif" });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="font-semibold leading-7 text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function VideoToGifUtility() {
  const stageRef = useRef<HTMLDivElement>(null);
  const stageVideoRef = useRef<HTMLVideoElement>(null);
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const cropDrag = useRef<{ mode: "move" | "resize"; edge: Edge; x: number; y: number; box: CropBox } | null>(null);
  const captionDragging = useRef(false);

  const [source, setSource] = useState("");
  const [gif, setGif] = useState("");
  const [name, setName] = useState("video");
  const [sourceName, setSourceName] = useState("");
  const [dimensions, setDimensions] = useState<[number, number] | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0, y: 0, size: 1 });
  const [filmstripState, setFilmstripState] = useState({ key: "", url: "" });
  const [start, setStart] = useState(0);
  const [seconds, setSeconds] = useState(3);
  const [caption, setCaption] = useState("");
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>({ x: 0.5, y: 0.84 });
  const [captionSize, setCaptionSize] = useState(9);
  const [quality, setQuality] = useState<QualityId>("balanced");
  const [bytes, setBytes] = useState(0);
  const [qualityLabel, setQualityLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, text: "" });
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [historyWarning, setHistoryWarning] = useState("");
  const [error, setError] = useState("");
  const { user, loading: authLoading } = useAuth();

  const maxSeconds = Math.max(0.1, Math.min(MAX_SECONDS, videoDuration || MAX_SECONDS));
  const minSeconds = Math.min(3, maxSeconds);
  const ready = Boolean(source && dimensions);
  const filmstrip = filmstripState.key === `${source}|${videoDuration}` ? filmstripState.url : "";

  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  useEffect(() => () => { if (gif) URL.revokeObjectURL(gif); }, [gif]);

  // Tạo dải ảnh khung hình cho timeline.
  useEffect(() => {
    if (!source || !videoDuration) return;
    let cancelled = false;
    const key = `${source}|${videoDuration}`;
    makeFilmstrip(source, videoDuration, () => cancelled)
      .then((url) => { if (!cancelled) setFilmstripState({ key, url }); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [source, videoDuration]);

  // Phát thử đoạn đã cắt, lặp lại liên tục.
  useEffect(() => {
    if (!previewPlaying) return;
    const video = stageVideoRef.current;
    if (!video) return;
    let raf = 0;
    let reported = -1;
    const tick = () => {
      if (video.currentTime >= start + seconds - 0.04 || video.currentTime < start - 0.3) video.currentTime = start;
      if (Math.abs(video.currentTime - reported) > 0.05) {
        reported = video.currentTime;
        setPlayhead(video.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [previewPlaying, start, seconds]);

  function stopPreview() {
    stageVideoRef.current?.pause();
    setPreviewPlaying(false);
  }

  async function togglePreview() {
    const video = stageVideoRef.current;
    if (!video) return;
    if (previewPlaying) { stopPreview(); return; }
    if (video.currentTime < start || video.currentTime >= start + seconds - 0.05) video.currentTime = start;
    try {
      await video.play();
      setPreviewPlaying(true);
    } catch {
      setError("Trình duyệt không thể phát video xem thử.");
    }
  }

  function scrubPreview(time: number) {
    const video = stageVideoRef.current;
    if (!video || !videoDuration) return;
    stopPreview();
    const target = clamp(time, 0, videoDuration - 0.02);
    if (Math.abs(video.currentTime - target) > 0.04) video.currentTime = target;
  }

  function chooseFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("video/")) { setError("Chọn tệp video hợp lệ (MP4, MOV, WebM…)."); return; }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) { setError(`Video tối đa ${MAX_VIDEO_MB} MB.`); return; }
    setError(""); setHistoryWarning(""); setGif(""); setDimensions(null); setVideoDuration(0);
    setPreviewPlaying(false); setStart(0); setCaption("");
    setSourceName(file.name);
    setName(file.name.replace(/\.[^.]+$/, "") || "video");
    setSource(URL.createObjectURL(file));
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    chooseFile(event.dataTransfer.files[0]);
  }

  function onMetadata() {
    const video = stageVideoRef.current;
    if (!video) return;
    if (!Number.isFinite(video.duration) || !video.videoWidth) {
      setError("Không xác định được thời lượng hoặc kích thước video này.");
      return;
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    const short = Math.min(width, height);
    setDimensions([width, height]);
    setVideoDuration(video.duration);
    setSeconds(Math.min(3, MAX_SECONDS, video.duration));
    setStart(0);
    setCropBox({ x: (width - short) / 2 / width, y: (height - short) / 2 / height, size: 1 });
  }

  function fitCrop(size: number) {
    if (!dimensions) return;
    const [width, height] = dimensions;
    const short = Math.min(width, height);
    const side = short * size;
    setCropBox({ x: (width - side) / 2 / width, y: (height - side) / 2 / height, size });
  }

  function beginCrop(event: PointerEvent<HTMLElement>, mode: "move" | "resize", edge: Edge = "se") {
    event.preventDefault();
    stageRef.current?.setPointerCapture(event.pointerId);
    cropDrag.current = { mode, edge, x: event.clientX, y: event.clientY, box: cropBox };
  }

  function moveCrop(event: PointerEvent<HTMLDivElement>) {
    const drag = cropDrag.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!drag || !rect || !dimensions) return;
    const [width, height] = dimensions;
    const short = Math.min(width, height);
    if (drag.mode === "move") {
      const side = short * drag.box.size;
      const left = drag.box.x * width + (event.clientX - drag.x) / rect.width * width;
      const top = drag.box.y * height + (event.clientY - drag.y) / rect.height * height;
      setCropBox({
        ...drag.box,
        x: clamp(left, 0, width - side) / width,
        y: clamp(top, 0, height - side) / height,
      });
      return;
    }
    const west = drag.edge.includes("w");
    const north = drag.edge.includes("n");
    const left = drag.box.x * width;
    const top = drag.box.y * height;
    const oldSide = short * drag.box.size;
    const anchorX = west ? left + oldSide : left;
    const anchorY = north ? top + oldSide : top;
    const dx = (event.clientX - drag.x) / rect.width * width;
    const dy = (event.clientY - drag.y) / rect.height * height;
    const sideDelta = ((west ? -dx : dx) + (north ? -dy : dy)) / 2;
    const maxSide = Math.min(short, west ? anchorX : width - anchorX, north ? anchorY : height - anchorY);
    const nextSide = clamp(oldSide + sideDelta, short * 0.2, maxSide);
    setCropBox({
      x: (west ? anchorX - nextSide : anchorX) / width,
      y: (north ? anchorY - nextSide : anchorY) / height,
      size: nextSide / short,
    });
  }

  function endCrop() {
    cropDrag.current = null;
  }

  function beginCaptionDrag(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    captionDragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveCaption(event: PointerEvent<HTMLDivElement>) {
    if (!captionDragging.current) return;
    const frame = cropFrameRef.current?.getBoundingClientRect();
    if (!frame) return;
    setCaptionPosition({
      x: clamp((event.clientX - frame.left) / frame.width, 0.04, 0.96),
      y: clamp((event.clientY - frame.top) / frame.height, 0.04, 0.96),
    });
  }

  function endCaptionDrag() {
    captionDragging.current = false;
  }

  async function createGif() {
    if (authLoading || busy || !dimensions) return;
    stopPreview();
    setBusy(true); setError(""); setHistoryWarning(""); setGif("");
    setProgress({ pct: 2, text: "Đọc video…" });
    const [width, height] = dimensions;
    const side = Math.min(width, height) * cropBox.size;
    const sx = cropBox.x * width;
    const sy = cropBox.y * height;
    const length = Math.min(MAX_SECONDS, seconds, Math.max(0.2, videoDuration - start));
    const startIndex = QUALITIES.find((item) => item.id === quality)?.start ?? 2;
    const [captureSize, captureFps] = PROFILES[startIndex]!;
    const total = Math.max(2, Math.ceil(length * captureFps));
    let video: HTMLVideoElement | null = null;
    try {
      // Dùng một video riêng (không hiển thị) để việc đọc khung hình không làm giật phần xem thử.
      video = await loadVideo(source);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = captureSize;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const frames: ImageData[] = [];
      for (let i = 0; i < total; i++) {
        await seek(video, clamp(start + i / total * length, 0, Math.max(0, videoDuration - 0.05)));
        ctx.clearRect(0, 0, captureSize, captureSize);
        ctx.drawImage(video, sx, sy, side, side, 0, 0, captureSize, captureSize);
        drawCaption(ctx, caption, captureSize, captionPosition, captionSize);
        frames.push(ctx.getImageData(0, 0, captureSize, captureSize));
        setProgress({ pct: 5 + ((i + 1) / total) * 55, text: `Đọc khung hình ${i + 1}/${total}…` });
      }
      let result: Blob | undefined;
      let resultQuality = "";
      for (let i = startIndex; i < PROFILES.length; i++) {
        setProgress({ pct: 60 + ((i - startIndex + 1) / (PROFILES.length - startIndex)) * 38, text: "Nén GIF xuống dưới 1 MB…" });
        await pause(16);
        const profile = PROFILES[i]!;
        const candidate = encode(frames, profile, length);
        if (candidate.size <= LIMIT) {
          result = candidate;
          resultQuality = `${profile[0]}px · ${profile[1]} khung/giây`;
          break;
        }
      }
      if (!result) throw new Error("Đoạn video quá nặng để tạo GIF.");
      setBytes(result.size);
      setQualityLabel(resultQuality);
      setGif(URL.createObjectURL(result));
      setProgress({ pct: 100, text: "Hoàn tất" });
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
      if (user) {
        try {
          await recordGifGeneration(user.id, {
            source_filename: sourceName || name,
            gif_filename: `${name}.gif`,
            duration_seconds: length,
            output_size_bytes: result.size,
            output_quality: resultQuality,
            caption,
          }, result);
        } catch (historyError) {
          console.error(historyError);
          setHistoryWarning("GIF đã tạo nhưng chưa lưu được lịch sử.");
        }
      } else {
        setHistoryWarning("GIF đã tạo.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tạo GIF từ video này.");
    } finally {
      if (video) releaseVideo(video);
      setBusy(false);
      setProgress({ pct: 0, text: "" });
    }
  }

  const cropSide = dimensions ? Math.min(dimensions[0], dimensions[1]) * cropBox.size : 0;
  const pill = "rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="min-w-0 space-y-6">
        <Section
         
          title="Chọn video & vùng cắt"
          MB.`}
        >
          {!source && (
            <label
              onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex min-h-52 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition ${dragOver ? "border-slate-900 bg-slate-50" : "border-slate-300 hover:border-slate-500 hover:bg-slate-50"}`}
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white"><UploadIcon className="h-6 w-6" /></span>
              <span className="font-semibold text-slate-900">Chọn video</span>
              <input className="sr-only" type="file" accept="video/*" onChange={(event) => chooseFile(event.target.files?.[0])} />
            </label>
          )}

          {source && (
            <>
              <div
                ref={stageRef}
                className="relative mx-auto w-full max-w-[640px] touch-none select-none overflow-hidden rounded-2xl bg-slate-950"
                style={{ aspectRatio: dimensions ? `${dimensions[0]} / ${dimensions[1]}` : "16 / 9" }}
                onPointerMove={moveCrop}
                onPointerUp={endCrop}
                onPointerCancel={endCrop}
              >
                <video
                  ref={stageVideoRef}
                  src={source}
                  muted
                  playsInline
                  preload="auto"
                  onLoadedMetadata={onMetadata}
                  onPlay={() => setPreviewPlaying(true)}
                  onPause={(event) => { if (!event.currentTarget.ended) setPreviewPlaying(false); }}
                  onEnded={(event) => {
                    event.currentTarget.currentTime = start;
                    void event.currentTarget.play().catch(() => undefined);
                  }}
                  onError={() => setError("Trình duyệt không đọc được video này.")}
                  className="absolute inset-0 h-full w-full object-fill"
                />
                {dimensions && (
                  <div
                    ref={cropFrameRef}
                    className="absolute cursor-move touch-none border-2 border-white shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)]"
                    style={{
                      left: `${cropBox.x * 100}%`,
                      top: `${cropBox.y * 100}%`,
                      width: `${cropSide / dimensions[0] * 100}%`,
                      height: `${cropSide / dimensions[1] * 100}%`,
                      containerType: "inline-size",
                    }}
                    onPointerDown={(event) => beginCrop(event, "move")}
                  >
                    <div className="pointer-events-none absolute inset-0">
                      <span className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
                      <span className="absolute inset-y-0 left-2/3 w-px bg-white/35" />
                      <span className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
                      <span className="absolute inset-x-0 top-2/3 h-px bg-white/35" />
                    </div>
                    {caption && (
                      <div
                        className="absolute z-20 max-w-[90%] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none whitespace-pre-wrap text-center font-bold leading-tight text-white [text-shadow:0_2px_5px_#000,1px_1px_3px_#000] active:cursor-grabbing"
                        style={{ left: `${captionPosition.x * 100}%`, top: `${captionPosition.y * 100}%`, fontSize: `${captionSize}cqw`, WebkitTextStroke: "0.6px #000" }}
                        onPointerDown={beginCaptionDrag}
                        onPointerMove={moveCaption}
                        onPointerUp={endCaptionDrag}
                        onPointerCancel={endCaptionDrag}
                      >
                        {caption}
                      </div>
                    )}
                    {(["nw", "ne", "sw", "se"] as const).map((edge) => (
                      <span
                        key={edge}
                        data-edge={edge}
                        onPointerDown={(event) => { event.stopPropagation(); beginCrop(event, "resize", edge); }}
                        className={`absolute grid h-8 w-8 place-items-center ${edge.includes("n") ? "-top-4" : "-bottom-4"} ${edge.includes("w") ? "-left-4" : "-right-4"} ${edge === "nw" || edge === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`}
                      >
                        <span className="h-3.5 w-3.5 rounded-sm border border-slate-500 bg-white shadow" />
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => fitCrop(1)} disabled={!dimensions} className={pill}>Vừa khung</button>
                <button type="button" onClick={() => fitCrop(0.7)} disabled={!dimensions} className={pill}>Thu nhỏ vùng cắt</button>
                <span className="mx-1 hidden h-4 w-px bg-slate-200 sm:block" />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{sourceName}</span>
                <label className={`${pill} cursor-pointer`}>
                  Đổi video
                  <input className="sr-only" type="file" accept="video/*" onChange={(event) => chooseFile(event.target.files?.[0])} />
                </label>
              </div>
            </>
          )}
        </Section>

        {ready && (
          <Section title="Chọn đoạn cần cắt">
            <TimelineTrimmer
              videoDuration={videoDuration}
              start={start}
              seconds={seconds}
              minSeconds={minSeconds}
              maxSeconds={maxSeconds}
              filmstrip={filmstrip}
              playhead={previewPlaying ? playhead : undefined}
              onScrub={scrubPreview}
              onChange={({ start: nextStart, seconds: nextSeconds }) => {
                setStart(nextStart);
                setSeconds(nextSeconds);
              }}
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void togglePreview()}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-black px-5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                {previewPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                {previewPlaying ? "Dừng xem thử" : "Xem thử đoạn cắt"}
              </button>
              <span className="text-sm tabular-nums text-slate-600">
                {formatTime(start)} → {formatTime(start + seconds)}
              </span>
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                Thời lượng
                <input
                  type="number"
                  min={minSeconds}
                  max={maxSeconds}
                  step="0.1"
                  value={seconds.toFixed(1)}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (!Number.isFinite(parsed)) return;
                    const next = clamp(parsed, minSeconds, maxSeconds);
                    setSeconds(next);
                    setStart((current) => Math.min(current, Math.max(0, videoDuration - next)));
                  }}
                  className="h-10 w-20 rounded-lg border border-slate-200 bg-white px-2 text-center outline-none focus:border-slate-500"
                />
                giây
              </label>
            </div>
          </Section>
        )}

        {ready && (
          <Section title="Chèn chữ & tạo GIF">
            <div className="space-y-5">
              <div>
                <label htmlFor="gif-caption" className="mb-2 block text-sm font-medium text-slate-800">Chữ trên GIF</label>
                <input
                  id="gif-caption"
                  value={caption}
                  maxLength={80}
                  onChange={(event) => setCaption(event.target.value)}
                                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
                />
                {caption && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
                    <label className="flex items-center gap-3 text-sm text-slate-600">
                      Cỡ chữ
                      <input className="w-36 accent-black" type="range" min="4" max="22" step="1" value={captionSize} onChange={(event) => setCaptionSize(Number(event.target.value))} />
                    </label>
                    <div className="flex items-center gap-1.5">
                      {CAPTION_SPOTS.map((spot) => (
                        <button key={spot.label} type="button" onClick={() => setCaptionPosition({ x: 0.5, y: spot.y })} className={pill}>{spot.label}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-800">Chất lượng</p>
                <div role="radiogroup" aria-label="Chất lượng GIF" className="grid grid-cols-3 gap-2">
                  {QUALITIES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={quality === item.id}
                      onClick={() => setQuality(item.id)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${quality === item.id ? "border-slate-900 bg-slate-950 text-white" : "border-slate-200 hover:border-slate-400"}`}
                    >
                      <span className="block text-sm font-semibold">{item.label}</span>
                    </button>
                  ))}
                </div>
                  </div>

              <div>
                <button
                  type="button"
                  onClick={() => void createGif()}
                  disabled={busy || authLoading}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-black px-6 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60 sm:w-auto"
                >
                  <FilmIcon className="h-5 w-5" />
                  {authLoading ? "Đang tải…" : busy ? "Đang tạo GIF…" : "Tạo GIF"}
                </button>
                {busy && (
                  <div className="mt-4" role="status" aria-live="polite">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-black transition-[width] duration-300" style={{ width: `${progress.pct}%` }} />
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{progress.text}</p>
                  </div>
                )}
              </div>
            </div>
          </Section>
        )}

        {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      </div>

      <aside className="space-y-6 lg:sticky lg:top-24">
        <section ref={resultRef} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-slate-950">GIF của bạn</h2>
          {gif ? (
            <div className="fade-up">
              <img src={gif} alt="GIF đã tạo" className="mt-4 aspect-square w-full rounded-2xl bg-slate-100 object-contain" />
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                  <span>{(bytes / 1024).toFixed(0)} KB · {qualityLabel}</span>
                  <span>Giới hạn 976 KB</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-black" style={{ width: `${Math.min(100, bytes / LIMIT * 100)}%` }} />
                </div>
              </div>
              <a href={gif} download={`${name}.gif`} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-slate-700">
                <DownloadIcon className="h-4 w-4" /> Tải GIF
              </a>
              {historyWarning && <p role="status" className="mt-3 text-xs text-slate-500">{historyWarning}</p>}
            </div>
          ) : (
            <div className="mt-4 grid aspect-square place-items-center rounded-2xl bg-slate-50 px-6 text-center text-sm text-slate-400">
              {busy ? "Đang tạo GIF…" : "GIF sau khi tạo sẽ hiện ở đây"}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
