-- Publish new incense blessings to public clients in real time.
-- Public SELECT access and the RLS policy are created by 20261023000500_incense_blessings.sql.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'incense_blessings'
     ) then
    alter publication supabase_realtime add table public.incense_blessings;
  end if;
end
$$;
