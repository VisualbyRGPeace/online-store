import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, FilmIcon, FrameIcon, PromptIcon, QrIcon } from "@/components/utilities/tool-icons";

export const metadata: Metadata = { title: "Tiện ích" };

const tools = [
  {
    href: "/utilities/video-to-gif/",
    name: "Video thành GIF",
    description: "Cắt đoạn ngắn, chọn vùng vuông, chèn chữ rồi nén GIF dưới 1 MB.",
    tags: ["Xem thử đoạn cắt", "Chèn chữ", "Tự nén < 1 MB"],
    Icon: FilmIcon,
  },
  {
    href: "/utilities/qr/",
    name: "Tạo mã QR",
    description: "Tạo mã QR cho liên kết, văn bản hoặc Wi‑Fi và tải về dạng SVG hoặc PNG.",
    tags: ["Liên kết", "Wi‑Fi", "SVG · PNG"],
    Icon: QrIcon,
  },
  {
    href: "/utilities/prompts/",
    name: "Thư viện prompt",
    description: "Tìm prompt hay, điền nhanh các biến rồi sao chép; chia sẻ prompt của bạn.",
    tags: ["Tìm kiếm", "Điền biến", "Chia sẻ"],
    Icon: PromptIcon,
  },
  {
    href: "/utilities/add-frame/",
    name: "Add frame",
    description: "Tải ảnh lên, tự thêm frame theo khu vực kèm logo trái hoặc phải, xuất 3000 × 3000 px.",
    tags: ["Theo danh mục", "Logo trái / phải", "JPG · PNG"],
    Icon: FrameIcon,
  },
];

export default function UtilitiesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 sm:mb-10">
        <p className="mb-2 text-sm font-medium text-slate-500">Công cụ hữu ích</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Tiện ích</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
          Những công cụ nhỏ, dùng ngay trên trình duyệt. Tệp của bạn được xử lý trên thiết bị, không cần cài đặt gì thêm.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tools.map(({ href, name, description, tags, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-slate-900 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <span className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white transition group-hover:scale-105">
              <Icon className="h-6 w-6" />
            </span>
            <h2 className="text-lg font-semibold text-slate-950">{name}</h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p>
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {tag}
                </li>
              ))}
            </ul>
            <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-semibold text-slate-900">
              Mở tiện ích
              <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
