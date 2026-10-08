# Online Store (Next.js static + Supabase + GitHub Pages)

Kiến trúc: Next.js (static export) chạy trên GitHub Pages; toàn bộ dữ liệu, đăng nhập, ảnh nằm ở Supabase.
Vì không có server riêng, **bảo mật nằm ở Supabase**: RLS, hàm RPC (`place_order`), Storage policy, Edge Functions (webhook thanh toán).

## Chạy local
1. `git clone <repo-url> && cd online-store`
2. `npm install`
3. `cp .env.example .env.local` rồi điền URL + publishable key của Supabase
4. `npm run dev` -> http://localhost:3000
5. Database: Supabase Dashboard > SQL Editor, chạy lần lượt 5 file trong `supabase/migrations/` theo thứ tự tên file (0100 -> 0500)
6. Kiểm tra: `npm run typecheck && npm run lint && npm run build`

## Deploy GitHub Pages
1. Repo > Settings > Pages > Source: **GitHub Actions**
2. Repo > Settings > Secrets and variables > Actions > tab **Variables**: thêm `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Push lên `main` (hoặc Actions > Deploy to GitHub Pages > Run workflow). Site: https://visualbyrgpeace.github.io/online-store/
4. Supabase > Authentication > URL Configuration: đặt Site URL là địa chỉ trên.

## Cấu trúc
`src/app` routes · `src/components` UI · `src/services` nghiệp vụ · `src/lib` hạ tầng · `supabase/migrations` schema + RLS (Phase 2).
