-- Quản lý thư mục: cho phép ghim thư mục hay dùng lên đầu danh sách.
begin;

alter table public.folder_entries add column pinned boolean not null default false;

grant update (pinned) on public.folder_entries to authenticated;

create index folder_entries_owner_pinned_idx on public.folder_entries (user_id) where pinned;

commit;
