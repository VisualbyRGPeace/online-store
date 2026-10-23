-- Allow admins to pause new offerings from the admin panel.
alter table public.shop_settings
  add column accepting_incense boolean not null default true;

-- The database blocks new incense even if a client bypasses the website controls.
create function public.guard_incense_offering_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(
    (select accepting_incense from public.shop_settings where id = true),
    false
  ) then
    raise exception 'incense_closed';
  end if;
  return new;
end
$$;

revoke all on function public.guard_incense_offering_insert() from public, anon, authenticated;

create trigger guard_incense_offering_insert
before insert on public.incense_offerings
for each row execute function public.guard_incense_offering_insert();
