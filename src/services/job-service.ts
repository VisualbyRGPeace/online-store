import { createClient } from "@/lib/supabase/client";

export type JobStatus = "todo" | "doing" | "done";
export type JobPriority = "high" | "medium" | "low";

export type Job = {
  id: string;
  title: string;
  client: string;
  date: string; // yyyy-MM-dd, "" nếu chưa đặt ngày
  priority: JobPriority;
  status: JobStatus;
  note: string;
  updatedAt: string;
};

export type JobInput = Pick<Job, "title" | "client" | "date" | "priority" | "status" | "note">;
export type JobLink = { scriptUrl: string; token: string };

/** Chữ ghi trong Google Sheet (người dùng cũng có thể gõ tay các giá trị này). */
export const STATUS_LABEL: Record<JobStatus, string> = { todo: "Cần làm", doing: "Đang làm", done: "Xong" };
export const PRIORITY_LABEL: Record<JobPriority, string> = { high: "Cao", medium: "Vừa", low: "Thấp" };

export type JobErrorCode =
  | "token_not_set"
  | "unauthorized"
  | "not_found"
  | "missing_title"
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
      return "Không tìm thấy công việc này trong Google Sheet (có thể đã bị xóa). Hãy bấm Làm mới.";
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
  if (/xong|hoan thanh|done|complete/.test(text)) return "done";
  if (/dang|doing|progress/.test(text)) return "doing";
  return "todo";
}

function parsePriority(raw: string): JobPriority {
  const text = plain(raw);
  if (/cao|high|gap|urgent/.test(text)) return "high";
  if (/thap|low/.test(text)) return "low";
  return "medium";
}

type RawJob = Record<string, unknown>;

function parseJob(raw: RawJob): Job | null {
  const id = typeof raw.id === "string" ? raw.id : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!id || !title) return null;
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : "";
  return {
    id,
    title,
    client: typeof raw.client === "string" ? raw.client : "",
    date,
    priority: parsePriority(typeof raw.priority === "string" ? raw.priority : ""),
    status: parseStatus(typeof raw.status === "string" ? raw.status : ""),
    note: typeof raw.note === "string" ? raw.note : "",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
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
    if (code === "token_not_set" || code === "unauthorized" || code === "not_found" || code === "missing_title") {
      throw new JobApiError(code);
    }
    throw new JobApiError("unknown", code);
  }
  return body;
}

function toSheetFields(input: Partial<JobInput>): Record<string, string> {
  const out: Record<string, string> = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.client !== undefined) out.client = input.client;
  if (input.date !== undefined) out.date = input.date;
  if (input.priority !== undefined) out.priority = PRIORITY_LABEL[input.priority];
  if (input.status !== undefined) out.status = STATUS_LABEL[input.status];
  if (input.note !== undefined) out.note = input.note;
  return out;
}

function requireJob(raw: unknown): Job {
  const job = typeof raw === "object" && raw !== null ? parseJob(raw as RawJob) : null;
  if (!job) throw new JobApiError("bad_response");
  return job;
}

export async function listJobs(link: JobLink): Promise<{ jobs: Job[]; sheetUrl: string }> {
  const body = await call(link, { action: "list" });
  const rows = Array.isArray(body.jobs) ? (body.jobs as RawJob[]) : [];
  const jobs = rows.map(parseJob).filter((job): job is Job => job !== null);
  return { jobs, sheetUrl: typeof body.sheetUrl === "string" ? body.sheetUrl : "" };
}

export async function createJob(link: JobLink, input: JobInput): Promise<Job> {
  const body = await call(link, { action: "create", job: toSheetFields(input) });
  return requireJob(body.job);
}

export async function updateJob(link: JobLink, id: string, patch: Partial<JobInput>): Promise<Job> {
  const body = await call(link, { action: "update", id, patch: toSheetFields(patch) });
  return requireJob(body.job);
}

export async function deleteJob(link: JobLink, id: string): Promise<void> {
  await call(link, { action: "delete", id });
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
