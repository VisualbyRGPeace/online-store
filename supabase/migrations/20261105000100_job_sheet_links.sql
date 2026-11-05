-- Quản lý Job: mỗi tài khoản lưu liên kết tới Google Sheet của riêng mình
-- (địa chỉ Apps Script web app + mật mã). Chỉ chủ tài khoản đọc/ghi được.
begin;

create table public.job_sheet_links (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  script_url text not null check (
    char_length(script_url) <= 500
    and script_url ~ '^https://script\.google\.com/.+/exec$'
  ),
  token      text not null check (char_length(token) between 8 and 200),
  updated_at timestamptz not null default now()
);

alter table public.job_sheet_links enable row level security;

revoke all on public.job_sheet_links from public, anon, authenticated;
grant select, insert, delete on public.job_sheet_links to authenticated;
grant update (script_url, token, updated_at) on public.job_sheet_links to authenticated;

create policy job_sheet_links_select_own on public.job_sheet_links
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy job_sheet_links_insert_own on public.job_sheet_links
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy job_sheet_links_update_own on public.job_sheet_links
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy job_sheet_links_delete_own on public.job_sheet_links
  for delete to authenticated
  using (user_id = (select auth.uid()));

commit;
