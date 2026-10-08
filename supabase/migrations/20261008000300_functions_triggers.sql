-- 0300: helper functions, triggers, and the only ways to create/change orders.

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger trg_profiles_updated      before update on public.profiles      for each row execute function public.set_updated_at();
create trigger trg_categories_updated    before update on public.categories    for each row execute function public.set_updated_at();
create trigger trg_products_updated      before update on public.products      for each row execute function public.set_updated_at();
create trigger trg_addresses_updated     before update on public.addresses     for each row execute function public.set_updated_at();
create trigger trg_orders_updated        before update on public.orders        for each row execute function public.set_updated_at();
create trigger trg_payments_updated      before update on public.payments      for each row execute function public.set_updated_at();
create trigger trg_shop_settings_updated before update on public.shop_settings for each row execute function public.set_updated_at();

-- Admin check used by RLS policies. Role can only be changed with SQL / service role.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

-- New auth user -> profile (always 'customer'; metadata is never trusted for role)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(new.raw_user_meta_data ->> 'full_name', 100));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Order history protection: money, customer and address columns never change.
create function public.guard_order_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.order_number, new.subtotal, new.shipping_fee, new.total, new.payment_method,
      new.customer_name, new.customer_phone, new.customer_email, new.shipping_province,
      new.shipping_district, new.shipping_ward, new.shipping_street, new.lookup_token_hash)
     is distinct from
     (old.order_number, old.subtotal, old.shipping_fee, old.total, old.payment_method,
      old.customer_name, old.customer_phone, old.customer_email, old.shipping_province,
      old.shipping_district, old.shipping_ward, old.shipping_street, old.lookup_token_hash)
  then raise exception 'order_immutable'; end if;
  return new;
end $$;
create trigger trg_orders_guard before update on public.orders
  for each row execute function public.guard_order_immutable();

-- order_items: only product_id may change (set null when a product is deleted).
create function public.guard_order_item_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.order_id, new.product_name_snapshot, new.price_snapshot, new.quantity, new.subtotal)
     is distinct from
     (old.order_id, old.product_name_snapshot, old.price_snapshot, old.quantity, old.subtotal)
  then raise exception 'order_item_immutable'; end if;
  return new;
end $$;
create trigger trg_order_items_guard before update on public.order_items
  for each row execute function public.guard_order_item_immutable();

-- ---------------------------------------------------------------------------
-- place_order: guests and logged-in users. Client sends ONLY product ids + quantities.
-- Prices, stock, shipping fee and totals all come from the database.
-- ---------------------------------------------------------------------------
create function public.place_order(
  p_items             jsonb,   -- [{"product_id": "<uuid>", "quantity": 2}, ...]
  p_customer_name     text,
  p_customer_phone    text,
  p_customer_email    text,
  p_shipping_province text,
  p_shipping_district text,
  p_shipping_ward     text,
  p_shipping_street   text,
  p_payment_method    text default 'cod',
  p_note              text default null
)
returns table (out_order_id uuid, out_order_number bigint, out_lookup_token text, out_total integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_ids       uuid[];
  v_req       jsonb;
  v_sub       bigint;
  v_stock_ok  boolean;
  v_fee       integer;
  v_threshold integer;
  v_token     text;
  v_order_id  uuid;
  v_number    bigint;
  v_total     integer;
begin
  if p_payment_method <> 'cod' then raise exception 'unsupported_payment_method'; end if;

  p_customer_name     := btrim(p_customer_name);
  p_customer_phone    := btrim(p_customer_phone);
  p_customer_email    := nullif(btrim(p_customer_email), '');
  p_shipping_province := btrim(p_shipping_province);
  p_shipping_district := btrim(p_shipping_district);
  p_shipping_ward     := btrim(p_shipping_ward);
  p_shipping_street   := btrim(p_shipping_street);
  p_note              := nullif(btrim(p_note), '');

  if coalesce(char_length(p_customer_name), 0) not between 1 and 100 then raise exception 'invalid_name'; end if;
  if p_customer_phone is null or p_customer_phone !~ '^\+?[0-9]{9,15}$' then raise exception 'invalid_phone'; end if;
  if p_customer_email is not null and (char_length(p_customer_email) > 254
     or p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'invalid_email'; end if;
  if coalesce(char_length(p_shipping_province), 0) not between 1 and 100
     or coalesce(char_length(p_shipping_district), 0) not between 1 and 100
     or coalesce(char_length(p_shipping_ward), 0)     not between 1 and 100
     or coalesce(char_length(p_shipping_street), 0)   not between 1 and 200
  then raise exception 'invalid_address'; end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'invalid_note'; end if;

  -- Parse items, merge duplicate products, validate shape
  begin
    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
      raise exception 'invalid_items';
    end if;
    if exists (select 1 from jsonb_array_elements(p_items) e
               where (e ->> 'quantity')::int not between 1 and 99) then
      raise exception 'invalid_items';
    end if;
    select jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty)), array_agg(product_id)
      into v_req, v_ids
      from (select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'quantity')::int) as qty
              from jsonb_array_elements(p_items) e group by 1) s;
  exception when others then
    raise exception 'invalid_items';
  end;

  -- Lock product rows (ordered to avoid deadlocks) so concurrent orders cannot oversell
  perform 1 from public.products p where p.id = any(v_ids) order by p.id for update;

  if (select count(*) from public.products p where p.id = any(v_ids) and p.status = 'active')
     <> cardinality(v_ids) then raise exception 'product_unavailable'; end if;

  select sum(p.price::bigint * r.qty), bool_and(p.stock >= r.qty)
    into v_sub, v_stock_ok
    from jsonb_to_recordset(v_req) as r(product_id uuid, qty int)
    join public.products p on p.id = r.product_id;

  if not v_stock_ok then raise exception 'insufficient_stock'; end if;
  if v_sub > 1000000000 then raise exception 'invalid_items'; end if;

  select s.shipping_fee, s.free_shipping_threshold into v_fee, v_threshold from public.shop_settings s;
  if v_threshold is not null and v_sub >= v_threshold then v_fee := 0; end if;
  v_total := v_sub::int + v_fee;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.orders (user_id, payment_method, customer_name, customer_phone, customer_email,
                             shipping_province, shipping_district, shipping_ward, shipping_street,
                             note, subtotal, shipping_fee, total, lookup_token_hash)
  values ((select auth.uid()), p_payment_method, p_customer_name, p_customer_phone, p_customer_email,
          p_shipping_province, p_shipping_district, p_shipping_ward, p_shipping_street,
          p_note, v_sub::int, v_fee, v_total, extensions.digest(v_token, 'sha256'))
  returning id, order_number into v_order_id, v_number;

  insert into public.order_items (order_id, product_id, product_name_snapshot, price_snapshot, quantity, subtotal)
  select v_order_id, p.id, p.name, p.price, r.qty, p.price * r.qty
    from jsonb_to_recordset(v_req) as r(product_id uuid, qty int)
    join public.products p on p.id = r.product_id;

  update public.products p set stock = p.stock - r.qty
    from jsonb_to_recordset(v_req) as r(product_id uuid, qty int)
   where p.id = r.product_id;

  insert into public.payments (order_id, provider, amount, status)
  values (v_order_id, p_payment_method, v_total, 'pending');

  return query select v_order_id, v_number, v_token, v_total;
