begin;

drop function if exists public.farm_create();
drop function if exists public.farm_plant(smallint, text);
drop function if exists public.farm_water(smallint);
drop function if exists public.farm_harvest(smallint);
drop function if exists public.farm_list_public(integer);
drop function if exists public.farm_leaderboard(integer);

drop table if exists public.farm_harvests;
drop table if exists public.farm_plots;
drop table if exists public.farms;

commit;
