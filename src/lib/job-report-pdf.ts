import fontkit from "@pdf-lib/fontkit";
import {
  LineCapStyle,
  PDFDocument,
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type Color,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { JobReport } from "@/lib/job-report";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export type ReportFonts = { regular: ArrayBuffer | Uint8Array; bold: ArrayBuffer | Uint8Array };

let fontCache: Promise<ReportFonts> | null = null;

/** Font Arimo (cùng kích thước chữ với Arial, có đủ dấu tiếng Việt) nằm trong public/fonts, chỉ tải khi xuất. */
function loadFonts(): Promise<ReportFonts> {
  if (!fontCache) {
    const get = async (name: string) => {
      const response = await fetch(`${BASE}/fonts/${name}`);
      if (!response.ok) throw new Error(`Không tải được font ${name}`);
      return response.arrayBuffer();
    };
    fontCache = Promise.all([get("Arimo-Regular.ttf"), get("Arimo-Bold.ttf")])
      .then(([regular, bold]) => ({ regular, bold }))
      .catch((error) => {
        fontCache = null; // lần sau thử lại
        throw error;
      });
  }
  return fontCache;
}

// ---------------------------------------------------------------------------
// Màu sắc (mã hex không có dấu #)
// ---------------------------------------------------------------------------
const rgbOf = (hex: string): [number, number, number] => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
const col = (hex: string): Color => {
  const [r, g, b] = rgbOf(hex);
  return rgb(r / 255, g / 255, b / 255);
};

const C = {
  navy: "0A1F4D",
  ink: "1B2B4B",
  muted: "62728A",
  soft: "AEB8C6",
  line: "E2E8F0",
  zebra: "F2F5FA",
  band: "EBF0F9",
  bandZebra: "E1E9F5",
  white: "FFFFFF",
  track: "E6EBF2",
  teal: "14B8A6",
  blue: "1347B5",
  gold: "D9A84A",
  barBlue: "2F7DE1",
};

// Mỗi designer một màu: tiêu đề nhóm, dòng TASK / SỐ LƯỢNG (đậm hơn một chút) và màu trên biểu đồ tròn.
const DESIGNER_COLORS = [
  { group: "1550C0", sub: "123F9E", ring: "1347B5" },
  { group: "0E9A86", sub: "0B7F6F", ring: "0E8C7A" },
  { group: "6D4CC2", sub: "563AA3", ring: "6D4CC2" },
  { group: "D4881C", sub: "B26F10", ring: "D4881C" },
  { group: "C2447C", sub: "A23566", ring: "C2447C" },
];

// ---------------------------------------------------------------------------
// Biểu tượng (nét 24x24, kiểu Lucide)
// ---------------------------------------------------------------------------
const ICON = {
  layers: ["M12 2 2 7l10 5 10-5-10-5z", "M2 17l10 5 10-5", "M2 12l10 5 10-5"],
  checkCircle: ["M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z", "M8 12.2l2.8 2.8L16.2 9.2"],
  monitor: ["M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M8 21h8", "M12 17v4"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  calendar: ["M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M16 2v4", "M8 2v4", "M3 10h18", "M8 14h.01", "M12 14h.01", "M16 14h.01", "M8 18h.01", "M12 18h.01"],
  user: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8z"],
  megaphone: ["M3 11l18-5v12L3 14v-3z", "M11.6 16.8a3 3 0 1 1-5.8-1.6"],
  image: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M9 8a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3z", "M21 15l-5-5L5 21"],
  layout: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M3 9h18", "M9 21V9"],
  mail: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M22 7l-10 6L2 7"],
  checkSquare: ["M9 11l3 3L22 4", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
  printer: ["M6 9V2h12v7", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 14h12v8H6z"],
  fileText: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"],
  box: ["M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z", "M3.27 6.96L12 12.01l8.73-5.05", "M12 22.08V12"],
  dot: ["M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z", "M12 10a2 2 0 1 0 0 4a2 2 0 0 0 0-4z"],
};

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Chọn biểu tượng theo tên loại task (tên lạ thì dùng biểu tượng chấm tròn). */
function taskIcon(name: string): string[] {
  const k = fold(name);
  if (k.includes("file") || k.includes("an pham")) return ICON.fileText;
  if (k.includes("post")) return ICON.megaphone;
  if (k.includes("anh")) return ICON.image;
  if (k.includes("banner")) return ICON.layout;
  if (k.includes("thiep")) return ICON.mail;
  if (k.includes("mo hinh") || k.includes("3d")) return ICON.box;
  if (k.startsWith("in an") || k === "in") return ICON.printer;
  if (k.includes("khac")) return ICON.checkSquare;
  return ICON.dot;
}

const upper = (text: string) => text.toLocaleUpperCase("vi");
const fmtDate = (date: Date) => `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
/** Phần trăm làm tròn 1 số lẻ: 43,3% */
const fmtPct1 = (ratio: number) => `${String(Math.round(ratio * 1000) / 10).replace(".", ",")}%`;

type Align = "left" | "center" | "right";
type Box = { x: number; y: number; w: number; h: number };
type Radii = number | [number, number, number, number];
type Stop = [number, string];

/**
 * Dựng file PDF báo cáo (A4 ngang, 1 trang): thẻ chỉ số, bảng thống kê theo hạng mục,
 * biểu đồ tròn theo designer và bảng phân bổ theo người giao.
 * Mọi tọa độ bên dưới tính bằng "px" của bản thiết kế 1494 px rộng, tự quy đổi sang điểm PDF.
 */
export async function buildReportPdf(report: JobReport, author: string, exportedAt: Date = new Date(), fonts?: ReportFonts): Promise<Uint8Array> {
  const bytes = fonts ?? (await loadFonts());
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // Nhúng nguyên font (không subset): subset của pdf-lib làm rơi chữ ở font này.
  const regular = await pdf.embedFont(bytes.regular, { subset: false });
  const bold = await pdf.embedFont(bytes.bold, { subset: false });

  const W = 841.89;
  const H = 595.28;
  const K = W / 1494; // px thiết kế → điểm PDF
  const page: PDFPage = pdf.addPage([W, H]);

  const monthText = report.month > 0 ? `Tháng ${report.month}/${report.year}` : report.tab;
  const monthLower = monthText.charAt(0).toLocaleLowerCase("vi") + monthText.slice(1);
  pdf.setTitle(`BÁO CÁO TIẾN ĐỘ MARKETING DESIGN – ${monthText}`);
  pdf.setAuthor(author);
  pdf.setCreator("Dowdee");
  pdf.setCreationDate(exportedAt);
  pdf.setLanguage("vi-VN");

  // ---------------------------------------------------------------------
  // Hàm vẽ cơ bản
  // ---------------------------------------------------------------------
  const Y = (pt: number) => H - pt;

  /** Vẽ đường dẫn SVG với tọa độ px thiết kế (gốc ở góc trên trái trang). */
  const svg = (path: string, o: { fill?: string; opacity?: number; stroke?: string; sw?: number; round?: boolean } = {}) =>
    page.drawSvgPath(path, {
      x: 0,
      y: H,
      scale: K,
      color: o.fill ? col(o.fill) : undefined,
      opacity: o.opacity,
      borderColor: o.stroke ? col(o.stroke) : undefined,
      borderWidth: o.stroke ? (o.sw ?? 1) : 0,
      borderOpacity: o.opacity,
      borderLineCap: o.round ? LineCapStyle.Round : undefined,
    });

  const radiiOf = (r: Radii): [number, number, number, number] => (typeof r === "number" ? [r, r, r, r] : r);

  const roundedPath = (b: Box, r: Radii) => {
    const [tl, tr, br, bl] = radiiOf(r);
    const { x, y, w, h } = b;
    return [
      `M ${x + tl} ${y}`,
      `L ${x + w - tr} ${y}`,
      tr ? `A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` : "",
      `L ${x + w} ${y + h - br}`,
      br ? `A ${br} ${br} 0 0 1 ${x + w - br} ${y + h}` : "",
      `L ${x + bl} ${y + h}`,
      bl ? `A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` : "",
      `L ${x} ${y + tl}`,
      tl ? `A ${tl} ${tl} 0 0 1 ${x + tl} ${y}` : "",
      "Z",
    ].join(" ");
  };

  const rrect = (b: Box, r: Radii, fill: string, o: { opacity?: number; stroke?: string; sw?: number } = {}) => svg(roundedPath(b, r), { fill, ...o });

  const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, widthPx = 1, opacity = 1) =>
    page.drawLine({ start: { x: x1 * K, y: Y(y1 * K) }, end: { x: x2 * K, y: Y(y2 * K) }, thickness: widthPx * K, color: col(stroke), opacity });

  /** Khoanh vùng cắt theo hình chữ nhật bo góc (px thiết kế). */
  const clipRounded = (b: Box, r: Radii) => {
    const [tl, tr, br, bl] = radiiOf(r).map((v) => v * K) as [number, number, number, number];
    const x = b.x * K;
    const y = b.y * K;
    const w = b.w * K;
    const h = b.h * K;
    const c = 0.5523;
    const ops = [pushGraphicsState(), moveTo(x + tl, Y(y)), lineTo(x + w - tr, Y(y))];
    if (tr) ops.push(appendBezierCurve(x + w - tr + tr * c, Y(y), x + w, Y(y + tr - tr * c), x + w, Y(y + tr)));
    ops.push(lineTo(x + w, Y(y + h - br)));
    if (br) ops.push(appendBezierCurve(x + w, Y(y + h - br + br * c), x + w - br + br * c, Y(y + h), x + w - br, Y(y + h)));
    ops.push(lineTo(x + bl, Y(y + h)));
    if (bl) ops.push(appendBezierCurve(x + bl - bl * c, Y(y + h), x, Y(y + h - bl + bl * c), x, Y(y + h - bl)));
    ops.push(lineTo(x, Y(y + tl)));
    if (tl) ops.push(appendBezierCurve(x, Y(y + tl - tl * c), x + tl - tl * c, Y(y), x + tl, Y(y)));
    ops.push(closePath(), clip(), endPath());
    page.pushOperators(...ops);
  };

  const mixAt = (stops: Stop[], t: number): Color => {
    let lo = stops[0]!;
    let hi = stops[stops.length - 1]!;
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i]![0] && t <= stops[i + 1]![0]) {
        lo = stops[i]!;
        hi = stops[i + 1]!;
        break;
      }
    }
    const span = hi[0] - lo[0];
    const f = span <= 0 ? 0 : Math.min(1, Math.max(0, (t - lo[0]) / span));
    const a = rgbOf(lo[1]);
    const b = rgbOf(hi[1]);
    return rgb((a[0] + (b[0] - a[0]) * f) / 255, (a[1] + (b[1] - a[1]) * f) / 255, (a[2] + (b[2] - a[2]) * f) / 255);
  };

  /** Ô nền chuyển màu (ngang hoặc dọc), bo góc; `deco` vẽ thêm họa tiết bên trong phần đã cắt. */
  const gradient = (b: Box, r: Radii, stops: Stop[], dir: "h" | "v" = "h", deco?: () => void) => {
    clipRounded(b, r);
    const x = b.x * K;
    const y = b.y * K;
    const w = b.w * K;
    const h = b.h * K;
    const n = Math.max(2, Math.ceil((dir === "h" ? w : h) / 1.5));
    for (let i = 0; i < n; i++) {
      const color = mixAt(stops, n === 1 ? 0 : i / (n - 1));
      if (dir === "h") {
        const sw = w / n;
        page.drawRectangle({ x: x + i * sw, y: Y(y + h), width: sw + 0.8, height: h, color });
      } else {
        const sh = h / n;
        page.drawRectangle({ x, y: Y(y + (i + 1) * sh) - 0.8, width: w, height: sh + 0.8, color });
      }
    }
    deco?.();
    page.pushOperators(popGraphicsState());
  };

  const fit = (value: string, font: PDFFont, sizePt: number, maxWidth: number) => {
    let s = sizePt;
    while (s > sizePt * 0.6 && font.widthOfTextAtSize(value, s) > maxWidth) s -= 0.25;
    let out = value;
    while (out.length > 1 && font.widthOfTextAtSize(out, s) > maxWidth) out = `${out.slice(0, -2)}…`;
    return { text: out, size: s };
  };

  /** Chữ nằm giữa theo chiều dọc của ô (px thiết kế), kích thước chữ tính bằng px. */
  const text = (value: string, b: Box, font: PDFFont, sizePx: number, fill: string, align: Align = "left", padPx = 0) => {
    const f = fit(value, font, sizePx * K, (b.w - padPx * 2) * K);
    const width = font.widthOfTextAtSize(f.text, f.size);
    const bx = b.x * K;
    const x = align === "center" ? bx + (b.w * K - width) / 2 : align === "right" ? bx + b.w * K - width - padPx * K : bx + padPx * K;
    page.drawText(f.text, { x, y: Y((b.y + b.h / 2) * K) - f.size * 0.36, size: f.size, font, color: col(fill) });
  };

  const spaced = (value: string, b: Box, font: PDFFont, sizePx: number, fill: string, gapPx = 1) => {
    const size = sizePx * K;
    const gap = gapPx * K;
    let x = b.x * K;
    const y = Y((b.y + b.h / 2) * K) - size * 0.36;
    for (const ch of value) {
      page.drawText(ch, { x, y, size, font, color: col(fill) });
      x += font.widthOfTextAtSize(ch, size) + gap;
    }
  };

  /** Biểu tượng nét (khung 24x24) đặt tại (x, y) với cạnh `size` px. */
  const icon = (paths: string[], x: number, y: number, size: number, stroke: string, sw = 1.7) => {
    for (const path of paths) {
      page.drawSvgPath(path, { x: x * K, y: Y(y * K), scale: (size * K) / 24, borderColor: col(stroke), borderWidth: sw, borderLineCap: LineCapStyle.Round });
    }
  };

  /** Thẻ trắng bo góc có bóng đổ nhẹ và viền mảnh. */
  const card = (b: Box, r: number) => {
    for (let i = 0; i < 3; i++) {
      const g = (i + 1) * 1.3;
      rrect({ x: b.x - g, y: b.y - g + 2, w: b.w + 2 * g, h: b.h + 2 * g }, r + g, "1E3A6E", { opacity: 0.007 });
    }
    rrect(b, r, C.white, { stroke: "E3E9F2", sw: 1.2 });
  };

  const sectionTitle = (label: string, x: number, y: number, right: number) => {
    text(label, { x, y: y - 14, w: right - x, h: 28 }, bold, 22, C.navy, "left");
    line(x, y + 26, right, y + 26, C.line, 1.2);
  };

  // ---------------------------------------------------------------------
  // Dữ liệu
  // ---------------------------------------------------------------------
  const nD = Math.max(report.designers.length, 1);
  const byQty = <T extends { qty: number; count: number }>(a: T, b: T) => b.qty - a.qty || b.count - a.count;
  const designerStats = report.designers.map((name, i) => ({
    name,
    count: report.taskRows.reduce((total, row) => total + (row.byDesigner[i]?.count ?? 0), 0),
    qty: report.taskRows.reduce((total, row) => total + (row.byDesigner[i]?.qty ?? 0), 0),
  }));
  let assignerStats = report.assigners.map((name, i) => ({ name, count: report.byAssigner[i]?.count ?? 0, qty: report.byAssigner[i]?.qty ?? 0 })).filter((row) => row.qty > 0 || row.count > 0).sort(byQty);
  if (assignerStats.length > 8) {
    const rest = assignerStats.slice(7);
    assignerStats = [...assignerStats.slice(0, 7), { name: "Khác", count: rest.reduce((t, r) => t + r.count, 0), qty: rest.reduce((t, r) => t + r.qty, 0) }];
  }
  const topTask = [...report.taskRows].filter((row) => row.total.count > 0).sort((a, b) => byQty({ qty: a.total.qty, count: a.total.count }, { qty: b.total.qty, count: b.total.count }))[0];
  const topAssigner = assignerStats[0];
  const dColor = (i: number) => DESIGNER_COLORS[i % DESIGNER_COLORS.length] ?? DESIGNER_COLORS[0]!;

  // ---------------------------------------------------------------------
  // Nền trang
  // ---------------------------------------------------------------------
  gradient({ x: 0, y: 0, w: 1494, h: H / K }, 0, [[0, "FFFFFF"], [1, "F1F6FB"]], "v");

  // ---------------------------------------------------------------------
  // Đầu trang
  // ---------------------------------------------------------------------
  spaced("BÁO CÁO TIẾN ĐỘ", { x: 62, y: 22, w: 400, h: 24 }, regular, 21, "1E3A5F", 3.4);
  text("MARKETING DESIGN", { x: 62, y: 46, w: 760, h: 64 }, bold, 52, C.navy, "left");
  text(monthText, { x: 62, y: 104, w: 500, h: 32 }, regular, 27, "1E3A5F", "left");
  rrect({ x: 62, y: 145, w: 54, h: 3 }, 1.5, C.teal);

  icon(ICON.calendar, 1019, 78, 28, "1E3A5F", 1.5);
  text("Ngày lập", { x: 1062, y: 72, w: 120, h: 22 }, regular, 15.5, C.muted, "left");
  text(fmtDate(exportedAt), { x: 1062, y: 94, w: 125, h: 26 }, bold, 20, C.navy, "left");
  line(1190, 77, 1190, 115, "D5DCE7", 1.2);
  icon(ICON.user, 1219, 77, 30, "1E3A5F", 1.5);
  text("Người lập", { x: 1265, y: 72, w: 190, h: 22 }, regular, 15.5, C.muted, "left");
  text(upper(author), { x: 1265, y: 94, w: 190, h: 26 }, bold, 20, C.navy, "left");

  // ---------------------------------------------------------------------
  // Bốn thẻ chỉ số
  // ---------------------------------------------------------------------
  const kTop = 172;
  const kH = 104;
  const kpiBoxes: Box[] = [
    { x: 58, y: kTop, w: 369, h: kH },
    { x: 461, y: kTop, w: 307, h: kH },
    { x: 787, y: kTop, w: 317, h: kH },
    { x: 1123, y: kTop, w: 329, h: kH },
  ];
  // thẻ 1: nền xanh đậm chuyển màu
  for (let i = 0; i < 3; i++) rrect({ x: 58 - (i + 1) * 1.3, y: kTop - (i + 1) * 1.3 + 2, w: 369 + (i + 1) * 2.6, h: kH + (i + 1) * 2.6 }, 18 + (i + 1) * 1.3, "0B2A66", { opacity: 0.01 });
  gradient(kpiBoxes[0]!, 18, [[0, "0B2F73"], [0.55, "0C4A9B"], [1, "0D6FB0"]]);
  icon(ICON.layers, 86, 197, 44, C.white, 1.5);
  text("TỔNG TASK", { x: 155, y: 187, w: 250, h: 28 }, regular, 20, C.white, "left");
  text(String(report.totalJobs), { x: 155, y: 208, w: 250, h: 60 }, bold, 54, C.white, "left");

  const detail = (count: number, qty: number) => `${count} task  ·  ${qty} số lượng`;
  const kpiRest: { label: string; value: string; sub?: string; big: boolean; icon: string[] }[] = [
    { label: "TỔNG SỐ LƯỢNG", value: String(report.totalQty), big: true, icon: ICON.checkCircle },
    { label: "LOẠI TASK NHIỀU NHẤT", value: topTask ? upper(topTask.task) : "–", sub: topTask ? detail(topTask.total.count, topTask.total.qty) : undefined, big: false, icon: ICON.monitor },
    { label: "NGƯỜI GIAO NHIỀU NHẤT", value: topAssigner ? upper(topAssigner.name) : "–", sub: topAssigner ? detail(topAssigner.count, topAssigner.qty) : undefined, big: false, icon: ICON.users },
  ];
  kpiRest.forEach((kpi, i) => {
    const b = kpiBoxes[i + 1]!;
    card(b, 18);
    icon(kpi.icon, b.x + 28, b.y + 28, 44, C.navy, 1.4);
    if (kpi.big) {
      text(kpi.label, { x: b.x + 98, y: b.y + 14, w: b.w - 108, h: 26 }, regular, 17, "1E3A5F", "left");
      text(kpi.value, { x: b.x + 98, y: b.y + 40, w: b.w - 108, h: 52 }, bold, 54, C.navy, "left");
    } else {
      // thẻ có thêm dòng số liệu: nhãn, tên nổi bật, rồi "x task · y số lượng"
      text(kpi.label, { x: b.x + 98, y: b.y + 10, w: b.w - 108, h: 24 }, regular, 16, "1E3A5F", "left");
      text(kpi.value, { x: b.x + 98, y: b.y + 33, w: b.w - 108, h: 36 }, bold, 28, C.navy, "left");
      if (kpi.sub) text(kpi.sub, { x: b.x + 98, y: b.y + 69, w: b.w - 108, h: 24 }, regular, 16, C.muted, "left");
    }
  });

  // ---------------------------------------------------------------------
  // Bảng I: thống kê task theo hạng mục (khung trái)
  // ---------------------------------------------------------------------
  const left: Box = { x: 32, y: 311, w: 828, h: 629 };
  card(left, 22);
  sectionTitle("I.  THỐNG KÊ TASK THEO HẠNG MỤC", 56, 337, 838);

  const tx = 50;
  const tw = 792;
  const hTop = 386;
  const hh1 = 37;
  const hh2 = 30;
  const colName = 231;
  const colTotal = 84;
  const colQty = 97;
  const dW = (tw - colName - colTotal - colQty) / nD; // bề rộng mỗi designer
  const sW = dW / 2;
  const dx = (i: number) => tx + colName + colTotal + colQty + i * dW;
  const xTotal = tx + colName;
  const xQty = xTotal + colTotal;
  const slLabel = sW * K < 40 ? "SL" : "SỐ LƯỢNG";

  // dải tiêu đề: nhóm đầu (tên task + tổng) màu navy, mỗi designer một màu
  gradient({ x: tx, y: hTop, w: colName + colTotal + colQty, h: hh1 + hh2 }, [14, 0, 0, 0], [[0, "0A2A5E"], [1, "0F3C7E"]]);
  text("TÊN TASK", { x: tx, y: hTop, w: colName, h: hh1 + hh2 }, bold, 19, C.white, "center");
  text("TỔNG", { x: xTotal, y: hTop, w: colTotal, h: hh1 + hh2 }, bold, 19, C.white, "center");
  text(slLabel === "SL" ? "SL" : "SỐ LƯỢNG", { x: xQty, y: hTop, w: colQty, h: hh1 + hh2 }, bold, 17, C.white, "center");
  report.designers.forEach((name, i) => {
    const pal = dColor(i);
    const last = i === nD - 1;
    rrect({ x: dx(i), y: hTop, w: dW, h: hh1 }, [0, last ? 14 : 0, 0, 0], pal.group);
    rrect({ x: dx(i), y: hTop + hh1, w: dW, h: hh2 }, 0, pal.sub);
    text(upper(name), { x: dx(i), y: hTop, w: dW, h: hh1 }, bold, 19, C.white, "center", 4);
    text("TASK", { x: dx(i), y: hTop + hh1, w: sW, h: hh2 }, bold, 15, C.white, "center", 2);
    text(slLabel, { x: dx(i) + sW, y: hTop + hh1, w: sW, h: hh2 }, bold, 15, C.white, "center", 2);
    line(dx(i) + sW, hTop + hh1, dx(i) + sW, hTop + hh1 + hh2, C.white, 1, 0.22);
  });
  [xTotal, xQty, dx(0)].forEach((x) => line(x, hTop, x, hTop + hh1 + hh2, C.white, 1, 0.22));

  // thân bảng
  const bodyTop = hTop + hh1 + hh2 + 4;
  const nRows = Math.max(report.taskRows.length, 1);
  const pitch = Math.min(46.7, (845 - bodyTop) / nRows);
  const bodyEnd = bodyTop + pitch * nRows;
  const fs = pitch >= 32 ? 19 : Math.max(11, pitch * 0.5);
  rrect({ x: xTotal, y: hTop + hh1 + hh2, w: colTotal + colQty, h: bodyEnd - (hTop + hh1 + hh2) }, 0, C.band);
  report.taskRows.forEach((row, index) => {
    const y = bodyTop + index * pitch;
    const zebra = index % 2 === 1;
    if (zebra) {
      rrect({ x: tx, y, w: colName, h: pitch }, 0, C.zebra);
      rrect({ x: xTotal, y, w: colTotal + colQty, h: pitch }, 0, C.bandZebra);
      rrect({ x: dx(0), y, w: tw - colName - colTotal - colQty, h: pitch }, 0, C.zebra);
    }
    const cell = (x: number, w: number, value: number, strong: boolean) =>
      text(String(value), { x, y, w, h: pitch }, strong && value > 0 ? bold : regular, fs, value === 0 ? C.soft : strong ? C.navy : C.ink, "center", 4);
    icon(taskIcon(row.task), tx + 25, y + pitch / 2 - 12, 24, "1E3A5F", 1.6);
    text(upper(row.task), { x: tx + 69, y, w: colName - 74, h: pitch }, regular, fs - 1, C.ink, "left");
    cell(xTotal, colTotal, row.total.count, true);
    cell(xQty, colQty, row.total.qty, true);
    row.byDesigner.forEach((stat, i) => {
      cell(dx(i), sW, stat.count, false);
      cell(dx(i) + sW, sW, stat.qty, false);
    });
  });
  for (let i = 0; i < nD; i++) line(dx(i), hTop + hh1 + hh2, dx(i), bodyEnd, "D3DBE8", 1);
  line(xQty, hTop + hh1 + hh2, xQty, bodyEnd, "D3DBE8", 0.8, 0.6);

  // dòng tổng
  const totY = 852;
  const totH = 59;
  const totBox: Box = { x: 52, y: totY, w: 790, h: totH };
  gradient(totBox, 15, [[0, "0A2A5E"], [0.4, "0C4786"], [1, "0E9F8A"]]);
  const tcell = (x: number, w: number, value: string) => text(value, { x, y: totY, w, h: totH }, bold, 25, C.white, "center", 4);
  text("TỔNG", { x: 91, y: totY, w: 150, h: totH }, bold, 25, C.white, "left");
  tcell(xTotal, colTotal, String(report.totalJobs));
  tcell(xQty, colQty, String(report.totalQty));
  designerStats.forEach((d, i) => {
    tcell(dx(i), sW, String(d.count));
    tcell(dx(i) + sW, sW, String(d.qty));
  });

  // ---------------------------------------------------------------------
  // Biểu đồ tròn: cơ cấu theo designer
  // ---------------------------------------------------------------------
  const rx = 876;
  const rw = 591;
  // Khung II cao thêm khi có nhiều người giao (biểu đồ tròn co lại tương ứng, tối thiểu 240 px).
  const nA = Math.max(assignerStats.length, 1);
  const panelBottom = 940;
  const panel2Fixed = 62 + 37 + 8 + 45 + 26; // tiêu đề + hàng tiêu đề bảng + khoảng cách + dòng tổng + lề dưới
  const wantPitch = nA <= 3 ? 40.5 : Math.max(24, 40.5 - (nA - 3) * 5);
  const panel2H = Math.min(Math.max(304, panel2Fixed + nA * wantPitch), panelBottom - 311 - 16 - 240);
  const donutH = panelBottom - panel2H - 16 - 311;
  const donutPanel: Box = { x: rx, y: 311, w: rw, h: donutH };
  card(donutPanel, 22);
  sectionTitle("CƠ CẤU THEO DESIGNER", 905, 337, 1447);

  const dcx = 1035;
  const dcy = 311 + 62 + (donutH - 62) / 2 - 4;
  const dR = Math.min(110, (donutH - 62 - 24) / 2);
  const dScale = dR / 110;
  const palette = report.designers.map((_, i) => dColor(i).ring);
  const totalQtyForRing = designerStats.reduce((sum, d) => sum + d.qty, 0);
  const slice = (a0: number, a1: number, fill: string) => {
    const px = (a: number) => dcx + dR * Math.cos(a);
    const py = (a: number) => dcy + dR * Math.sin(a);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    svg(`M ${dcx} ${dcy} L ${px(a0)} ${py(a0)} A ${dR} ${dR} 0 ${large} 1 ${px(a1)} ${py(a1)} Z`, { fill, stroke: C.white, sw: 3 });
  };
  if (totalQtyForRing <= 0) {
    svg(`M ${dcx - dR} ${dcy} a ${dR} ${dR} 0 1 0 ${dR * 2} 0 a ${dR} ${dR} 0 1 0 ${-dR * 2} 0 Z`, { fill: C.track });
  } else if (designerStats.filter((d) => d.qty > 0).length === 1) {
    const idx = designerStats.findIndex((d) => d.qty > 0);
    svg(`M ${dcx - dR} ${dcy} a ${dR} ${dR} 0 1 0 ${dR * 2} 0 a ${dR} ${dR} 0 1 0 ${-dR * 2} 0 Z`, { fill: palette[idx] ?? C.blue });
  } else {
    let angle = -Math.PI / 2;
    designerStats.forEach((d, i) => {
      if (d.qty <= 0) return;
      const next = angle + (d.qty / totalQtyForRing) * Math.PI * 2;
      slice(angle, next, palette[i] ?? C.blue);
      angle = next;
    });
  }
  const dr = dR * 0.61;
  svg(`M ${dcx - dr} ${dcy} a ${dr} ${dr} 0 1 0 ${dr * 2} 0 a ${dr} ${dr} 0 1 0 ${-dr * 2} 0 Z`, { fill: C.white });
  text(String(report.totalQty), { x: dcx - 60, y: dcy - 36 * dScale, w: 120, h: 54 * dScale }, bold, 46 * dScale, C.navy, "center");
  text("số lượng", { x: dcx - 60, y: dcy + 12 * dScale, w: 120, h: 24 * dScale }, regular, 18 * dScale, C.muted, "center");

  const lgX = 1183;
  const lgR = 1437;
  const lgPitch = Math.min(45, (dR * 2) / nD);
  const lgTop = dcy - 10 - (lgPitch * nD) / 2;
  designerStats.forEach((d, i) => {
    const y = lgTop + i * lgPitch;
    rrect({ x: lgX, y: y + lgPitch / 2 - 7, w: 14, h: 14 }, 3, palette[i] ?? C.blue);
    text(d.name, { x: lgX + 27, y, w: 130, h: lgPitch }, regular, 20, C.ink, "left");
    text(String(d.qty), { x: lgX, y, w: 164, h: lgPitch }, bold, 20, C.navy, "right");
    text(totalQtyForRing > 0 ? fmtPct1(d.qty / totalQtyForRing) : "0%", { x: lgX, y, w: lgR - lgX, h: lgPitch }, regular, 19, C.muted, "right");
    if (i < nD - 1) line(lgX, y + lgPitch, lgR, y + lgPitch, C.line, 1);
  });

  // ---------------------------------------------------------------------
  // Bảng II: phân bổ theo người giao
  // ---------------------------------------------------------------------
  const p2Top = panelBottom - panel2H;
  const assignPanel: Box = { x: rx, y: p2Top, w: rw, h: panel2H };
  card(assignPanel, 22);
  sectionTitle("II.  PHÂN BỔ THEO NGƯỜI GIAO", 905, p2Top + 23, 1447);

  const ax = 894;
  const aw = 556;
  const aTop = p2Top + 62;
  const aH = 37;
  const nameW = 173;
  const taskW = 70;
  const qtyW = 96;
  const pctW = aw - nameW - taskW - qtyW;
  const axTask = ax + nameW;
  const axQty = axTask + taskW;
  const axPct = axQty + qtyW;
  gradient({ x: ax, y: aTop, w: aw, h: aH }, [12, 12, 0, 0], [[0, "0A2A5E"], [1, "0F3C7E"]]);
  text("NGƯỜI GIAO", { x: ax, y: aTop, w: nameW, h: aH }, bold, 16, C.white, "center");
  text("TASK", { x: axTask, y: aTop, w: taskW, h: aH }, bold, 16, C.white, "center");
  text("SỐ LƯỢNG", { x: axQty, y: aTop, w: qtyW, h: aH }, bold, 16, C.white, "center", 2);
  text("TỶ LỆ", { x: axPct, y: aTop, w: pctW, h: aH }, bold, 16, C.white, "center");
  [axTask, axQty, axPct].forEach((x) => line(x, aTop + 6, x, aTop + aH - 6, C.white, 1, 0.22));

  const aRowsTop = aTop + aH;
  const aTotH = 45;
  const aTotY = panelBottom - 28 - aTotH;
  if (assignerStats.length === 0) {
    text("Chưa có dữ liệu", { x: ax + 19, y: aRowsTop, w: aw - 38, h: 40 }, regular, 18, C.soft, "left");
  }
  const aPitch = Math.min(40.5, (aTotY - 8 - aRowsTop) / nA);
  const afs = aPitch >= 34 ? 18 : Math.max(13, aPitch * 0.56);
  const trackW = 127;
  const trackH = Math.min(14, aPitch * 0.4);
  assignerStats.forEach((row, i) => {
    const y = aRowsTop + i * aPitch;
    if (i % 2 === 1) rrect({ x: ax, y, w: aw, h: aPitch }, 0, C.zebra);
    const ratio = report.totalQty > 0 ? row.qty / report.totalQty : 0;
    text(row.name, { x: ax + 19, y, w: nameW - 24, h: aPitch }, regular, afs, C.ink, "left");
    text(String(row.count), { x: axTask, y, w: taskW, h: aPitch }, bold, afs, C.navy, "center", 4);
    text(String(row.qty), { x: axQty, y, w: qtyW, h: aPitch }, bold, afs, C.navy, "center", 4);
    const tx0 = axPct + 16;
    const ty = y + aPitch / 2 - trackH / 2;
    rrect({ x: tx0, y: ty, w: trackW, h: trackH }, trackH / 2, C.track);
    if (ratio > 0) rrect({ x: tx0, y: ty, w: Math.max(trackH, trackW * ratio), h: trackH }, trackH / 2, i === 0 ? C.gold : C.barBlue);
    text(fmtPct1(ratio), { x: axPct, y, w: pctW, h: aPitch }, regular, afs - 1, C.ink, "right", 10);
  });

  gradient({ x: ax, y: aTotY, w: aw, h: aTotH }, 13, [[0, "0A2A5E"], [0.5, "0C4A8A"], [1, "1B73B8"]]);
  text("TỔNG", { x: ax + 19, y: aTotY, w: nameW - 24, h: aTotH }, bold, 20, C.white, "left");
  text(String(report.totalJobs), { x: axTask, y: aTotY, w: taskW, h: aTotH }, bold, 20, C.white, "center", 4);
  text(String(report.totalQty), { x: axQty, y: aTotY, w: qtyW, h: aTotH }, bold, 20, C.white, "center", 4);
  text("100%", { x: axPct, y: aTotY, w: pctW, h: aTotH }, bold, 20, C.white, "right", 10);

  // ---------------------------------------------------------------------
  // Chân trang
  // ---------------------------------------------------------------------
  text("Marketing Design", { x: 77, y: 984, w: 200, h: 30 }, regular, 17, "1E3A5F", "left");
  line(218, 990, 218, 1008, "1E3A5F", 1.4);
  text(`Báo cáo ${monthLower}`, { x: 242, y: 984, w: 400, h: 30 }, regular, 17, "1E3A5F", "left");
  text(`Ngày lập ${fmtDate(exportedAt)}`, { x: 1100, y: 984, w: 345, h: 30 }, regular, 17, "1E3A5F", "right");

  return pdf.save();
}

/** Tên file gợi ý, ví dụ Bao-cao-Marketing-Design-T11-2026.pdf */
export function reportFileName(report: JobReport): string {
  return `Bao-cao-Marketing-Design-${report.tab}-${report.year}.pdf`.replace(/[^A-Za-z0-9._-]/g, "-");
}

/** Dựng báo cáo rồi cho trình duyệt tải về. */
export async function downloadReport(report: JobReport, author: string): Promise<void> {
  const bytes = await buildReportPdf(report, author);
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFileName(report);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
