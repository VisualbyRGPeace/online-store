-- Public virtual incense offerings. Each stick burns for exactly four hours from lit_at.
create table public.incense_messages (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(btrim(content)) between 2 and 240),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.incense_offerings (
  id uuid primary key default gen_random_uuid(),
  donor_name text not null check (char_length(btrim(donor_name)) between 1 and 60),
  message_id uuid references public.incense_messages(id) on delete set null,
  message_text text not null check (char_length(message_text) between 2 and 240),
  lit_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.incense_messages enable row level security;
alter table public.incense_offerings enable row level security;

revoke all on public.incense_messages from anon, authenticated;
revoke all on public.incense_offerings from anon, authenticated;
grant select on public.incense_messages to anon, authenticated;
grant insert, update, delete on public.incense_messages to authenticated;
grant select on public.incense_offerings to anon, authenticated;

create policy incense_messages_public_read on public.incense_messages
  for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy incense_messages_admin_insert on public.incense_messages
  for insert to authenticated with check ((select public.is_admin()));
create policy incense_messages_admin_update on public.incense_messages
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy incense_messages_admin_delete on public.incense_messages
  for delete to authenticated using ((select public.is_admin()));

create policy incense_offerings_public_read on public.incense_offerings
  for select to anon, authenticated using (expires_at > now());

create index incense_offerings_active_idx on public.incense_offerings (expires_at desc);
create index incense_messages_active_idx on public.incense_messages (is_active, created_at desc);

-- Anonymous or signed-in visitors can light one incense using an active admin message.
-- Keep a snapshot of the message so an admin can remove a template without changing already-lit incense.
create function public.light_incense(p_donor_name text, p_message_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_donor_name, ''));
  v_message text;
  v_id uuid;
  v_now timestamptz := now();
begin
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'invalid_donor_name';
  end if;

  select content into v_message
    from public.incense_messages
   where id = p_message_id and is_active;
  if v_message is null then raise exception 'message_unavailable'; end if;

  insert into public.incense_offerings (donor_name, message_id, message_text, lit_at, expires_at)
  values (v_name, p_message_id, v_message, v_now, v_now + interval '4 hours')
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function public.light_incense(text, uuid) from public, anon, authenticated;
grant execute on function public.light_incense(text, uuid) to anon, authenticated;

insert into public.incense_messages (content) values
  ('Nguyện cầu bình an, sức khỏe và an lành cho mọi người.'),
  ('Xin hồi hướng chút thiện lành này đến gia đình và những người hữu duyên.'),
  ('Nguyện cho tâm được an tĩnh, sáng suốt và từ bi.'),
  ('Cầu mong mọi điều tốt đẹp đến với những người mình thương quý.');
