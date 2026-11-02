import { createClient } from "@/lib/supabase/client";

export type WorkspaceAccess = "own" | "approved" | "pending" | "none";

export type FolderWorkspace = {
  owner_id: string;
  owner_name: string;
  entry_count: number | null;
  access: WorkspaceAccess;
};

export type FolderEntry = {
  id: string;
  user_id: string;
  client: string;
  project: string;
  folder_date: string;
  path: string;
  created_at: string;
  pinned: boolean;
};

export type FolderViewer = {
  viewer_id: string;
  viewer_name: string;
  status: "pending" | "approved";
  created_at: string;
};

export type FolderInput = {
  client: string;
  project: string;
  folderDate: string;
  path: string;
};

const BASE_COLUMNS = "id, user_id, client, project, folder_date, path, created_at";
const ENTRY_COLUMNS = `${BASE_COLUMNS}, pinned`;
const MAX_ENTRIES = 2000;

export async function listWorkspaces(): Promise<FolderWorkspace[]> {
  const { data, error } = await createClient().rpc("list_folder_workspaces");
  if (error) throw error;
  return ((data ?? []) as FolderWorkspace[]).map((row) => ({
    ...row,
    entry_count: row.entry_count === null ? null : Number(row.entry_count),
  }));
}

export async function listEntries(ownerId: string): Promise<FolderEntry[]> {
  const run = (columns: string) =>
    createClient()
      .from("folder_entries")
      .select(columns)
      .eq("user_id", ownerId)
      .order("folder_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(MAX_ENTRIES);

  const first = await run(ENTRY_COLUMNS);
  if (!first.error) return (first.data ?? []) as unknown as FolderEntry[];
  // 42703: cột "pinned" chưa có (chưa chạy migration ghim) -> vẫn hiển thị danh sách, chỉ không có ghim.
  if (first.error.code !== "42703") throw first.error;
  const fallback = await run(BASE_COLUMNS);
  if (fallback.error) throw fallback.error;
  return ((fallback.data ?? []) as unknown as Omit<FolderEntry, "pinned">[]).map((row) => ({ ...row, pinned: false }));
}

/** Ảnh siêu nhỏ tải riêng theo từng trang để danh sách và tìm kiếm luôn nhẹ. */
export async function getThumbnails(ids: string[]): Promise<Record<string, string | null>> {
  if (ids.length === 0) return {};
  const { data, error } = await createClient().from("folder_entries").select("id, thumbnail").in("id", ids);
  if (error) throw error;
  const result: Record<string, string | null> = Object.fromEntries(ids.map((id) => [id, null]));
  for (const row of (data ?? []) as { id: string; thumbnail: string | null }[]) result[row.id] = row.thumbnail;
  return result;
}

export async function createEntry(userId: string, input: FolderInput, thumbnail: string | null): Promise<void> {
  const { error } = await createClient().from("folder_entries").insert({
    user_id: userId,
    client: input.client,
    project: input.project,
    folder_date: input.folderDate,
    path: input.path,
    thumbnail,
  });
  if (error) throw error;
}

/** thumbnail: undefined = giữ nguyên, null = bỏ ảnh, chuỗi = ảnh mới. */
export async function updateEntry(id: string, input: FolderInput, thumbnail?: string | null): Promise<void> {
  const patch: Record<string, unknown> = {
    client: input.client,
    project: input.project,
    folder_date: input.folderDate,
    path: input.path,
  };
  if (thumbnail !== undefined) patch.thumbnail = thumbnail;
  const { data, error } = await createClient().from("folder_entries").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("update_denied");
}

export async function setPinned(id: string, pinned: boolean): Promise<void> {
  const { data, error } = await createClient().from("folder_entries").update({ pinned }).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("update_denied");
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await createClient().from("folder_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function requestAccess(ownerId: string, viewerId: string): Promise<void> {
  const { error } = await createClient()
    .from("folder_access")
    .insert({ owner_id: ownerId, viewer_id: viewerId, status: "pending" });
  if (error && error.code !== "23505") throw error;
}

/** Hủy yêu cầu (người xem), từ chối hoặc thu hồi quyền (chủ kho). */
export async function removeAccess(ownerId: string, viewerId: string): Promise<void> {
  const { error } = await createClient().from("folder_access").delete().eq("owner_id", ownerId).eq("viewer_id", viewerId);
  if (error) throw error;
}

export async function approveAccess(ownerId: string, viewerId: string): Promise<void> {
  const { data, error } = await createClient()
    .from("folder_access")
    .update({ status: "approved" })
    .eq("owner_id", ownerId)
    .eq("viewer_id", viewerId)
    .select("viewer_id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("update_denied");
}

export async function listViewers(): Promise<FolderViewer[]> {
  const { data, error } = await createClient().rpc("list_folder_access");
  if (error) throw error;
  return (data ?? []) as FolderViewer[];
}
