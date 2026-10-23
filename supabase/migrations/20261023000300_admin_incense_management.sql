-- Let administrators review all incense history and remove entries from the admin panel.
-- Public visitors can continue to see only incense that is still burning.
grant delete on public.incense_offerings to authenticated;

drop policy if exists incense_offerings_public_read on public.incense_offerings;
create policy incense_offerings_public_read on public.incense_offerings
  for select to anon, authenticated
  using (expires_at > now() or (select public.is_admin()));

create policy incense_offerings_admin_delete on public.incense_offerings
  for delete to authenticated
  using ((select public.is_admin()));
