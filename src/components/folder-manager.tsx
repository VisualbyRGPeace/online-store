"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AuthGate } from "@/components/auth-gate";
import { Modal } from "@/components/utilities/modal";
import { CheckIcon, CloseIcon, CopyIcon, FolderIcon, LockIcon, PlusIcon, SearchIcon } from "@/components/utilities/tool-icons";
import {
  approveAccess,
  createEntry,
  deleteEntry,
  getThumbnails,
  listEntries,
  listViewers,
  listWorkspaces,
  removeAccess,
  requestAccess,
  updateEntry,
  type FolderEntry,
  type FolderInput,
  type FolderViewer,
  type FolderWorkspace,
} from "@/services/folder-service";
import { copyText } from "@/utils/clipboard";
import { createTinyThumbnail } from "@/utils/folder-thumbnail";
import { validateImageFile } from "@/utils/image";

const PAGE_SIZE = 24;

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100";
const selectClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100";
const outlineButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm font-medium text-slate-800 transition hover:border-slate-900 disabled:cursor-not-allowed disabled:opacity-50";
const blackButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `Tháng ${month}/${year}`;
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA");
}

function cleanPath(value: string): string {
  return value.trim().replace(/^["']+|["']+$/g, "").trim();
}

/** Mở thư mục trên máy qua trình hỗ trợ "folderopen:" (cài một lần trên máy Windows). */
function openFolder(path: string): boolean {
  if (!/^[A-Za-z]:[\\/]/.test(path)) return false;
  const link = document.createElement("a");
  link.href = `folderopen:${encodeURIComponent(path)}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

type Toast = { text: string; ok: boolean };

type FormState = {
  entry: FolderEntry | null;
  client: string;
  project: string;
  folderDate: string;
  path: string;
  thumbnail: string | null | undefined; // undefined: giữ nguyên, null: bỏ, chuỗi: ảnh mới
  existingThumb: string | null;
};

const EMPTY_FORM: FormState = {
  entry: null,
  client: "",
  project: "",
  folderDate: "",
  path: "",
  thumbnail: undefined,
  existingThumb: null,
};

/** Ô nhập kèm danh sách xổ xuống các tên đã dùng; vẫn gõ được tên mới. */
function NameCombobox({
  value,
  onChange,
  options,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  options: [name: string, count: number][];
  placeholder: string;
  maxLength: number;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listId = useId();
  const needle = normalize(value.trim());
  const matches = options.filter(([name]) => !needle || normalize(name).includes(needle));
  const showList = open && matches.length > 0;

  function choose(name: string) {
    onChange(name);
    setOpen(false);
    setHighlight(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => Math.min(current + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && showList && highlight >= 0) {
      event.preventDefault();
      const picked = matches[highlight];
      if (picked) choose(picked[0]);
    } else if (event.key === "Escape" && showList) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        maxLength={maxLength}
        required
        placeholder={placeholder}
        className={`${inputClass} pr-11`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Mở danh sách"
        onMouseDown={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
        className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform ${showList ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          {matches.map(([name, count], index) => (
            <li
              key={name}
              role="option"
              aria-selected={name === value}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(name);
              }}
              onMouseEnter={() => setHighlight(index)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                index === highlight ? "bg-slate-100" : ""
              } ${name === value ? "font-semibold text-slate-950" : "text-slate-700"}`}
            >
              <span className="truncate">{name}</span>
              <span className="shrink-0 text-xs text-slate-400">{count} thư mục</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WorkspaceCard({
  workspace,
  active,
  busy,
  onSelect,
  onRequest,
  onCancel,
}: {
  workspace: FolderWorkspace;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  onRequest: () => void;
  onCancel: () => void;
}) {
  const own = workspace.access === "own";
  const open = own || workspace.access === "approved";
  const label = own ? "Thư mục của tôi" : `Thư mục của ${workspace.owner_name}`;

  const body = (
    <>
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
          open ? (active ? "bg-white text-black" : "bg-slate-950 text-white") : "bg-slate-100 text-slate-500"
        }`}
      >
        {open ? <FolderIcon className="h-5 w-5" /> : <LockIcon className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className={`block text-xs ${active ? "text-white/70" : "text-slate-500"}`}>
          {open ? `${workspace.entry_count ?? 0} thư mục` : workspace.access === "pending" ? "Đã gửi yêu cầu xem" : "Chưa được cấp quyền"}
        </span>
      </span>
    </>
  );

  if (open) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
          active ? "border-black bg-black text-white" : "border-slate-200 bg-white text-slate-900 hover:border-slate-900"
        }`}
      >
        {body}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-3 text-slate-700">
      {body}
      {workspace.access === "pending" ? (
        <button type="button" onClick={onCancel} disabled={busy} className="shrink-0 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900 disabled:opacity-50">
          Hủy
        </button>
      ) : (
        <button type="button" onClick={onRequest} disabled={busy} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:border-slate-900 disabled:opacity-50">
          Xin quyền xem
        </button>
      )}
    </div>
  );
}

