-- Bách Khoa meme: kho GIF dùng chung.
--   * Chỉ quản trị viên được đăng và xóa.
--   * Mọi tài khoản đã đăng nhập đều xem và sao chép được.
begin;

create table public.meme_gifs (
  id         uuid primary key default gen_random_uuid(),
  path       text not null unique check (char_length(path) between 1 and 200),
  width      integer check (width between 1 and 10000),
  height     integer check (height between 1 and 10000),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index meme_gifs_created_idx on public.meme_gifs (created_at desc);

alter table public.meme_gifs enable row level security;
revoke all on public.meme_gifs from public, anon, authenticated;
grant select, insert, delete on public.meme_gifs to authenticated;

create policy meme_gifs_read on public.meme_gifs
  for select to authenticated using (true);

create policy meme_gifs_admin_insert on public.meme_gifs
  for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));

create policy meme_gifs_admin_delete on public.meme_gifs
  for delete to authenticated
  using ((select public.is_admin()));

-- Kho lưu tệp: tối đa 10 MB mỗi GIF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meme-gifs', 'meme-gifs', true, 10485760, array['image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy meme_gifs_storage_read on storage.objects
  for select to authenticated
  using (bucket_id = 'meme-gifs');

create policy meme_gifs_storage_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meme-gifs' and (select public.is_admin()));

create policy meme_gifs_storage_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'meme-gifs' and (select public.is_admin()));

commit;
