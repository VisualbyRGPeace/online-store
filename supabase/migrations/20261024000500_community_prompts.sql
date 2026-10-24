begin;

create table public.community_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 5000),
  image_path text,
  created_at timestamptz not null default now(),
  constraint community_prompts_image_owner check (
    image_path is null or split_part(image_path, '/', 1) = user_id::text
  )
);

create index community_prompts_created_idx on public.community_prompts (created_at desc);

alter table public.community_prompts enable row level security;
revoke all on public.community_prompts from public, anon, authenticated;
grant select on public.community_prompts to anon, authenticated;
grant insert, delete on public.community_prompts to authenticated;

create policy community_prompts_public_read on public.community_prompts
  for select to anon, authenticated using (true);

create policy community_prompts_insert_own on public.community_prompts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy community_prompts_delete_admin on public.community_prompts
  for delete to authenticated
  using ((select public.is_admin()));

create function public.list_community_prompts(p_page integer default 1, p_page_size integer default 20)
returns table (
  id uuid,
  title text,
  content text,
  image_path text,
  created_at timestamptz,
  creator_name text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
begin
  return query
    select c.id,
           c.title,
           c.content,
           c.image_path,
           c.created_at,
           coalesce(nullif(p.full_name, ''), 'Thành viên')::text,
           count(*) over()
      from public.community_prompts c
      left join public.profiles p on p.id = c.user_id
     order by c.created_at desc
     offset ((v_page - 1) * v_page_size)
     limit v_page_size;
end
$$;

revoke all on function public.list_community_prompts(integer, integer) from public, anon, authenticated;
grant execute on function public.list_community_prompts(integer, integer) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prompt-illustrations', 'prompt-illustrations', true, 524288, array['image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy prompt_illustrations_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'prompt-illustrations');

create policy prompt_illustrations_own_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'prompt-illustrations'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) = 'webp'
  );

create policy prompt_illustrations_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'prompt-illustrations' and (select public.is_admin()));

commit;
