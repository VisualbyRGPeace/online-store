-- 1100: download history. Every successful download is recorded by get_download_url() itself,
-- so the log cannot be skipped or faked from the browser.
--   a user sees only their own history; admins see everyone's; nobody can write or delete from the client.

create table public.download_logs (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,            -- snapshot: the history survives if the resource is deleted/renamed
  created_at   timestamptz not null default now()
);
create index download_logs_user_idx on public.download_logs (user_id, created_at desc);
create index download_logs_created_idx on public.download_logs (created_at desc);

alter table public.download_logs enable row level security;
revoke all on public.download_logs from anon, authenticated;
grant select on public.download_logs to authenticated;

create policy download_logs_select on public.download_logs for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Same access rules as before (signed-in only; free = anyone signed in; paid = paid order; admin = always),
-- now also writing one log row whenever a link is handed out.
create or replace function public.get_download_url(p_product_id uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_url  text;
  v_name text;
begin
  select d.drive_url, p.name into v_url, v_name
    from public.product_downloads d
    join public.products p on p.id = d.product_id
   where d.product_id = p_product_id
     and ( (select public.is_admin())
        or ( v_uid is not null
             and p.status = 'active'
             and ( p.price = 0
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

-- Member list for the admin: now with the number of downloads per member.
drop function public.admin_list_customers();
create function public.admin_list_customers()
returns table (id uuid, email text, full_name text, phone text, role public.user_role,
               created_at timestamptz, order_count bigint, download_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.phone, p.role, p.created_at,
           (select count(*) from public.orders o where o.user_id = p.id),
           (select count(*) from public.download_logs l where l.user_id = p.id)
      from public.profiles p
      join auth.users u on u.id = p.id
     order by p.created_at desc
     limit 200;
end $$;

revoke all on function public.admin_list_customers() from public, anon, authenticated;
grant execute on function public.admin_list_customers() to authenticated;