function FolderManagerInner({ userId }: { userId: string }) {
  const [workspaces, setWorkspaces] = useState<FolderWorkspace[]>([]);
  const [wsLoading, setWsLoading] = useState(true);
  const [wsBusy, setWsBusy] = useState(false);
  const [activeOwner, setActiveOwner] = useState(userId);
  const [loaded, setLoaded] = useState<{ key: string; rows: FolderEntry[] } | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [visibleState, setVisibleState] = useState({ count: PAGE_SIZE, key: "" });

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toDelete, setToDelete] = useState<FolderEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [accessOpen, setAccessOpen] = useState(false);
  const [viewers, setViewers] = useState<FolderViewer[]>([]);
  const [viewersBusy, setViewersBusy] = useState(false);

  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const requested = useRef(new Set<string>());

  // Kho đang chọn bị thu hồi quyền thì tự quay về kho của mình.
  const picked = workspaces.find((item) => item.owner_id === activeOwner);
  const ownerId = wsLoading || activeOwner === userId || picked?.access === "approved" ? activeOwner : userId;
  const activeWorkspace = workspaces.find((item) => item.owner_id === ownerId);
  const isOwn = ownerId === userId;
  const canView = isOwn || activeWorkspace?.access === "approved";
  const dataKey = `${ownerId}:${version}`;
  const entriesLoading = canView && loaded?.key !== dataKey;
  const entries = useMemo(() => (canView && loaded?.key === dataKey ? loaded.rows : []), [canView, loaded, dataKey]);
  const pendingCount = viewers.filter((item) => item.status === "pending").length;

  const showToast = useCallback((text: string, ok = true) => {
    setToast({ text, ok });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // Danh sách các kho (kể cả kho đang bị khóa).
  useEffect(() => {
    let current = true;
    listWorkspaces().then(
      (rows) => {
        if (!current) return;
        setWorkspaces(rows);
        setWsLoading(false);
      },
      (err) => {
        console.error(err);
        if (!current) return;
        setError("Không tải được danh sách. Hãy tải lại trang.");
        setWsLoading(false);
      },
    );
    return () => {
      current = false;
    };
  }, [version]);

  // Thư mục của kho đang chọn.
  useEffect(() => {
    if (!canView) return;
    let current = true;
    listEntries(ownerId).then(
      (rows) => current && setLoaded({ key: dataKey, rows }),
      (err) => {
        console.error(err);
        if (!current) return;
        setError("Không tải được thư mục.");
        setLoaded({ key: dataKey, rows: [] });
      },
    );
    return () => {
      current = false;
    };
  }, [ownerId, canView, dataKey]);

  // Danh sách người xin quyền (chỉ kho của mình).
  useEffect(() => {
    let current = true;
    listViewers().then(
      (rows) => current && setViewers(rows),
      (err) => console.error(err),
    );
    return () => {
      current = false;
    };
  }, [version]);

  const clientOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.client, (counts.get(entry.client) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0], "vi"));
  }, [entries]);

  const monthOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(monthKey(entry.folder_date), (counts.get(monthKey(entry.folder_date)) ?? 0) + 1);
    return [...counts].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    return entries.filter((entry) => {
      if (clientFilter && entry.client !== clientFilter) return false;
      if (monthFilter && monthKey(entry.folder_date) !== monthFilter) return false;
      if (dateFilter && entry.folder_date !== dateFilter) return false;
      if (!needle) return true;
      return normalize(`${entry.client} ${entry.project} ${entry.path} ${formatDate(entry.folder_date)}`).includes(needle);
    });
  }, [entries, query, clientFilter, monthFilter, dateFilter]);

  const filterKey = `${ownerId}|${query}|${clientFilter}|${monthFilter}|${dateFilter}`;
  const visible = visibleState.key === filterKey ? visibleState.count : PAGE_SIZE;

  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);

  const groups = useMemo(() => {
    const result: { key: string; items: FolderEntry[] }[] = [];
    for (const entry of shown) {
      const key = monthKey(entry.folder_date);
      const last = result[result.length - 1];
      if (last && last.key === key) last.items.push(entry);
      else result.push({ key, items: [entry] });
    }
    return result;
  }, [shown]);

  // Chỉ tải ảnh siêu nhỏ của các mục đang hiển thị.
  useEffect(() => {
    const missing = shown.map((entry) => entry.id).filter((id) => !(id in thumbs) && !requested.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => requested.current.add(id));
    getThumbnails(missing).then(
      (loaded) => setThumbs((prev) => ({ ...prev, ...loaded })),
      (err) => {
        console.error(err);
        missing.forEach((id) => requested.current.delete(id));
      },
    );
  }, [shown, thumbs]);

  const hasFilter = Boolean(query || clientFilter || monthFilter || dateFilter);

  function clearFilters() {
    setQuery("");
    setClientFilter("");
    setMonthFilter("");
    setDateFilter("");
  }

  function openCreate() {
    setFormError("");
    setForm({ ...EMPTY_FORM, folderDate: todayIso() });
  }

  function openEdit(entry: FolderEntry) {
    setFormError("");
    setForm({
      entry,
      client: entry.client,
      project: entry.project,
      folderDate: entry.folder_date,
      path: entry.path,
      thumbnail: undefined,
      existingThumb: thumbs[entry.id] ?? null,
    });
  }

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function chooseThumbnail(file?: File) {
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError("");
    try {
      patchForm({ thumbnail: await createTinyThumbnail(file) });
    } catch (err) {
      console.error(err);
      setFormError("Không xử lý được ảnh này.");
    }
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (!form || saving) return;
    const input: FolderInput = {
      client: form.client.trim(),
      project: form.project.trim(),
      folderDate: form.folderDate,
      path: cleanPath(form.path),
    };
    if (!input.client || !input.project || !input.folderDate || !input.path) {
      setFormError("Hãy nhập đủ: làm cho ai, dự án, ngày và đường dẫn.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (form.entry) {
        await updateEntry(form.entry.id, input, form.thumbnail);
        setThumbs((prev) => {
          const next = { ...prev };
          delete next[form.entry!.id];
          return next;
        });
        requested.current.delete(form.entry.id);
      } else {
        await createEntry(userId, input, form.thumbnail ?? null);
      }
      setForm(null);
      setVersion((current) => current + 1);
      showToast(form.entry ? "Đã lưu thay đổi." : "Đã thêm thư mục.");
    } catch (err) {
      console.error(err);
      setFormError("Chưa lưu được. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteEntry(toDelete.id);
      setToDelete(null);
      setVersion((current) => current + 1);
      showToast("Đã xóa khỏi danh sách.");
    } catch (err) {
      console.error(err);
      showToast("Chưa xóa được. Vui lòng thử lại.", false);
    } finally {
      setDeleting(false);
    }
  }

  async function handleOpen(entry: FolderEntry) {
    if (!openFolder(entry.path)) {
      showToast("Chỉ mở được đường dẫn dạng C:\\Thư mục.", false);
      return;
    }
    showToast("Đang mở thư mục…");
  }

  async function handleCopy(entry: FolderEntry) {
    showToast((await copyText(entry.path)) ? "Đã sao chép đường dẫn." : "Trình duyệt chưa cho phép sao chép.", true);
  }

  async function accessAction(action: () => Promise<void>, message: string) {
    setWsBusy(true);
    try {
      await action();
      setVersion((current) => current + 1);
      showToast(message);
    } catch (err) {
      console.error(err);
      showToast("Chưa thực hiện được. Vui lòng thử lại.", false);
    } finally {
      setWsBusy(false);
      setViewersBusy(false);
    }
  }

  const activeLabel = isOwn ? "của tôi" : `của ${activeWorkspace?.owner_name ?? ""}`;

  return (
    <section className="space-y-6">
      {!wsLoading && workspaces.length > 1 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((workspace) => (
            <WorkspaceCard
              key={workspace.owner_id}
              workspace={workspace}
              active={workspace.owner_id === ownerId}
              busy={wsBusy}
              onSelect={() => setActiveOwner(workspace.owner_id)}
              onRequest={() => void accessAction(() => requestAccess(workspace.owner_id, userId), "Đã gửi yêu cầu xem.")}
              onCancel={() => void accessAction(() => removeAccess(workspace.owner_id, userId), "Đã hủy yêu cầu.")}
            />
          ))}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">
            Thư mục {activeLabel}
            <span className="font-normal text-slate-500"> · {filtered.length}{hasFilter ? `/${entries.length}` : ""}</span>
          </h2>
          {isOwn && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setAccessOpen(true)} className={`${outlineButton} relative`}>
                <LockIcon className="h-4 w-4" />
                Quyền xem
                {pendingCount > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">{pendingCount}</span>
                )}
              </button>
              <button type="button" onClick={openCreate} className={blackButton}>
                <PlusIcon className="h-4 w-4" />
                Thêm thư mục
              </button>
            </div>
          )}
        </div>

        {canView && (
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_1fr_1fr_1fr]">
            <label className="relative block sm:col-span-2 lg:col-span-1">
              <span className="sr-only">Tìm kiếm</span>
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm khách, dự án, đường dẫn…" className={`${inputClass} pl-10`} />
            </label>
            <label>
              <span className="sr-only">Làm cho ai</span>
              <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} className={selectClass}>
                <option value="">Tất cả khách</option>
                {clientOptions.map(([name, count]) => (
                  <option key={name} value={name}>
                    {name} ({count})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Tháng</span>
              <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className={selectClass}>
                <option value="">Tất cả tháng</option>
                {monthOptions.map(([key, count]) => (
                  <option key={key} value={key}>
                    {monthLabel(key)} ({count})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Ngày</span>
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className={selectClass} />
            </label>
          </div>
        )}

        {hasFilter && canView && (
          <button type="button" onClick={clearFilters} className="mb-4 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900">
            Xóa bộ lọc
          </button>
        )}

        {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}

        {entriesLoading && canView ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid place-items-center rounded-2xl bg-slate-50 py-14 text-center">
            <FolderIcon className="h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-600">{hasFilter ? "Không tìm thấy thư mục phù hợp" : "Chưa có thư mục nào"}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.key}>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">{monthLabel(group.key)}</h3>
                <ul className="space-y-3">
                  {group.items.map((entry) => {
                    const thumb = thumbs[entry.id];
                    return (
                      <li
                        key={entry.id}
                        className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-2xl border border-slate-200 p-3 transition hover:border-slate-300 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-4"
                      >
                        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="" width={64} height={64} className="h-full w-full object-cover" />
                          ) : (
                            <FolderIcon className="h-6 w-6" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{entry.client}</p>
                          <p className="truncate text-sm text-slate-600">{entry.project}</p>
                          <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">{formatDate(entry.folder_date)}</span>
                            <span className="truncate font-mono" title={entry.path}>{entry.path}</span>
                          </p>
                        </div>
                        <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:justify-end">
                          <button type="button" onClick={() => void handleOpen(entry)} className={blackButton}>
                            Mở
                          </button>
                          <button type="button" onClick={() => void handleCopy(entry)} aria-label="Sao chép đường dẫn" title="Sao chép đường dẫn" className={`${outlineButton} w-10 px-0`}>
                            <CopyIcon className="h-4 w-4" />
                          </button>
                          {isOwn && (
                            <>
                              <button type="button" onClick={() => openEdit(entry)} className="h-10 rounded-xl px-2 text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
                                Sửa
                              </button>
                              <button type="button" onClick={() => setToDelete(entry)} className="h-10 rounded-xl px-2 text-sm font-medium text-red-600 underline-offset-2 hover:underline">
                                Xóa
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {filtered.length > shown.length && (
              <div className="text-center">
                <button type="button" onClick={() => setVisibleState({ count: visible + PAGE_SIZE, key: filterKey })} className={outlineButton}>
                  Xem thêm ({filtered.length - shown.length})
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={form !== null} onClose={() => !saving && setForm(null)} title={form?.entry ? "Sửa thư mục" : "Thêm thư mục"}>
        {form && (
          <form onSubmit={(event) => void submitForm(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Làm cho ai</span>
                <NameCombobox value={form.client} onChange={(client) => patchForm({ client })} options={clientOptions} placeholder="Tên khách hàng" maxLength={100} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Ngày</span>
                <input type="date" value={form.folderDate} onChange={(event) => patchForm({ folderDate: event.target.value })} required className={inputClass} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Dự án</span>
              <input value={form.project} onChange={(event) => patchForm({ project: event.target.value })} maxLength={150} required placeholder="Tên dự án" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Đường dẫn thư mục</span>
              <input value={form.path} onChange={(event) => patchForm({ path: event.target.value })} maxLength={500} required placeholder="D:\Khach hang\Du an" spellCheck={false} className={`${inputClass} font-mono`} />
            </label>

            <div>
              <p className="mb-1.5 text-sm font-medium">
                Ảnh minh họa <span className="font-normal text-slate-400">(không bắt buộc)</span>
              </p>
              {(() => {
                const preview = form.thumbnail === null ? null : form.thumbnail ?? form.existingThumb;
                return preview ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="" className="h-14 w-14 rounded-xl object-cover" />
                    <span className="flex-1" />
                    <label className="cursor-pointer text-sm text-slate-700 underline">
                      Đổi ảnh
                      <input type="file" accept="image/*" className="sr-only" onChange={(event) => { void chooseThumbnail(event.target.files?.[0]); event.target.value = ""; }} />
                    </label>
                    <button type="button" onClick={() => patchForm({ thumbnail: null })} className="text-sm text-slate-500 underline">
                      Bỏ ảnh
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm font-medium text-slate-700 transition hover:border-slate-500 hover:bg-slate-50">
                    <PlusIcon className="h-4 w-4" />
                    Chọn ảnh
                    <input type="file" accept="image/*" className="sr-only" onChange={(event) => { void chooseThumbnail(event.target.files?.[0]); event.target.value = ""; }} />
                  </label>
                );
              })()}
            </div>

            {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setForm(null)} disabled={saving} className="h-11 rounded-xl px-4 text-sm font-medium text-slate-600 hover:text-slate-950">
                Hủy
              </button>
              <button type="submit" disabled={saving} className={`${blackButton} h-11 px-6`}>
                {saving ? "Đang lưu…" : form.entry ? "Lưu thay đổi" : "Thêm"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={toDelete !== null} onClose={() => !deleting && setToDelete(null)} title="Xóa thư mục?">
        {toDelete && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              <span className="font-semibold text-slate-900">{toDelete.client} · {toDelete.project}</span> sẽ bị xóa khỏi danh sách. Thư mục thật trên máy không bị ảnh hưởng.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setToDelete(null)} disabled={deleting} className="h-11 rounded-xl px-4 text-sm font-medium text-slate-600 hover:text-slate-950">
                Hủy
              </button>
              <button type="button" onClick={() => void confirmDelete()} disabled={deleting} className="h-11 rounded-xl bg-red-600 px-6 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
                {deleting ? "Đang xóa…" : "Xóa"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={accessOpen} onClose={() => setAccessOpen(false)} title="Quyền xem">
        {viewers.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Chưa có ai yêu cầu.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {viewers.map((viewer) => (
              <li key={viewer.viewer_id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                  {viewer.viewer_name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{viewer.viewer_name}</p>
                  <p className="text-xs text-slate-500">{viewer.status === "pending" ? "Đang chờ duyệt" : "Đang được xem"}</p>
                </div>
                {viewer.status === "pending" ? (
                  <>
                    <button
                      type="button"
                      disabled={viewersBusy}
                      onClick={() => { setViewersBusy(true); void accessAction(() => approveAccess(userId, viewer.viewer_id), "Đã cho phép xem."); }}
                      className={blackButton}
                    >
                      <CheckIcon className="h-4 w-4" />
                      Cho phép
                    </button>
                    <button
                      type="button"
                      disabled={viewersBusy}
                      onClick={() => { setViewersBusy(true); void accessAction(() => removeAccess(userId, viewer.viewer_id), "Đã từ chối."); }}
                      aria-label="Từ chối"
                      className={`${outlineButton} w-10 px-0`}
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={viewersBusy}
                    onClick={() => { setViewersBusy(true); void accessAction(() => removeAccess(userId, viewer.viewer_id), "Đã thu hồi quyền xem."); }}
                    className={outlineButton}
                  >
                    Thu hồi
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {toast && (
        <div role="status" className={`toast-in fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-3 text-sm font-medium shadow-lg ${toast.ok ? "bg-black text-white" : "bg-red-600 text-white"}`}>
          {toast.text}
        </div>
      )}
    </section>
  );
}

export function FolderManager() {
  return <AuthGate>{(userId) => <FolderManagerInner userId={userId} />}</AuthGate>;
}
