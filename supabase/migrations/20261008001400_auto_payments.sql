-- 1400: automatic bank-transfer payments (SePay webhook).
--
-- Flow: member presses "Cúng dường" -> create_donation_payment() gives a unique code (DW + 8 hex) and the
-- amount is read from the product -> the QR contains amount + code -> the member pays -> SePay calls the
-- Edge Function -> apply_bank_transfer() (service role only) matches the code, checks the amount, records the
-- payment and unlocks the file. Everything that decides "paid" happens here, never in the browser.

-- Admin-controlled settings (public: they are printed on every transfer anyway).
alter table public.shop_settings
  add column payment_mode text not null default 'manual' check (payment_mode in ('manual', 'auto')),
  add column bank_name text check (bank_name is null or (char_length(bank_name) between 1 and 40 and bank_name ~ '^[A-Za-z0-9 ._-]+$')),
  add column bank_account text check (bank_account is null or bank_account ~ '^[0-9]{4,24}$'),
  add column bank_account_name text check (bank_account_name is null or char_length(bank_account_name) <= 100);

alter table public.donation_claims
  add column source text not null default 'honor' check (source in ('honor', 'bank'));

create table public.donation_payments (
  id           bigint generated always as identity primary key,
  code         text not null unique check (code ~ '^DW[0-9A-F]{8}$'),
  user_id      uuid not null references auth.users(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,
  amount       integer not null check (amount > 0),
  status       text not null default 'pending' check (status in ('pending', 'paid')),
  provider_ref text,
  paid_amount  integer,
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index donation_payments_user_idx on public.donation_payments (user_id, created_at desc);

-- Every transfer the webhook reports (matched or not): an audit trail and protection against replays.
create table public.bank_transfers (
  id          bigint generated always as identity primary key,
  provider    text not null default 'sepay',
  provider_ref text not null,
  amount      integer not null,
  content     text,
  code        text,
  result      text not null default 'received',
  payment_id  bigint references public.donation_payments(id) on delete set null,
  payload     jsonb,
  created_at  timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index bank_transfers_created_idx on public.bank_transfers (created_at desc);

alter table public.donation_payments enable row level security;
alter table public.bank_transfers enable row level security;
revoke all on public.donation_payments from anon, authenticated;
revoke all on public.bank_transfers from anon, authenticated;
grant select on public.donation_payments to authenticated;
grant select on public.bank_transfers to authenticated;

create policy donation_payments_select on public.donation_payments for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy bank_transfers_select on public.bank_transfers for select to authenticated
  using ((select public.is_admin()));

-- The member asks for a payment code (the amount always comes from the product, never from the browser).
create function public.create_donation_payment(p_product_id uuid)
returns table (code text, amount integer, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_name  text;
  v_price integer;
  v_code  text;
  v_try   integer := 0;
begin
  if v_uid is null then raise exception 'login_required'; end if;
  if public.is_banned(v_uid) then raise exception 'account_banned'; end if;
  select p.name, p.price into v_name, v_price
    from public.products p where p.id = p_product_id and p.status = 'active' and p.price > 0;
  if v_name is null then raise exception 'not_found'; end if;

  -- reuse a payment of the same member for the same resource that is still waiting
  select dp.code into v_code
    from public.donation_payments dp
   where dp.user_id = v_uid and dp.product_id = p_product_id and dp.status = 'pending'
     and dp.amount = v_price and dp.created_at > now() - interval '7 days'
   order by dp.created_at desc limit 1;

  if v_code is null then
    loop
      v_code := 'DW' || upper(encode(extensions.gen_random_bytes(4), 'hex'));
      begin
        insert into public.donation_payments (code, user_id, product_id, product_name, amount)
        values (v_code, v_uid, p_product_id, v_name, v_price);
        exit;
      exception when unique_violation then
        v_try := v_try + 1;
        if v_try > 5 then raise; end if;
      end;
    end loop;
  end if;

  return query select dp.code, dp.amount, dp.status from public.donation_payments dp where dp.code = v_code;
end $$;

-- The browser polls this (own payments only) until it says 'paid'.
create function public.get_donation_payment(p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select dp.status from public.donation_payments dp
   where dp.code = upper(btrim(p_code)) and dp.user_id = (select auth.uid());
$$;

-- Called ONLY by the Edge Function with the service role. Idempotent per transfer id.
create function public.apply_bank_transfer(p_content text, p_code_hint text, p_amount integer, p_ref text, p_payload jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_transfer_id bigint;
  v_code        text;
  v_pay         public.donation_payments;
  v_result      text;
begin
  insert into public.bank_transfers (provider_ref, amount, content, payload)
  values (p_ref, p_amount, left(p_content, 500), p_payload)
  on conflict (provider, provider_ref) do nothing
  returning id into v_transfer_id;
  if v_transfer_id is null then return 'duplicate'; end if;

  v_code := coalesce((regexp_match(upper(coalesce(p_code_hint, '')), 'DW[0-9A-F]{8}'))[1],
                     (regexp_match(upper(coalesce(p_content, '')), 'DW[0-9A-F]{8}'))[1]);

  if v_code is null then
    v_result := 'no_code';
  else
    select * into v_pay from public.donation_payments where code = v_code for update;
    if not found then
      v_result := 'no_match';
    elsif v_pay.status = 'paid' then
      v_result := 'already_paid';
    elsif p_amount < v_pay.amount then
      v_result := 'amount_too_low';
    else
      update public.donation_payments
         set status = 'paid', provider_ref = p_ref, paid_amount = p_amount, paid_at = now()
       where id = v_pay.id;
      insert into public.donation_claims (user_id, product_id, product_name, amount, source)
      values (v_pay.user_id, v_pay.product_id, v_pay.product_name, v_pay.amount, 'bank')
      on conflict (user_id, product_id) do nothing;
      v_result := 'paid';
    end if;
  end if;

  update public.bank_transfers set code = v_code, result = v_result, payment_id = v_pay.id where id = v_transfer_id;
  return v_result;
end $$;

-- Donations list: now says whether a confirmation was automatic (bank) or self-declared (honor).
drop function public.admin_list_donations();
create function public.admin_list_donations()
returns table (id bigint, user_id uuid, email text, full_name text, product_name text, amount integer,
               created_at timestamptz, source text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select c.id, c.user_id, u.email::text, p.full_name, c.product_name, c.amount, c.created_at, c.source
      from public.donation_claims c
      join auth.users u on u.id = c.user_id
      left join public.profiles p on p.id = c.user_id
     order by c.created_at desc
     limit 500;
end $$;

revoke all on function public.create_donation_payment(uuid) from public, anon, authenticated;
revoke all on function public.get_donation_payment(text) from public, anon, authenticated;
revoke all on function public.apply_bank_transfer(text, text, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_list_donations() from public, anon, authenticated;
grant execute on function public.create_donation_payment(uuid) to authenticated;
grant execute on function public.get_donation_payment(text) to authenticated;
grant execute on function public.apply_bank_transfer(text, text, integer, text, jsonb) to service_role;
grant execute on function public.admin_list_donations() to authenticated;
