begin;

drop policy if exists incense_offerings_public_read on public.incense_offerings;
create policy incense_offerings_public_read on public.incense_offerings
  for select to anon, authenticated
  using (
    (expires_at > now() and (extinguished_at is null or extinguished_at > now() - interval '1 hour'))
    or (select public.is_admin())
  );

create or replace function public.relight_incense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if public.is_banned(v_user_id) then raise exception 'account_banned'; end if;

  update public.incense_offerings
     set extinguished_at = null,
         extinguished_by_name = null
   where id = p_id
     and donor_id = v_user_id
     and extinguished_at is not null
     and extinguished_at > now() - interval '1 hour'
     and expires_at > now();
  if not found then raise exception 'cannot_relight'; end if;

  insert into public.incense_extinguish_log (offering_id, user_id, action)
  values (p_id, v_user_id, 'relight');
end
$$;

revoke all on function public.relight_incense(uuid) from public, anon, authenticated;
grant execute on function public.relight_incense(uuid) to authenticated;

commit;
