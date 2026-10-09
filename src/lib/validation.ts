import { z } from "zod";

const email = z.email("Email không hợp lệ").max(254);
const password = z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(72, "Mật khẩu tối đa 72 ký tự");
const phone = z.string().regex(/^\+?[0-9]{9,15}$/, "Số điện thoại không hợp lệ");
const text = (label: string, max: number) =>
  z.string().min(1, `Vui lòng nhập ${label}`).max(max, `${label} tối đa ${max} ký tự`);

export const loginSchema = z.object({ email, password: z.string().min(1, "Vui lòng nhập mật khẩu") });

export const registerSchema = z
  .object({ full_name: text("họ tên", 100), email, password, confirm: z.string() })
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
