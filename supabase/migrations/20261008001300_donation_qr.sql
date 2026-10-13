-- 1300: the donation QR image is managed from the admin page.
-- It lives in a public Storage bucket (site-assets, folder qr/); its path is saved in shop_settings.
-- Everyone can read it (the pop-up shows it); only admins can upload, replace or delete it.

alter table public.shop_settings
  add column donation_qr_path text
  check (donation_qr_path is null or donation_qr_path ~ '^qr/[A-Za-z0-9-]+\.(png|jpg|webp)$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy site_assets_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'qr' and (select public.is_admin()));
create policy site_assets_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-assets' and (select public.is_admin()));
