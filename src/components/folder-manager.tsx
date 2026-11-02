"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AuthGate } from "@/components/auth-gate";
import { Modal } from "@/components/utilities/modal";
import {
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  FolderIcon,
  GridIcon,
  ListIcon,
  LockIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/utilities/tool-icons";
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
  setPinned,
  updateEntry,
  type FolderEntry,
  type FolderInput,
  type FolderViewer,
  type FolderWorkspace,
} from "@/services/folder-service";
import { copyText } from "@/utils/clipboard";
import { createTinyThumbnail } from "@/utils/folder-thumbnail";
import { validateImageFile } from "@/utils/image";

const PAGE_SIZE = 30;
const CLIENT_CHIP_LIMIT = 8;
const INSTALLER_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/installers/FolderOpen-CaiDat.zip`;

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100";
const outlineButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm font-medium text-slate-800 transition hover:border-slate-900 disabled:cursor-not-allowed disabled:opacity-50";
const blackButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300";
const iconButton =
  "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-950";

/** Bỏ dấu tiếng Việt + chữ thường nhưng giữ NGUYÊN độ dài chuỗi (để tô sáng đúng vị trí). */
function foldChar(char: string): string {
  const base = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const mapped = base === "đ" || base === "Đ" ? "d" : base.toLowerCase();
  return mapped.length === 1 ? mapped : char;
}

function fold(value: string): string {
  const source = value.normalize("NFC");
  let out = "";
  for (let index = 0; index < source.length; index += 1) out += foldChar(source.charAt(index));
  return out;
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

/** Tách "D:\\Khach\\Du an" thành phần cha ("D:\\Khach\\") và thư mục cuối ("Du an"). */
function splitPath(path: string): { parent: string; leaf: string } {
  const trimmed = path.replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  if (index < 0) return { parent: "", leaf: trimmed };
  return { parent: trimmed.slice(0, index + 1), leaf: trimmed.slice(index + 1) };
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

// ---- Tùy chọn hiển thị (nhớ trên trình duyệt) ----
type SortKey = "newest" | "oldest" | "client" | "project";
type GroupKey = "month" | "client" | "project" | "none";
type ViewKey = "list" | "grid";
type Prefs = { sort: SortKey; group: GroupKey; view: ViewKey };

const SORT_OPTIONS: [SortKey, string][] = [
  ["newest", "Mới nhất"],
  ["oldest", "Cũ nhất"],
  ["client", "Khách A → Z"],
  ["project", "Dự án A → Z"],
];
const GROUP_OPTIONS: [GroupKey, string][] = [
  ["month", "Tháng"],
  ["client", "Khách"],
  ["project", "Dự án"],
  ["none", "Không nhóm"],
];

const PREFS_KEY = "folder-manager-prefs";
const DEFAULT_PREFS: Prefs = { sort: "newest", group: "month", view: "list" };
const prefListeners = new Set<() => void>();
let memoryPrefs = "";

function readPrefsRaw(): string {
  try {
    return window.localStorage.getItem(PREFS_KEY) ?? memoryPrefs;
  } catch {
    return memoryPrefs;
  }
}

function parsePrefs(raw: string): Prefs {
  try {
    const data = JSON.parse(raw) as Partial<Prefs>;
    return {
      sort: SORT_OPTIONS.some(([key]) => key === data.sort) ? (data.sort as SortKey) : DEFAULT_PREFS.sort,
      group: GROUP_OPTIONS.some(([key]) => key === data.group) ? (data.group as GroupKey) : DEFAULT_PREFS.group,
      view: data.view === "grid" ? "grid" : "list",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function subscribePrefs(callback: () => void): () => void {
  prefListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    prefListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const raw = useSyncExternalStore(subscribePrefs, readPrefsRaw, () => "");
  const prefs = useMemo(() => parsePrefs(raw), [raw]);
  const update = useCallback((patch: Partial<Prefs>) => {
    const next = JSON.stringify({ ...parsePrefs(readPrefsRaw()), ...patch });
    memoryPrefs = next;
    try {
      window.localStorage.setItem(PREFS_KEY, next);
    } catch {
      /* trình duyệt chặn lưu trữ: chỉ giữ trong phiên */
    }
    prefListeners.forEach((listener) => listener());
  }, []);
  return [prefs, update];
}

// ---- Sắp xếp / nhóm ----
function compareEntries(sort: SortKey): (a: FolderEntry, b: FolderEntry) => number {
  const byDateDesc = (a: FolderEntry, b: FolderEntry) =>
    b.folder_date.localeCompare(a.folder_date) || b.created_at.localeCompare(a.created_at);
  switch (sort) {
    case "oldest":
      return (a, b) => -byDateDesc(a, b);
    case "client":
      return (a, b) => a.client.localeCompare(b.client, "vi") || a.project.localeCompare(b.project, "vi") || byDateDesc(a, b);
    case "project":
      return (a, b) => a.project.localeCompare(b.project, "vi") || a.client.localeCompare(b.client, "vi") || byDateDesc(a, b);
    default:
      return byDateDesc;
  }
}

type Group = { key: string; label: string; items: FolderEntry[]; pinned?: boolean };

function buildGroups(pinned: FolderEntry[], rest: FolderEntry[], groupBy: GroupKey): Group[] {
  const groups: Group[] = [];
  if (pinned.length > 0) groups.push({ key: "__pinned", label: "Đã ghim", items: pinned, pinned: true });
  if (groupBy === "none") {
    if (rest.length > 0) groups.push({ key: "__rest", label: pinned.length > 0 ? "Thư mục khác" : "", items: rest });
    return groups;
  }
  const map = new Map<string, Group>();
  for (const entry of rest) {
    const raw =
      groupBy === "month" ? monthKey(entry.folder_date) : groupBy === "client" ? entry.client : `${entry.client} · ${entry.project}`;
    let group = map.get(raw);
    if (!group) {
      group = { key: `${groupBy}:${raw}`, label: groupBy === "month" ? monthLabel(raw) : raw, items: [] };
      map.set(raw, group);
      groups.push(group);
    }
    group.items.push(entry);
  }
  return groups;
}

/** Tô sáng các từ đang tìm (không phân biệt dấu / hoa thường). */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const source = text.normalize("NFC");
  const folded = fold(source);
  const marked = new Array<boolean>(source.length).fill(false);
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at < 0) break;
      for (let k = at; k < at + term.length; k += 1) marked[k] = true;
      from = at + term.length;
    }
  }
  const parts: { text: string; hit: boolean }[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const hit = marked[index] === true;
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) last.text += source.charAt(index);
    else parts.push({ text: source.charAt(index), hit });
  }
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className="rounded bg-yellow-200 px-0.5 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
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
  const needle = fold(value.trim());
  const matches = options.filter(([name]) => !needle || fold(name).includes(needle));
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
  const label = own ? "Của tôi" : workspace.owner_name;

  const body = (
    <>
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
          open ? (active ? "bg-white text-black" : "bg-slate-950 text-white") : "bg-slate-100 text-slate-500"
        }`}
      >
        {open ? <FolderIcon className="h-4.5 w-4.5" /> : <LockIcon className="h-4.5 w-4.5" />}
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
        className={`flex min-w-[11rem] items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition ${
          active ? "border-black bg-black text-white shadow-sm" : "border-slate-200 bg-white text-slate-900 hover:border-slate-900"
        }`}
      >
        {body}
      </button>
    );
  }

  return (
    <div className="flex min-w-[11rem] items-center gap-2.5 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2 text-slate-700">
      {body}
      {workspace.access === "pending" ? (
        <button type="button" onClick={onCancel} disabled={busy} className="shrink-0 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900 disabled:opacity-50">
          Hủy
        </button>
      ) : (
        <button type="button" onClick={onRequest} disabled={busy} className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 transition hover:border-slate-900 disabled:opacity-50">
          Xin quyền xem
        </button>
      )}
    </div>
  );
}

