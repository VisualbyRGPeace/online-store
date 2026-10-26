begin;

create or replace function public.farm_create()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_created boolean := false;
begin
  if v_uid is null or not coalesce(public.is_admin(), false) then
    raise exception 'Nông trại hiện chỉ dành cho quản trị viên.';
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), 'Nông trại của thành viên')
    into v_name
    from public.profiles p
   where p.id = v_uid;

  v_name := left(coalesce(v_name, 'Nông trại của thành viên'), 51) || ' - Farm';

  insert into public.farms(user_id, farm_name)
  values (v_uid, v_name)
  on conflict (user_id) do nothing;
  v_created := found;

  insert into public.farm_plots(user_id, plot_no)
  select v_uid, n::smallint from generate_series(1, 4) n
  on conflict (user_id, plot_no) do nothing;

  return jsonb_build_object('created', v_created);
end
$$;

create or replace function public.farm_plant(p_plot_no smallint, p_crop_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_duration integer;
begin
  if v_uid is null or not coalesce(public.is_admin(), false) then
    raise exception 'Nông trại hiện chỉ dành cho quản trị viên.';
  end if;

  v_duration := case p_crop_key
    when 'greens' then 1800
    when 'sunflower' then 7200
    when 'strawberry' then 21600
    when 'lotus' then 43200
    else null
  end;
  if v_duration is null then raise exception 'Loại cây không hợp lệ.'; end if;

  perform 1 from public.farm_plots
   where user_id = v_uid and plot_no = p_plot_no and crop_key is null
   for update;
  if not found then raise exception 'Ô đất không trống hoặc không tồn tại.'; end if;

  update public.farm_plots
     set crop_key = p_crop_key, planted_at = now(), grow_seconds = v_duration, watered = false
   where user_id = v_uid and plot_no = p_plot_no;

  return jsonb_build_object('planted', true);
end
$$;

create or replace function public.farm_water(p_plot_no smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plot public.farm_plots%rowtype;
begin
  if v_uid is null or not coalesce(public.is_admin(), false) then
    raise exception 'Nông trại hiện chỉ dành cho quản trị viên.';
  end if;

  select * into v_plot from public.farm_plots
   where user_id = v_uid and plot_no = p_plot_no
   for update;
  if not found or v_plot.crop_key is null then raise exception 'Không có cây ở ô đất này.'; end if;
  if v_plot.watered then raise exception 'Cây này đã được tưới rồi.'; end if;
  if now() >= v_plot.planted_at + make_interval(secs => v_plot.grow_seconds) then
    raise exception 'Cây đã chín, hãy thu hoạch.';
  end if;

  update public.farm_plots
     set grow_seconds = greatest(300, round(grow_seconds * 0.85)::integer), watered = true
   where user_id = v_uid and plot_no = p_plot_no;

  return jsonb_build_object('watered', true);
end
$$;

create or replace function public.farm_harvest(p_plot_no smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plot public.farm_plots%rowtype;
  v_points integer;
begin
  if v_uid is null or not coalesce(public.is_admin(), false) then
    raise exception 'Nông trại hiện chỉ dành cho quản trị viên.';
  end if;

  select * into v_plot from public.farm_plots
   where user_id = v_uid and plot_no = p_plot_no
   for update;
  if not found or v_plot.crop_key is null then raise exception 'Không có cây để thu hoạch.'; end if;
  if now() < v_plot.planted_at + make_interval(secs => v_plot.grow_seconds) then
    raise exception 'Cây chưa chín.';
  end if;

  v_points := case v_plot.crop_key
    when 'greens' then 10
    when 'sunflower' then 25
    when 'strawberry' then 60
    when 'lotus' then 100
  end;

  update public.farms set points = points + v_points where user_id = v_uid;
  insert into public.farm_harvests(user_id, crop_key, points)
  values (v_uid, v_plot.crop_key, v_points);
  update public.farm_plots
     set crop_key = null, planted_at = null, grow_seconds = null, watered = false
   where user_id = v_uid and plot_no = p_plot_no;

  return jsonb_build_object('harvested', true, 'points', v_points);
end
$$;

create or replace function public.farm_list_public(p_limit integer default 24)
returns table (
  is_mine boolean,
  farm_name text,
  owner_name text,
  points integer,
  created_at timestamptz,
  plots jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.user_id = auth.uid(),
         f.farm_name,
         coalesce(nullif(p.full_name, ''), 'Thành viên')::text,
         f.points,
         f.created_at,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'plot_no', fp.plot_no,
               'crop_key', fp.crop_key,
               'planted_at', fp.planted_at,
               'grow_seconds', fp.grow_seconds,
               'watered', fp.watered
             ) order by fp.plot_no
           ) filter (where fp.plot_no is not null),
           '[]'::jsonb
         )
    from public.farms f
    left join public.profiles p on p.id = f.user_id
    left join public.farm_plots fp on fp.user_id = f.user_id
   where coalesce(public.is_admin(), false)
   group by f.user_id, f.farm_name, f.points, f.created_at, p.full_name
   order by f.points desc, f.created_at asc
   limit least(greatest(coalesce(p_limit, 24), 1), 48)
$$;

create or replace function public.farm_leaderboard(p_limit integer default 10)
returns table (owner_name text, total_points integer, weekly_points integer)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(p.full_name, ''), f.farm_name)::text,
         f.points,
         coalesce(sum(h.points) filter (
           where h.harvested_at >= date_trunc('week', now())
         ), 0)::integer
    from public.farms f
    left join public.profiles p on p.id = f.user_id
    left join public.farm_harvests h on h.user_id = f.user_id
   where coalesce(public.is_admin(), false)
   group by f.user_id, f.farm_name, f.points, p.full_name
   order by 3 desc, 2 desc
   limit least(greatest(coalesce(p_limit, 10), 1), 20)
$$;

revoke all on function public.farm_create() from public, anon, authenticated;
revoke all on function public.farm_plant(smallint, text) from public, anon, authenticated;
revoke all on function public.farm_water(smallint) from public, anon, authenticated;
revoke all on function public.farm_harvest(smallint) from public, anon, authenticated;
revoke all on function public.farm_list_public(integer) from public, anon, authenticated;
revoke all on function public.farm_leaderboard(integer) from public, anon, authenticated;

grant execute on function public.farm_create() to authenticated;
grant execute on function public.farm_plant(smallint, text) to authenticated;
grant execute on function public.farm_water(smallint) to authenticated;
grant execute on function public.farm_harvest(smallint) to authenticated;
grant execute on function public.farm_list_public(integer) to authenticated;
grant execute on function public.farm_leaderboard(integer) to authenticated;

commit;
