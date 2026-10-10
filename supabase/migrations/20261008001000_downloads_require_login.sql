-- 1000: downloads now require a signed-in account, free resources included.
--   free resource (price = 0), visible  -> any SIGNED-IN user
--   paid resource (price > 0)           -> signed-in buyer with a PAID order
--   admins                              -> always
-- (CREATE OR REPLACE keeps the existing grants on the function.)
create or replace function public.get_download_url(p_product_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select d.drive_url
    from public.product_downloads d
    join public.products p on p.id = d.product_id
   where d.product_id = p_product_id
     and ( (select public.is_admin())
        or ( (select auth.uid()) is not null
             and p.status = 'active'
             and ( p.price = 0
                or exists (select 1
                             from public.order_items i
                             join public.orders o on o.id = i.order_id
                            where i.product_id = p.id
                              and o.user_id = (select auth.uid())
                              and o.payment_status = 'paid') ) ) );
$$;
