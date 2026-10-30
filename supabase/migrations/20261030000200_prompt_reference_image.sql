-- Mỗi prompt có 2 loại ảnh:
--   image_path            = thumbnail, hiển thị cho người xem
--   reference_image_path  = ảnh mẫu / phác thảo, dùng để AI hiểu và được sao chép kèm chữ
begin;

alter table public.community_prompts add column reference_image_path text;

alter table public.community_prompts add constraint community_prompts_reference_image_owner check (
  reference_image_path is null or split_part(reference_image_path, '/', 1) = user_id::text
);

grant update (reference_image_path) on public.community_prompts to authenticated;

-- Chủ prompt chỉ được xóa ảnh khi không còn prompt nào dùng (kể cả làm ảnh mẫu).
drop policy prompt_illustrations_owner_delete_orphan on storage.objects;
create policy prompt_illustrations_owner_delete_orphan on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'prompt-illustrations'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.community_prompts p
       where p.image_path = name or p.reference_image_path = name
    )
  );

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
  user_id uuid,
  reference_image_path text
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
           c.user_id,
           c.reference_image_path
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
