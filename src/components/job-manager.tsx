"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { AuthGate } from "@/components/auth-gate";
import { Combobox } from "@/components/utilities/combobox";
import { DatePicker } from "@/components/utilities/date-picker";
import { Modal } from "@/components/utilities/modal";
import { SelectMenu } from "@/components/utilities/select-menu";
import {
  CalendarIcon,
  CheckIcon,
  ClipboardIcon,
  CloseIcon,
  CopyIcon,
  EditIcon,
  ExternalIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
  TrashIcon,
} from "@/components/utilities/tool-icons";
import { JOB_APPS_SCRIPT } from "@/lib/job-apps-script";
import {
  DEFAULT_ASSIGNERS,
  DEFAULT_DESIGNERS,
  DEFAULT_TASKS,
  STATUS_LABEL,
  clearLink,
  createJob,
  deleteJob,
  describeError,
  isValidScriptUrl,
  listJobs,
  loadLink,
  saveLink,
  updateJob,
  type Job,
  type JobInput,
  type JobLink,
  type JobStatus,
} from "@/services/job-service";
import {
  askNotifyPermission,
  describeJob,
  diffJobs,
  getNotifyPermission,
  jobKey,
  loadSeen,
  playChime,
  preloadSound,
  registerNoticeWorker,
  rememberJob,
  saveSeen,
  showSystemNotice,
  type NotifyPermission,
  type SeenMap,
} from "@/lib/job-alerts";
import { holdKeepAlive, startTicker } from "@/lib/background-ticker";
import { copyText } from "@/utils/clipboard";
import { isAllowedDriveUrl } from "@/utils/drive";

const STALE_AFTER_MS = 15_000; // quay lại tab trình duyệt sau chừng này thì làm mới ngay
const POLL_VISIBLE_MS = 30_000; // đang mở trang: hỏi Google Sheet mỗi 30 giây
const POLL_HIDDEN_MS = 30_000; // trang ở nền: cũng mỗi 30 giây để báo việc mới kịp lúc
const ALERTS_KEY = "job-alerts-on";

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100";
const outlineButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm font-medium text-slate-800 transition hover:border-slate-900 disabled:cursor-not-allowed disabled:opacity-50";
const blackButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300";
const iconButton =
  "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-950";

// ---- Ngày tháng (dạng yyyy-MM-dd, theo giờ máy người dùng) ----
function todayIso(): string {
  return new Date().toLocaleDateString("en-CA");
}

