"use client";

import { useEffect, useRef, useState } from "react";
import { applyPalette, GIFEncoder, quantize } from "gifenc";

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

function drawCaption(ctx: CanvasRenderingContext2D, text: string, size: number) {
  if (!text.trim()) return;
  ctx.save();
  const font = Math.max(9, Math.round(size * 0.075));
  ctx.font = `bold ${font}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, size * 0.012);
  ctx.strokeStyle = "rgba(0,0,0,.85)";
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
  const centerY = size - Math.max(size * 0.1, step * lines.length * 0.55);
  lines.forEach((item, i) => {
    const y = centerY + (i - (lines.length - 1) / 2) * step;
    ctx.strokeText(item, size / 2, y, size * 0.92);
    ctx.fillText(item, size / 2, y, size * 0.92);
  });
  ctx.restore();
}

function encode(frames: ImageData[], profile: (typeof PROFILES)[number], seconds: number) {
  const [size, fps, colors] = profile;
  const count = Math.max(1, Math.min(frames.length, Math.ceil(seconds * fps)));
  const chosen = Array.from({ length: count }, (_, i) =>
    frames[Math.round(i * (frames.length - 1) / Math.max(1, count - 1))],
  );
  const sample: number[] = [];
  chosen.forEach((frame, fi) => {
    if (fi % Math.max(1, Math.floor(chosen.length / 6))) return;
    const step = Math.max(4, Math.floor(frame.data.length / 1600 / 4) * 4);
    for (let i = 0; i < frame.data.length; i += step) {
      sample.push(frame.data[i], frame.data[i + 1], frame.data[i + 2], frame.data[i + 3]);
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
  const [source, setSource] = useState("");
  const [gif, setGif] = useState("");
  const [name, setName] = useState("video");
  const [dimensions, setDimensions] = useState<[number, number] | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [crop, setCrop] = useState(50);
  const [start, setStart] = useState(0);
  const [seconds, setSeconds] = useState(3);
  const [caption, setCaption] = useState("");
  const [bytes, setBytes] = useState(0);
  const [quality, setQuality] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

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

  async function createGif() {
    const video = videoRef.current;
    if (!video || !dimensions) return;
    setBusy(true); setError(""); setStatus("Đọc video…"); setGif("");
    const previousTime = video.currentTime;
    const [width, height] = dimensions;
    const side = Math.min(width, height);
    const sx = width > side ? (width - side) * crop / 100 : 0;
    const sy = height > side ? (height - side) * crop / 100 : 0;
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
        drawCaption(ctx, caption, 160);
        frames.push(ctx.getImageData(0, 0, 160, 160));
        setStatus(`Đọc khung hình ${i + 1}/${total}…`);
      }
      let result: Blob | undefined;
      for (let i = 0; i < PROFILES.length; i++) {
        setStatus(`Tối ưu dung lượng ${i + 1}/${PROFILES.length}…`);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        const profile = PROFILES[i];
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
            <div className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-2xl bg-slate-100">
              <video src={source} muted playsInline loop autoPlay className="h-full w-full object-cover"
                style={{ objectPosition: horizontal ? `${crop}% center` : `center ${crop}%` }} />
              {caption && <div className="pointer-events-none absolute inset-x-3 bottom-4 text-center text-lg font-bold text-white [text-shadow:0_2px_5px_#000,1px_1px_3px_#000]">{caption}</div>}
            </div>
            {dimensions && <div className="mt-6 space-y-5">
              <label className="block text-sm font-medium text-slate-800">Vị trí cắt vuông
                <input className="mt-2 w-full accent-black" type="range" min="0" max="100" value={crop} onChange={e => setCrop(Number(e.target.value))} />
              </label>
              <label className="block text-sm font-medium text-slate-800">Độ dài · {seconds.toFixed(1)} giây
                <input className="mt-2 w-full accent-black" type="range" min="0.5" max={maxLength} step="0.5" value={Math.min(seconds, maxLength)} onChange={e => { const value = Number(e.target.value); setSeconds(value); setStart(s => Math.min(s, Math.max(0, videoDuration - value))); }} />
              </label>
              <label className="block text-sm font-medium text-slate-800">Bắt đầu tại · {start.toFixed(1)} giây
                <input className="mt-2 w-full accent-black" type="range" min="0" max={maxStart} step="0.1" value={Math.min(start, maxStart)} onChange={e => setStart(Number(e.target.value))} />
              </label>
              <label className="block text-sm font-medium text-slate-800">Chữ trên GIF
                <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" value={caption} maxLength={80} onChange={e => setCaption(e.target.value)} placeholder="Nhập chữ muốn chèn…" />
              </label>
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
