begin;

revoke all on table public.incense_messages, public.incense_offerings, public.incense_blessings, public.incense_extinguish_log from anon, authenticated;

drop policy if exists incense_messages_public_read on public.incense_messages;
drop policy if exists incense_messages_admin_insert on public.incense_messages;
drop policy if exists incense_messages_admin_update on public.incense_messages;
drop policy if exists incense_messages_admin_delete on public.incense_messages;
drop policy if exists incense_offerings_public_read on public.incense_offerings;
drop policy if exists incense_offerings_admin_delete on public.incense_offerings;
drop policy if exists incense_blessings_read_active on public.incense_blessings;
drop policy if exists incense_extinguish_log_admin_read on public.incense_extinguish_log;

drop trigger if exists guard_incense_offering_insert on public.incense_offerings;

drop function if exists public.guard_incense_offering_insert();
drop function if exists public.light_incense(text);
drop function if exists public.light_incense(text, uuid);
drop function if exists public.incense_permissions();
drop function if exists public.bless_incense(uuid);
drop function if exists public.extinguish_incense(uuid);
drop function if exists public.relight_incense(uuid);

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'incense_blessings'
  ) then
    alter publication supabase_realtime drop table public.incense_blessings;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'incense_offerings'
  ) then
    alter publication supabase_realtime drop table public.incense_offerings;
  end if;
end;
$$;

commit;
