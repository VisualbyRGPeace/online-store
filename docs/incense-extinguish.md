# Dập nhang / thắp lại nhang: phần dữ liệu cần có

Giao diện (`src/components/incense-view.tsx`) đã xong. Nó gọi hai hàm mới trong
`@/services/incense-service` và đọc thêm 3 trường từ danh sách nhang.
Tôi không thấy file service và schema của bạn, nên bên dưới là **bản mẫu**: bạn đổi tên bảng/cột/client
cho khớp project rồi mới chạy.

## 1. Hợp đồng giữa giao diện và service

`listBurningIncense()` phải trả thêm cho mỗi nén nhang:

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `is_mine` | `boolean` | người đang đăng nhập chính là người đã thắp nén nhang này |
| `extinguished_at` | `string \| null` | thời điểm bị dập, `null` nếu còn cháy |
| `extinguished_by_name` | `string \| null` | tên người đã dập |

Nhang bị dập **vẫn phải nằm trong danh sách** cho đến khi hết hạn (`expires_at`), để trang còn hiện được tên người dập.

Hai hàm mới:

- `extinguishIncense(id: string): Promise<void>`: dập nhang của người khác. Báo lỗi nếu chưa đăng nhập, nếu là nhang của chính mình, đã tắt, hoặc đã hết hạn.
- `relightIncense(id: string): Promise<void>`: thắp lại. **Chỉ người thắp ban đầu** mới được.

Quy tắc "chỉ người thắp ban đầu mới thắp lại được" phải nằm ở phía server (SQL bên dưới). Nút ẩn trên giao diện chỉ để gọn, không thay thế được kiểm tra này.

## 2. SQL mẫu (Postgres / Supabase)

Giả định: bảng `public.incense_offerings` có `id`, `donor_id`, `expires_at`; bảng `public.profiles` có `id`, `full_name`.

```sql
alter table public.incense_offerings
  add column if not exists extinguished_at timestamptz,
  add column if not exists extinguished_by uuid references auth.users (id),
  add column if not exists extinguished_by_name text;

create or replace function public.extinguish_incense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(nullif(trim(full_name), ''), 'Một người')
    into v_name
    from public.profiles
   where id = auth.uid();

  update public.incense_offerings
     set extinguished_at = now(),
         extinguished_by = auth.uid(),
         extinguished_by_name = coalesce(v_name, 'Một người')
   where id = p_id
     and donor_id <> auth.uid()      -- không tự dập nhang của mình
     and extinguished_at is null     -- chưa tắt
     and expires_at > now();         -- chưa hết hạn

  if not found then
    raise exception 'cannot_extinguish';
  end if;
end;
$$;

create or replace function public.relight_incense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.incense_offerings
     set extinguished_at = null,
         extinguished_by = null,
         extinguished_by_name = null
   where id = p_id
     and donor_id = auth.uid()       -- chỉ người thắp ban đầu
     and extinguished_at is not null
     and expires_at > now();

  if not found then
    raise exception 'cannot_relight';
  end if;
end;
$$;

grant execute on function public.extinguish_incense(uuid) to authenticated;
grant execute on function public.relight_incense(uuid) to authenticated;
```

Nhớ chặn người dùng tự `update` ba cột `extinguished_*` trực tiếp (RLS hoặc `revoke update (...)`),
nếu không họ có thể bỏ qua hai hàm trên.

## 3. Thêm vào `incense-service`

Đổi `supabase` thành client đang dùng trong project.

```ts
export async function extinguishIncense(id: string): Promise<void> {
  const { error } = await supabase.rpc("extinguish_incense", { p_id: id });
  if (error) throw error;
}

export async function relightIncense(id: string): Promise<void> {
  const { error } = await supabase.rpc("relight_incense", { p_id: id });
  if (error) throw error;
}
```

Trong `listBurningIncense()`: lấy thêm `extinguished_at`, `extinguished_by_name`, và tính
`is_mine: row.donor_id === currentUserId` (người chưa đăng nhập thì `false`). Không lọc bỏ các dòng đã tắt.

## 4. Người khác thấy thay đổi khi nào

Sau khi dập hoặc thắp lại, trang của người thao tác tải lại ngay. Người khác thấy trong lần tải kế tiếp (tối đa 15 giây, theo chu kỳ đang có).
Muốn thấy tức thời, mở rộng `subscribeToIncenseBlessings` để nghe cả sự kiện UPDATE của bảng này.
