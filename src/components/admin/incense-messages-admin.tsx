"use client";

import { useEffect, useState } from "react";
import { FormMessage, primaryButton } from "@/components/ui/form";
import { addIncenseMessage, deleteIncenseMessage, listAllIncenseMessages, setIncenseMessageActive, type IncenseMessage } from "@/services/incense-service";

export function IncenseMessagesAdmin() {
  const [messages, setMessages] = useState<IncenseMessage[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    setMessages(await listAllIncenseMessages());
  }

  useEffect(() => {
    let active = true;
    listAllIncenseMessages()
      .then((rows) => { if (active) setMessages(rows); })
      .catch((err) => {
        console.error(err);
        if (active) setError("Chưa tải được danh sách thông điệp.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await addIncenseMessage(content);
      setContent("");
      await refresh();
      setNotice("Đã thêm thông điệp.");
    } catch (err) {
      console.error(err);
      setError("Chưa thêm được thông điệp. Hãy kiểm tra nội dung và thử lại.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(message: IncenseMessage) {
    setError(null);
    try {
      await setIncenseMessageActive(message.id, !message.is_active);
      await refresh();
    } catch (err) {
      console.error(err);
      setError("Chưa cập nhật được trạng thái thông điệp.");
    }
  }

  async function remove(message: IncenseMessage) {
    if (!window.confirm("Xóa thông điệp này?")) return;
    setError(null);
    try {
      await deleteIncenseMessage(message.id);
      await refresh();
    } catch (err) {
      console.error(err);
      setError("Chưa xóa được thông điệp.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quản lý thông điệp</h1>
        <p className="mt-1 text-sm text-slate-500">Quản lý thông điệp hiển thị sau khi cúng dường.</p>
      </div>

      <form onSubmit={add} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <label htmlFor="incense-message" className="block text-sm font-medium text-slate-700">Thông điệp mới</label>
        <textarea id="incense-message" required minLength={2} maxLength={240} rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Ví dụ: Ta đã nhận lời khẩn cầu của con." className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm leading-6 outline-none focus:border-black focus:ring-4 focus:ring-black/10" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-400">{content.length}/240 ký tự</span>
          <button type="submit" disabled={busy || content.trim().length < 2} className={primaryButton}>{busy ? "Đang lưu..." : "Thêm thông điệp"}</button>
        </div>
      </form>

      {error && <FormMessage kind="error">{error}</FormMessage>}
      {notice && <FormMessage kind="success">{notice}</FormMessage>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">Danh sách thông điệp</h2>
          <span className="text-xs text-slate-500">{messages.length} thông điệp</span>
        </div>
        {loading ? (
          <div className="h-28 animate-pulse bg-slate-100" aria-busy="true" />
        ) : messages.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Chưa có thông điệp.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {messages.map((message) => (
              <li key={message.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="text-sm leading-6 text-slate-800">{message.content}</p>
                  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs ${message.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{message.is_active ? "Đang hiển thị" : "Đã ẩn"}</span>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-sm">
                  <button type="button" onClick={() => void toggle(message)} className="text-slate-600 underline">{message.is_active ? "Ẩn" : "Hiện"}</button>
                  <button type="button" onClick={() => void remove(message)} className="text-red-600 underline">Xóa</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
