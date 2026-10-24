-- Record every real profile display-name change and expose it to admins only.
create table public.profile_name_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  previous_name text,
  new_name text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index profile_name_history_user_changed_idx
  on public.profile_name_history (user_id, changed_at desc, id desc);

alter table public.profile_name_history enable row level security;
revoke all on table public.profile_name_history from public, anon, authenticated;

create function public.capture_profile_name_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.full_name is distinct from old.full_name then
    insert into public.profile_name_history (
      user_id, previous_name, new_name, changed_by
    )
    values (
      new.id, old.full_name, new.full_name, (select auth.uid())
    );
  end if;
  return new;
end;
$$;

revoke all on function public.capture_profile_name_change() from public, anon, authenticated;

create trigger trg_profiles_name_history
  after update of full_name on public.profiles
  for each row execute function public.capture_profile_name_change();

create function public.admin_list_profile_name_history(p_user_id uuid)
returns table (
  id bigint,
  previous_name text,
  new_name text,
  changed_at timestamptz
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
    select h.id, h.previous_name, h.new_name, h.changed_at
    from public.profile_name_history h
    where h.user_id = p_user_id
    order by h.changed_at desc, h.id desc;
end;
$$;

revoke all on function public.admin_list_profile_name_history(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_profile_name_history(uuid) to authenticated;
