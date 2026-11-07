import { DEFAULT_ASSIGNERS, DEFAULT_DESIGNERS, DEFAULT_TASKS, type Job } from "@/services/job-service";

/** Người giao luôn có mặt trong báo cáo (kể cả khi tháng đó chưa có việc), theo mẫu báo cáo. */
const REPORT_ASSIGNERS = [...DEFAULT_ASSIGNERS, "Sale Nawon"];

export type Stat = { count: number; qty: number };

export type JobReport = {
  tab: string; // "T11"
  month: number;
  year: number;
  tasks: string[];
  designers: string[];
  assigners: string[];
  /** Mỗi loại task: tổng + theo từng designer. */
  taskRows: { task: string; total: Stat; byDesigner: Stat[] }[];
  /** Mỗi người giao: số task + số lượng. */
  byAssigner: Stat[];
  totalJobs: number;
  totalQty: number;
};

const NO_TASK = "Chưa phân loại";
const NO_DESIGNER = "Chưa giao";
const NO_ASSIGNER = "Chưa ghi";

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Gom các cách viết khác nhau của cùng một tên ("vũ", "Vũ ", "VŨ") về một dòng/cột:
 * mục mặc định đứng trước theo đúng thứ tự, mục lạ xếp A → Z, mục trống (nếu có) đứng cuối.
 */
function buildAxis(defaults: string[], values: string[], emptyLabel: string): { labels: string[]; indexOf: (value: string) => number } {
  const labels: string[] = [];
  const index = new Map<string, number>();
  for (const name of defaults) {
    const key = fold(name);
    if (!index.has(key)) {
      index.set(key, labels.length);
      labels.push(name);
    }
  }
  const extras = new Map<string, string>();
  let hasEmpty = false;
  for (const raw of values) {
    const name = raw.trim();
    if (name === "") {
      hasEmpty = true;
      continue;
    }
    const key = fold(name);
    if (!index.has(key) && !extras.has(key)) extras.set(key, name);
  }
  for (const [key, name] of [...extras].sort((a, b) => a[1].localeCompare(b[1], "vi"))) {
    index.set(key, labels.length);
    labels.push(name);
  }
  if (hasEmpty) {
    index.set("", labels.length);
    labels.push(emptyLabel);
  }
  return { labels, indexOf: (value) => index.get(fold(value)) ?? -1 };
}

/** Tên tab "T11" → số tháng 11 (0 nếu không đọc được). */
function monthOfTab(tab: string): number {
  const match = /(\d{1,2})/.exec(tab);
  const month = match ? Number(match[1]) : 0;
  return month >= 1 && month <= 12 ? month : 0;
}

/** Năm của báo cáo: năm xuất hiện nhiều nhất trong deadline của tab; không có thì lấy năm hiện tại. */
function yearOfJobs(jobs: Job[]): number {
  const counter = new Map<number, number>();
  for (const job of jobs) {
    const year = Number(job.date.slice(0, 4));
    if (Number.isInteger(year) && year > 2000) counter.set(year, (counter.get(year) ?? 0) + 1);
  }
  let best = new Date().getFullYear();
  let bestCount = 0;
  for (const [year, count] of counter) {
    if (count > bestCount) {
      best = year;
      bestCount = count;
    }
  }
  return best;
}

const empty = (): Stat => ({ count: 0, qty: 0 });

/** Số liệu báo cáo cho một tab tháng. Tự đếm từ danh sách job, không cần nhập tay. */
export function buildReport(allJobs: Job[], tab: string): JobReport {
  const jobs = allJobs.filter((job) => job.tab === tab);
  const task = buildAxis(DEFAULT_TASKS, jobs.map((job) => job.task), NO_TASK);
  const designer = buildAxis(DEFAULT_DESIGNERS, jobs.map((job) => job.designer), NO_DESIGNER);
  const assigner = buildAxis(REPORT_ASSIGNERS, jobs.map((job) => job.assigner), NO_ASSIGNER);

  const taskRows = task.labels.map((label) => ({ task: label, total: empty(), byDesigner: designer.labels.map(empty) }));
  const byAssigner = assigner.labels.map(empty);
  let totalJobs = 0;
  let totalQty = 0;

  for (const job of jobs) {
    const qty = Number.isFinite(job.quantity) && job.quantity > 0 ? job.quantity : 0;
    const t = taskRows[task.indexOf(job.task)];
    const d = designer.indexOf(job.designer);
    const a = byAssigner[assigner.indexOf(job.assigner)];
    if (t) {
      t.total.count += 1;
      t.total.qty += qty;
      const cell = t.byDesigner[d];
      if (cell) {
        cell.count += 1;
        cell.qty += qty;
      }
    }
    if (a) {
      a.count += 1;
      a.qty += qty;
    }
    totalJobs += 1;
    totalQty += qty;
  }

  return {
    tab,
    month: monthOfTab(tab),
    year: yearOfJobs(jobs),
    tasks: task.labels,
    designers: designer.labels,
    assigners: assigner.labels,
    taskRows,
    byAssigner,
    totalJobs,
    totalQty,
  };
}
