-- Restrict incense offerings for one account and add unlimited blessing clicks.
-- Target account: hdt10102002@gmail.com
create table if not exists public.incense_blessings (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.incense_offerings(id) on delete cascade,
  blessed_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists incense_blessings_offering_idx
  on public.incense_blessings (offering_id, created_at desc);

alter table public.incense_blessings enable row level security;
revoke all on public.incense_blessings from anon, authenticated;
grant select on public.incense_blessings to anon, authenticated;

create policy incense_blessings_read_active on public.incense_blessings
  for select to anon, authenticated
  using (exists (
    select 1 from public.incense_offerings o
    where o.id = offering_id and o.expires_at > now()
  ));

create or replace function public.incense_permissions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_admin boolean := coalesce((select public.is_admin()), false);
begin
  if v_user_id is not null then
    select lower(email) into v_email from auth.users where id = v_user_id;
  end if;
  return jsonb_build_object(
    'can_donate', v_user_id is not null and v_email <> 'hdt10102002@gmail.com',
    'can_bless', v_user_id is not null and (v_email = 'hdt10102002@gmail.com' or v_admin)
  );
end
$$;

revoke all on function public.incense_permissions() from public;
grant execute on function public.incense_permissions() to anon, authenticated;

create or replace function public.bless_incense(p_offering_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_admin boolean := coalesce((select public.is_admin()), false);
  v_blessing_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select lower(email) into v_email from auth.users where id = v_user_id;
  if not (v_admin or v_email = 'hdt10102002@gmail.com') then
    raise exception 'blessing_not_authorized';
  end if;
  if not exists (
    select 1 from public.incense_offerings
    where id = p_offering_id and expires_at > now()
  ) then raise exception 'incense_not_active'; end if;

  insert into public.incense_blessings (offering_id, blessed_by)
  values (p_offering_id, v_user_id)
  returning id into v_blessing_id;
  return v_blessing_id;
end
$$;

revoke all on function public.bless_incense(uuid) from public, anon, authenticated;
grant execute on function public.bless_incense(uuid) to authenticated;

-- Enforce the no-donation rule in the database, including direct RPC or API calls.
create or replace function public.guard_incense_offering_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(
    (select accepting_incense from public.shop_settings where id = true),
    false
  ) then
    raise exception 'incense_closed';
  end if;

  if new.donor_id is not null and exists (
    select 1 from auth.users
    where id = new.donor_id and lower(email) = 'hdt10102002@gmail.com'
  ) then
    raise exception 'incense_donation_not_allowed';
  end if;

  return new;
end
$$;

revoke all on function public.guard_incense_offering_insert() from public, anon, authenticated;
