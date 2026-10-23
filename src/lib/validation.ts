import { z } from "zod";
import { isAllowedDriveUrl } from "@/utils/drive";

const email = z.email("Email không hợp lệ").max(254);
const password = z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(72, "Mật khẩu tối đa 72 ký tự");
const phone = z.string().regex(/^\+?[0-9]{9,15}$/, "Số điện thoại không hợp lệ");
const text = (label: string, max: number) =>
  z.string().min(1, `Vui lòng nhập ${label}`).max(max, `${label} tối đa ${max} ký tự`);

const username = z.string()
  .min(3, "Tên đăng nhập cần ít nhất 3 ký tự")
  .max(30, "Tên đăng nhập tối đa 30 ký tự")
  .regex(/^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*$/, "Dùng chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang");

const loginIdentifier = z.string().trim().min(3, "Nhập tên đăng nhập hoặc email").max(254)
  .refine((value) => value.includes("@") ? email.safeParse(value).success : username.safeParse(value).success,
    "Tên đăng nhập hoặc email không hợp lệ");

export const loginSchema = z.object({ identifier: loginIdentifier, password: z.string().min(1, "Vui lòng nhập mật khẩu") });

export const registerSchema = z
  .object({ username, password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Mật khẩu nhập lại không khớp" });

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Mật khẩu nhập lại không khớp" });

export const profileSchema = z.object({
  full_name: z.string().max(100, "Họ tên tối đa 100 ký tự"),
  phone: z.union([z.literal(""), phone]),
});

export const addressSchema = z.object({
  recipient_name: text("tên người nhận", 100),
  phone,
  province: text("tỉnh/thành phố", 100),
  district: text("quận/huyện", 100),
  ward: text("phường/xã", 100),
  street: text("địa chỉ cụ thể", 200),
});

/** Trimmed form values (passwords are never trimmed). */
export function formValues(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  new FormData(form).forEach((v, k) => {
    if (typeof v === "string") out[k] = k.startsWith("password") || k === "confirm" ? v : v.trim();
  });
  return out;
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

// ---- admin ----
const slug = z
  .string()
  .min(1, "Vui lòng nhập slug")
  .max(200)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang");

const wholeNumber = (label: string, max: number) =>
  z
    .string()
    .regex(/^\d+$/, `${label} phải là số nguyên không âm`)
    .refine((v) => Number(v) <= max, `${label} quá lớn`);

export const productSchema = z
  .object({
    name: text("tên sản phẩm", 200),
    slug,
    price: wholeNumber("Giá", 1_000_000_000),
    compare_at_price: z.union([z.literal(""), wholeNumber("Giá cũ", 1_000_000_000)]),
    stock: wholeNumber("Tồn kho", 1_000_000),
    category_id: z.string(),
    description: z.string().max(10000, "Mô tả tối đa 10.000 ký tự"),
    status: z.enum(["draft", "active", "archived"]),
  })
  .refine((v) => v.compare_at_price === "" || Number(v.compare_at_price) >= Number(v.price), {
    path: ["compare_at_price"],
    message: "Giá cũ phải lớn hơn hoặc bằng giá bán",
  });

export const categorySchema = z.object({ name: text("tên danh mục", 100), slug });

// ---- checkout / settings ----
export const checkoutSchema = z.object({
  customer_name: text("họ tên", 100),
  customer_phone: phone,
  customer_email: z.union([z.literal(""), email]),
  province: text("tỉnh/thành phố", 100),
  district: text("quận/huyện", 100),
  ward: text("phường/xã", 100),
  street: text("địa chỉ cụ thể", 200),
  note: z.string().max(500, "Ghi chú tối đa 500 ký tự"),
  payment_method: z.enum(["cod"], { message: "Vui lòng chọn phương thức thanh toán" }),
});

export const settingsSchema = z.object({
  shipping_fee: wholeNumber("Phí vận chuyển", 10_000_000),
  free_shipping_threshold: z.union([z.literal(""), wholeNumber("Mức miễn phí vận chuyển", 1_000_000_000)]),
});

// ---- resources ----
export const resourceSchema = z
  .object({
    name: text("tiêu đề", 200),
    slug,
    description: z.string().max(2000, "Mô tả tối đa 2.000 ký tự"),
    kind: z.enum(["free", "paid"]),
    price: z.string().optional(), // not sent for free resources (the price box is hidden)
    drive_url: z
      .string()
      .min(1, "Vui lòng dán liên kết Google Drive")
      .refine(isAllowedDriveUrl, "Liên kết phải bắt đầu bằng https://drive.google.com/ (hoặc docs.google.com)"),
    category_id: z.string(),
    status: z.enum(["draft", "active"]),
  })
  .superRefine((v, ctx) => {
    const price = v.price ?? "";
    if (v.kind === "paid" && (!/^\d+$/.test(price) || Number(price) < 1 || Number(price) > 1_000_000_000)) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "Giá phải là số nguyên từ 1 VND trở lên" });
    }
  });

// ---- automatic payments ----
export const paymentSettingsSchema = z
  .object({
    payment_mode: z.enum(["manual", "auto"]),
    bank_name: z.string().max(40, "Tên ngân hàng tối đa 40 ký tự").regex(/^[A-Za-z0-9 ._-]*$/, "Tên ngân hàng chỉ gồm chữ không dấu, số và khoảng trắng"),
    bank_account: z.string().max(24, "Số tài khoản tối đa 24 số").regex(/^[0-9]*$/, "Số tài khoản chỉ gồm chữ số"),
    bank_account_name: z.string().max(100, "Tên chủ tài khoản tối đa 100 ký tự"),
  })
  .superRefine((v, ctx) => {
    if (v.payment_mode !== "auto") return;
    if (!v.bank_name) ctx.addIssue({ code: "custom", path: ["bank_name"], message: "Vui lòng nhập tên ngân hàng" });
    if (v.bank_account.length < 4) ctx.addIssue({ code: "custom", path: ["bank_account"], message: "Vui lòng nhập số tài khoản (ít nhất 4 số)" });
  });
