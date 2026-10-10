-- 0900: digital resources. The Google Drive link is NOT a column of the public products table
-- (anyone can read that table). It lives in product_downloads, which only admins can read, and is
-- handed out by get_download_url() only to people allowed to download.
--   free resource (price = 0), visible (status = 'active')   -> anyone
--   paid resource (price > 0)                                 -> only a signed-in buyer with a PAID order
--   admins                                                    -> always

create table public.product_downloads (
  product_id uuid primary key references public.products(id) on delete cascade,
  drive_url  text not null check (
    char_length(drive_url) <= 2000
    and (drive_url ~ '^https://(drive|docs)\.google\.com/[^[:space:]]+$'
      or drive_url ~ '^https://drive\.usercontent\.google\.com/[^[:space:]]+$')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_product_downloads_updated before update on public.product_downloads
  for each row execute function public.set_updated_at();

alter table public.product_downloads enable row level security;
revoke all on public.product_downloads from anon, authenticated;
grant select, insert, update, delete on public.product_downloads to authenticated; -- RLS: admin only

create policy product_downloads_select on public.product_downloads for select to authenticated
  using ((select public.is_admin()));
create policy product_downloads_insert on public.product_downloads for insert to authenticated
  with check ((select public.is_admin()));
create policy product_downloads_update on public.product_downloads for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy product_downloads_delete on public.product_downloads for delete to authenticated
  using ((select public.is_admin()));

create function public.get_download_url(p_product_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select d.drive_url
    from public.product_downloads d
    join public.products p on p.id = d.product_id
   where d.product_id = p_product_id
     and ( (select public.is_admin())
        or ( p.status = 'active'
             and ( p.price = 0
                or exists (select 1
                             from public.order_items i
                             join public.orders o on o.id = i.order_id
                            where i.product_id = p.id
                              and o.user_id = (select auth.uid())
                              and o.payment_status = 'paid') ) ) );
$$;

revoke all on function public.get_download_url(uuid) from public, anon, authenticated;
grant execute on function public.get_download_url(uuid) to anon, authenticated;
