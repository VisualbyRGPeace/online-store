import type { Metadata } from "next";
import { PromptUtility } from "@/components/prompt-utility";

export const metadata: Metadata = { title: "Lưu trữ prompt" };

export default function PromptPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-7">
        <p className="mb-2 text-sm font-medium text-slate-500">Tiện ích</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Lưu trữ prompt</h1>
        <p className="mt-2 text-sm text-slate-500">Prompt và ảnh được lưu trên thiết bị này.</p>
      </div>
      <PromptUtility />
    </div>
  );
}
