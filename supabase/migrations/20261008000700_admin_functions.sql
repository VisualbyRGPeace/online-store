-- 0700: read-only admin helpers (dashboard numbers, customer list incl. email from auth.users).
-- Both check is_admin() themselves; clients cannot read auth.users directly.

create function public.admin_dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'total_products', (select count(*) from public.products),
    'total_orders',   (select count(*) from public.orders),
    'new_orders',     (select count(*) from public.orders where status = 'pending'),
    'revenue',        (select coalesce(sum(total), 0) from public.orders where payment_status = 'paid'),
    'low_stock', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'stock', s.stock)
                                order by s.stock, s.name), '[]'::jsonb)
        from (select id, name, stock from public.products
               where status <> 'archived' and stock <= 5
               order by stock, name limit 20) s)
  );
end $$;

create function public.admin_list_customers()
returns table (id uuid, email text, full_name text, phone text, role public.user_role,
               created_at timestamptz, order_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.phone, p.role, p.created_at,
           (select count(*) from public.orders o where o.user_id = p.id)
      from public.profiles p
      join auth.users u on u.id = p.id
     order by p.created_at desc
     limit 200;
end $$;

revoke all on function public.admin_dashboard_stats() from public, anon, authenticated;
revoke all on function public.admin_list_customers()  from public, anon, authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.admin_list_customers()  to authenticated;
