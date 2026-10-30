import { createClient } from "@/lib/supabase/client";

export type CommunityPrompt = {
  id: string;
  title: string;
  content: string;
  /** Thumbnail hiển thị cho người xem. */
  image_path: string | null;
  /** Ảnh mẫu / phác thảo để AI hiểu; được sao chép kèm chữ. */
  reference_image_path: string | null;
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

async function uploadImage(ownerId: string, dataUrl: string): Promise<string> {
  const blob = await fetch(dataUrl).then((response) => response.blob());
  const path = `${ownerId}/${crypto.randomUUID()}.webp`;
  const { error } = await createClient()
    .storage.from(IMAGE_BUCKET)
    .upload(path, blob, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) throw error;
  return path;
}

async function removeImages(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((path): path is string => Boolean(path));
  if (list.length === 0) return;
  const { error } = await createClient().storage.from(IMAGE_BUCKET).remove(list);
  if (error) console.error("Could not remove prompt illustration:", error);
}

export async function createCommunityPrompt(input: {
  userId: string;
  title: string;
  content: string;
  thumbnailData?: string;
  referenceData?: string;
}): Promise<void> {
  const supabase = createClient();
  const uploaded: string[] = [];
  try {
    const imagePath = input.thumbnailData ? await uploadImage(input.userId, input.thumbnailData) : null;
    if (imagePath) uploaded.push(imagePath);
    const referencePath = input.referenceData ? await uploadImage(input.userId, input.referenceData) : null;
    if (referencePath) uploaded.push(referencePath);

    const { error } = await supabase.from("community_prompts").insert({
      user_id: input.userId,
      title: input.title,
      content: input.content,
      image_path: imagePath,
      reference_image_path: referencePath,
    });
    if (error) throw error;
  } catch (err) {
    await supabase.storage.from(IMAGE_BUCKET).remove(uploaded).catch(() => undefined);
    throw err;
  }
}

/**
 * Sửa tiêu đề, nội dung, thumbnail và ảnh mẫu. Ảnh mới nằm trong thư mục của chủ prompt
 * (kể cả khi quản trị viên sửa). Với mỗi ảnh: có dữ liệu mới thì thay, remove = true thì bỏ, còn lại giữ nguyên.
 */
export async function updateCommunityPrompt(input: {
  id: string;
  title: string;
  content: string;
  thumbnailData?: string;
  removeThumbnail?: boolean;
  referenceData?: string;
  removeReference?: boolean;
}): Promise<void> {
  const supabase = createClient();
  const { data: row, error: readError } = await supabase
    .from("community_prompts")
    .select("user_id, image_path, reference_image_path")
    .eq("id", input.id)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error("not_found");

  const uploaded: string[] = [];
  try {
    let nextThumb: string | null = row.image_path;
    if (input.thumbnailData) {
      nextThumb = await uploadImage(row.user_id, input.thumbnailData);
      uploaded.push(nextThumb);
    } else if (input.removeThumbnail) {
      nextThumb = null;
    }

    let nextReference: string | null = row.reference_image_path;
    if (input.referenceData) {
      nextReference = await uploadImage(row.user_id, input.referenceData);
      uploaded.push(nextReference);
    } else if (input.removeReference) {
      nextReference = null;
    }

    const { data, error } = await supabase
      .from("community_prompts")
      .update({ title: input.title, content: input.content, image_path: nextThumb, reference_image_path: nextReference })
      .eq("id", input.id)
      .select("id");
    if (error || !data || data.length === 0) throw error ?? new Error("update_denied");

    await removeImages([
      row.image_path !== nextThumb ? row.image_path : null,
      row.reference_image_path !== nextReference ? row.reference_image_path : null,
    ]);
  } catch (err) {
    await supabase.storage.from(IMAGE_BUCKET).remove(uploaded).catch(() => undefined);
    throw err;
  }
}

export async function deleteCommunityPrompt(id: string): Promise<void> {
  const supabase = createClient();
  const { data, error: readError } = await supabase
    .from("community_prompts")
    .select("image_path, reference_image_path")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;

  const { error } = await supabase.from("community_prompts").delete().eq("id", id);
  if (error) throw error;

  await removeImages([data?.image_path, data?.reference_image_path]);
}
