-- 0800: speed bump against guest-checkout spam (stock hoarding with fake orders).
-- At most 5 pending orders per phone number per hour. Not a full defence (CAPTCHA comes later).
create index orders_phone_created_idx on public.orders (customer_phone, created_at desc);

create function public.limit_recent_orders() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.orders o
       where o.customer_phone = new.customer_phone
         and o.status = 'pending'
         and o.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_orders';
  end if;
  return new;
end $$;

create trigger trg_orders_rate_limit before insert on public.orders
  for each row execute function public.limit_recent_orders();