end $$;

-- Guest order lookup: needs order id + the secret token returned by place_order
create function public.get_guest_order(p_order_id uuid, p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'status', o.status,
    'payment_status', o.payment_status, 'payment_method', o.payment_method,
    'subtotal', o.subtotal, 'shipping_fee', o.shipping_fee, 'total', o.total,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'shipping_address', concat_ws(', ', o.shipping_street, o.shipping_ward, o.shipping_district, o.shipping_province),
    'created_at', o.created_at,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'name', i.product_name_snapshot, 'price', i.price_snapshot,
                'quantity', i.quantity, 'subtotal', i.subtotal)), '[]'::jsonb)
                from public.order_items i where i.order_id = o.id))
  from public.orders o
  where o.id = p_order_id and o.lookup_token_hash = extensions.digest(p_token, 'sha256');
$$;

-- Admin: controlled status transitions (cancel puts stock back)
create function public.admin_set_order_status(p_order_id uuid, p_status public.order_status) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old public.order_status; v_pay public.payment_status;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select status, payment_status into v_old, v_pay from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;

  if not ((v_old = 'pending'   and p_status in ('confirmed', 'cancelled'))
       or (v_old = 'confirmed' and p_status in ('shipping', 'cancelled'))
       or (v_old = 'shipping'  and p_status = 'completed'))
  then raise exception 'invalid_transition'; end if;

  if p_status = 'cancelled' then
    if v_pay = 'paid' then raise exception 'refund_required'; end if;
    update public.products p set stock = p.stock + i.quantity
      from public.order_items i where i.order_id = p_order_id and i.product_id = p.id;
  end if;

  update public.orders set status = p_status where id = p_order_id;
end $$;

-- Admin: mark a COD order as paid (online providers are updated only by webhooks via service role)
create function public.admin_mark_cod_paid(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_o public.orders;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_o.payment_method <> 'cod' or v_o.payment_status <> 'unpaid'
     or v_o.status not in ('shipping', 'completed') then raise exception 'invalid_transition'; end if;
  update public.orders set payment_status = 'paid' where id = p_order_id;
  update public.payments set status = 'succeeded' where order_id = p_order_id and provider = 'cod';
end $$;

-- Function privileges: nothing is callable by default
revoke all on function public.place_order(jsonb, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_guest_order(uuid, text)            from public, anon, authenticated;
revoke all on function public.admin_set_order_status(uuid, public.order_status) from public, anon, authenticated;
revoke all on function public.admin_mark_cod_paid(uuid)              from public, anon, authenticated;
revoke all on function public.is_admin()                             from public, anon;

grant execute on function public.place_order(jsonb, text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_guest_order(uuid, text)         to anon, authenticated;
grant execute on function public.admin_set_order_status(uuid, public.order_status) to authenticated;
grant execute on function public.admin_mark_cod_paid(uuid)           to authenticated;
grant execute on function public.is_admin()                          to authenticated;
