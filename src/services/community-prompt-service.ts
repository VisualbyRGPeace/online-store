import { createClient } from "@/lib/supabase/client";

export type CommunityPrompt = {
  id: string;
  title: string;
  content: string;
  image_path: string | null;
  created_at: string;
  creator_name: string;
  total_count: number;
  user_id: string;
};

export type CommunityPromptPage = {
  items: CommunityPrompt[];
  total: number;
  pageSize: number;
};

export const COMMUNITY_PROMPT_PAGE_SIZE = 20;
const IMAGE_BUCKET = "prompt-illustrations";

export async function listCommunityPrompts(page: number): Promise<CommunityPromptPage> {
  const { data, error } = await createClient().rpc("list_community_prompts", {
    p_page: page,
    p_page_size: COMMUNITY_PROMPT_PAGE_SIZE,
  });
  if (error) throw error;
  const items = (data ?? []) as CommunityPrompt[];
  return {
    items,
    total: Number(items[0]?.total_count ?? 0),
    pageSize: COMMUNITY_PROMPT_PAGE_SIZE,
  };
}

export function communityPromptImageUrl(path: string): string {
  return createClient().storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function createCommunityPrompt(input: {
  userId: string;
  title: string;
  content: string;
  imageData?: string;
}): Promise<void> {
  const supabase = createClient();
  let imagePath: string | null = null;

  if (input.imageData) {
    const blob = await fetch(input.imageData).then((response) => response.blob());
    imagePath = `${input.userId}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(imagePath, blob, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
    if (uploadError) throw uploadError;
  }

  const { error } = await supabase.from("community_prompts").insert({
    user_id: input.userId,
    title: input.title,
    content: input.content,
    image_path: imagePath,
  });

  if (error) {
    if (imagePath) {
      await supabase.storage.from(IMAGE_BUCKET).remove([imagePath]).catch(() => undefined);
    }
    throw error;
  }
}

export async function deleteCommunityPrompt(id: string): Promise<void> {
  const supabase = createClient();
  const { data, error: readError } = await supabase
    .from("community_prompts")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;

  const { error } = await supabase.from("community_prompts").delete().eq("id", id);
  if (error) throw error;

  if (data?.image_path) {
    const { error: imageError } = await supabase.storage.from(IMAGE_BUCKET).remove([data.image_path]);
    if (imageError) console.error("Could not remove prompt illustration:", imageError);
  }
}

/** Sửa tiêu đề, nội dung và ảnh mẫu. Ảnh mới nằm trong thư mục của chủ prompt (kể cả khi quản trị viên sửa). */
export async function updateCommunityPrompt(input: {
  id: string;
  title: string;
  content: string;
  imageData?: string;
  removeImage?: boolean;
}): Promise<void> {
  const supabase = createClient();
  const { data: row, error: readError } = await supabase
    .from("community_prompts")
    .select("user_id, image_path")
    .eq("id", input.id)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error("not_found");

  let nextPath: string | null = row.image_path;
  let uploadedPath: string | null = null;

  if (input.imageData) {
    const blob = await fetch(input.imageData).then((response) => response.blob());
    uploadedPath = `${row.user_id}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(uploadedPath, blob, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
    if (uploadError) throw uploadError;
    nextPath = uploadedPath;
  } else if (input.removeImage) {
    nextPath = null;
  }

  const { data, error } = await supabase
    .from("community_prompts")
    .update({ title: input.title, content: input.content, image_path: nextPath })
    .eq("id", input.id)
    .select("id");

  if (error || !data || data.length === 0) {
    if (uploadedPath) await supabase.storage.from(IMAGE_BUCKET).remove([uploadedPath]).catch(() => undefined);
    throw error ?? new Error("update_denied");
  }

  if (row.image_path && row.image_path !== nextPath) {
    const { error: imageError } = await supabase.storage.from(IMAGE_BUCKET).remove([row.image_path]);
    if (imageError) console.error("Could not remove old prompt illustration:", imageError);
  }
}
