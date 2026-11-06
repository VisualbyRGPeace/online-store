import { createClient } from "@/lib/supabase/client";

export type JobStatus = "received" | "priority" | "doing" | "done";

export type Job = {
  id: string; // dạng "T11:31" (tab:dòng) do script cấp
  tab: string;
  task: string; // loại task: Post Social, Sửa Ảnh, Thiệp…
  title: string;
  date: string; // deadline, yyyy-MM-dd ("" nếu trống)
  status: JobStatus;
  designer: string;
  quantity: number;
  assigner: string; // người giao (TASK ASSIGNMENT)
};

export type JobInput = Pick<Job, "task" | "title" | "date" | "status" | "designer" | "quantity" | "assigner">;
export type JobLink = { scriptUrl: string; token: string };

/** Đúng chữ trong cột COMPLETED STATUS của bảng. */
export const STATUS_LABEL: Record<JobStatus, string> = {
  received: "Đã nhận",
  priority: "Ưu tiên",
  doing: "Đang thực hiện",
  done: "Kết thúc",
};

/** Gợi ý ban đầu (lấy từ bảng); các giá trị có trong dữ liệu sẽ được gộp thêm. */
export const DEFAULT_TASKS = ["Post Social", "Sửa Ảnh", "Banner", "Thiệp", "Task khác", "In ấn", "Sửa file ấn phẩm", "Mô hình 3D"];
export const DEFAULT_DESIGNERS = ["Vũ", "Thành"];
export const DEFAULT_ASSIGNERS = ["Ms. Ngân", "Ms. Diệu", "Ms. Tuyền", "Mr. Huy", "Mr. Vinh"];

export type JobErrorCode =
  | "token_not_set"
  | "unauthorized"
  | "not_found"
  | "missing_title"
  | "stale"
  | "protected"
  | "tab_other_year"
  | "no_source_tab"
  | "no_tab"
  | "no_layout"
  | "cell_has_formula"
  | "bad_response"
  | "network"
  | "timeout"
  | "unknown";

export class JobApiError extends Error {
  readonly code: JobErrorCode;
  constructor(code: JobErrorCode, detail?: string) {
    super(detail ?? code);
    this.code = code;
  }
}

export function describeError(error: unknown): string {
  const code = error instanceof JobApiError ? error.code : "unknown";
  switch (code) {
    case "token_not_set":
      return "Trong Apps Script bạn chưa đổi dòng TOKEN. Hãy đặt mật mã riêng rồi triển khai lại.";
    case "unauthorized":
      return "Mật mã không khớp với TOKEN trong Apps Script.";
    case "not_found":
    case "stale":
      return "Bảng vừa thay đổi (dòng này đã bị sửa, xóa hoặc dời chỗ). Hãy bấm Làm mới rồi thử lại.";
    case "protected":
      return "Tab này đang bị khóa, tài khoản của bạn không có quyền sửa.";
    case "tab_other_year":
      return "Tab của tháng này đang chứa việc của năm khác. Hãy đổi tên tab cũ (ví dụ T1-2026) để web tạo tab mới.";
    case "no_source_tab":
      return "Chưa có tab tháng nào để làm mẫu. Hãy tạo tab T1…T12 đầu tiên theo đúng cấu trúc bảng.";
    case "no_tab":
      return "Không thấy tab tháng nào (T10, T11, T12…) có dòng tiêu đề TASK / TITLE / DEADLINE trong file này.";
    case "no_layout":
      return "Không nhận ra dòng tiêu đề của tab. Cần có các cột TITLE, DEADLINE và COMPLETED STATUS.";
    case "cell_has_formula":
      return "Ô cần ghi đang chứa công thức nên web không ghi đè. Hãy nhập tay dòng này trong Sheet.";
    case "missing_title":
      return "Hãy nhập tên công việc.";
    case "bad_response":
      return "Không đọc được phản hồi từ Google. Hãy kiểm tra đã triển khai web app với quyền truy cập “Bất kỳ ai”.";
    case "network":
      return "Không kết nối được tới Google. Kiểm tra mạng rồi thử lại.";
    case "timeout":
      return "Google phản hồi quá lâu. Vui lòng thử lại.";
    default:
      return "Chưa thực hiện được. Vui lòng thử lại.";
  }
}

