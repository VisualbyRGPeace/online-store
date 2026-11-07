import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type Color, type PDFFont } from "pdf-lib";
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

const color = (hex: string): Color => rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);

// Bảng màu: xanh navy đậm làm chủ đạo, vàng đồng làm điểm nhấn, xám dịu cho chữ phụ và đường kẻ.
const C = {
  navy: color("0B2545"),
  gold: color("B08D57"),
  ink: color("1F2937"),
  muted: color("6B7280"),
  soft: color("A3AAB6"),
  line: color("DDE2EA"),
  zebra: color("F6F8FB"),
  tint: color("EDF2FA"),
  total: color("E3EAF6"),
  card: color("F3F6FA"),
  white: color("FFFFFF"),
  track: color("E9EDF3"),
  bar: color("2A5298"),
};

const HEAD_FILL = "0B2545";
// Mỗi designer một cặp màu (tiêu đề nhóm đậm, dòng TASK / SỐ LƯỢNG nhạt hơn một bậc).
const DESIGNER_COLORS = [
  { group: "163A70", sub: "2A5298" },
  { group: "0E4F5C", sub: "2A7384" },
  { group: "3D3A78", sub: "5A57A0" },
  { group: "7A5C1E", sub: "A07F3A" },
  { group: "5B2A4F", sub: "84446F" },
];

