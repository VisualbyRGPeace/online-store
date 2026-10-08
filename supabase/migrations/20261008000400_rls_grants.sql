-- 0400: grants (least privilege) + Row Level Security on every table.

revoke all on all tables in schema public from anon, authenticated;

grant select on public.categories, public.products, public.product_images, public.shop_settings to anon, authenticated;
grant insert, update, delete on public.categories, public.products, public.product_images to authenticated; -- RLS: admin only
grant update on public.shop_settings to authenticated;                                                    -- RLS: admin only
grant select on public.profiles, public.orders, public.order_items, public.payments to authenticated;
grant select, insert, update, delete on public.addresses to authenticated;
-- Users may edit ONLY these profile columns. 'role' is not grantable -> nobody can self-promote.
grant update (full_name, phone) on public.profiles to authenticated;

alter table public.profiles       enable row level security;
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.product_images enable row level security;
alter table public.addresses      enable row level security;
alter table public.shop_settings  enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.payments       enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- categories
create policy categories_select on public.categories for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy categories_insert on public.categories for insert to authenticated with check ((select public.is_admin()));
create policy categories_update on public.categories for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy categories_delete on public.categories for delete to authenticated using ((select public.is_admin()));

-- products: public sees only active; admin sees and manages all
create policy products_select on public.products for select to anon, authenticated
  using (status = 'active' or (select public.is_admin()));
create policy products_insert on public.products for insert to authenticated with check ((select public.is_admin()));
create policy products_update on public.products for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy products_delete on public.products for delete to authenticated using ((select public.is_admin()));

-- product_images: visible when its product is visible (the subquery is filtered by products RLS)
create policy product_images_select on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy product_images_insert on public.product_images for insert to authenticated with check ((select public.is_admin()));
create policy product_images_update on public.product_images for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy product_images_delete on public.product_images for delete to authenticated using ((select public.is_admin()));

-- addresses: owner only (+ admin can read)
create policy addresses_select on public.addresses for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy addresses_insert on public.addresses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy addresses_update on public.addresses for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy addresses_delete on public.addresses for delete to authenticated
  using (user_id = (select auth.uid()));

-- shop_settings
create policy shop_settings_select on public.shop_settings for select to anon, authenticated using (true);
create policy shop_settings_update on public.shop_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- orders / order_items / payments: read-only for clients. All writes go through
-- place_order(), admin_* functions, or the service role (payment webhooks).
create policy orders_select on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));  -- orders RLS applies
create policy payments_select on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
