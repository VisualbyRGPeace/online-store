-- Require a signed-in account, save the user's own prayer, and snapshot a random admin dialogue.
alter table public.incense_offerings
  add column donor_id uuid references auth.users(id) on delete set null,
  add column npc_message_text text;

-- Keep existing live/history records readable after this schema change.
update public.incense_offerings
   set npc_message_text = message_text
 where npc_message_text is null;

alter table public.incense_offerings
  alter column npc_message_text set not null,
  add constraint incense_offerings_npc_message_length
    check (char_length(npc_message_text) between 2 and 240);

-- Replace the previous anonymous/admin-template RPC. The donor's name is derived
-- from their account profile, while the prayer is supplied by the signed-in donor.
drop function if exists public.light_incense(text, uuid);

create function public.light_incense(p_prayer text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text;
  v_prayer text := btrim(coalesce(p_prayer, ''));
  v_message_id uuid;
  v_npc_message text;
  v_id uuid;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if char_length(v_prayer) not between 2 and 240 then
    raise exception 'invalid_prayer';
  end if;

  select coalesce(
    nullif(btrim(p.full_name), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), '')
  )
    into v_name
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id = v_user_id;

  v_name := left(btrim(coalesce(v_name, '')), 60);
  if char_length(v_name) not between 1 and 60 then
    raise exception 'account_name_required';
  end if;

  select id, content
    into v_message_id, v_npc_message
    from public.incense_messages
   where is_active
   order by random()
   limit 1;

  if v_npc_message is null then
    raise exception 'npc_message_unavailable';
  end if;

  insert into public.incense_offerings
    (donor_id, donor_name, message_id, message_text, npc_message_text, lit_at, expires_at)
  values
    (v_user_id, v_name, v_message_id, v_prayer, v_npc_message, v_now, v_now + interval '4 hours')
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function public.light_incense(text) from public, anon, authenticated;
grant execute on function public.light_incense(text) to authenticated;
