import { copyText } from "@/utils/clipboard";

/**
 * Sao chép một GIF theo cách tốt nhất mà trình duyệt cho phép:
 *  1. Tệp GIF thật (chỉ một số trình duyệt hỗ trợ).
 *  2. Ảnh dạng HTML kèm liên kết: dán vào Gmail, Docs, Notion... vẫn là ảnh động.
 *  3. Chỉ liên kết, nếu hai cách trên đều bị từ chối.
 * Muốn đưa tệp GIF thật vào ô chat, hãy kéo ảnh sang ô đó.
 */
export async function copyGif(url: string): Promise<boolean> {
  const canWrite = typeof ClipboardItem !== "undefined" && Boolean(navigator.clipboard?.write);
  if (canWrite) {
    const supports = (ClipboardItem as unknown as { supports?: (type: string) => boolean }).supports;
    if (!supports || supports("image/gif")) {
      try {
        const blob = fetch(url, { mode: "cors" }).then(async (response) => {
          if (!response.ok) throw new Error("gif_fetch_failed");
          const raw = await response.blob();
          return raw.type === "image/gif" ? raw : new Blob([raw], { type: "image/gif" });
        });
        await navigator.clipboard.write([new ClipboardItem({ "image/gif": blob })]);
        return true;
      } catch {
        // thử cách tiếp theo
      }
    }
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([`<img src="${url}" alt="">`], { type: "text/html" }),
          "text/plain": new Blob([url], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch {
      // thử cách tiếp theo
    }
  }
  return copyText(url);
}