const upper = (text: string) => text.toLocaleUpperCase("vi");
const fmtDate = (date: Date) => `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
/** Phần trăm làm tròn 1 số lẻ cho biểu đồ: 43,3% */
const fmtPct1 = (ratio: number) => `${String(Math.round(ratio * 1000) / 10).replace(".", ",")}%`;

type Align = "left" | "center" | "right";
type Box = { x: number; y: number; w: number; h: number }; // y tính từ mép trên trang xuống

/** Dựng file PDF báo cáo (A4 ngang, 2 trang: tổng quan bằng biểu đồ + bảng chi tiết), trả về nội dung PDF. */
export async function buildReportPdf(report: JobReport, author: string, exportedAt: Date = new Date(), fonts?: ReportFonts): Promise<Uint8Array> {
  const bytes = fonts ?? (await loadFonts());
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // Nhúng nguyên font (không subset): subset của pdf-lib làm rơi chữ ở font này.
  const regular = await pdf.embedFont(bytes.regular, { subset: false });
  const bold = await pdf.embedFont(bytes.bold, { subset: false });

  const W = 841.89;
  const H = 595.28;
  const M = 40;
  const CW = W - 2 * M;
    const page = pdf.addPage([W, H]);

  const monthText = report.month > 0 ? `Tháng ${report.month}/${report.year}` : report.tab;
  const monthLower = monthText.charAt(0).toLocaleLowerCase("vi") + monthText.slice(1);
  pdf.setTitle(`BÁO CÁO TIẾN ĐỘ MARKETING DESIGN – ${monthText}`);
  pdf.setAuthor(author);
  pdf.setCreator("Dowdee");
  pdf.setCreationDate(exportedAt);
  pdf.setLanguage("vi-VN");

  // ---- Hàm vẽ ----
  const fit = (value: string, font: PDFFont, size: number, maxWidth: number) => {
    let s = size;
    while (s > 6 && font.widthOfTextAtSize(value, s) > maxWidth) s -= 0.5;
    let out = value;
    while (out.length > 1 && font.widthOfTextAtSize(out, s) > maxWidth) out = `${out.slice(0, -2)}…`;
    return { text: out, size: s };
  };

  const baselineOf = (box: Box, size: number) => H - (box.y + box.h / 2) - size * 0.36;

  const text = (value: string, box: Box, font: PDFFont, size: number, fill: Color, align: Align = "left", pad = 8) => {
    const f = fit(value, font, size, box.w - pad * 2);
    const width = font.widthOfTextAtSize(f.text, f.size);
    const x = align === "center" ? box.x + (box.w - width) / 2 : align === "right" ? box.x + box.w - width - pad : box.x + pad;
    page.drawText(f.text, { x, y: baselineOf(box, f.size), size: f.size, font, color: fill });
  };

  /** Chữ giãn cách đều (dùng cho nhãn viết hoa nhỏ). */
  const spacedWidth = (value: string, font: PDFFont, size: number, gap: number) => [...value].reduce((total, ch) => total + font.widthOfTextAtSize(ch, size) + gap, 0) - gap;
  const spaced = (value: string, box: Box, font: PDFFont, size: number, fill: Color, gap = 1, align: Align = "left") => {
    const width = spacedWidth(value, font, size, gap);
    let x = align === "center" ? box.x + (box.w - width) / 2 : align === "right" ? box.x + box.w - width : box.x;
    const y = baselineOf(box, size);
    for (const ch of value) {
      page.drawText(ch, { x, y, size, font, color: fill });
      x += font.widthOfTextAtSize(ch, size) + gap;
    }
    return width;
  };

  const rect = (box: Box, fill: Color, border?: { color: Color; width: number }) =>
    page.drawRectangle({ x: box.x, y: H - box.y - box.h, width: box.w, height: box.h, color: fill, borderColor: border?.color, borderWidth: border ? border.width : 0 });

  const hline = (x1: number, x2: number, top: number, thickness: number, fill: Color) =>
    page.drawLine({ start: { x: x1, y: H - top }, end: { x: x2, y: H - top }, thickness, color: fill });

  const sectionTitle = (label: string, top: number, left = M, right = W - M) => {
    const width = spaced(label, { x: left, y: top, w: right - left, h: 14 }, bold, 9.5, C.navy, 1);
    hline(left + width + 12, right, top + 7, 0.6, C.line);
  };

  /** Ô tiêu đề bảng: nền đậm, chữ trắng, viền trắng mảnh ngăn các cột. */
  const head = (box: Box, label: string, fill: string, size = 8.5) => {
    rect(box, color(fill), { color: C.white, width: 0.5 });
    text(label, box, bold, size, C.white, "center", 4);
  };

  /** Ô dữ liệu: không kẻ dọc, chỉ một đường kẻ mảnh phía dưới; số 0 hiện xám nhạt cho dễ đọc. */
  const cellBody = (box: Box, label: string, o: { fill?: Color; font?: PDFFont; fg?: Color; align?: Align; size?: number } = {}) => {
    if (o.fill) rect(box, o.fill);
    const isZero = label === "0" || label === "0%";
    text(label, box, o.font ?? regular, o.size ?? 10, o.fg ?? (isZero ? C.soft : C.ink), o.align ?? "center", 10);
    hline(box.x, box.x + box.w, box.y + box.h, 0.5, C.line);
  };

  // ---- Biểu đồ tròn: vẽ các miếng bằng đường dẫn SVG (hệ tọa độ gốc ở góc trên trái trang) ----
  const slice = (cx: number, cy: number, r: number, a0: number, a1: number, fill: Color) => {
    const px = (a: number) => cx + r * Math.cos(a);
    const py = (a: number) => cy + r * Math.sin(a);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    page.drawSvgPath(`M ${cx} ${cy} L ${px(a0)} ${py(a0)} A ${r} ${r} 0 ${large} 1 ${px(a1)} ${py(a1)} Z`, { x: 0, y: H, color: fill, borderColor: C.white, borderWidth: 1.5 });
  };
  const donut = (cx: number, cy: number, r: number, values: number[], colors: Color[]) => {
    const total = values.reduce((sum, v) => sum + v, 0);
    if (total <= 0) {
      page.drawCircle({ x: cx, y: H - cy, size: r, color: C.track });
    } else if (values.filter((v) => v > 0).length === 1) {
      page.drawCircle({ x: cx, y: H - cy, size: r, color: colors[values.findIndex((v) => v > 0)] ?? C.navy });
    } else {
      let angle = -Math.PI / 2;
      values.forEach((v, i) => {
        if (v <= 0) return;
        const next = angle + (v / total) * Math.PI * 2;
        slice(cx, cy, r, angle, next, colors[i] ?? C.navy);
        angle = next;
      });
    }
    page.drawCircle({ x: cx, y: H - cy, size: r * 0.62, color: C.white });
  };

  const footer = () => {
    hline(M, W - M, H - 40, 0.5, C.line);
    const foot = { x: M, y: H - 34, w: CW, h: 10 };
    text(`Marketing Design  ·  Báo cáo ${monthLower}`, foot, regular, 7.5, C.muted, "left", 0);
    text(`Ngày lập ${fmtDate(exportedAt)}`, foot, regular, 7.5, C.muted, "right", 0);
  };

  // ---- Dữ liệu ----
  const nD = report.designers.length;
  const byQty = <T extends { qty: number; count: number }>(a: T, b: T) => b.qty - a.qty || b.count - a.count;
  const designerStats = report.designers.map((name, i) => ({
    name,
    count: report.taskRows.reduce((total, row) => total + (row.byDesigner[i]?.count ?? 0), 0),
    qty: report.taskRows.reduce((total, row) => total + (row.byDesigner[i]?.qty ?? 0), 0),
  }));
  let assignerStats = report.assigners.map((name, i) => ({ name, count: report.byAssigner[i]?.count ?? 0, qty: report.byAssigner[i]?.qty ?? 0 })).filter((row) => row.qty > 0 || row.count > 0).sort(byQty);
  if (assignerStats.length > 9) {
    const rest = assignerStats.slice(8);
    assignerStats = [...assignerStats.slice(0, 8), { name: "Khác", count: rest.reduce((t, r) => t + r.count, 0), qty: rest.reduce((t, r) => t + r.qty, 0) }];
  }
  const topTask = [...report.taskRows].filter((row) => row.total.count > 0).sort((a, b) => byQty({ qty: a.total.qty, count: a.total.count }, { qty: b.total.qty, count: b.total.count }))[0];
  const topAssigner = assignerStats[0];
  const empty = report.totalJobs === 0;

  // =====================================================================
  // MỘT TRANG DUY NHẤT
  // =====================================================================
  rect({ x: 0, y: 0, w: W, h: 6 }, C.navy);
  spaced("BÁO CÁO TIẾN ĐỘ", { x: M, y: 29, w: 300, h: 12 }, bold, 8, C.bar, 2.2);
  text("MARKETING DESIGN", { x: M, y: 41, w: 520, h: 28 }, bold, 22, C.navy, "left", 0);
  text(monthText, { x: M, y: 69, w: 300, h: 14 }, regular, 11, C.muted, "left", 0);

  // Lưới trang: hai cột (trái rộng hơn), khoảng cách giữa hai cột 24, giữa các thẻ 12; mọi khối bám theo hai cột này.
  const GUTTER = 24;
  const CARD_GAP = 12;
  const leftW = 456;
  const rightX = M + leftW + GUTTER;
  const rightW = W - M - rightX;

  // Ngày lập / người lập: nhãn thẳng hàng trái, giá trị căn phải sát lề phải của trang
  const metaLabelX = W - M - 210;
  const meta = (row: number, label: string, value: string) => {
    const top = 40 + row * 17;
    spaced(label, { x: metaLabelX, y: top, w: 70, h: 14 }, bold, 7, C.muted, 1.2);
    text(value, { x: metaLabelX + 70, y: top, w: 140, h: 14 }, bold, 10, C.ink, "right", 0);
  };
  meta(0, "NGÀY LẬP", fmtDate(exportedAt));
  meta(1, "NGƯỜI LẬP", upper(author));
  hline(M, W - M, 92, 0.8, C.line);

  // Chỉ số tổng quan: hai thẻ nằm gọn trong cột trái, hai thẻ nằm gọn trong cột phải
  const kpis: { label: string; value: string; small?: boolean }[] = [
    { label: "TỔNG TASK", value: String(report.totalJobs) },
    { label: "TỔNG SỐ LƯỢNG", value: String(report.totalQty) },
    { label: "LOẠI TASK NHIỀU NHẤT", value: topTask ? upper(topTask.task) : "–", small: true },
    { label: "NGƯỜI GIAO NHIỀU NHẤT", value: topAssigner ? upper(topAssigner.name) : "–", small: true },
  ];
  const cardTop = 106;
  const cardH = 46;
  const leftCardW = (leftW - CARD_GAP) / 2;
  const rightCardW = (rightW - CARD_GAP) / 2;
  kpis.forEach((kpi, i) => {
    const w = i < 2 ? leftCardW : rightCardW;
    const x = i < 2 ? M + i * (leftCardW + CARD_GAP) : rightX + (i - 2) * (rightCardW + CARD_GAP);
    rect({ x, y: cardTop, w, h: cardH }, C.card);
    spaced(kpi.label, { x: x + 14, y: cardTop + 7, w: w - 20, h: 10 }, bold, 6.3, C.muted, 0.9);
    text(kpi.value, { x: x + 14, y: cardTop + 19, w: w - 20, h: 24 }, bold, kpi.small ? 12.5 : 20, C.navy, "left", 0);
  });

  const mainTop = cardTop + cardH + 22;
  const mainBottom = 522;

  // ---- Trái: I. Thống kê task theo hạng mục ----
  sectionTitle("I.  THỐNG KÊ TASK THEO HẠNG MỤC", mainTop, M, M + leftW);
  const hh = 16;
  const t1Top = mainTop + 24;
  const rows1 = report.taskRows.length;
  const rowH = Math.max(15, Math.min(32, (mainBottom - t1Top - 2 * hh - 3) / (rows1 + 1)));
  const fs = rowH >= 20 ? 10 : 8.5;
  const col1 = 108;
  const colW = (leftW - col1) / (2 + 2 * nD);
  const cx = (i: number) => M + col1 + i * colW;
  const slLabel = colW < 54 ? "SL" : "SỐ LƯỢNG"; // cột hẹp (nhiều designer) thì viết tắt
  head({ x: M, y: t1Top, w: col1, h: 2 * hh }, "TÊN TASK", HEAD_FILL, 8);
  head({ x: cx(0), y: t1Top, w: colW, h: 2 * hh }, "TỔNG", HEAD_FILL, 8);
  head({ x: cx(1), y: t1Top, w: colW, h: 2 * hh }, slLabel, HEAD_FILL, 7.5);
  report.designers.forEach((name, i) => {
    const pal = DESIGNER_COLORS[i % DESIGNER_COLORS.length] ?? DESIGNER_COLORS[0]!;
    head({ x: cx(2 + 2 * i), y: t1Top, w: 2 * colW, h: hh }, upper(name), pal.group, 8);
    head({ x: cx(2 + 2 * i), y: t1Top + hh, w: colW, h: hh }, "TASK", pal.sub, 7);
    head({ x: cx(3 + 2 * i), y: t1Top + hh, w: colW, h: hh }, slLabel, pal.sub, 7);
  });

  let y = t1Top + 2 * hh;
  report.taskRows.forEach((row, index) => {
    const zebra = index % 2 === 1 ? C.zebra : undefined;
    cellBody({ x: M, y, w: col1, h: rowH }, upper(row.task), { align: "left", fill: zebra, size: fs });
    cellBody({ x: cx(0), y, w: colW, h: rowH }, String(row.total.count), { fill: C.tint, font: bold, fg: row.total.count === 0 ? C.soft : C.navy, size: fs });
    cellBody({ x: cx(1), y, w: colW, h: rowH }, String(row.total.qty), { fill: C.tint, font: bold, fg: row.total.qty === 0 ? C.soft : C.navy, size: fs });
    row.byDesigner.forEach((stat, i) => {
      cellBody({ x: cx(2 + 2 * i), y, w: colW, h: rowH }, String(stat.count), { fill: zebra, size: fs });
      cellBody({ x: cx(3 + 2 * i), y, w: colW, h: rowH }, String(stat.qty), { fill: zebra, size: fs });
    });
    y += rowH;
  });
  const totalH = rowH + 3;
  const totalBox = (x: number, w: number): Box => ({ x, y, w, h: totalH });
  rect({ x: M, y, w: leftW, h: totalH }, C.total);
  hline(M, M + leftW, y, 1.2, C.navy);
  hline(M, M + leftW, y + totalH, 0.5, C.navy);
  text("TỔNG", totalBox(M, col1), bold, fs, C.navy, "left", 10);
  text(String(report.totalJobs), totalBox(cx(0), colW), bold, fs + 0.5, C.navy, "center", 6);
  text(String(report.totalQty), totalBox(cx(1), colW), bold, fs + 0.5, C.navy, "center", 6);
  designerStats.forEach((d, i) => {
    text(String(d.count), totalBox(cx(2 + 2 * i), colW), bold, fs + 0.5, C.navy, "center", 6);
    text(String(d.qty), totalBox(cx(3 + 2 * i), colW), bold, fs + 0.5, C.navy, "center", 6);
  });
  const leftBottom = y + totalH; // đáy cột trái: cột phải sẽ co giãn để kết thúc đúng ở đây

  // ---- Phải: cơ cấu designer (biểu đồ tròn) + II. phân bổ theo người giao ----
  // Bảng II dùng cùng chiều cao dòng với bảng I; phần còn lại dành cho biểu đồ tròn, nên hai cột luôn bằng đáy nhau.
  const hh2 = 16;
  const nRows2 = Math.max(assignerStats.length, 1) + 1; // người giao + dòng tổng
  const rightFixed = 24 + 18 + 24 + hh2 + 3; // tiêu đề donut + khoảng cách + tiêu đề mục II + tiêu đề bảng + dòng tổng thêm
  const avail = leftBottom - mainTop - rightFixed;
  const rowH2 = Math.max(14, Math.min(rowH, (avail - 88) / nRows2));
  const block = Math.max(88, Math.min(150, avail - nRows2 * rowH2));
  const donutR = Math.min(60, block / 2 - 2);

  sectionTitle("CƠ CẤU THEO DESIGNER", mainTop, rightX, W - M);
  const donutCx = rightX + donutR + 2;
  const donutCy = mainTop + 24 + block / 2;
  const palette = report.designers.map((_, i) => color((DESIGNER_COLORS[i % DESIGNER_COLORS.length] ?? DESIGNER_COLORS[0]!).group));
  donut(donutCx, donutCy, donutR, designerStats.map((d) => d.qty), palette);
  text(String(report.totalQty), { x: donutCx - 26, y: donutCy - 11, w: 52, h: 16 }, bold, donutR > 46 ? 15 : 13, C.navy, "center", 0);
  text("số lượng", { x: donutCx - 26, y: donutCy + 5, w: 52, h: 9 }, regular, 6.5, C.muted, "center", 0);
  const legendX = donutCx + donutR + 20;
  const legendW = W - M - legendX;
  const legendRow = Math.min(22, (donutR * 2) / Math.max(designerStats.length, 1));
  const legendTop = donutCy - (legendRow * designerStats.length) / 2;
  designerStats.forEach((d, i) => {
    const top = legendTop + i * legendRow;
    rect({ x: legendX, y: top + legendRow / 2 - 3, w: 6, h: 6 }, palette[i] ?? C.navy);
    text(d.name, { x: legendX + 12, y: top, w: legendW - 12 - 66, h: legendRow }, regular, 9, C.ink, "left", 0);
    text(String(d.qty), { x: legendX, y: top, w: legendW - 38, h: legendRow }, bold, 9, C.navy, "right", 0);
    text(report.totalQty > 0 ? fmtPct1(d.qty / report.totalQty) : "0%", { x: legendX, y: top, w: legendW, h: legendRow }, regular, 8, C.muted, "right", 0);
  });

  const t2Title = mainTop + 24 + block + 18;
  sectionTitle("II.  PHÂN BỔ THEO NGƯỜI GIAO", t2Title, rightX, W - M);
  const t2Top = t2Title + 24;
  if (empty || assignerStats.length === 0) {
    text("Chưa có dữ liệu", { x: rightX, y: t2Top + 6, w: rightW, h: 20 }, regular, 10, C.soft, "left", 0);
  } else {
    const fs2 = rowH2 >= 20 ? 10 : 8.5;
    const nameW = 96;
    const taskW = 42;
    const qtyW = 54;
    const pctW = rightW - nameW - taskW - qtyW;
    const px = rightX + nameW + taskW + qtyW;
    head({ x: rightX, y: t2Top, w: nameW, h: hh2 }, "NGƯỜI GIAO", HEAD_FILL, 7.5);
    head({ x: rightX + nameW, y: t2Top, w: taskW, h: hh2 }, "TASK", HEAD_FILL, 7.5);
    head({ x: rightX + nameW + taskW, y: t2Top, w: qtyW, h: hh2 }, "SỐ LƯỢNG", HEAD_FILL, 7);
    head({ x: px, y: t2Top, w: pctW, h: hh2 }, "TỶ LỆ", HEAD_FILL, 7.5);
    const maxRatio = report.totalQty > 0 ? Math.max(...assignerStats.map((r) => r.qty / report.totalQty)) : 0;
    const barW = pctW - 16 - 40;
    let ry = t2Top + hh2;
    assignerStats.forEach((row, i) => {
      const zebra = i % 2 === 1 ? C.zebra : undefined;
      const ratio = report.totalQty > 0 ? row.qty / report.totalQty : 0;
      cellBody({ x: rightX, y: ry, w: nameW, h: rowH2 }, row.name, { align: "left", fill: zebra, size: fs2 });
      cellBody({ x: rightX + nameW, y: ry, w: taskW, h: rowH2 }, String(row.count), { fill: zebra, size: fs2 });
      cellBody({ x: rightX + nameW + taskW, y: ry, w: qtyW, h: rowH2 }, String(row.qty), { fill: C.tint, font: bold, fg: row.qty === 0 ? C.soft : C.navy, size: fs2 });
      cellBody({ x: px, y: ry, w: pctW, h: rowH2 }, "", { fill: zebra });
      rect({ x: px + 8, y: ry + rowH2 / 2 - 2, w: barW, h: 4 }, C.track);
      if (maxRatio > 0 && ratio > 0) rect({ x: px + 8, y: ry + rowH2 / 2 - 2, w: Math.max(2, (barW * ratio) / maxRatio), h: 4 }, i === 0 ? C.gold : C.bar);
      text(fmtPct1(ratio), { x: px, y: ry, w: pctW, h: rowH2 }, bold, fs2 - 0.5, C.navy, "right", 8);
      ry += rowH2;
    });
    const tb = { x: rightX, y: ry, w: rightW, h: rowH2 + 3 };
    rect(tb, C.total);
    hline(rightX, W - M, ry, 1.2, C.navy);
    hline(rightX, W - M, ry + tb.h, 0.5, C.navy);
    text("TỔNG", { ...tb, w: nameW }, bold, fs2, C.navy, "left", 8);
    text(String(report.totalJobs), { ...tb, x: rightX + nameW, w: taskW }, bold, fs2, C.navy, "center", 4);
    text(String(report.totalQty), { ...tb, x: rightX + nameW + taskW, w: qtyW }, bold, fs2, C.navy, "center", 4);
    text("100%", { ...tb, x: px, w: pctW }, bold, fs2 - 0.5, C.navy, "right", 8);
  }

  footer();

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
