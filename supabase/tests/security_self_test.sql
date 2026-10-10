-- =====================================================================================
-- SECURITY SELF-TEST: grants, RLS, order functions, immutability triggers, storage policies.
--
-- HOW TO RUN: Supabase > SQL Editor > New query > paste this whole file > Run.
-- It creates temporary test users/products inside ONE transaction and ends with an
-- INTENTIONAL error, which rolls everything back. Your real data is not touched or changed.
-- Read the result in the red message at the bottom:
--   "ALL n TESTS PASSED"  -> good.
--   "x passed, y failed"  -> the failing tests are listed, one per line (send them to me).
-- =====================================================================================

drop table if exists pg_temp.t_results;
create temp table t_results (n int generated always as identity, test text, passed boolean, detail text);

-- Runs one statement as a given database role/user and reports "ok:<rows>" or "error:<sqlstate>".
create or replace function pg_temp.try_as(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare v_count bigint;
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    get diagnostics v_count = row_count;
    reset role;
    return 'ok:' || v_count;
  exception when others then
    reset role;
    return 'error:' || sqlstate;
  end;
end $$;

create or replace function pg_temp.chk(p_test text, p_result text, p_expect text) returns void
language plpgsql as $$
declare v_ok boolean;
begin
  if p_expect = 'ok' then v_ok := p_result like 'ok:%';
  elsif p_expect = 'error' then v_ok := p_result like 'error:%';
  elsif p_expect = 'blocked' then v_ok := p_result like 'error:%' or p_result = 'ok:0';
  elsif p_expect = 'rows>0' then
    v_ok := case when p_result like 'ok:%' then substring(p_result from 4)::bigint > 0 else false end;
  else v_ok := p_result = 'ok:' || substring(p_expect from 6); -- 'rows=N'
  end if;
  insert into t_results (test, passed, detail) values (p_test, v_ok, 'expected ' || p_expect || ', got ' || p_result);
end $$;

create or replace function pg_temp.t(p_test text, p_role text, p_uid uuid, p_sql text, p_expect text) returns void
language plpgsql as $$
begin
  perform pg_temp.chk(p_test, pg_temp.try_as(p_role, p_uid, p_sql), p_expect);
end $$;

create or replace function pg_temp.assert_that(p_test text, p_ok boolean, p_detail text default '') returns void
language plpgsql as $$
begin
  insert into t_results (test, passed, detail) values (p_test, coalesce(p_ok, false), p_detail);
end $$;

do $test$
declare
  a uuid := gen_random_uuid();   -- customer A
  b uuid := gen_random_uuid();   -- customer B
  c uuid := gen_random_uuid();   -- admin
  p_active uuid; p_draft uuid; p_bulk uuid; p_free uuid; p_free_draft uuid;
  g_id uuid; g_token text; a_order uuid;
  items_active text; items_draft text; items_bulk text; items_zero text; items_many text;
  tpl text := $q$select * from public.place_order(%L::jsonb, 'Test', %L, null, 'HCM', 'Q1', 'P1', 'Street', 'cod', null)$q$;
  v_int int; v_before int; v_pass int; v_fail int; v_report text := ''; rec record; i int;
begin
  -- ---------- fixtures (rolled back at the end) ----------
  insert into auth.users (id, email) values (a, 'zz-a@test.local'), (b, 'zz-b@test.local'), (c, 'zz-c@test.local');
  update public.profiles set role = 'admin' where id = c;
  insert into public.products (name, slug, price, stock, status) values ('ZZ active', 'zz-test-active', 100000, 3, 'active') returning id into p_active;
  insert into public.products (name, slug, price, stock, status) values ('ZZ draft', 'zz-test-draft', 5, 5, 'draft') returning id into p_draft;
  insert into public.products (name, slug, price, stock, status) values ('ZZ bulk', 'zz-test-bulk', 1000, 100, 'active') returning id into p_bulk;
  items_active := json_build_array(json_build_object('product_id', p_active, 'quantity', 1))::text;
  items_draft  := json_build_array(json_build_object('product_id', p_draft,  'quantity', 1))::text;
  items_bulk   := json_build_array(json_build_object('product_id', p_bulk,   'quantity', 1))::text;
  items_zero   := json_build_array(json_build_object('product_id', p_bulk,   'quantity', 0))::text;
  items_many   := json_build_array(json_build_object('product_id', p_bulk,   'quantity', 100))::text;

  -- ---------- A. anonymous visitor ----------
  perform pg_temp.t('anon can read active products', 'anon', null, format('select 1 from public.products where id = %L', p_active), 'rows=1');
  perform pg_temp.t('anon cannot see draft products', 'anon', null, format('select 1 from public.products where id = %L', p_draft), 'rows=0');
  perform pg_temp.t('anon can read shop settings', 'anon', null, 'select 1 from public.shop_settings', 'rows=1');
  perform pg_temp.t('anon cannot read profiles', 'anon', null, 'select 1 from public.profiles', 'error');
  perform pg_temp.t('anon cannot read orders', 'anon', null, 'select 1 from public.orders', 'error');
  perform pg_temp.t('anon cannot read order_items', 'anon', null, 'select 1 from public.order_items', 'error');
  perform pg_temp.t('anon cannot read payments', 'anon', null, 'select 1 from public.payments', 'error');
  perform pg_temp.t('anon cannot read addresses', 'anon', null, 'select 1 from public.addresses', 'error');
  perform pg_temp.t('anon cannot read auth.users', 'anon', null, 'select 1 from auth.users', 'error');
  perform pg_temp.t('anon cannot insert products', 'anon', null, $s$insert into public.products (name, slug, price, stock, status) values ('h', 'zz-h', 1, 1, 'active')$s$, 'error');
  perform pg_temp.t('anon cannot change product price', 'anon', null, format('update public.products set price = 1 where id = %L', p_active), 'error');
  perform pg_temp.t('anon cannot delete products', 'anon', null, format('delete from public.products where id = %L', p_active), 'error');
  perform pg_temp.t('anon cannot call admin_dashboard_stats', 'anon', null, 'select public.admin_dashboard_stats()', 'error');
  perform pg_temp.t('anon cannot call admin_set_order_status', 'anon', null, format($s$select public.admin_set_order_status(%L::uuid, 'confirmed')$s$, gen_random_uuid()), 'error');

  -- ---------- B. guest checkout ----------
  begin
    select out_order_id, out_lookup_token into g_id, g_token
      from public.place_order(items_active::jsonb, 'Guest Test', '0900000001', null, 'HCM', 'Q1', 'P1', 'Street', 'cod', null);
    perform pg_temp.assert_that('guest checkout creates an order', g_id is not null);
  exception when others then
    perform pg_temp.assert_that('guest checkout creates an order', false, 'error ' || sqlstate || ' ' || sqlerrm);
  end;
  select subtotal into v_int from public.orders where id = g_id;
  perform pg_temp.assert_that('order price comes from the database (100000)', v_int = 100000, 'subtotal=' || coalesce(v_int::text, 'null'));
  select count(*) into v_int from public.orders where id = g_id and total = subtotal + shipping_fee;
  perform pg_temp.assert_that('order total = subtotal + shipping', v_int = 1);
  select stock into v_int from public.products where id = p_active;
  perform pg_temp.assert_that('stock is reduced by the order (3 -> 2)', v_int = 2, 'stock=' || v_int);
  select count(*) into v_int from public.order_items where order_id = g_id and product_name_snapshot = 'ZZ active' and price_snapshot = 100000;
  perform pg_temp.assert_that('order item stores name and price snapshot', v_int = 1);
  perform pg_temp.t('guest can open own order with the right token', 'anon', null, format('select 1 where public.get_guest_order(%L, %L) is not null', g_id, g_token), 'rows=1');
  perform pg_temp.t('guest order is hidden with a wrong token', 'anon', null, format($s$select 1 where public.get_guest_order(%L, 'wrong-token') is not null$s$, g_id), 'rows=0');
  perform pg_temp.t('anon can call place_order', 'anon', null, format(tpl, items_active, '0900000002'), 'ok');
  perform pg_temp.t('signed-in customer A can place an order', 'authenticated', a, format(tpl, items_active, '0900000003'), 'ok');
  perform pg_temp.t('signed-in customer B can place an order', 'authenticated', b, format(tpl, items_bulk, '0900000004'), 'ok');
  perform pg_temp.t('cannot oversell (stock is now 0)', 'anon', null, format(tpl, items_active, '0900000005'), 'error');
  perform pg_temp.t('cannot order a draft product', 'anon', null, format(tpl, items_draft, '0900000006'), 'error');
  perform pg_temp.t('quantity 0 is rejected', 'anon', null, format(tpl, items_zero, '0900000007'), 'error');
  perform pg_temp.t('quantity 100 is rejected', 'anon', null, format(tpl, items_many, '0900000008'), 'error');
  perform pg_temp.t('invalid phone is rejected', 'anon', null, format(tpl, items_bulk, '123'), 'error');
  perform pg_temp.t('empty cart is rejected', 'anon', null, format(tpl, '[]', '0900000009'), 'error');
  select id into a_order from public.orders where user_id = a;

  -- ---------- C. customers ----------
  perform pg_temp.t('A reads own profile', 'authenticated', a, format('select 1 from public.profiles where id = %L', a), 'rows=1');
  perform pg_temp.t('A cannot read B profile', 'authenticated', a, format('select 1 from public.profiles where id = %L', b), 'rows=0');
  perform pg_temp.t('A cannot make self admin', 'authenticated', a, format($s$update public.profiles set role = 'admin' where id = %L$s$, a), 'error');
  perform pg_temp.t('A can edit own name', 'authenticated', a, format($s$update public.profiles set full_name = 'A' where id = %L$s$, a), 'rows=1');
  perform pg_temp.t('A cannot edit B profile', 'authenticated', a, format($s$update public.profiles set full_name = 'hack' where id = %L$s$, b), 'blocked');
  perform pg_temp.t('A cannot insert products', 'authenticated', a, $s$insert into public.products (name, slug, price, stock, status) values ('h', 'zz-h2', 1, 1, 'active')$s$, 'error');
  perform pg_temp.t('A cannot change product price', 'authenticated', a, format('update public.products set price = 1 where id = %L', p_active), 'blocked');
  perform pg_temp.t('A cannot delete products', 'authenticated', a, format('delete from public.products where id = %L', p_active), 'blocked');
  perform pg_temp.t('A cannot change shop settings', 'authenticated', a, 'update public.shop_settings set shipping_fee = 0', 'blocked');
  perform pg_temp.t('A sees only own orders (1)', 'authenticated', a, 'select 1 from public.orders', 'rows=1');
  perform pg_temp.t('B sees only own orders (1)', 'authenticated', b, 'select 1 from public.orders', 'rows=1');
  perform pg_temp.t('A cannot open the guest order', 'authenticated', a, format('select 1 from public.orders where id = %L', g_id), 'rows=0');
  perform pg_temp.t('A sees own order items only', 'authenticated', a, format('select 1 from public.order_items where order_id = %L', g_id), 'rows=0');
  perform pg_temp.t('A sees only own payments (1)', 'authenticated', a, 'select 1 from public.payments', 'rows=1');
  perform pg_temp.t('A cannot create an order directly', 'authenticated', a,
    $s$insert into public.orders (customer_name, customer_phone, shipping_province, shipping_district, shipping_ward, shipping_street, subtotal, shipping_fee, total, lookup_token_hash) values ('x', '0900000090', 'a', 'b', 'c', 'd', 0, 0, 0, '\x00')$s$, 'error');
  perform pg_temp.t('A cannot mark an order paid', 'authenticated', a, $s$update public.orders set payment_status = 'paid'$s$, 'error');
  perform pg_temp.t('A cannot change an order total', 'authenticated', a, 'update public.orders set total = 1', 'error');
  perform pg_temp.t('A cannot change payments', 'authenticated', a, $s$update public.payments set status = 'succeeded'$s$, 'error');
  perform pg_temp.t('A cannot insert payments', 'authenticated', a, format($s$insert into public.payments (order_id, provider, amount, status) values (%L, 'cod', 0, 'succeeded')$s$, a_order), 'error');
  perform pg_temp.t('A cannot call admin_dashboard_stats', 'authenticated', a, 'select public.admin_dashboard_stats()', 'error');
  perform pg_temp.t('A cannot call admin_list_customers', 'authenticated', a, 'select * from public.admin_list_customers()', 'error');
  perform pg_temp.t('A cannot change order status', 'authenticated', a, format($s$select public.admin_set_order_status(%L, 'confirmed')$s$, a_order), 'error');
  perform pg_temp.t('A cannot mark COD paid', 'authenticated', a, format('select public.admin_mark_cod_paid(%L)', a_order), 'error');
  perform pg_temp.t('A cannot read auth.users', 'authenticated', a, 'select 1 from auth.users', 'error');
  perform pg_temp.t('A can add own address', 'authenticated', a, format($s$insert into public.addresses (user_id, recipient_name, phone, province, district, ward, street) values (%L, 'x', '0900000010', 'a', 'b', 'c', 'd')$s$, a), 'rows=1');
  perform pg_temp.t('B cannot read A addresses', 'authenticated', b, 'select 1 from public.addresses', 'rows=0');
  perform pg_temp.t('B cannot add an address for A', 'authenticated', b, format($s$insert into public.addresses (user_id, recipient_name, phone, province, district, ward, street) values (%L, 'x', '0900000011', 'a', 'b', 'c', 'd')$s$, a), 'error');

  -- ---------- D. admin ----------
  perform pg_temp.t('admin sees draft products', 'authenticated', c, format('select 1 from public.products where id = %L', p_draft), 'rows=1');
  perform pg_temp.t('admin sees all orders', 'authenticated', c, 'select 1 from public.orders', 'rows>0');
  perform pg_temp.t('admin sees other profiles', 'authenticated', c, format('select 1 from public.profiles where id = %L', a), 'rows=1');
  perform pg_temp.t('admin dashboard works', 'authenticated', c, 'select public.admin_dashboard_stats()', 'rows=1');
  perform pg_temp.t('admin customer list works', 'authenticated', c, 'select * from public.admin_list_customers()', 'rows>0');
  perform pg_temp.t('admin can edit product price', 'authenticated', c, format('update public.products set price = 120000 where id = %L', p_active), 'rows=1');
  perform pg_temp.t('admin can edit shop settings', 'authenticated', c, 'update public.shop_settings set shipping_fee = shipping_fee', 'rows=1');
  perform pg_temp.t('admin cannot rewrite an order total', 'authenticated', c, format('update public.orders set total = 1 where id = %L', g_id), 'error');
  perform pg_temp.t('admin cannot edit order items', 'authenticated', c, 'update public.order_items set quantity = 99', 'error');
  perform pg_temp.t('admin cannot delete orders', 'authenticated', c, 'delete from public.orders', 'error');
  perform pg_temp.t('admin cannot change roles from the client', 'authenticated', c, format($s$update public.profiles set role = 'admin' where id = %L$s$, a), 'error');
  perform pg_temp.t('order: pending -> confirmed', 'authenticated', c, format($s$select public.admin_set_order_status(%L, 'confirmed')$s$, g_id), 'ok');
  perform pg_temp.t('order: confirmed -> pending is refused', 'authenticated', c, format($s$select public.admin_set_order_status(%L, 'pending')$s$, g_id), 'error');
  perform pg_temp.t('COD cannot be marked paid before shipping', 'authenticated', c, format('select public.admin_mark_cod_paid(%L)', g_id), 'error');
  perform pg_temp.t('order: confirmed -> shipping', 'authenticated', c, format($s$select public.admin_set_order_status(%L, 'shipping')$s$, g_id), 'ok');
  perform pg_temp.t('COD can be marked paid while shipping', 'authenticated', c, format('select public.admin_mark_cod_paid(%L)', g_id), 'ok');
  perform pg_temp.t('order: shipping -> cancelled is refused', 'authenticated', c, format($s$select public.admin_set_order_status(%L, 'cancelled')$s$, g_id), 'error');
  perform pg_temp.t('order: shipping -> completed', 'authenticated', c, format($s$select public.admin_set_order_status(%L, 'completed')$s$, g_id), 'ok');
  perform pg_temp.t('completed order cannot change again', 'authenticated', c, format($s$select public.admin_set_order_status(%L, 'cancelled')$s$, g_id), 'error');
  select stock into v_before from public.products where id = p_active;
  perform pg_temp.t('admin can cancel a pending order', 'authenticated', c, format($s$select public.admin_set_order_status(%L, 'cancelled')$s$, a_order), 'ok');
  select stock into v_int from public.products where id = p_active;
  perform pg_temp.assert_that('cancelling gives the stock back', v_int = v_before + 1, 'before=' || v_before || ' after=' || v_int);

  -- ---------- E. history is immutable (even for the database owner) ----------
  perform pg_temp.t('order total cannot be changed by anyone', 'postgres', null, format('update public.orders set total = 1, subtotal = 1 where id = %L', g_id), 'error');
  perform pg_temp.t('order customer name cannot be changed', 'postgres', null, format($s$update public.orders set customer_name = 'x' where id = %L$s$, g_id), 'error');
  perform pg_temp.t('order item price cannot be changed', 'postgres', null, format('update public.order_items set price_snapshot = 1, subtotal = quantity where order_id = %L', g_id), 'error');

  -- ---------- F. rate limit: 5 pending orders per phone per hour ----------
  for i in 1..5 loop
    perform 1 from public.place_order(items_bulk::jsonb, 'Rate', '0900000077', null, 'HCM', 'Q1', 'P1', 'S', 'cod', null);
  end loop;
  perform pg_temp.t('6th pending order from the same phone is refused', 'postgres', null, format(tpl, items_bulk, '0900000077'), 'error');

  -- ---------- G. storage policies ----------
  perform pg_temp.t('anon cannot upload product images', 'anon', null, $s$insert into storage.objects (bucket_id, name) values ('product-images', 'products/zz/t1.webp')$s$, 'error');
  perform pg_temp.t('customer cannot upload product images', 'authenticated', a, $s$insert into storage.objects (bucket_id, name) values ('product-images', 'products/zz/t2.webp')$s$, 'error');
  perform pg_temp.t('admin can upload product images', 'authenticated', c, $s$insert into storage.objects (bucket_id, name) values ('product-images', 'products/zz/t3.webp')$s$, 'rows=1');
  perform pg_temp.t('admin cannot upload outside products/', 'authenticated', c, $s$insert into storage.objects (bucket_id, name) values ('product-images', 'other/t4.webp')$s$, 'error');
  perform pg_temp.t('customer can upload own avatar', 'authenticated', a, format($s$insert into storage.objects (bucket_id, name) values ('avatars', '%s/avatar.webp')$s$, a), 'rows=1');
  perform pg_temp.t('customer cannot upload into another avatar folder', 'authenticated', a, format($s$insert into storage.objects (bucket_id, name) values ('avatars', '%s/avatar.webp')$s$, b), 'error');

  -- ---------- H. protected download links (Google Drive) ----------
  insert into public.products (name, slug, price, stock, status) values ('ZZ free', 'zz-test-free', 0, 0, 'active') returning id into p_free;
  insert into public.products (name, slug, price, stock, status) values ('ZZ free hidden', 'zz-test-free-hidden', 0, 0, 'draft') returning id into p_free_draft;
  insert into public.product_downloads (product_id, drive_url) values
    (p_free, 'https://drive.google.com/file/d/zzfree/view'),
    (p_free_draft, 'https://drive.google.com/file/d/zzhidden/view'),
    (p_active, 'https://drive.google.com/file/d/zzpaid/view'),
    (p_bulk, 'https://drive.google.com/file/d/zzbulk/view');
  update public.orders set payment_status = 'paid' where user_id = b;   -- B has now "bought" p_bulk

  perform pg_temp.t('anon cannot read the download links table', 'anon', null, 'select 1 from public.product_downloads', 'error');
  perform pg_temp.t('customer cannot read the download links table', 'authenticated', a, 'select 1 from public.product_downloads', 'error');
  perform pg_temp.t('customer cannot change a download link', 'authenticated', a, format($s$update public.product_downloads set drive_url = 'https://drive.google.com/x' where product_id = %L$s$, p_free), 'error');
  perform pg_temp.t('admin can read the download links table', 'authenticated', c, 'select 1 from public.product_downloads', 'rows>0');
  perform pg_temp.t('free resource: anon gets the link', 'anon', null, format('select 1 where public.get_download_url(%L) is not null', p_free), 'rows=1');
  perform pg_temp.t('free but hidden resource: no link for anon', 'anon', null, format('select 1 where public.get_download_url(%L) is not null', p_free_draft), 'rows=0');
  perform pg_temp.t('paid resource: no link for anon (even if a guest order exists)', 'anon', null, format('select 1 where public.get_download_url(%L) is not null', p_active), 'rows=0');
  perform pg_temp.t('paid resource: no link without a paid order (A)', 'authenticated', a, format('select 1 where public.get_download_url(%L) is not null', p_active), 'rows=0');
  perform pg_temp.t('paid resource: buyer B gets the link', 'authenticated', b, format('select 1 where public.get_download_url(%L) is not null', p_bulk), 'rows=1');
  perform pg_temp.t('paid resource: other customer A gets no link', 'authenticated', a, format('select 1 where public.get_download_url(%L) is not null', p_bulk), 'rows=0');
  perform pg_temp.t('paid resource: anon gets no link', 'anon', null, format('select 1 where public.get_download_url(%L) is not null', p_bulk), 'rows=0');
  perform pg_temp.t('admin gets the link of a paid resource', 'authenticated', c, format('select 1 where public.get_download_url(%L) is not null', p_active), 'rows=1');
  perform pg_temp.t('admin gets the link of a hidden resource', 'authenticated', c, format('select 1 where public.get_download_url(%L) is not null', p_free_draft), 'rows=1');
  perform pg_temp.t('non-Google link is rejected', 'postgres', null, format($s$insert into public.product_downloads (product_id, drive_url) values (%L, 'https://evil.example.com/x')$s$, p_draft), 'error');
  perform pg_temp.t('javascript: link is rejected', 'postgres', null, format($s$insert into public.product_downloads (product_id, drive_url) values (%L, 'javascript:alert(1)')$s$, p_draft), 'error');
  perform pg_temp.t('look-alike Google host is rejected', 'postgres', null, format($s$insert into public.product_downloads (product_id, drive_url) values (%L, 'https://drive.google.com.evil.com/x')$s$, p_draft), 'error');
  perform pg_temp.t('real Drive link is accepted', 'postgres', null, format($s$insert into public.product_downloads (product_id, drive_url) values (%L, 'https://drive.google.com/file/d/abc123/view?usp=sharing')$s$, p_draft), 'rows=1');

  -- ---------- report (the error below is intentional: it rolls everything back) ----------
  select count(*) filter (where passed), count(*) filter (where not passed) into v_pass, v_fail from t_results;
  for rec in select test, detail from t_results where not passed order by n loop
    v_report := v_report || E'\n  FAIL: ' || rec.test || '  (' || rec.detail || ')';
  end loop;
  if v_fail = 0 then
    raise exception 'ALL % TESTS PASSED. (This error is intentional: it rolls back the test data.)', v_pass;
  else
    raise exception E'% passed, % FAILED. (This error is intentional: it rolls back the test data.)%', v_pass, v_fail, v_report;
  end if;
end
$test$;
