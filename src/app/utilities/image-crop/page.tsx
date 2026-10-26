import type { Metadata } from "next";
import { ImageCropExpandUtility } from "@/components/image-crop-expand-utility";

export const metadata: Metadata = { title: "Cắt ảnh social" };

export default function Page() {
  return <ImageCropExpandUtility />;
}
