begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gif-history', 'gif-history', false, 1000000, array['image/gif'])
on conflict (id) do update
set public = false, file_size_limit = 1000000, allowed_mime_types = array['image/gif'];

create table public.gif_generation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  source_filename text not null check (char_length(source_filename) between 1 and 255),
  gif_filename text not null check (char_length(gif_filename) between 1 and 255),
  duration_seconds numeric(6,2) not null check (duration_seconds > 0 and duration_seconds <= 6),
  output_size_bytes integer not null check (output_size_bytes between 1 and 1000000),
  output_quality text not null check (char_length(output_quality) <= 100),
  caption text not null default '' check (char_length(caption) <= 80),
  created_at timestamptz not null default now()
);

create index gif_generation_history_user_created_idx
  on public.gif_generation_history (user_id, created_at desc);

alter table public.gif_generation_history enable row level security;
revoke all on public.gif_generation_history from public, anon, authenticated;
grant select, insert, delete on public.gif_generation_history to authenticated;

create policy gif_history_select_own on public.gif_generation_history
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy gif_history_insert_own on public.gif_generation_history
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy gif_history_delete_own on public.gif_generation_history
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy gif_history_upload_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'gif-history'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy gif_history_read_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'gif-history' and (select public.is_admin()));

create policy gif_history_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'gif-history'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create function public.admin_list_gif_generation_history(p_user_id uuid)
returns table (
  id uuid,
  storage_path text,
  source_filename text,
  gif_filename text,
  duration_seconds numeric,
  output_size_bytes integer,
  output_quality text,
  caption text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return query
    select h.id, h.storage_path, h.source_filename, h.gif_filename, h.duration_seconds,
           h.output_size_bytes, h.output_quality, h.caption, h.created_at
      from public.gif_generation_history h
     where h.user_id = p_user_id
     order by h.created_at desc, h.id desc;
end;
$$;

revoke all on function public.admin_list_gif_generation_history(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_gif_generation_history(uuid) to authenticated;

commit;