// ---- Chuẩn hóa dữ liệu đọc từ Sheet ----
function plain(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

function parseStatus(raw: string): JobStatus {
  const text = plain(raw);
  if (/ket thuc|xong|hoan thanh|done/.test(text)) return "done";
  if (/dang|doing|progress/.test(text)) return "doing";
  if (/uu tien|priority|gap/.test(text)) return "priority";
  return "received";
}

type RawJob = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseJob(raw: RawJob): Job | null {
  const id = text(raw.id);
  const title = text(raw.title);
  if (!id || !title) return null;
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : "";
  const quantity = typeof raw.quantity === "number" && Number.isFinite(raw.quantity) && raw.quantity > 0 ? raw.quantity : 1;
  return {
    id,
    tab: text(raw.tab),
    task: text(raw.task),
    title,
    date,
    status: parseStatus(text(raw.status)),
    designer: text(raw.designer),
    quantity,
    assigner: text(raw.assigner),
  };
}

// ---- Gọi Apps Script ----
/** Chỉ nhận địa chỉ web app của Google (để không gửi mật mã tới nơi khác). */
export function isValidScriptUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "script.google.com" && url.pathname.endsWith("/exec");
  } catch {
    return false;
  }
}

const REQUEST_TIMEOUT_MS = 25_000;

async function call(link: JobLink, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!isValidScriptUrl(link.scriptUrl)) throw new JobApiError("bad_response");
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    // text/plain tránh yêu cầu "preflight" (Apps Script không trả lời OPTIONS).
    response = await fetch(link.scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, token: link.token }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new JobApiError(err instanceof DOMException && err.name === "AbortError" ? "timeout" : "network");
  } finally {
    window.clearTimeout(timer);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new JobApiError("bad_response");
  }
  if (typeof data !== "object" || data === null) throw new JobApiError("bad_response");
  const body = data as Record<string, unknown>;
  if (body.ok !== true) {
    const code = String(body.error ?? "");
    const known: JobErrorCode[] = ["token_not_set", "unauthorized", "not_found", "missing_title", "stale", "protected", "tab_other_year", "no_source_tab", "no_tab", "no_layout", "cell_has_formula"];
    const match = known.find((item) => item === code);
    if (match) throw new JobApiError(match);
    throw new JobApiError("unknown", code);
  }
  return body;
}

function toSheetFields(input: Partial<JobInput>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (input.task !== undefined) out.task = input.task;
  if (input.title !== undefined) out.title = input.title;
  if (input.date !== undefined) out.date = input.date;
  if (input.status !== undefined) out.status = STATUS_LABEL[input.status];
  if (input.designer !== undefined) out.designer = input.designer;
  if (input.quantity !== undefined) out.quantity = input.quantity;
  if (input.assigner !== undefined) out.assigner = input.assigner;
  return out;
}

function requireJob(raw: unknown): Job {
  const job = typeof raw === "object" && raw !== null ? parseJob(raw as RawJob) : null;
  if (!job) throw new JobApiError("bad_response");
  return job;
}

export type JobList = {
  jobs: Job[];
  sheetUrl: string;
  /** Tên các tab tháng trong file Sheet (T12, T11…), theo thứ tự trong file. */
  tabs: string[];
  /** Tab của tháng hiện tại. */
  currentTab: string;
  /** Các tab nằm trong phạm vi "gần đây" (tháng này ± 1). Rỗng nếu script cũ chưa cập nhật. */
  recentTabs: string[];
  /** Mã nội bộ (gid) của từng tab, để mở đúng tab trong Google Sheet. */
  tabGids: Record<string, number>;
  /** true nếu Apps Script trên Google còn là bản cũ (chưa trả danh sách tab). */
  outdated: boolean;
};

function gidMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof value === "object" && value !== null) {
    for (const [key, gid] of Object.entries(value)) if (typeof gid === "number" && Number.isFinite(gid)) out[key] = gid;
  }
  return out;
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** tab: tên tab tháng muốn xem thêm (ví dụ "T9"); bỏ trống = các tháng gần đây. */
export async function listJobs(link: JobLink, tab = ""): Promise<JobList> {
  const body = await call(link, tab ? { action: "list", tab } : { action: "list" });
  const rows = Array.isArray(body.jobs) ? (body.jobs as RawJob[]) : [];
  const jobs = rows.map(parseJob).filter((job): job is Job => job !== null);
  const tabs = textList(body.tabs);
  return {
    jobs,
    sheetUrl: typeof body.sheetUrl === "string" ? body.sheetUrl : "",
    // Script bản cũ chưa trả danh sách tab: tạm lấy từ chính dữ liệu.
    tabs: tabs.length > 0 ? tabs : [...new Set(jobs.map((job) => job.tab).filter(Boolean))],
    currentTab: typeof body.currentTab === "string" ? body.currentTab : "",
    recentTabs: textList(body.recentTabs),
    tabGids: gidMap(body.tabGids),
    outdated: !Array.isArray(body.tabs),
  };
}

export async function createJob(link: JobLink, input: JobInput): Promise<{ job: Job; tabCreated: boolean }> {
  const body = await call(link, { action: "create", job: toSheetFields(input) });
  return { job: requireJob(body.job), tabCreated: body.tabCreated === true };
}

/** expectedTitle: tên việc lúc web tải, để script chắc chắn đang sửa đúng dòng. */
export async function updateJob(link: JobLink, job: Pick<Job, "id" | "title">, patch: Partial<JobInput>): Promise<Job> {
  const body = await call(link, { action: "update", id: job.id, expectedTitle: job.title, patch: toSheetFields(patch) });
  return requireJob(body.job);
}

export async function deleteJob(link: JobLink, job: Pick<Job, "id" | "title">): Promise<void> {
  await call(link, { action: "delete", id: job.id, expectedTitle: job.title });
}

// ---- Lưu liên kết của từng tài khoản (Supabase; dự phòng trên trình duyệt nếu chưa chạy migration) ----
const LOCAL_PREFIX = "job-sheet-link:";

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

function readLocal(userId: string): JobLink | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFIX + userId);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<JobLink>;
    return typeof data.scriptUrl === "string" && typeof data.token === "string"
      ? { scriptUrl: data.scriptUrl, token: data.token }
      : null;
  } catch {
    return null;
  }
}

function writeLocal(userId: string, link: JobLink | null): void {
  try {
    if (link) window.localStorage.setItem(LOCAL_PREFIX + userId, JSON.stringify(link));
    else window.localStorage.removeItem(LOCAL_PREFIX + userId);
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua */
  }
}

export async function loadLink(userId: string): Promise<JobLink | null> {
  const { data, error } = await createClient()
    .from("job_sheet_links")
    .select("script_url, token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.code)) return readLocal(userId);
    throw error;
  }
  if (!data) return readLocal(userId);
  return { scriptUrl: String(data.script_url), token: String(data.token) };
}

export async function saveLink(userId: string, link: JobLink): Promise<void> {
  const { error } = await createClient()
    .from("job_sheet_links")
    .upsert(
      { user_id: userId, script_url: link.scriptUrl, token: link.token, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) {
    if (!isMissingTable(error.code)) throw error;
    writeLocal(userId, link);
    return;
  }
  writeLocal(userId, null);
}

export async function clearLink(userId: string): Promise<void> {
  const { error } = await createClient().from("job_sheet_links").delete().eq("user_id", userId);
  if (error && !isMissingTable(error.code)) throw error;
  writeLocal(userId, null);
}
