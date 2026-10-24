begin;

create table public.qr_generation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index qr_generation_history_created_idx
  on public.qr_generation_history (created_at desc);

alter table public.qr_generation_history enable row level security;

revoke all on public.qr_generation_history from anon, authenticated;
grant insert, delete on public.qr_generation_history to authenticated;

create policy qr_history_insert_own on public.qr_generation_history
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy qr_history_delete_admin on public.qr_generation_history
  for delete to authenticated
  using ((select public.is_admin()));

create function public.admin_list_qr_history(p_page integer default 1, p_page_size integer default 50)
returns table (
  id uuid,
  content text,
  created_at timestamptz,
  member_name text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  return query
    select h.id,
           h.content,
           h.created_at,
           coalesce(nullif(p.full_name, ''), 'Thành viên')::text,
           count(*) over()
      from public.qr_generation_history h
      left join public.profiles p on p.id = h.user_id
     order by h.created_at desc
     offset ((v_page - 1) * v_page_size)
     limit v_page_size;
end
$$;

create function public.admin_delete_qr_history(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.qr_generation_history where id = p_id;
  if not found then raise exception 'not_found'; end if;
end
$$;

revoke all on function public.admin_list_qr_history(integer, integer) from public, anon, authenticated;
revoke all on function public.admin_delete_qr_history(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_qr_history(integer, integer) to authenticated;
grant execute on function public.admin_delete_qr_history(uuid) to authenticated;

commit;
