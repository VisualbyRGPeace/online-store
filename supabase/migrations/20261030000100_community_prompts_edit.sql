-- Cho phép sửa prompt: chủ prompt hoặc quản trị viên.
begin;

-- Chỉ được sửa 3 cột này (không đổi được người đăng hay ngày đăng).
grant update (title, content, image_path) on public.community_prompts to authenticated;

create policy community_prompts_update_owner_or_admin on public.community_prompts
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

-- Quản trị viên sửa prompt của người khác: ảnh mới phải nằm trong thư mục của chủ prompt.
create policy prompt_illustrations_admin_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'prompt-illustrations'
    and lower(storage.extension(name)) = 'webp'
    and (select public.is_admin())
  );

-- Trả thêm user_id để giao diện biết ai được hiện nút Sửa.
drop function public.list_community_prompts(integer, integer);

create function public.list_community_prompts(p_page integer default 1, p_page_size integer default 20)
returns table (
  id uuid,
  title text,
  content text,
  image_path text,
  created_at timestamptz,
  creator_name text,
  total_count bigint,
  user_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
begin
  return query
    select c.id,
           c.title,
           c.content,
           c.image_path,
           c.created_at,
           coalesce(nullif(p.full_name, ''), 'Thành viên')::text,
           count(*) over(),
           c.user_id
      from public.community_prompts c
      left join public.profiles p on p.id = c.user_id
     order by c.created_at desc
     offset ((v_page - 1) * v_page_size)
     limit v_page_size;
end
$$;

revoke all on function public.list_community_prompts(integer, integer) from public, anon, authenticated;
grant execute on function public.list_community_prompts(integer, integer) to anon, authenticated;

commit;
