import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, FilmIcon, FrameIcon, PromptIcon, QrIcon } from "@/components/utilities/tool-icons";

export const metadata: Metadata = { title: "Tiện ích" };

const tools = [
  {
    href: "/utilities/video-to-gif/",
    name: "Video thành GIF",
    Icon: FilmIcon,
  },
  {
    href: "/utilities/qr/",
    name: "Tạo mã QR",
    Icon: QrIcon,
  },
  {
    href: "/utilities/prompts/",
    name: "Thư viện prompt",
    Icon: PromptIcon,
  },
  {
    href: "/utilities/add-frame/",
    name: "Add frame",
    Icon: FrameIcon,
  },
];

export default function UtilitiesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 sm:mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Tiện ích</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tools.map(({ href, name, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-slate-900 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <span className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white transition group-hover:scale-105">
              <Icon className="h-6 w-6" />
            </span>
            <h2 className="text-lg font-semibold text-slate-950">{name}</h2>
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
