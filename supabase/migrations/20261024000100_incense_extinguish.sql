-- Put out / relight incense.
--   * Any signed-in account can put out a stick that someone else lit.
--   * Only the person who lit a stick can relight it. A relit stick keeps its original expires_at.
-- Both rules live in the functions below; clients cannot update these columns directly
-- (incense_offerings has no UPDATE grant for anon/authenticated).

alter table public.incense_offerings
  add column if not exists extinguished_at timestamptz,
  add column if not exists extinguished_by_name text
    check (extinguished_by_name is null or char_length(extinguished_by_name) between 1 and 60);

-- Private audit trail (admins only) so abuse can be traced without exposing user ids publicly.
create table if not exists public.incense_extinguish_log (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.incense_offerings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('extinguish', 'relight')),
  created_at timestamptz not null default now()
);

create index if not exists incense_extinguish_log_user_idx
  on public.incense_extinguish_log (user_id, created_at desc);

alter table public.incense_extinguish_log enable row level security;
revoke all on public.incense_extinguish_log from anon, authenticated;
grant select on public.incense_extinguish_log to authenticated;

drop policy if exists incense_extinguish_log_admin_read on public.incense_extinguish_log;
create policy incense_extinguish_log_admin_read on public.incense_extinguish_log
  for select to authenticated using ((select public.is_admin()));

create or replace function public.extinguish_incense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if public.is_banned(v_user_id) then raise exception 'account_banned'; end if;

  -- At most 20 sticks put out per 10 minutes per account.
  if (select count(*) from public.incense_extinguish_log
       where user_id = v_user_id and action = 'extinguish'
         and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'rate_limited';
  end if;

  select coalesce(
    nullif(btrim(p.full_name), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), '')
  )
    into v_name
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id = v_user_id;
  v_name := coalesce(nullif(left(btrim(coalesce(v_name, '')), 60), ''), 'Một người');

  update public.incense_offerings
     set extinguished_at = now(),
         extinguished_by_name = v_name
   where id = p_id
     and donor_id is distinct from v_user_id   -- never your own stick
     and extinguished_at is null               -- still burning
     and expires_at > now();                   -- not yet burned out
  if not found then raise exception 'cannot_extinguish'; end if;

  insert into public.incense_extinguish_log (offering_id, user_id, action)
  values (p_id, v_user_id, 'extinguish');
end
$$;

create or replace function public.relight_incense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if public.is_banned(v_user_id) then raise exception 'account_banned'; end if;

  update public.incense_offerings
     set extinguished_at = null,
         extinguished_by_name = null
   where id = p_id
     and donor_id = v_user_id                  -- only whoever lit it
     and extinguished_at is not null
     and expires_at > now();
  if not found then raise exception 'cannot_relight'; end if;

  insert into public.incense_extinguish_log (offering_id, user_id, action)
  values (p_id, v_user_id, 'relight');
end
$$;

revoke all on function public.extinguish_incense(uuid) from public, anon, authenticated;
revoke all on function public.relight_incense(uuid) from public, anon, authenticated;
grant execute on function public.extinguish_incense(uuid) to authenticated;
grant execute on function public.relight_incense(uuid) to authenticated;

-- Let other visitors see a stick go out / come back without waiting for the next refresh.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'incense_offerings'
     ) then
    alter publication supabase_realtime add table public.incense_offerings;
  end if;
end
$$;