type EntryViewProps = {
  entry: FolderEntry;
  thumb: string | null | undefined;
  terms: string[];
  isOwn: boolean;
  onOpen: () => void;
  onCopy: () => void;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function EntryThumb({ thumb, className }: { thumb: string | null | undefined; className: string }) {
  return (
    <div className={`grid shrink-0 place-items-center overflow-hidden bg-slate-100 text-slate-300 ${className}`}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" width={64} height={64} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <FolderIcon className="h-6 w-6" />
      )}
    </div>
  );
}

function PathText({ path, terms }: { path: string; terms: string[] }) {
  const { parent, leaf } = splitPath(path);
  return (
    <span className="min-w-0 truncate font-mono text-[11px] text-slate-500" title={path}>
      <Highlight text={parent} terms={terms} />
      <span className="font-semibold text-slate-800">
        <Highlight text={leaf} terms={terms} />
      </span>
    </span>
  );
}

function EntryActions({ entry, isOwn, onOpen, onCopy, onPin, onEdit, onDelete, grow }: EntryViewProps & { grow?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onOpen} className={`${blackButton} h-9 ${grow ? "flex-1" : ""}`}>
        <FolderIcon className="h-4 w-4" />
        Mở
      </button>
      <button type="button" onClick={onCopy} aria-label="Sao chép đường dẫn" title="Sao chép đường dẫn" className={`${iconButton} border border-slate-200`}>
        <CopyIcon className="h-4 w-4" />
      </button>
      {isOwn && (
        <>
          <button
            type="button"
            onClick={onPin}
            aria-label={entry.pinned ? "Bỏ ghim" : "Ghim lên đầu"}
            aria-pressed={entry.pinned}
            title={entry.pinned ? "Bỏ ghim" : "Ghim lên đầu"}
            className={`${iconButton} ${entry.pinned ? "text-slate-950" : ""}`}
          >
            <PinIcon className="h-4 w-4" filled={entry.pinned} />
          </button>
          <button type="button" onClick={onEdit} aria-label="Sửa" title="Sửa" className={iconButton}>
            <EditIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDelete} aria-label="Xóa" title="Xóa" className={`${iconButton} hover:bg-red-50 hover:text-red-600`}>
            <TrashIcon className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}

function EntryRow(props: EntryViewProps) {
  const { entry, thumb, terms } = props;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-slate-400 hover:shadow-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-3.5">
      <EntryThumb thumb={thumb} className="h-16 w-16 rounded-xl" />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-950">
          <span className="truncate">
            <Highlight text={entry.client} terms={terms} />
          </span>
          {entry.pinned && <PinIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" filled />}
        </p>
        <p className="truncate text-sm text-slate-600">
          <Highlight text={entry.project} terms={terms} />
        </p>
        <p className="mt-1.5 flex items-center gap-2">
          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{formatDate(entry.folder_date)}</span>
          <PathText path={entry.path} terms={terms} />
        </p>
      </div>
      <div className="col-span-2 sm:col-span-1 sm:justify-self-end">
        <EntryActions {...props} />
      </div>
    </li>
  );
}

function EntryTile(props: EntryViewProps) {
  const { entry, thumb, terms, isOwn } = props;
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-slate-400 hover:shadow-sm">
      <div className="relative grid h-32 place-items-center bg-slate-100">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" width={128} height={128} loading="lazy" className="max-h-full max-w-full object-contain" />
        ) : (
          <FolderIcon className="h-10 w-10 text-slate-300" />
        )}
        {entry.pinned && !isOwn && (
          <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 shadow-sm">
            <PinIcon className="h-3.5 w-3.5" filled />
          </span>
        )}
        {isOwn && (
          <button
            type="button"
            onClick={props.onPin}
            aria-label={entry.pinned ? "Bỏ ghim" : "Ghim lên đầu"}
            aria-pressed={entry.pinned}
            className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-sm transition hover:bg-white ${
              entry.pinned ? "text-slate-950" : "text-slate-400 hover:text-slate-950"
            }`}
          >
            <PinIcon className="h-4 w-4" filled={entry.pinned} />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <p className="truncate text-sm font-semibold text-slate-950">
          <Highlight text={entry.client} terms={terms} />
        </p>
        <p className="line-clamp-2 min-h-10 text-sm leading-5 text-slate-600">
          <Highlight text={entry.project} terms={terms} />
        </p>
        <p className="flex items-center gap-2">
          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{formatDate(entry.folder_date)}</span>
          <PathText path={entry.path} terms={terms} />
        </p>
        <div className="mt-auto pt-3">
          <EntryActions {...props} grow />
        </div>
      </div>
    </li>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white pl-3 pr-1.5 text-xs text-slate-500 transition focus-within:border-slate-500 hover:border-slate-400">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 max-w-40 cursor-pointer rounded-lg bg-transparent text-sm font-medium text-slate-900 outline-none">
        {children}
      </select>
    </label>
  );
}

function chipClass(active: boolean): string {
  return `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition ${
    active ? "border-black bg-black text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-900"
  }`;
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

  const [prefs, updatePrefs] = usePrefs();
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [visibleState, setVisibleState] = useState({ count: PAGE_SIZE, key: "" });
  const searchRef = useRef<HTMLInputElement>(null);

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

  // Phím tắt "/" để nhảy vào ô tìm kiếm.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // Chip khách hàng: những khách làm nhiều nhất hiện sẵn, số còn lại gom vào ô chọn "Khách khác".
  const clientChips = useMemo(() => {
    const byCount = [...clientOptions].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"));
    const chips = byCount.slice(0, CLIENT_CHIP_LIMIT);
    if (clientFilter && !chips.some(([name]) => name === clientFilter)) {
      const selected = byCount.find(([name]) => name === clientFilter);
      if (selected) chips.push(selected);
    }
    const shownNames = new Set(chips.map(([name]) => name));
    return { chips, rest: clientOptions.filter(([name]) => !shownNames.has(name)) };
  }, [clientOptions, clientFilter]);

  // Gợi ý dự án: nếu khách đang chọn đã có dự án thì chỉ hiện dự án của khách đó, chưa có thì hiện tất cả.
  const formClient = form?.client.trim() ?? "";
  const projectOptions = useMemo(() => {
    const ofClient = entries.filter((entry) => entry.client === formClient);
    const source = ofClient.length > 0 ? ofClient : entries;
    const counts = new Map<string, number>();
    for (const entry of source) counts.set(entry.project, (counts.get(entry.project) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0], "vi"));
  }, [entries, formClient]);

  const monthOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(monthKey(entry.folder_date), (counts.get(monthKey(entry.folder_date)) ?? 0) + 1);
    return [...counts].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  const stats = useMemo(
    () => ({ total: entries.length, clients: clientOptions.length, projects: new Set(entries.map((entry) => `${entry.client}\u0000${entry.project}`)).size }),
    [entries, clientOptions],
  );

  // Chỉ mục tìm kiếm dựng một lần: bỏ dấu, gồm khách + dự án + đường dẫn + ngày.
  const searchIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const entry of entries) {
      index.set(entry.id, fold(`${entry.client} ${entry.project} ${entry.path} ${formatDate(entry.folder_date)} ${monthLabel(monthKey(entry.folder_date))}`));
    }
    return index;
  }, [entries]);

  const deferredQuery = useDeferredValue(query);
  const terms = useMemo(() => fold(deferredQuery.trim()).split(/\s+/).filter(Boolean), [deferredQuery]);

  const filtered = useMemo(() => {
    const result = entries.filter((entry) => {
      if (clientFilter && entry.client !== clientFilter) return false;
      if (monthFilter && monthKey(entry.folder_date) !== monthFilter) return false;
      if (dateFilter && entry.folder_date !== dateFilter) return false;
      if (terms.length === 0) return true;
      const haystack = searchIndex.get(entry.id) ?? "";
      return terms.every((term) => haystack.includes(term));
    });
    return result.sort(compareEntries(prefs.sort));
  }, [entries, clientFilter, monthFilter, dateFilter, terms, searchIndex, prefs.sort]);

  const pinnedItems = useMemo(() => filtered.filter((entry) => entry.pinned), [filtered]);
  const restItems = useMemo(() => filtered.filter((entry) => !entry.pinned), [filtered]);

  const filterKey = `${ownerId}|${deferredQuery}|${clientFilter}|${monthFilter}|${dateFilter}|${prefs.sort}|${prefs.group}`;
  const visible = visibleState.key === filterKey ? visibleState.count : PAGE_SIZE;
  const shownRest = useMemo(() => restItems.slice(0, visible), [restItems, visible]);
  const groups = useMemo(() => buildGroups(pinnedItems, shownRest, prefs.group), [pinnedItems, shownRest, prefs.group]);
  const shownCount = pinnedItems.length + shownRest.length;

  // Chỉ tải ảnh siêu nhỏ của các mục đang hiển thị.
  useEffect(() => {
    const missing = [...pinnedItems, ...shownRest].map((entry) => entry.id).filter((id) => !(id in thumbs) && !requested.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => requested.current.add(id));
    getThumbnails(missing).then(
      (result) => setThumbs((prev) => ({ ...prev, ...result })),
      (err) => {
        console.error(err);
        missing.forEach((id) => requested.current.delete(id));
      },
    );
  }, [pinnedItems, shownRest, thumbs]);

  const hasFilter = Boolean(query || clientFilter || monthFilter || dateFilter);

  function clearFilters() {
    setQuery("");
    setClientFilter("");
    setMonthFilter("");
    setDateFilter("");
  }

  function openCreate() {
    setFormError("");
    setForm({ ...EMPTY_FORM, folderDate: todayIso(), client: clientFilter });
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

  function handleOpen(entry: FolderEntry) {
    if (!openFolder(entry.path)) {
      showToast("Chỉ mở được đường dẫn dạng C:\\Thư mục.", false);
      return;
    }
    showToast("Đang mở thư mục…");
  }

  async function handleCopy(entry: FolderEntry) {
    showToast((await copyText(entry.path)) ? "Đã sao chép đường dẫn." : "Trình duyệt chưa cho phép sao chép.", true);
  }

  async function handlePin(entry: FolderEntry) {
    const next = !entry.pinned;
    try {
      await setPinned(entry.id, next);
      setLoaded((prev) => (prev ? { ...prev, rows: prev.rows.map((row) => (row.id === entry.id ? { ...row, pinned: next } : row)) } : prev));
      showToast(next ? "Đã ghim lên đầu." : "Đã bỏ ghim.");
    } catch (err) {
      console.error(err);
      showToast("Chưa ghim được. Hãy chạy file migration ghim thư mục trong Supabase.", false);
    }
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
  const searching = terms.length > 0;

  function entryProps(entry: FolderEntry): EntryViewProps {
    return {
      entry,
      thumb: thumbs[entry.id],
      terms,
      isOwn,
      onOpen: () => handleOpen(entry),
      onCopy: () => void handleCopy(entry),
      onPin: () => void handlePin(entry),
      onEdit: () => openEdit(entry),
      onDelete: () => setToDelete(entry),
    };
  }

  return (
    <section className="space-y-5">
      {!wsLoading && workspaces.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
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
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Thư mục {activeLabel}</h2>
            {canView && !entriesLoading && (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{stats.total} thư mục</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{stats.clients} khách</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{stats.projects} dự án</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={INSTALLER_URL} download title="Tải công cụ giúp nút Mở hoạt động trên Windows" className={outlineButton}>
              <DownloadIcon className="h-4 w-4" />
              Cài đặt Windows
            </a>
            {isOwn && (
              <>
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
              </>
            )}
          </div>
        </div>

        {canView && (
          <>
            <div className="sticky top-14 z-10 -mx-5 space-y-3 border-b border-slate-100 bg-white/95 px-5 pb-3 pt-2 backdrop-blur sm:-mx-6 sm:px-6">
              <div className="flex items-center gap-2">
                <label className="relative block min-w-0 flex-1">
                  <span className="sr-only">Tìm kiếm</span>
                  <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setQuery("");
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder="Tìm khách, dự án, đường dẫn, ngày… (nhấn / để tìm)"
                    className={`${inputClass} pl-10 pr-10`}
                  />
                  {query ? (
                    <button type="button" onClick={() => setQuery("")} aria-label="Xóa nội dung tìm" className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900">
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  ) : (
                    <kbd className="pointer-events-none absolute right-3 top-1/2 hidden h-6 -translate-y-1/2 place-items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-xs text-slate-400 sm:grid">/</kbd>
                  )}
                </label>
                <div role="group" aria-label="Kiểu hiển thị" className="flex h-11 shrink-0 items-center rounded-xl border border-slate-200 bg-white p-1">
                  {([
                    ["list", "Danh sách", ListIcon],
                    ["grid", "Lưới", GridIcon],
                  ] as const).map(([key, label, Icon]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => updatePrefs({ view: key })}
                      aria-pressed={prefs.view === key}
                      aria-label={label}
                      title={label}
                      className={`grid h-9 w-9 place-items-center rounded-lg transition ${prefs.view === key ? "bg-black text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"}`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>

              {clientOptions.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto md:flex-wrap md:overflow-visible" role="group" aria-label="Lọc theo khách">
                  <button type="button" onClick={() => setClientFilter("")} aria-pressed={clientFilter === ""} className={chipClass(clientFilter === "")}>
                    Tất cả
                    <span className={`text-xs ${clientFilter === "" ? "text-white/70" : "text-slate-400"}`}>{entries.length}</span>
                  </button>
                  {clientChips.chips.map(([name, count]) => (
                    <button key={name} type="button" onClick={() => setClientFilter(clientFilter === name ? "" : name)} aria-pressed={clientFilter === name} className={chipClass(clientFilter === name)}>
                      <span className="max-w-40 truncate">{name}</span>
                      <span className={`text-xs ${clientFilter === name ? "text-white/70" : "text-slate-400"}`}>{count}</span>
                    </button>
                  ))}
                  {clientChips.rest.length > 0 && (
                    <label className="relative inline-flex h-8 shrink-0 items-center">
                      <span className="sr-only">Khách khác</span>
                      <select
                        value=""
                        onChange={(event) => setClientFilter(event.target.value)}
                        className="h-8 cursor-pointer appearance-none rounded-full border border-dashed border-slate-300 bg-white pl-3 pr-8 text-sm font-medium text-slate-600 outline-none transition hover:border-slate-900 focus:border-slate-900"
                      >
                        <option value="">Khách khác ({clientChips.rest.length})</option>
                        {clientChips.rest.map(([name, count]) => (
                          <option key={name} value={name}>
                            {name} ({count})
                          </option>
                        ))}
                      </select>
                      <ChevronDownIcon className="pointer-events-none absolute right-2.5 h-4 w-4 text-slate-400" />
                    </label>
                  )}
                </div>
              )}
            </div>

            <div className="mb-4 mt-3 flex flex-wrap items-center gap-2">
              <FilterSelect label="Tháng" value={monthFilter} onChange={setMonthFilter}>
                <option value="">Tất cả</option>
                {monthOptions.map(([key, count]) => (
                  <option key={key} value={key}>
                    {monthLabel(key)} ({count})
                  </option>
                ))}
              </FilterSelect>
              <label className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white pl-3 pr-1.5 text-xs text-slate-500 transition focus-within:border-slate-500 hover:border-slate-400">
                Ngày
                <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="h-8 rounded-lg bg-transparent text-sm font-medium text-slate-900 outline-none" />
              </label>
              <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />
              <FilterSelect label="Sắp xếp" value={prefs.sort} onChange={(value) => updatePrefs({ sort: value as SortKey })}>
                {SORT_OPTIONS.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Nhóm theo" value={prefs.group} onChange={(value) => updatePrefs({ group: value as GroupKey })}>
                {GROUP_OPTIONS.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </FilterSelect>
              {hasFilter && (
                <button type="button" onClick={clearFilters} className="h-9 rounded-xl px-2.5 text-sm font-medium text-slate-500 underline-offset-2 transition hover:text-slate-950 hover:underline">
                  Xóa bộ lọc
                </button>
              )}
              {!entriesLoading && (
                <span className="ml-auto text-xs text-slate-500" aria-live="polite">
                  {hasFilter ? `${filtered.length}/${entries.length} kết quả` : `${filtered.length} thư mục`}
                </span>
              )}
            </div>
          </>
        )}

        {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}

        {entriesLoading && canView ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid place-items-center rounded-2xl bg-slate-50 px-4 py-14 text-center">
            <FolderIcon className="h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-600">{hasFilter ? "Không tìm thấy thư mục phù hợp" : "Chưa có thư mục nào"}</p>
            {hasFilter ? (
              <button type="button" onClick={clearFilters} className={`${outlineButton} mt-4`}>
                Xóa bộ lọc
              </button>
            ) : (
              isOwn && (
                <button type="button" onClick={openCreate} className={`${blackButton} mt-4`}>
                  <PlusIcon className="h-4 w-4" />
                  Thêm thư mục đầu tiên
                </button>
              )
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => {
              const isCollapsed = !searching && collapsed[group.key] === true;
              const showHeader = group.label !== "";
              return (
                <div key={group.key}>
                  {showHeader && (
                    <button
                      type="button"
                      onClick={() => setCollapsed((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                      aria-expanded={!isCollapsed}
                      className="mb-3 flex w-full items-center gap-2 text-left"
                    >
                      <ChevronDownIcon className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                      {group.pinned && <PinIcon className="h-3.5 w-3.5 shrink-0" filled />}
                      <span className="truncate text-sm font-semibold text-slate-900">{group.label}</span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{group.items.length}</span>
                      <span className="h-px flex-1 bg-slate-100" aria-hidden="true" />
                    </button>
                  )}
                  {!isCollapsed && (
                    <ul className={prefs.view === "grid" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2.5"}>
                      {group.items.map((entry) =>
                        prefs.view === "grid" ? <EntryTile key={entry.id} {...entryProps(entry)} /> : <EntryRow key={entry.id} {...entryProps(entry)} />,
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
            {restItems.length > shownRest.length && (
              <div className="text-center">
                <button type="button" onClick={() => setVisibleState({ count: visible + PAGE_SIZE, key: filterKey })} className={outlineButton}>
                  Xem thêm ({restItems.length - shownRest.length})
                </button>
                <p className="mt-2 text-xs text-slate-400">
                  Đang hiển thị {shownCount}/{filtered.length}
                </p>
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
              <NameCombobox value={form.project} onChange={(project) => patchForm({ project })} options={projectOptions} placeholder="Tên dự án" maxLength={150} />
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
