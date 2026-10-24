import type { Metadata } from "next";
import { QrUtility } from "@/components/qr-utility";

export const metadata: Metadata = { title: "Tạo mã QR" };

export default function QrPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-7">
        <p className="mb-2 text-sm font-medium text-slate-500">Tiện ích</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Tạo mã QR</h1>
      </div>
      <QrUtility />
    </div>
  );
}