function parseIso(iso: string): Date {
  const [year = 1970, month = 1, day = 1] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Số ngày từ `from` đến `to` (dương nếu `to` ở sau). */
function daysBetween(from: string, to: string): number {
  const a = parseIso(from);
  const b = parseIso(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

function dayLabel(iso: string, today: string): string {
  const base = `${WEEKDAYS[parseIso(iso).getDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const diff = daysBetween(today, iso);
  if (diff === 0) return `Hôm nay · ${base}`;
  if (diff === 1) return `Ngày mai · ${base}`;
  return base;
}

/** Bỏ dấu + chữ thường để tìm kiếm tiếng Việt. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

// ---- Sắp xếp / chia nhóm ----
const STATUS_RANK: Record<JobStatus, number> = { priority: 0, doing: 1, received: 2, done: 3 };
const STATUS_SHORT: Record<JobStatus, string> = { received: "Đã nhận", priority: "Ưu tiên", doing: "Đang làm", done: "Kết thúc" };
// Màu theo trạng thái: xanh dương = đã nhận, xanh lá = đang thực hiện, đỏ = ưu tiên, xám = kết thúc.
const STATUS_STYLE: Record<JobStatus, { label: string; dot: string; pill: string }> = {
  received: { label: "Đã nhận", dot: "bg-blue-500", pill: "bg-blue-50 text-blue-700" },
  doing: { label: "Đang thực hiện", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700" },
  priority: { label: "Ưu tiên", dot: "bg-red-500", pill: "bg-red-50 text-red-700" },
  done: { label: "Kết thúc", dot: "bg-slate-300", pill: "bg-slate-100 text-slate-500" },
};
const DESIGNER_KEY = "job-designer-filter";

function compareJobs(a: Job, b: Job): number {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.title.localeCompare(b.title, "vi");
}

function readDesigner(): string {
  try {
    return window.localStorage.getItem(DESIGNER_KEY) ?? "";
  } catch {
    return "";
  }
}

function readAlertsOn(): boolean {
  try {
    return window.localStorage.getItem(ALERTS_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Gộp gợi ý mặc định với các giá trị đang có trong bảng (không trùng, A → Z). */
function mergeOptions(defaults: string[], found: string[]): string[] {
  return [...new Set([...defaults, ...found.filter(Boolean)])].sort((a, b) => a.localeCompare(b, "vi"));
}

type Tab = "today" | "upcoming" | "all" | "done";
type Section = { key: string; label: string; danger?: boolean; items: Job[] };

const TAB_LABEL: Record<Tab, string> = { today: "Hôm nay", upcoming: "Sắp tới", all: "Tất cả", done: "Đã xong" };

function buildSections(tab: Tab, jobs: Job[], today: string): Section[] {
  const open = jobs.filter((job) => job.status !== "done");

  if (tab === "today") {
    const overdue = open.filter((job) => job.date !== "" && job.date < today).sort((a, b) => a.date.localeCompare(b.date) || compareJobs(a, b));
    const due = jobs.filter((job) => job.date === today).sort(compareJobs);
    const sections: Section[] = [];
    if (overdue.length > 0) sections.push({ key: "overdue", label: "Quá hạn", danger: true, items: overdue });
    if (due.length > 0) sections.push({ key: "today", label: dayLabel(today, today), items: due });
    return sections;
  }

  if (tab === "upcoming") {
    const byDate = new Map<string, Job[]>();
    for (const job of open) {
      if (job.date !== "" && job.date > today) byDate.set(job.date, [...(byDate.get(job.date) ?? []), job]);
    }
    const sections: Section[] = [...byDate.keys()]
      .sort()
      .map((date) => ({ key: date, label: dayLabel(date, today), items: (byDate.get(date) ?? []).sort(compareJobs) }));
    const undated = open.filter((job) => job.date === "").sort(compareJobs);
    if (undated.length > 0) sections.push({ key: "undated", label: "Chưa đặt ngày", items: undated });
    return sections;
  }

  if (tab === "done") {
    const items = jobs.filter((job) => job.status === "done").sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, "vi"));
    return items.length > 0 ? [{ key: "done", label: "", items }] : [];
  }

  const items = [...jobs].sort((a, b) => {
    const doneDiff = Number(a.status === "done") - Number(b.status === "done");
    if (doneDiff !== 0) return doneDiff;
    const dateA = a.date || "9999-99-99";
    const dateB = b.date || "9999-99-99";
    return dateA.localeCompare(dateB) || compareJobs(a, b);
  });
  return items.length > 0 ? [{ key: "all", label: "", items }] : [];
}

function computeCounts(list: Job[], today: string) {
  const open = list.filter((job) => job.status !== "done");
  const dueToday = list.filter((job) => job.date === today);
  return {
    overdue: open.filter((job) => job.date !== "" && job.date < today).length,
    todayTotal: dueToday.length,
    todayDone: dueToday.filter((job) => job.status === "done").length,
    todayOpen: dueToday.filter((job) => job.status !== "done").length,
    upcoming: open.filter((job) => job.date === "" || job.date > today).length,
    all: list.length,
    done: list.length - open.length,
  };
}

// ---- Giao diện nhỏ ----
function BellIcon({ className, off = false }: { className?: string; off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

type Toast = { text: string; ok: boolean };

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <div role="group" aria-label={label} className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:grid-cols-4">
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={value === key}
            className={`h-9 rounded-lg px-2 text-sm font-medium transition ${
              value === key ? "bg-black text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-slate-800">
      <span className="text-slate-400">{label}</span>
      <span className="truncate font-medium">{children}</span>
    </span>
  );
}

function JobRow({
  job,
  today,
  fresh,
  index,
  onToggle,
  onEdit,
  onDelete,
}: {
  job: Job;
  today: string;
  fresh: boolean;
  index: number;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = job.status === "done";
  const late = !done && job.date !== "" && job.date < today;
  const lateDays = late ? daysBetween(job.date, today) : 0;
  const style = STATUS_STYLE[job.status];

  return (
    <li
      style={{ "--i": index } as CSSProperties}
      className={`stagger-item flex items-start gap-3 rounded-2xl border bg-white px-3.5 py-3 transition hover:border-slate-300 hover:shadow-sm ${
        fresh ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200"
      } ${done ? "bg-slate-50/60" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? "Đánh dấu chưa xong" : "Đánh dấu đã xong"}
        title={done ? "Đánh dấu chưa xong" : "Đánh dấu đã xong"}
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${
          done ? "border-black bg-black text-white" : "border-slate-300 text-transparent hover:border-slate-900 hover:text-slate-300"
        }`}
      >
        <CheckIcon className="h-3.5 w-3.5" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={`min-w-0 flex-1 text-sm font-semibold leading-6 ${done ? "text-slate-400 line-through" : "text-slate-950"}`}>{job.title}</p>
          {fresh && <span className="mt-0.5 shrink-0 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-semibold text-white">MỚI</span>}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          {job.task && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">{job.task}</span>}
          <span className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-semibold ${style.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
            {style.label}
          </span>
          {job.date !== "" && (
            <span className={`inline-flex items-center gap-1 ${late ? "font-semibold text-red-600" : "text-slate-700"}`}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {formatDate(job.date)}
              {late && ` · trễ ${lateDays} ngày`}
            </span>
          )}
          {job.designer && <Meta label="Designer">{job.designer}</Meta>}
          {job.assigner && <Meta label="Giao bởi">{job.assigner}</Meta>}
          {job.quantity > 1 && <Meta label="SL">{job.quantity}</Meta>}
        </div>
      </div>

      <div className="flex shrink-0 items-center">
        <button type="button" onClick={onEdit} aria-label="Sửa" title="Sửa" className={iconButton}>
          <EditIcon className="h-4 w-4" />
        </button>
        <button type="button" onClick={onDelete} aria-label="Xóa" title="Xóa" className={`${iconButton} hover:bg-red-50 hover:text-red-600`}>
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

const SETUP_STEPS: string[] = [
  "Mở file Google Sheet công việc (có các tab T1…T12) rồi vào menu Tiện ích mở rộng → Apps Script.",
  "Xóa mã mẫu, bấm “Sao chép mã script” bên dưới rồi dán vào. Đổi dòng TOKEN thành mật mã riêng của bạn, bấm Lưu.",
  "Bấm Triển khai → Tùy chọn triển khai mới → loại “Ứng dụng web”. Chọn Thực thi dưới tên: Tôi; Người có quyền truy cập: Bất kỳ ai. Bấm Triển khai và cấp quyền khi Google hỏi.",
  "Sao chép “URL ứng dụng web” (kết thúc bằng /exec), dán vào ô bên dưới cùng mật mã vừa đặt.",
];

/** Hướng dẫn + biểu mẫu nối với Google Sheet. Dùng cả khi chưa kết nối và trong hộp Cài đặt. */
function SetupPanel({
  userId,
  initial,
  onConnected,
  onDisconnected,
  onToast,
}: {
  userId: string;
  initial: JobLink | null;
  onConnected: (link: JobLink) => void;
  onDisconnected: () => void;
  onToast: (text: string, ok?: boolean) => void;
}) {
  const [scriptUrl, setScriptUrl] = useState(initial?.scriptUrl ?? "");
  const [token, setToken] = useState(initial?.token ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showCode, setShowCode] = useState(false);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const link: JobLink = { scriptUrl: scriptUrl.trim(), token: token.trim() };
    if (!isValidScriptUrl(link.scriptUrl)) {
      setError("Địa chỉ phải bắt đầu bằng https://script.google.com/ và kết thúc bằng /exec.");
      return;
    }
    if (link.token.length < 8) {
      setError("Mật mã cần ít nhất 8 ký tự (giống dòng TOKEN trong Apps Script).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await listJobs(link); // thử kết nối thật trước khi lưu
      await saveLink(userId, link);
      onConnected(link);
    } catch (err) {
      console.error(err);
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await clearLink(userId);
      onDisconnected();
    } catch (err) {
      console.error(err);
      setError("Chưa ngắt kết nối được. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <ol className="space-y-3">
        {SETUP_STEPS.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm leading-6 text-slate-600">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-950 text-xs font-semibold text-white">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copyText(JOB_APPS_SCRIPT).then((ok) => onToast(ok ? "Đã sao chép mã script." : "Trình duyệt chưa cho phép sao chép.", ok))}
            className={outlineButton}
          >
            <CopyIcon className="h-4 w-4" />
            Sao chép mã script
          </button>
          <button type="button" onClick={() => setShowCode((current) => !current)} aria-expanded={showCode} className="h-10 rounded-xl px-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-950">
            {showCode ? "Ẩn mã" : "Xem mã"}
          </button>
        </div>
        {showCode && (
          <pre className="mt-3 max-h-64 overflow-auto rounded-2xl bg-slate-950 p-4 font-mono text-[11px] leading-5 text-slate-100">{JOB_APPS_SCRIPT}</pre>
        )}
      </div>

      <form onSubmit={(event) => void connect(event)} className="space-y-4 rounded-2xl bg-slate-50 p-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">URL ứng dụng web</span>
          <input
            value={scriptUrl}
            onChange={(event) => setScriptUrl(event.target.value)}
            placeholder="https://script.google.com/macros/s/…/exec"
            spellCheck={false}
            autoComplete="off"
            className={`${inputClass} font-mono text-xs`}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Mật mã (TOKEN)</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Giống dòng TOKEN trong Apps Script"
            autoComplete="off"
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {initial ? (
            <button type="button" onClick={() => void disconnect()} disabled={busy} className="h-10 rounded-xl px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50">
              Ngắt kết nối
            </button>
          ) : (
            <span />
          )}
          <button type="submit" disabled={busy} className={`${blackButton} px-6`}>
            {busy ? "Đang kết nối…" : initial ? "Lưu & kiểm tra" : "Kết nối Google Sheet"}
          </button>
        </div>
      </form>

      <p className="text-xs leading-5 text-slate-500">
        Mật mã chỉ lưu trong tài khoản của bạn. Sau khi sửa mã Apps Script, nhớ Triển khai → Quản lý bản triển khai → chọn phiên bản mới để áp dụng.
      </p>
    </div>
  );
}

type FormState = {
  id: string | null;
  expectedTitle: string;
  task: string;
  title: string;
  date: string;
  status: JobStatus;
  designer: string;
  quantity: string;
  assigner: string;
};

function JobManagerInner({ userId }: { userId: string }) {
  const [link, setLink] = useState<JobLink | null>(null);
  const [linkLoaded, setLinkLoaded] = useState(false);
  const [linkError, setLinkError] = useState("");

  const [loaded, setLoaded] = useState<{ key: string; jobs: Job[]; sheetUrl: string; tabs: string[]; currentTab: string; recentTabs: string[]; tabGids: Record<string, number>; outdated: boolean } | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const lastFetch = useRef(0);
  const mutatedAt = useRef(0); // lần cuối bạn thêm/sửa/xóa trên web (để kết quả tải cũ không ghi đè)
  const [updatedAt, setUpdatedAt] = useState(0);
  const [viewTab, setViewTab] = useState(""); // "" = các tháng gần đây; "T9"… = xem tab tháng đó
  const [freshKeys, setFreshKeys] = useState<Set<string>>(() => new Set());
  const [alertsOn, setAlertsOn] = useState(readAlertsOn);
  const [permission, setPermission] = useState<NotifyPermission>(getNotifyPermission);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [popup, setPopup] = useState<{ id: number; jobs: Job[] } | null>(null); // thẻ thông báo kiểu Zalo trong trang
  const seenRef = useRef<{ storeKey: string; seen: SeenMap } | null>(null);
  const designerRef = useRef("");
  const alertsRef = useRef(true);

  const [today, setToday] = useState(todayIso);
  const [tab, setTab] = useState<Tab>("today");
  const [query, setQuery] = useState("");
  const [designer, setDesigner] = useState<string>(readDesigner);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toDelete, setToDelete] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((text: string, ok = true) => {
    setToast({ text, ok });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // Qua nửa đêm thì "hôm nay" tự đổi sang ngày mới.
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayIso()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Liên kết Google Sheet của tài khoản.
  useEffect(() => {
    let current = true;
    loadLink(userId).then(
      (value) => {
        if (!current) return;
        setLink(value);
        setLinkLoaded(true);
      },
      (err) => {
        console.error(err);
        if (!current) return;
        setLinkError("Không tải được cài đặt liên kết. Hãy tải lại trang.");
        setLinkLoaded(true);
      },
    );
    return () => {
      current = false;
    };
  }, [userId]);

  // Công việc từ Google Sheet.
  const dataKey = link ? `${link.scriptUrl}|${version}|${viewTab}` : "";
  useEffect(() => {
    if (!link) return;
    let current = true;
    const startedAt = Date.now();
    lastFetch.current = startedAt;

    // So với lần tải trước để biết có việc mới được book hay không.
    function detectNewJobs(active: JobLink, rows: Job[]) {
      const storeKey = `${userId}|${active.scriptUrl}`;
      let state = seenRef.current;
      if (!state || state.storeKey !== storeKey) state = { storeKey, seen: loadSeen(storeKey) };
      const { fresh, next } = diffJobs(state.seen, rows);
      seenRef.current = { storeKey, seen: next };
      saveSeen(storeKey, next);
      const mine = fresh.filter((job) => job.status !== "done" && (designerRef.current === "" || job.designer === designerRef.current));
      if (mine.length === 0) return;
      setFreshKeys((prev) => new Set([...prev, ...mine.map(jobKey)]));
      if (!alertsRef.current) return;
      setPopup({ id: Date.now(), jobs: mine });
      const lines = mine.slice(0, 3).map((job) => {
        const detail = describeJob(job);
        return mine.length === 1 ? `${job.title}\n${detail}`.trim() : `${job.title}${detail ? ` — ${detail}` : ""}`;
      });
      void showSystemNotice(mine.length === 1 ? "Có việc mới" : `Có ${mine.length} việc mới`, lines.join("\n"));
      playChime();
    }

    listJobs(link, viewTab).then(
      (result) => {
        if (!current) return;
        if (mutatedAt.current > startedAt) {
          setVersion((value) => value + 1); // vừa sửa trong lúc đang tải: tải lại để không ghi đè bản mới
          return;
        }
        setError("");
        setUpdatedAt(Date.now());
        setLoaded({ key: dataKey, jobs: result.jobs, sheetUrl: result.sheetUrl, tabs: result.tabs, currentTab: result.currentTab, recentTabs: result.recentTabs, tabGids: result.tabGids, outdated: result.outdated });
        detectNewJobs(link, result.jobs);
      },
      (err) => {
        console.error(err);
        if (!current) return;
        setError(describeError(err));
        setLoaded((prev) => (prev ? { ...prev, key: dataKey } : { key: dataKey, jobs: [], sheetUrl: "", tabs: [], currentTab: "", recentTabs: [], tabGids: {}, outdated: false }));
      },
    );
    return () => {
      current = false;
    };
  }, [link, dataKey, userId, viewTab]);

  useEffect(() => {
    preloadSound();
    void registerNoticeWorker();
  }, []);

  useEffect(() => {
    if (!popup) return;
    const timer = window.setTimeout(() => setPopup(null), 9000);
    return () => window.clearTimeout(timer);
  }, [popup]);

  useEffect(() => {
    designerRef.current = designer;
    alertsRef.current = alertsOn;
  }, [designer, alertsOn]);

  // Tự cập nhật liên tục kể cả khi bạn đang ở tab/phần mềm khác: đồng hồ chạy trong worker nên không bị trình duyệt làm chậm.
  useEffect(() => {
    if (!link) return;
    const stopTicker = startTicker(() => {
      const wait = document.visibilityState === "visible" ? POLL_VISIBLE_MS : POLL_HIDDEN_MS;
      if (Date.now() - lastFetch.current >= wait) setVersion((value) => value + 1);
    }, 5_000);
    const releaseLock = holdKeepAlive();
    return () => {
      stopTicker();
      releaseLock();
    };
  }, [link]);

  // Quay lại tab trình duyệt sau một lúc thì tự làm mới (phòng khi bạn vừa sửa trong Google Sheet).
  useEffect(() => {
    if (!link) return;
    function onFocus() {
      if (document.visibilityState === "visible" && Date.now() - lastFetch.current > STALE_AFTER_MS) {
        setVersion((current) => current + 1);
      }
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [link]);

  const jobs = useMemo(() => loaded?.jobs ?? [], [loaded]);
  const refreshing = Boolean(link) && loaded?.key !== dataKey;
  const firstLoad = Boolean(link) && loaded === null;
  const tabs = useMemo(() => loaded?.tabs ?? [], [loaded]);
  const recentTabs = useMemo(() => loaded?.recentTabs ?? [], [loaded]);
  const currentTab = loaded?.currentTab ?? "";
  const scriptOutdated = loaded?.outdated ?? false;
  // "Mở Google Sheet" mở đúng tab đang xem (tab đã chọn, hoặc tháng hiện tại khi ở "Gần đây").
  const baseSheetUrl = loaded && isAllowedDriveUrl(loaded.sheetUrl) ? loaded.sheetUrl : "";
  const targetGid = loaded?.tabGids[viewTab || currentTab];
  const sheetUrl = baseSheetUrl && targetGid !== undefined ? `${baseSheetUrl.split("#")[0]}#gid=${targetGid}` : baseSheetUrl;
  // Vừa bấm sang một tab tháng mà dữ liệu của tab đó chưa về: hiện khung chờ thay vì "trống việc".
  const switching = refreshing && viewTab !== "" && !jobs.some((job) => job.tab === viewTab);

  const patchJobs = useCallback((change: (rows: Job[]) => Job[]) => {
    setLoaded((prev) => (prev ? { ...prev, jobs: change(prev.jobs) } : prev));
  }, []);

  const freshJobs = useMemo(() => jobs.filter((job) => freshKeys.has(jobKey(job))), [jobs, freshKeys]);

  // Tiêu đề tab trình duyệt hiện "(2)" khi có việc mới chưa xem.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = freshJobs.length > 0 ? `(${freshJobs.length}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [freshJobs.length]);

  const remember = useCallback((job: Job) => {
    const state = seenRef.current;
    if (!state) return;
    rememberJob(state.seen, job);
    saveSeen(state.storeKey, state.seen);
  }, []);

  const designerOptions = useMemo(() => mergeOptions(DEFAULT_DESIGNERS, jobs.map((job) => job.designer)), [jobs]);
  const taskOptions = useMemo(() => mergeOptions(DEFAULT_TASKS, jobs.map((job) => job.task)), [jobs]);
  const assignerOptions = useMemo(() => mergeOptions(DEFAULT_ASSIGNERS, jobs.map((job) => job.assigner)), [jobs]);

  // Chỉ xem việc của một designer (nhớ lựa chọn trên trình duyệt này).
  const scoped = useMemo(() => (designer ? jobs.filter((job) => job.designer === designer) : jobs), [jobs, designer]);

  function chooseDesigner(value: string) {
    setDesigner(value);
    try {
      window.localStorage.setItem(DESIGNER_KEY, value);
    } catch {
      /* trình duyệt chặn lưu trữ: chỉ giữ trong phiên */
    }
  }

  const shown = useMemo(() => (viewTab ? scoped.filter((job) => job.tab === viewTab) : scoped), [scoped, viewTab]);

  const terms = useMemo(() => fold(query.trim()).split(/\s+/).filter(Boolean), [query]);
  const visibleJobs = useMemo(() => {
    if (terms.length === 0) return shown;
    return shown.filter((job) => {
      const haystack = fold(`${job.title} ${job.task} ${job.designer} ${job.assigner}`);
      return terms.every((term) => haystack.includes(term));
    });
  }, [shown, terms]);

  // Khung đầu trang luôn tính trên các tháng gần đây, không đổi khi bạn xem một tab tháng cũ.
  const headerJobs = useMemo(() => (recentTabs.length > 0 ? scoped.filter((job) => recentTabs.includes(job.tab)) : scoped), [scoped, recentTabs]);
  const counts = useMemo(() => computeCounts(headerJobs, today), [headerJobs, today]);
  const shownCounts = useMemo(() => computeCounts(shown, today), [shown, today]);

  const tabCount: Record<Tab, number> = {
    today: shownCounts.overdue + shownCounts.todayOpen,
    upcoming: shownCounts.upcoming,
    all: shownCounts.all,
    done: shownCounts.done,
  };

  const sections = useMemo(() => buildSections(tab, visibleJobs, today), [tab, visibleJobs, today]);

  function chooseMonth(name: string) {
    setViewTab(name);
    if (name !== "" && name !== currentTab) setTab("all"); // tháng khác tháng này: xem toàn bộ cho dễ thấy
  }

  async function allowNotifications() {
    const result = await askNotifyPermission();
    setPermission(result);
    if (result === "granted") {
      void showSystemNotice("Đã bật thông báo", "Khi có job mới, web sẽ báo ở đây kèm âm thanh.", true);
      playChime();
      showToast("Đã bật thông báo việc mới.");
    } else if (result === "denied") {
      showToast("Trình duyệt đang chặn thông báo của trang này.", false);
    } else if (result === "unsupported") {
      showToast("Trình duyệt này chỉ hỗ trợ thẻ thông báo và âm báo trong trang.", false);
    }
  }

  async function toggleAlerts() {
    const next = !alertsOn;
    if (next) {
      await allowNotifications();
    } else {
      showToast("Đã tắt thông báo việc mới.");
    }
    setAlertsOn(next);
    try {
      window.localStorage.setItem(ALERTS_KEY, next ? "1" : "0");
    } catch {
      /* chỉ giữ trong phiên */
    }
  }

  function openCreate() {
    setFormError("");
    setForm({ id: null, expectedTitle: "", task: "", title: "", date: today, status: "received", designer, quantity: "1", assigner: "" });
  }

  function openEdit(job: Job) {
    setFormError("");
    setForm({
      id: job.id,
      expectedTitle: job.title,
      task: job.task,
      title: job.title,
      date: job.date,
      status: job.status,
      designer: job.designer,
      quantity: String(job.quantity),
      assigner: job.assigner,
    });
  }

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (!form || !link || saving) return;
    const quantity = Number(form.quantity);
    const input: JobInput = {
      task: form.task.trim(),
      title: form.title.trim(),
      date: form.date,
      status: form.status,
      designer: form.designer.trim(),
      quantity: Number.isFinite(quantity) && quantity >= 1 ? Math.min(Math.round(quantity), 999) : 1,
      assigner: form.assigner.trim(),
    };
    if (!input.title || !input.task || !input.date || !input.designer) {
      setFormError("Hãy nhập đủ: loại task, tên công việc, deadline và designer.");
      return;
    }
    setSaving(true);
    setFormError("");
    let createdNote = "";
    mutatedAt.current = Date.now();
    try {
      if (form.id) {
        const saved = await updateJob(link, { id: form.id, title: form.expectedTitle }, input);
        patchJobs((rows) => rows.map((row) => (row.id === form.id ? saved : row)));
        mutatedAt.current = Date.now();
        remember(saved);
      } else {
        const { job: saved, tabCreated } = await createJob(link, input);
        patchJobs((rows) => [...rows, saved]);
        mutatedAt.current = Date.now();
        remember(saved);
        createdNote = tabCreated ? `Đã tạo tab ${saved.tab} mới và thêm việc.` : `Đã thêm vào tab ${saved.tab}.`;
      }
      setForm(null);
      showToast(form.id ? "Đã lưu thay đổi." : createdNote);
    } catch (err) {
      console.error(err);
      setFormError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(job: Job) {
    if (!link) return;
    const next: JobStatus = job.status === "done" ? "doing" : "done";
    mutatedAt.current = Date.now();
    patchJobs((rows) => rows.map((row) => (row.id === job.id ? { ...row, status: next } : row))); // hiện ngay, lỗi thì hoàn lại
    try {
      const saved = await updateJob(link, job, { status: next });
      mutatedAt.current = Date.now();
      patchJobs((rows) => rows.map((row) => (row.id === job.id ? saved : row)));
    } catch (err) {
      console.error(err);
      patchJobs((rows) => rows.map((row) => (row.id === job.id ? { ...row, status: job.status } : row)));
      showToast(describeError(err), false);
    }
  }

  async function confirmDelete() {
    if (!toDelete || !link) return;
    setDeleting(true);
    try {
      mutatedAt.current = Date.now();
      await deleteJob(link, toDelete);
      mutatedAt.current = Date.now();
      const removed = toDelete.id;
      patchJobs((rows) => rows.filter((row) => row.id !== removed));
      setToDelete(null);
      showToast("Đã xóa nội dung dòng trong Google Sheet.");
    } catch (err) {
      console.error(err);
      showToast(describeError(err), false);
    } finally {
      setDeleting(false);
    }
  }

  if (!linkLoaded) return <div className="h-40 animate-pulse rounded-3xl bg-slate-100" aria-busy="true" />;

  if (!link) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">
            <ClipboardIcon className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Nối với Google Sheet của bạn</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Công việc được lưu ngay trong Google Sheet. Bạn thêm, sửa, tick xong trên web hoặc gõ thẳng trong Sheet đều được. Chỉ cần cài đặt một lần, khoảng 3 phút.
            </p>
          </div>
        </div>
        {linkError && (
          <p role="alert" className="mb-4 text-sm text-red-600">
            {linkError}
          </p>
        )}
        <SetupPanel
          userId={userId}
          initial={null}
          onConnected={(value) => {
            setLink(value);
            showToast("Đã kết nối Google Sheet.");
          }}
          onDisconnected={() => undefined}
          onToast={showToast}
        />
        {toast && <ToastView toast={toast} />}
      </section>
    );
  }

  const deploymentId = link.scriptUrl.match(/\/s\/([^/]+)\/exec/)?.[1] ?? "";
  const shortId = deploymentId.length > 18 ? `${deploymentId.slice(0, 8)}…${deploymentId.slice(-8)}` : deploymentId;

  const progress = counts.todayTotal > 0 ? Math.round((counts.todayDone / counts.todayTotal) * 100) : 0;

  return (
    <section className="space-y-5">
      <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-white/60">{dayLabel(today, today).replace("Hôm nay · ", "")}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {counts.todayOpen > 0 ? `Hôm nay có ${counts.todayOpen} việc cần làm` : counts.todayTotal > 0 ? "Đã xong hết việc hôm nay 🎉" : "Hôm nay chưa có việc nào"}
            </h2>
            {counts.overdue > 0 && (
              <button type="button" onClick={() => setTab("today")} className="mt-2 inline-flex items-center rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-200 transition hover:bg-red-500/30">
                {counts.overdue} việc quá hạn
              </button>
            )}
          </div>
          <button type="button" onClick={openCreate} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-slate-200">
            <PlusIcon className="h-4 w-4" />
            Thêm việc
          </button>
        </div>
        {counts.todayTotal > 0 && (
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-white/70">
              <span>
                Đã xong {counts.todayDone}/{counts.todayTotal} việc của hôm nay
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ hôm nay">
              <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-3 flex items-center gap-2.5">
          {tabs.length > 0 && (
            <>
              <span className="shrink-0 text-xs font-medium text-slate-500">Tháng</span>
              <div role="group" aria-label="Chọn tab tháng" className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-xl bg-slate-100 p-1">
                {([["", "Gần đây"], ...tabs.map((name): [string, string] => [name, name])] as [string, string][]).map(([key, text], index) => (
                  <button
                    key={key || "recent"}
                    type="button"
                    onClick={() => chooseMonth(key)}
                    aria-pressed={viewTab === key}
                    style={{ "--i": index } as CSSProperties}
                    className={`stagger-item relative inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition ${
                      viewTab === key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-950"
                    }`}
                  >
                    {text}
                    {key !== "" && key === currentTab && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" title="Tháng hiện tại" />}
                  </button>
                ))}
              </div>
            </>
          )}
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-400" title="Web tự hỏi lại Google Sheet mỗi 30 giây">
            <span className={`h-1.5 w-1.5 rounded-full ${error ? "bg-red-500" : "bg-emerald-500"}`} aria-hidden="true" />
            <span className="hidden sm:inline">{updatedAt > 0 ? `Cập nhật ${new Date(updatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : "Đang tải…"}</span>
            <span className="sm:hidden">{updatedAt > 0 ? new Date(updatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "…"}</span>
          </span>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Danh sách công việc" className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {(Object.keys(TAB_LABEL) as Tab[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition ${
                  tab === key ? "border-black bg-black text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-900"
                }`}
              >
                {TAB_LABEL[key]}
                <span className={`text-xs ${tab === key ? "text-white/70" : "text-slate-400"}`}>{tabCount[key]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void toggleAlerts()}
              aria-pressed={alertsOn}
              aria-label={alertsOn ? "Tắt thông báo việc mới" : "Bật thông báo việc mới"}
              title={alertsOn ? "Đang bật thông báo việc mới (bấm để tắt)" : "Thông báo việc mới đang tắt (bấm để bật)"}
              className={`${outlineButton} w-10 px-0 ${alertsOn ? "" : "text-slate-400"}`}
            >
              <BellIcon className="h-4 w-4" off={!alertsOn} />
            </button>
            <button
              type="button"
              onClick={() => setVersion((current) => current + 1)}
              disabled={refreshing}
              aria-label="Làm mới từ Google Sheet"
              title="Làm mới từ Google Sheet"
              className={`${outlineButton} w-10 px-0`}
            >
              <RefreshIcon className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            {sheetUrl && (
              <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className={outlineButton} title="Mở Google Sheet">
                <ExternalIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Mở Google Sheet</span>
                <span className="sm:hidden">Sheet</span>
              </a>
            )}
            <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Cài đặt liên kết" title="Cài đặt liên kết" className={`${outlineButton} w-10 px-0`}>
              <SettingsIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Tìm công việc</span>
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
              }}
              placeholder="Tìm theo tên việc, loại task, designer, người giao…"
              className={`${inputClass} pl-10 pr-10`}
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Xóa nội dung tìm" className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900">
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </label>
          <SelectMenu
            label="Designer"
            value={designer}
            onChange={chooseDesigner}
            options={[{ value: "", label: "Tất cả" }, ...designerOptions.map((name) => ({ value: name, label: name }))]}
            className="sm:w-52"
          />
        </div>

        {popup && (
          <div role="alert" className="fixed right-4 top-4 z-50 w-[calc(100vw-2rem)] max-w-sm">
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black text-white">
                <BellIcon className="h-5 w-5" />
              </span>
              <button type="button" onClick={() => setPopup(null)} className="min-w-0 flex-1 text-left" aria-label="Đóng thông báo">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-950">{popup.jobs.length === 1 ? "Có việc mới" : `Có ${popup.jobs.length} việc mới`}</span>
                  <span className="shrink-0 text-xs text-slate-400">bây giờ</span>
                </span>
                {popup.jobs.slice(0, 3).map((job) => (
                  <span key={job.id} className="mt-1 block">
                    <span className="block truncate text-sm text-slate-800">{job.title}</span>
                    {describeJob(job) !== "" && <span className="block truncate text-xs text-slate-500">{describeJob(job)}</span>}
                  </span>
                ))}
                {popup.jobs.length > 3 && <span className="mt-1 block text-xs text-slate-500">… và {popup.jobs.length - 3} việc khác</span>}
              </button>
              <button type="button" onClick={() => setPopup(null)} aria-label="Đóng" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {alertsOn && permission === "default" && !promptDismissed && (
          <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <BellIcon className="h-5 w-5 shrink-0 text-slate-500" />
            <p className="min-w-0 flex-1">Cho phép web gửi thông báo khi có job mới, kèm âm thanh.</p>
            <button type="button" onClick={() => void allowNotifications()} className="h-9 rounded-xl bg-black px-3.5 text-sm font-medium text-white transition hover:bg-slate-800">
              Cho phép
            </button>
            <button type="button" onClick={() => setPromptDismissed(true)} className="h-9 rounded-xl px-3 text-sm font-medium text-slate-500 transition hover:bg-slate-100">
              Để sau
            </button>
          </div>
        )}

        {alertsOn && permission === "denied" && !promptDismissed && (
          <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <BellIcon className="h-5 w-5 shrink-0 text-slate-400" off />
            <p className="min-w-0 flex-1">Trình duyệt đang chặn thông báo của trang này. Bấm biểu tượng ổ khóa cạnh địa chỉ web → Thông báo → Cho phép, rồi tải lại trang.</p>
            <button type="button" onClick={() => setPromptDismissed(true)} className="h-9 rounded-xl px-3 text-sm font-medium text-slate-500 transition hover:bg-slate-100">
              Đóng
            </button>
          </div>
        )}

        {scriptOutdated && (
          <div role="alert" className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            <p className="font-semibold">Script mà web đang gọi vẫn là bản cũ nên chỉ thấy vài tab tháng.</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>
                Web đang gọi bản triển khai có mã <span className="font-mono text-xs">{shortId || "?"}</span> (so với “ID bản triển khai” trong Apps Script → Quản lý bản triển khai).
              </li>
              {sheetUrl && (
                <li>
                  Script này đang gắn với file Sheet này:{" "}
                  <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                    mở file
                  </a>
                  . Hãy mở Apps Script từ <strong>chính file đó</strong> (Tiện ích mở rộng → Apps Script) rồi dán mã mới, Lưu.
                </li>
              )}
              <li>
                Triển khai → Quản lý bản triển khai → chọn <strong>đúng bản triển khai có ID trên</strong> → bút chì → Phiên bản: <strong>Phiên bản mới</strong> → Triển khai.
              </li>
              <li>
                Dán URL <span className="font-mono text-xs">…/exec</span> vào trình duyệt: phải thấy <span className="font-mono text-xs">&quot;version&quot;:2</span>. Rồi bấm làm mới.
              </li>
            </ul>
          </div>
        )}

        {freshJobs.length > 0 && (
          <div role="status" className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <BellIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-emerald-900">{freshJobs.length === 1 ? "Có 1 việc mới vừa được book" : `Có ${freshJobs.length} việc mới vừa được book`}</p>
              <ul className="mt-1 space-y-0.5 text-emerald-800">
                {freshJobs.slice(0, 4).map((job) => (
                  <li key={job.id} className="truncate">
                    {[job.task, job.title].filter(Boolean).join(" · ")}
                    {job.date !== "" && ` · ${formatDate(job.date)}`}
                  </li>
                ))}
                {freshJobs.length > 4 && <li>… và {freshJobs.length - 4} việc khác</li>}
              </ul>
            </div>
            <button type="button" onClick={() => setFreshKeys(new Set())} className="h-8 shrink-0 rounded-lg px-2.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100">
              Đã xem
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {firstLoad || switching ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : sections.length === 0 ? (
          <div className="grid place-items-center rounded-2xl bg-slate-50 px-4 py-14 text-center">
            <ClipboardIcon className="h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-600">
              {terms.length > 0
                ? "Không tìm thấy công việc phù hợp"
                : tab === "today"
                  ? "Hôm nay trống việc. Nghỉ ngơi hoặc thêm việc mới nhé."
                  : tab === "done"
                    ? "Chưa có việc nào hoàn thành"
                    : tab === "upcoming"
                      ? "Không có việc sắp tới"
                      : "Chưa có công việc nào"}
            </p>
            {terms.length > 0 ? (
              <button type="button" onClick={() => setQuery("")} className={`${outlineButton} mt-4`}>
                Xóa tìm kiếm
              </button>
            ) : (
              <button type="button" onClick={openCreate} className={`${blackButton} mt-4`}>
                <PlusIcon className="h-4 w-4" />
                Thêm công việc
              </button>
            )}
          </div>
        ) : (
          <div key={`${viewTab}|${tab}|${designer}`} className="space-y-6">
            {sections.map((section, sectionIndex) => {
              const base = sections.slice(0, sectionIndex).reduce((total, item) => total + item.items.length, 0);
              return (
                <section key={section.key} aria-label={section.label || TAB_LABEL[tab]}>
                  {section.label !== "" && (
                    <h3 className={`mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${section.danger ? "text-red-600" : "text-slate-500"}`}>
                      {section.label}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium normal-case ${section.danger ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{section.items.length}</span>
                      <span className="h-px flex-1 bg-slate-100" aria-hidden="true" />
                    </h3>
                  )}
                  <ul className="space-y-2">
                    {section.items.map((job, index) => (
                      <JobRow key={job.id} job={job} today={today} fresh={freshKeys.has(jobKey(job))} index={base + index} onToggle={() => void toggleDone(job)} onEdit={() => openEdit(job)} onDelete={() => setToDelete(job)} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={form !== null} onClose={() => !saving && setForm(null)} title={form?.id ? "Sửa công việc" : "Thêm công việc"}>
        {form && (
          <form onSubmit={(event) => void submitForm(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Loại task</span>
                <Combobox label="Loại task" value={form.task} onChange={(task) => patchForm({ task })} options={taskOptions} maxLength={60} required placeholder="Chọn hoặc gõ loại task" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Tên công việc</span>
                <input value={form.title} onChange={(event) => patchForm({ title: event.target.value })} maxLength={300} required autoFocus placeholder="Ví dụ: Thiệp Quốc khánh Ba Lan 11/11" className={inputClass} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="mb-1.5 block text-sm font-medium">Deadline</span>
                <DatePicker label="Deadline" value={form.date} onChange={(date) => patchForm({ date })} required placeholder="Chọn deadline" />
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Số lượng</span>
                <input type="number" inputMode="numeric" min={1} max={999} value={form.quantity} onChange={(event) => patchForm({ quantity: event.target.value })} className={inputClass} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Designer</span>
                <Combobox label="Designer" value={form.designer} onChange={(designer) => patchForm({ designer })} options={designerOptions} maxLength={60} required placeholder="Chọn designer" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">
                  Người giao <span className="font-normal text-slate-400">(không bắt buộc)</span>
                </span>
                <Combobox label="Người giao" value={form.assigner} onChange={(assigner) => patchForm({ assigner })} options={assignerOptions} maxLength={60} placeholder="Chọn người giao" />
              </label>
            </div>
            <Segmented<JobStatus>
              label="Trạng thái"
              value={form.status}
              onChange={(status) => patchForm({ status })}
              options={(Object.keys(STATUS_LABEL) as JobStatus[]).map((key) => [key, STATUS_SHORT[key]])}
            />
            <p className="text-xs leading-5 text-slate-500">Điểm (SCORE) và các cột công thức của bảng do Google Sheet tự tính, web không ghi đè.</p>
            {formError && (
              <p role="alert" className="text-sm text-red-600">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setForm(null)} disabled={saving} className="h-11 rounded-xl px-4 text-sm font-medium text-slate-600 hover:text-slate-950">
                Hủy
              </button>
              <button type="submit" disabled={saving} className={`${blackButton} h-11 px-6`}>
                {saving ? "Đang lưu…" : form.id ? "Lưu thay đổi" : "Thêm"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={toDelete !== null} onClose={() => !deleting && setToDelete(null)} title="Xóa công việc?">
        {toDelete && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              <span className="font-semibold text-slate-900">{toDelete.title}</span> sẽ bị xóa nội dung ở tab {toDelete.tab} của Google Sheet. Công thức và bảng thống kê không bị ảnh hưởng.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setToDelete(null)} disabled={deleting} className="h-11 rounded-xl px-4 text-sm font-medium text-slate-600 hover:text-slate-950">
                Hủy
              </button>
              <button type="button" onClick={() => void confirmDelete()} disabled={deleting} className="h-11 rounded-xl bg-red-600 px-6 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
                {deleting ? "Đang xóa…" : "Xóa"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Liên kết Google Sheet" size="lg">
        <SetupPanel
          userId={userId}
          initial={link}
          onConnected={(value) => {
            setLink(value);
            setVersion((current) => current + 1);
            setSettingsOpen(false);
            showToast("Đã lưu liên kết.");
          }}
          onDisconnected={() => {
            setLink(null);
            setLoaded(null);
            setSettingsOpen(false);
          }}
          onToast={showToast}
        />
      </Modal>

      {toast && <ToastView toast={toast} />}
    </section>
  );
}

function ToastView({ toast }: { toast: Toast }) {
  return (
    <div role="status" className={`toast-in fixed bottom-6 left-1/2 z-[60] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full px-5 py-3 text-center text-sm font-medium shadow-lg ${toast.ok ? "bg-black text-white" : "bg-red-600 text-white"}`}>
      {toast.text}
    </div>
  );
}

export function JobManager() {
  return <AuthGate>{(userId) => <JobManagerInner userId={userId} />}</AuthGate>;
}
