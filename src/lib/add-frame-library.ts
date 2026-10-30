/**
 * Thư viện frame cho tiện ích "Add frame".
 *
 * Ảnh nằm trong public/add-frame/:
 *   frames/<file>.png        mỗi frame một file 3000×3000 (PNG nền trong suốt)
 *   logos/logo-left.png      logo góc trái
 *   logos/logo-right.png     logo góc phải
 *
 * Thêm frame mới: bỏ file PNG vào public/add-frame/frames/, thêm một dòng vào FRAMES,
 * rồi thêm id của nó vào danh mục muốn dùng (và luôn thêm vào "all").
 */
export type Frame = { id: string; name: string; file: string };
export type FrameCategory = { id: string; name: string; frameIds: string[] };

export const SIZE = 3000;

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const frameUrl = (frame: Frame) => `${BASE}/add-frame/frames/${frame.file}`;
export const logoUrl = (side: "left" | "right") => `${BASE}/add-frame/logos/logo-${side}.png`;

export const FRAMES: Frame[] = [
  { id: "aloe-can", name: "Aloe Can", file: "aloe-can.png" },
  { id: "aloe-pet", name: "Aloe PET", file: "aloe-pet.png" },
  { id: "basil", name: "Basil", file: "basil.png" },
  { id: "boba", name: "Boba", file: "boba.png" },
  { id: "coffee", name: "Coffee", file: "coffee.png" },
  { id: "coffee-can", name: "Coffee Can", file: "coffee-can.png" },
  { id: "fruit-milk", name: "Fruit milk", file: "fruit-milk.png" },
  { id: "juice-100", name: "Juice 100", file: "juice-100.png" },
  { id: "juice-30", name: "Juice 30", file: "juice-30.png" },
  { id: "juice-can", name: "Juice Can", file: "juice-can.png" },
  { id: "nata-nature", name: "Nata - nature", file: "nata-nature.png" },
  { id: "nata-sunsmile", name: "Nata - Sunsmile", file: "nata-sunsmile.png" },
  { id: "smoothie", name: "Smoothie", file: "smoothie.png" },
  { id: "soy", name: "Soy", file: "soy.png" },
];

export const CATEGORIES: FrameCategory[] = [
  { id: "all", name: "All", frameIds: ["aloe-can", "aloe-pet", "basil", "boba", "coffee", "coffee-can", "fruit-milk", "juice-100", "juice-30", "juice-can", "nata-nature", "nata-sunsmile", "smoothie", "soy"] },
  { id: "america", name: "America", frameIds: ["aloe-can", "aloe-pet", "juice-100", "smoothie"] },
  { id: "asia", name: "Asia", frameIds: ["coffee", "coffee-can", "juice-100", "nata-nature", "nata-sunsmile"] },
  { id: "australia", name: "Australia", frameIds: ["aloe-can", "aloe-pet", "juice-100", "smoothie"] },
  { id: "china", name: "China", frameIds: ["juice-100", "juice-30", "juice-can"] },
  { id: "europe", name: "Europe", frameIds: ["aloe-can", "aloe-pet", "basil", "juice-100"] },
  { id: "global", name: "Global", frameIds: ["aloe-can", "aloe-pet", "juice-100", "juice-30", "juice-can", "smoothie"] },
  { id: "india", name: "India", frameIds: ["boba", "nata-nature", "nata-sunsmile"] },
  { id: "middle-east", name: "Middle East", frameIds: ["fruit-milk", "juice-100", "juice-30", "juice-can", "soy"] },
  { id: "russia", name: "Russia", frameIds: ["coffee", "coffee-can", "juice-100", "juice-30", "juice-can", "smoothie"] },
];

const byId = new Map(FRAMES.map((frame) => [frame.id, frame]));

export function framesOf(category: FrameCategory): Frame[] {
  return category.frameIds.flatMap((id) => {
    const frame = byId.get(id);
    return frame ? [frame] : [];
  });
}
