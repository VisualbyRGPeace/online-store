import type { Job } from "@/services/job-service";

/** Khóa nhận diện một job trong giao diện (đánh dấu "MỚI"). */
export function jobKey(job: Job): string {
  return `${job.id}|${job.title}`;
}

// ---- Nhớ những job đã thấy, theo từng tab tháng ----
// Khóa so sánh dùng tab + tên việc + deadline (không dùng số dòng) nên sắp xếp lại bảng không bị tính là job mới.
export type SeenMap = Map<string, Set<string>>;

const SEEN_PREFIX = "job-seen:";

function baseKey(job: Job): string {
  return `${job.tab}|${job.title}|${job.date}`;
}

/** Hai job trùng tên + deadline vẫn được phân biệt nhờ số thứ tự xuất hiện. */
function withKeys(rows: Job[]): { job: Job; key: string }[] {
  const counter = new Map<string, number>();
  return rows.map((job) => {
    const base = baseKey(job);
    const n = counter.get(base) ?? 0;
    counter.set(base, n + 1);
    return { job, key: `${base}#${n}` };
  });
}

export function loadSeen(storeKey: string): SeenMap {
  const map: SeenMap = new Map();
  try {
    const raw = window.localStorage.getItem(SEEN_PREFIX + storeKey);
    if (!raw) return map;
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const [tab, keys] of Object.entries(data)) {
      if (Array.isArray(keys)) map.set(tab, new Set(keys.filter((key): key is string => typeof key === "string")));
    }
  } catch {
    /* dữ liệu hỏng hoặc trình duyệt chặn lưu trữ: coi như chưa có */
  }
  return map;
}

export function saveSeen(storeKey: string, seen: SeenMap): void {
  try {
    const data: Record<string, string[]> = {};
    for (const [tab, keys] of seen) data[tab] = [...keys];
    window.localStorage.setItem(SEEN_PREFIX + storeKey, JSON.stringify(data));
  } catch {
    /* bỏ qua */
  }
}

/**
 * So danh sách vừa tải với lần trước. Tab nào chưa từng được tải thì chỉ ghi nhớ, không báo
 * (tránh báo hàng loạt khi mới dùng hoặc khi mở một tab tháng cũ lần đầu).
 */
export function diffJobs(seen: SeenMap, jobs: Job[]): { fresh: Job[]; next: SeenMap } {
  const byTab = new Map<string, Job[]>();
  for (const job of jobs) byTab.set(job.tab, [...(byTab.get(job.tab) ?? []), job]);

  const next: SeenMap = new Map(seen);
  const fresh: Job[] = [];
  for (const [tab, rows] of byTab) {
    const entries = withKeys(rows);
    const before = seen.get(tab);
    if (before) {
      for (const { job, key } of entries) if (!before.has(key)) fresh.push(job);
    }
    next.set(tab, new Set(entries.map((entry) => entry.key)));
  }
  return { fresh, next };
}

/** Job do chính bạn vừa thêm/sửa trên web: ghi nhớ ngay để không tự báo "việc mới". */
export function rememberJob(seen: SeenMap, job: Job): void {
  const set = seen.get(job.tab);
  if (!set) return;
  const base = baseKey(job);
  let n = 0;
  while (set.has(`${base}#${n}`)) n += 1;
  set.add(`${base}#${n}`);
}

// ---- Thông báo của trình duyệt + âm báo ----
export type NotifyPermission = NotificationPermission | "unsupported";

function supportsNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function askNotifyPermission(): Promise<NotifyPermission> {
  if (!supportsNotifications()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Chỉ hiện thông báo hệ thống khi bạn đang ở tab/cửa sổ khác; đang xem trang thì đã có biểu ngữ trong trang. */
export function showSystemNotice(title: string, body: string): void {
  try {
    if (!supportsNotifications() || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible" && document.hasFocus()) return;
    const notice = new Notification(title, { body, tag: "job-new" });
    notice.onclick = () => {
      window.focus();
      notice.close();
    };
  } catch {
    /* một số trình duyệt di động không cho tạo trực tiếp */
  }
}

export function playChime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    [880, 1175].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start(now + index * 0.18);
      osc.stop(now + index * 0.18 + 0.3);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* trình duyệt chưa cho phát âm thanh: bỏ qua */
  }
}
