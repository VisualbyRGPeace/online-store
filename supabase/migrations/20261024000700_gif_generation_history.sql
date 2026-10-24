begin;

create table public.gif_generation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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
grant insert on public.gif_generation_history to authenticated;

create policy gif_history_insert_own on public.gif_generation_history
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create function public.admin_list_gif_generation_history(p_user_id uuid)
returns table (
  id uuid,
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
    select h.id, h.source_filename, h.gif_filename, h.duration_seconds,
           h.output_size_bytes, h.output_quality, h.caption, h.created_at
      from public.gif_generation_history h
     where h.user_id = p_user_id
     order by h.created_at desc, h.id desc;
end;
$$;

revoke all on function public.admin_list_gif_generation_history(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_gif_generation_history(uuid) to authenticated;

commit;
