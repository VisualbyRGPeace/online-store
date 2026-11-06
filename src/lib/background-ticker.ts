/**
 * Đồng hồ chạy trong Web Worker: khi tab ở nền, trình duyệt làm chậm setInterval của trang
 * (có khi chỉ còn 1 lần/phút), còn bộ đếm trong worker thì không bị làm chậm như vậy.
 */
export function startTicker(onTick: () => void, ms: number): () => void {
  let worker: Worker | null = null;
  let url: string | null = null;
  let fallback: number | undefined;
  try {
    url = URL.createObjectURL(new Blob([`setInterval(function(){postMessage(0)}, ${ms});`], { type: "text/javascript" }));
    worker = new Worker(url);
    worker.onmessage = () => onTick();
  } catch {
    fallback = window.setInterval(onTick, ms); // trình duyệt không cho tạo worker: quay về cách cũ
  }
  return () => {
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
    if (fallback !== undefined) window.clearInterval(fallback);
  };
}

/** Giữ một Web Lock trong lúc mở trang: Chrome/Edge không đóng băng tab đang giữ khóa. */
export function holdKeepAlive(): () => void {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return () => undefined;
  let released = false;
  let release: (() => void) | undefined;
  navigator.locks
    .request("job-manager-keepalive", { mode: "shared" }, () => {
      if (released) return undefined;
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    })
    .catch(() => undefined);
  return () => {
    released = true;
    release?.();
  };
}
