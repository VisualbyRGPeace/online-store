import { createClient } from "@/lib/supabase/client";

export type MemeGif = {
  id: string;
  path: string;
  width: number | null;
  height: number | null;
  created_at: string;
  url: string;
};

const BUCKET = "meme-gifs";
const LIST_LIMIT = 1000;

/** Giới hạn khớp với kho lưu trữ trong cơ sở dữ liệu (10 MB). */
export const MAX_MEME_BYTES = 10 * 1024 * 1024;

export function memeGifUrl(path: string): string {
  return createClient().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function listMemeGifs(): Promise<MemeGif[]> {
  const { data, error } = await createClient()
    .from("meme_gifs")
    .select("id, path, width, height, created_at")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    path: row.path as string,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    created_at: row.created_at as string,
    url: memeGifUrl(row.path as string),
  }));
}

/** Chỉ quản trị viên làm được (chính sách RLS vẫn chặn người khác dù giao diện bị bỏ qua). */
export async function uploadMemeGif(
  userId: string,
  file: File,
  size: { width: number; height: number } | null,
): Promise<void> {
  const supabase = createClient();
  const path = `${userId}/${crypto.randomUUID()}.gif`;
  const { error: uploadError } = await supabase
    .storage.from(BUCKET)
    .upload(path, file, { contentType: "image/gif", cacheControl: "31536000", upsert: false });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from("meme_gifs").insert({
    path,
    width: size?.width ?? null,
    height: size?.height ?? null,
    created_by: userId,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }
}

export async function deleteMemeGif(gif: MemeGif): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase.from("meme_gifs").delete().eq("id", gif.id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("delete_denied");
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([gif.path]);
  if (removeError) console.error("Could not remove meme file:", removeError);
}
