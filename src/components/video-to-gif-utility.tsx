"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { applyPalette, GIFEncoder, quantize } from "gifenc";

type CropBox = { x: number; y: number; size: number };
type CaptionPosition = { x: number; y: number };

const LIMIT = 1_000_000;
const PROFILES = [
  [160, 8, 128], [144, 7, 112], [128, 6, 96], [112, 5, 80],
  [96, 4, 64], [80, 3, 48], [64, 2, 32], [48, 1, 16], [32, 1, 8],
] as const;

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => { clean(); resolve(); };
    const fail = () => { clean(); reject(new Error("Không đọc được video.")); };
    const clean = () => { video.removeEventListener("seeked", done); video.removeEventListener("error", fail); };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.currentTime = time;
    if (!video.seeking && Math.abs(video.currentTime - time) < 0.01) done();
  });
}

async function makeFilmstrip(src: string, duration: number) {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  const loaded = new Promise<void>((resolve, reject) => {
    video.addEventListener("loadeddata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("Không thể tạo khung xem trước.")), { once: true });
  });
  video.src = src;
  await loaded;
  const count = 14;
  const thumbWidth = 64;
  const thumbHeight = 54;
  const canvas = document.createElement("canvas");
  canvas.width = count * thumbWidth;
  canvas.height = thumbHeight;
  const ctx = canvas.getContext("2d")!;
  for (let i = 0; i < count; i++) {
    await seek(video, Math.min(Math.max(0, duration - 0.05), duration * (i / count)));
    ctx.drawImage(video, i * thumbWidth, 0, thumbWidth, thumbHeight);
  }
  const result = canvas.toDataURL("image/jpeg", 0.72);
  video.pause();
  video.removeAttribute("src");
  video.load();
  return result;
}
function drawCaption(ctx: CanvasRenderingContext2D, text: string, size: number, position: { x: number; y: number }, fontPercent: number) {
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

function encode(frames: ImageData[], profile: (typeof PROFILES)[number], seconds: number) {
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
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  chosen.forEach((frame, i) => {
    const source = document.createElement("canvas");
    source.width = source.height = frame.width;
    source.getContext("2d")!.putImageData(frame, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(source, 0, 0, size, size);
    gif.writeFrame(applyPalette(ctx.getImageData(0, 0, size, size).data, palette), size, size, {
      palette, delay: Math.max(100, Math.round(1000 / fps)), repeat: i === 0 ? 0 : undefined,
    });
  });
  gif.finish();
  const bytes = gif.bytes();
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "image/gif" });
}

export function VideoToGifUtility() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineDrag = useRef<{ mode: "start" | "end" | "move"; x: number; start: number } | null>(null);
  const cropDrag = useRef<{ mode: "move" | "resize"; edge: "nw" | "ne" | "sw" | "se"; x: number; y: number; box: CropBox } | null>(null);
  const [source, setSource] = useState("");
  const [gif, setGif] = useState("");
  const [name, setName] = useState("video");
  const [dimensions, setDimensions] = useState<[number, number] | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0.15, y: 0.15, size: 0.7 });
  const [filmstrip, setFilmstrip] = useState("");
  const [start, setStart] = useState(0);
  const [seconds, setSeconds] = useState(3);
  const [caption, setCaption] = useState("");
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>({ x: 0.5, y: 0.84 });
  const [captionSize, setCaptionSize] = useState(9);
  const [bytes, setBytes] = useState(0);
  const [quality, setQuality] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const maxSeconds = Math.max(0.1, Math.min(6, videoDuration || 6));
  const minSeconds = Math.min(0.5, maxSeconds);

  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  useEffect(() => () => { if (gif) URL.revokeObjectURL(gif); }, [gif]);

  function chooseFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("video/")) { setError("Chọn tệp video hợp lệ."); return; }
    if (file.size > 100 * 1024 * 1024) { setError("Video tối đa 100 MB."); return; }
    setError(""); setGif(""); setDimensions(null);
    setName(file.name.replace(/\.[^.]+$/, "") || "video");
    setSource(URL.createObjectURL(file));
  }

  function onMetadata() {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    setDimensions([video.videoWidth, video.videoHeight]);
    setVideoDuration(video.duration);
    setSeconds(Math.min(3, 6, video.duration));
    setStart(0);
  }

  function formatTime(value: number) {
    const minutes = Math.floor(value / 60).toString().padStart(2, "0");
    const seconds = (value % 60).toFixed(1).padStart(4, "0");
    return `${minutes}:${seconds}`;
  }

  function scrubPreview(clientX: number) {
    const track = timelineRef.current;
    const preview = previewVideoRef.current;
    if (!track || !preview || !videoDuration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    preview.pause();
    const target = Math.min(videoDuration - 0.02, ratio * videoDuration);
    if (Math.abs(preview.currentTime - target) > 0.04) preview.currentTime = target;
  }

  function beginTimeline(event: PointerEvent<HTMLDivElement | HTMLButtonElement>, mode: "start" | "end" | "move") {
    timelineRef.current?.setPointerCapture(event.pointerId);
    scrubPreview(event.clientX);
    timelineDrag.current = { mode, x: event.clientX, start };
  }

  function moveTimeline(event: PointerEvent<HTMLDivElement>) {
    const drag = timelineDrag.current;
    const track = timelineRef.current;
    if (!drag || !track || !videoDuration) return;
    scrubPreview(event.clientX);
    const rect = track.getBoundingClientRect();
    const delta = (event.clientX - drag.x) / rect.width * videoDuration;
    if (drag.mode === "move") {
      setStart(Math.min(Math.max(0, drag.start + delta), Math.max(0, videoDuration - seconds)));
    } else if (drag.mode === "start") {
      const nextStart = Math.max(0, Math.min(videoDuration - 0.5, (event.clientX - rect.left) / rect.width * videoDuration));
      setStart(Math.min(nextStart, Math.max(0, videoDuration - seconds)));
    } else {
      const end = (event.clientX - rect.left) / rect.width * videoDuration;
      setSeconds(Math.max(minSeconds, Math.min(maxSeconds, videoDuration - start, end - start)));
    }
  }

  function endTimeline() {
    timelineDrag.current = null;
  }

  function beginCrop(event: PointerEvent<HTMLDivElement | HTMLSpanElement>, mode: "move" | "resize", edge: "nw" | "ne" | "sw" | "se" = "se") {
    event.preventDefault();
    previewRef.current?.setPointerCapture(event.pointerId);
    cropDrag.current = { mode, edge, x: event.clientX, y: event.clientY, box: cropBox };
  }

  function moveCrop(event: PointerEvent<HTMLDivElement>) {
    const drag = cropDrag.current;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!drag || !rect || !dimensions) return;
    const [width, height] = dimensions;
    const short = Math.min(width, height);
    if (drag.mode === "move") {
      const side = short * drag.box.size;
      const left = drag.box.x * width + (event.clientX - drag.x) / rect.width * width;
      const top = drag.box.y * height + (event.clientY - drag.y) / rect.height * height;
      setCropBox({
        ...drag.box,
        x: Math.max(0, Math.min(width - side, left)) / width,
        y: Math.max(0, Math.min(height - side, top)) / height,
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
    const nextSide = Math.max(short * 0.2, Math.min(maxSide, oldSide + sideDelta));
    const nextLeft = west ? anchorX - nextSide : anchorX;
    const nextTop = north ? anchorY - nextSide : anchorY;
    setCropBox({ x: nextLeft / width, y: nextTop / height, size: nextSide / short });
  }

  function endCrop() {
    cropDrag.current = null;
  }

  function beginCaptionDrag(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveCaption(event: PointerEvent<HTMLDivElement>) {
    const frame = cropFrameRef.current?.getBoundingClientRect();
    if (!frame) return;
    setCaptionPosition({
      x: Math.max(0.04, Math.min(0.96, (event.clientX - frame.left) / frame.width)),
      y: Math.max(0.04, Math.min(0.96, (event.clientY - frame.top) / frame.height)),
    });
  }

  async function createGif() {
    const video = videoRef.current;
    if (!video || !dimensions) return;
    setBusy(true); setError(""); setStatus("Đọc video…"); setGif("");
    const previousTime = video.currentTime;
    const [width, height] = dimensions;
    const side = Math.min(width, height) * cropBox.size;
    const sx = cropBox.x * width;
    const sy = cropBox.y * height;
    const length = Math.min(6, seconds, Math.max(0.2, videoDuration - start));
    const total = Math.max(2, Math.ceil(length * 8));
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 160;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const frames: ImageData[] = [];
      for (let i = 0; i < total; i++) {
        await seek(video, Math.min(videoDuration - 0.01, start + i / total * length));
        ctx.clearRect(0, 0, 160, 160);
        ctx.drawImage(video, sx, sy, side, side, 0, 0, 160, 160);
        drawCaption(ctx, caption, 160, captionPosition, captionSize);
        frames.push(ctx.getImageData(0, 0, 160, 160));
        setStatus(`Đọc khung hình ${i + 1}/${total}…`);
      }
      let result: Blob | undefined;
      for (let i = 0; i < PROFILES.length; i++) {
        setStatus(`Tối ưu dung lượng ${i + 1}/${PROFILES.length}…`);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        const profile = PROFILES[i]!;
        const candidate = encode(frames, profile, length);
        if (candidate.size <= LIMIT) {
          result = candidate;
          setQuality(`${profile[0]}px · ${profile[1]} khung/giây`);
          break;
        }
      }
      if (!result) throw new Error("Video vẫn quá nặng. Hãy chọn đoạn ngắn hơn.");
      setBytes(result.size);
      setGif(URL.createObjectURL(result));
      setStatus("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tạo GIF từ video này.");
      setStatus("");
    } finally {
      try { await seek(video, previousTime); } catch { /* bỏ qua nếu video đã bị thay */ }
      setBusy(false);
    }
  }

  const horizontal = !dimensions || dimensions[0] >= dimensions[1];
  const maxLength = Math.max(0.5, Math.min(6, videoDuration || 6));
  const maxStart = Math.max(0, videoDuration - seconds);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7">
        <p className="mb-2 text-sm font-medium text-slate-500">Tiện ích</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Chuyển video thành GIF</h1>
        <p className="mt-2 text-sm text-slate-500">Cắt khung vuông, chèn chữ và nén GIF dưới 1 MB.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <label className="mb-5 flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:border-slate-500 hover:bg-slate-50">
            {source ? "Chọn video khác" : "Tải video lên"}
            <input className="sr-only" type="file" accept="video/*" onChange={e => chooseFile(e.target.files?.[0])} />
          </label>
          {source && <>
            <video ref={videoRef} src={source} onLoadedMetadata={onMetadata} className="hidden" playsInline />
            <div
              ref={previewRef}
              className="relative mx-auto w-full max-w-[560px] touch-none overflow-hidden rounded-2xl bg-slate-950"
              style={{ aspectRatio: dimensions ? `${dimensions[0]} / ${dimensions[1]}` : "16 / 9" }}
              onPointerMove={moveCrop}
              onPointerUp={endCrop}
              onPointerCancel={endCrop}
            >
              <video ref={previewVideoRef} src={source} muted playsInline loop autoPlay className="absolute inset-0 h-full w-full object-fill" />
              {dimensions && (() => {
                const side = Math.min(dimensions[0], dimensions[1]) * cropBox.size;
                const handles = (["nw", "ne", "sw", "se"] as const);
                return (
                  <div
                    ref={cropFrameRef}
                    className="absolute touch-none border-2 border-white bg-[linear-gradient(to_right,transparent_33%,rgba(255,255,255,.4)_33%,rgba(255,255,255,.4)_34%,transparent_34%,transparent_66%,rgba(255,255,255,.4)_66%,rgba(255,255,255,.4)_67%,transparent_67%),linear-gradient(to_bottom,transparent_33%,rgba(255,255,255,.4)_33%,rgba(255,255,255,.4)_34%,transparent_34%,transparent_66%,rgba(255,255,255,.4)_66%,rgba(255,255,255,.4)_67%,transparent_67%)] shadow-[0_0_0_100vmax_rgba(15,23,42,0.32)]"
                    style={{ left: `${cropBox.x * 100}%`, top: `${cropBox.y * 100}%`, width: `${side / dimensions[0] * 100}%`, height: `${side / dimensions[1] * 100}%` }}
                    onPointerDown={event => beginCrop(event, "move")}
                  >
                    {caption && (
                      <div
                        className="absolute z-20 max-w-[90%] touch-none -translate-x-1/2 -translate-y-1/2 cursor-move select-none whitespace-pre-wrap text-center font-bold leading-tight text-white [text-shadow:0_2px_5px_#000,1px_1px_3px_#000]"
                        style={{ left: `${captionPosition.x * 100}%`, top: `${captionPosition.y * 100}%`, fontSize: `${Math.max(12, (cropFrameRef.current?.clientWidth || 160) * captionSize / 100)}px`, WebkitTextStroke: "0.6px #000" }}
                        onPointerDown={beginCaptionDrag}
                        onPointerMove={moveCaption}
                      >
                        {caption}
                      </div>
                    )}
                    {handles.map(edge => (
                      <span
                        key={edge}
                        data-edge={edge}
                        onPointerDown={event => { event.stopPropagation(); beginCrop(event, "resize", edge); }}
                        className={`absolute h-3 w-3 rounded-sm border border-slate-400 bg-white shadow ${edge.includes("n") ? "-top-1.5" : "-bottom-1.5"} ${edge.includes("w") ? "-left-1.5" : "-right-1.5"} ${edge === "nw" ? "cursor-nwse-resize" : edge === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
            {dimensions && <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm font-medium text-slate-800">
                  <span>Đoạn video</span><span className="text-xs text-slate-500">{seconds.toFixed(1)} giây</span>
                </div>
                <div
                  ref={timelineRef}
                  className="relative h-[76px] select-none touch-none overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-inner"
                  onPointerMove={moveTimeline}
                  onPointerUp={endTimeline}
                  onPointerCancel={endTimeline}
                >
                  <div className="absolute inset-x-0 top-0 h-[54px] bg-slate-100 bg-repeat-x" style={{ backgroundImage: filmstrip ? `url(${filmstrip})` : undefined, backgroundSize: "auto 54px" }} />
                  <div className="absolute inset-y-0 left-0 bg-slate-900/50" style={{ width: `${videoDuration ? start / videoDuration * 100 : 0}%` }} />
                  <div className="absolute inset-y-0 right-0 bg-slate-900/50" style={{ width: `${videoDuration ? Math.max(0, (videoDuration - start - seconds) / videoDuration * 100) : 0}%` }} />
                  <div
                    className="absolute inset-y-0 cursor-grab border-x-2 border-slate-950 bg-white/20 active:cursor-grabbing"
                    style={{ left: `${videoDuration ? start / videoDuration * 100 : 0}%`, width: `${videoDuration ? seconds / videoDuration * 100 : 100}%` }}
                    onPointerDown={event => beginTimeline(event, "move")}
                  />
                  {(["start", "end"] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      aria-label={mode === "start" ? "Điểm bắt đầu đoạn video" : "Điểm kết thúc đoạn video"}
                      onPointerDown={event => { event.preventDefault(); beginTimeline(event, mode); }}
                      className="absolute inset-y-0 z-10 w-8 -translate-x-1/2 cursor-ew-resize"
                      style={{ left: `${videoDuration ? (start + (mode === "end" ? seconds : 0)) / videoDuration * 100 : 0}%` }}
                    >
                      <span className="absolute left-1/2 top-0 flex h-6 w-7 -translate-x-1/2 items-center justify-center gap-1 rounded-b-lg border border-white bg-slate-950 shadow-md">
                        <span className="h-3 w-0.5 rounded bg-white/90" />
                        <span className="h-3 w-0.5 rounded bg-white/90" />
                        <span className="h-3 w-0.5 rounded bg-white/90" />
                      </span>
                      <span className="absolute bottom-0 left-1/2 top-5 w-1 -translate-x-1/2 rounded-full bg-slate-950" />
                    </button>
                  ))}
                  <div className="absolute inset-x-2 bottom-1 flex justify-between text-[10px] font-medium text-slate-700">
                    <span>{formatTime(start)}</span><span>{formatTime(start + seconds)}</span>
                  </div>
                </div>
                <label className="mt-3 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                  <span>Thời lượng</span>
                  <input
                    type="number"
                    min={minSeconds}
                    max={maxSeconds}
                    step="0.1"
                    value={seconds.toFixed(1)}
                    onChange={event => {
                      const parsed = Number(event.target.value);
                      if (!Number.isFinite(parsed)) return;
                      const next = Math.max(minSeconds, Math.min(maxSeconds, parsed));
                      setSeconds(next);
                      setStart(current => Math.min(current, Math.max(0, videoDuration - next)));
                    }}
                    className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center font-normal outline-none focus:border-slate-400"
                  />
                  <span className="font-normal text-slate-500">giây · tối đa {maxSeconds.toFixed(1)} giây</span>
                </label>
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-800">Chữ trên GIF
                  <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" value={caption} maxLength={80} onChange={e => setCaption(e.target.value)} placeholder="Nhập chữ muốn chèn…" />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  Cỡ chữ · {captionSize}%
                  <input className="mt-2 w-full accent-black" type="range" min="4" max="22" step="1" value={captionSize} onChange={e => setCaptionSize(Number(e.target.value))} />
                </label>
                <p className="text-xs text-slate-500">Kéo chữ trực tiếp trên khung crop để đổi vị trí.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={createGif} disabled={busy} className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">{busy ? "Đang tạo GIF…" : "Tạo GIF"}</button>
                {status && <span className="text-sm text-slate-500">{status}</span>}
              </div>
            </div>}
          </>}
          {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        </section>
        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-slate-950">GIF của bạn</h2>
          {gif ? <>
            <img src={gif} alt="Xem trước GIF" className="mt-4 aspect-square w-full rounded-2xl bg-slate-100 object-contain" />
            <p className="mt-3 text-sm text-slate-600">{(bytes / 1024).toFixed(0)} KB · {quality}</p>
            <a href={gif} download={`${name}.gif`} className="mt-4 inline-flex rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">Tải GIF</a>
          </> : <div className="mt-4 grid aspect-square place-items-center rounded-2xl bg-slate-50 px-6 text-center text-sm text-slate-400">Chọn video để tạo GIF</div>}
        </aside>
      </div>
      <p className="mt-4 text-xs text-slate-400">Video được xử lý ngay trên thiết bị của bạn.</p>
    </div>
  );
}
