-- 1200: honor-system donations ("Cúng dường") + member bans.
--
-- Donations: a signed-in member presses "Xác nhận đã cúng dường" and gets access to that resource.
-- It relies on the member's honesty by design; the admin can see every confirmation and revoke it.
--
-- Bans: banned_until on the profile. "kick" = blocked for 24 hours, "ban" = blocked permanently
-- (year 9999), "unban" = cleared. A blocked member cannot download or confirm donations (enforced here
-- in the database). Passwords are NOT stored or readable anywhere: Supabase keeps only salted hashes.

alter table public.profiles add column banned_until timestamptz, add column ban_reason text;
-- Members can still update only full_name and phone (column grants unchanged), so they cannot touch these.

create function public.is_banned(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select banned_until > now() from public.profiles where id = p_uid), false);
$$;
revoke all on function public.is_banned(uuid) from public, anon, authenticated;  -- internal helper

create table public.donation_claims (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,
  amount       integer not null check (amount >= 0),
  created_at   timestamptz not null default now(),
  unique (user_id, product_id)
);
create index donation_claims_user_idx on public.donation_claims (user_id);
create index donation_claims_created_idx on public.donation_claims (created_at desc);

alter table public.donation_claims enable row level security;
revoke all on public.donation_claims from anon, authenticated;
grant select on public.donation_claims to authenticated;
create policy donation_claims_select on public.donation_claims for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- The member confirms a donation (only for visible, paid resources).
create function public.claim_donation(p_product_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_name  text;
  v_price integer;
begin
  if v_uid is null then raise exception 'login_required'; end if;
  if public.is_banned(v_uid) then raise exception 'account_banned'; end if;
  select name, price into v_name, v_price
    from public.products where id = p_product_id and status = 'active' and price > 0;
  if v_name is null then raise exception 'not_found'; end if;
  insert into public.donation_claims (user_id, product_id, product_name, amount)
  values (v_uid, p_product_id, v_name, v_price)
  on conflict (user_id, product_id) do nothing;
end $$;
revoke all on function public.claim_donation(uuid) from public, anon, authenticated;
grant execute on function public.claim_donation(uuid) to authenticated;

-- Download link: signed-in, not banned; free, or donation confirmed, or paid order; admins always.
create or replace function public.get_download_url(p_product_id uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_admin boolean := (select public.is_admin());
  v_url   text;
  v_name  text;
begin
  select d.drive_url, p.name into v_url, v_name
    from public.product_downloads d
    join public.products p on p.id = d.product_id
   where d.product_id = p_product_id
     and ( v_admin
        or ( v_uid is not null
             and not public.is_banned(v_uid)
             and p.status = 'active'
             and ( p.price = 0
                or exists (select 1 from public.donation_claims c
                            where c.user_id = v_uid and c.product_id = p.id)
                or exists (select 1
                             from public.order_items i
                             join public.orders o on o.id = i.order_id
                            where i.product_id = p.id
                              and o.user_id = v_uid
                              and o.payment_status = 'paid') ) ) );

  if v_url is null then return null; end if;

  if v_uid is not null then
    insert into public.download_logs (user_id, product_id, product_name) values (v_uid, p_product_id, v_name);
  end if;
  return v_url;
end $$;

-- Admin: kick (24 h), ban (permanent), unban.
create function public.admin_set_ban(p_user_id uuid, p_mode text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_until timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if exists (select 1 from public.profiles where id = p_user_id and role = 'admin') then
    raise exception 'cannot_ban_admin';
  end if;
  v_until := case p_mode
    when 'kick' then now() + interval '24 hours'
    when 'ban'  then timestamptz '9999-12-31 00:00:00+00'
    when 'unban' then null
    else null end;
  if p_mode not in ('kick', 'ban', 'unban') then raise exception 'invalid_mode'; end if;
  update public.profiles
     set banned_until = v_until,
         ban_reason = case when v_until is null then null else nullif(left(btrim(coalesce(p_reason, '')), 300), '') end
   where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
end $$;

-- Admin: every donation confirmation (with the member's email) and a way to revoke one.
create function public.admin_list_donations()
returns table (id bigint, user_id uuid, email text, full_name text, product_name text, amount integer, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select c.id, c.user_id, u.email::text, p.full_name, c.product_name, c.amount, c.created_at
      from public.donation_claims c
      join auth.users u on u.id = c.user_id
      left join public.profiles p on p.id = c.user_id
     order by c.created_at desc
     limit 500;
end $$;

create function public.admin_revoke_donation(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.donation_claims where id = p_id;
end $$;

-- Member list: now with ban status.
drop function public.admin_list_customers();
create function public.admin_list_customers()
returns table (id uuid, email text, full_name text, phone text, role public.user_role,
               created_at timestamptz, order_count bigint, download_count bigint,
               banned_until timestamptz, ban_reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.phone, p.role, p.created_at,
           (select count(*) from public.orders o where o.user_id = p.id),
           (select count(*) from public.download_logs l where l.user_id = p.id),
           p.banned_until, p.ban_reason
      from public.profiles p
      join auth.users u on u.id = p.id
     order by p.created_at desc
     limit 200;
end $$;

revoke all on function public.admin_set_ban(uuid, text, text)   from public, anon, authenticated;
revoke all on function public.admin_list_donations()            from public, anon, authenticated;
revoke all on function public.admin_revoke_donation(bigint)     from public, anon, authenticated;
revoke all on function public.admin_list_customers()            from public, anon, authenticated;
grant execute on function public.admin_set_ban(uuid, text, text) to authenticated;
grant execute on function public.admin_list_donations()          to authenticated;
grant execute on function public.admin_revoke_donation(bigint)   to authenticated;
grant execute on function public.admin_list_customers()         to authenticated;
