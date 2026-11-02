-- Quản lý thư mục: mỗi tài khoản có kho riêng; người khác thấy tên kho nhưng chỉ xem được khi chủ kho cho phép.
begin;

create table public.folder_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  client      text not null check (char_length(btrim(client)) between 1 and 100),
  project     text not null check (char_length(btrim(project)) between 1 and 150),
  folder_date date not null,
  path        text not null check (char_length(btrim(path)) between 1 and 500),
  thumbnail   text check (
    thumbnail is null
    or (char_length(thumbnail) <= 40000 and thumbnail ~ '^data:image/(webp|jpeg);base64,')
  ),
  created_at  timestamptz not null default now()
);

create index folder_entries_owner_date_idx
  on public.folder_entries (user_id, folder_date desc, created_at desc);

create table public.folder_access (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  viewer_id  uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id),
  check (owner_id <> viewer_id)
);

alter table public.folder_entries enable row level security;
alter table public.folder_access enable row level security;

revoke all on public.folder_entries from anon, authenticated;
revoke all on public.folder_access from anon, authenticated;
grant select, insert, delete on public.folder_entries to authenticated;
grant update (client, project, folder_date, path, thumbnail) on public.folder_entries to authenticated;
grant select, insert, delete on public.folder_access to authenticated;
grant update (status) on public.folder_access to authenticated;

-- Thư mục: chủ kho xem/sửa; người khác chỉ xem khi đã được cho phép.
create policy folder_entries_select on public.folder_entries
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.folder_access a
       where a.owner_id = folder_entries.user_id
         and a.viewer_id = (select auth.uid())
         and a.status = 'approved'
    )
  );

create policy folder_entries_insert_own on public.folder_entries
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy folder_entries_update_own on public.folder_entries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy folder_entries_delete_own on public.folder_entries
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Quyền xem: người xem tự gửi yêu cầu, chỉ chủ kho được duyệt.
create policy folder_access_select on public.folder_access
  for select to authenticated
  using (owner_id = (select auth.uid()) or viewer_id = (select auth.uid()));

create policy folder_access_request on public.folder_access
  for insert to authenticated
  with check (viewer_id = (select auth.uid()) and status = 'pending');

create policy folder_access_approve on public.folder_access
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy folder_access_delete on public.folder_access
  for delete to authenticated
  using (owner_id = (select auth.uid()) or viewer_id = (select auth.uid()));

-- Danh sách các kho: ai cũng thấy tên kho, chỉ chủ kho và người được phép thấy số lượng.
create function public.list_folder_workspaces()
returns table (owner_id uuid, owner_name text, entry_count bigint, access text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'forbidden'; end if;

  return query
    with owners as (
      select distinct e.user_id from public.folder_entries e
      union
      select v_uid
    )
    select o.user_id,
           coalesce(nullif(p.full_name, ''), 'Thành viên')::text,
           case when o.user_id = v_uid or a.status = 'approved'
                then (select count(*) from public.folder_entries e where e.user_id = o.user_id)
           end,
           (case when o.user_id = v_uid then 'own'
                 when a.status = 'approved' then 'approved'
                 when a.status = 'pending' then 'pending'
                 else 'none' end)::text
      from owners o
      left join public.profiles p on p.id = o.user_id
      left join public.folder_access a on a.owner_id = o.user_id and a.viewer_id = v_uid
     order by (o.user_id = v_uid) desc, 2;
end
$$;

-- Chủ kho xem ai đang xin quyền hoặc đã được phép (kèm tên).
create function public.list_folder_access()
returns table (viewer_id uuid, viewer_name text, status text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;

  return query
    select a.viewer_id,
           coalesce(nullif(p.full_name, ''), 'Thành viên')::text,
           a.status,
           a.created_at
      from public.folder_access a
      left join public.profiles p on p.id = a.viewer_id
     where a.owner_id = auth.uid()
     order by (a.status = 'pending') desc, a.created_at desc;
end
$$;

revoke all on function public.list_folder_workspaces() from public, anon, authenticated;
revoke all on function public.list_folder_access() from public, anon, authenticated;
grant execute on function public.list_folder_workspaces() to authenticated;
grant execute on function public.list_folder_access() to authenticated;

commit;
