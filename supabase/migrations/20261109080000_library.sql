-- =============================================================================
-- Library: each client's product photos, videos, logos and documents in one
-- place. Files live in the workspace-files bucket under
-- <workspace>/library/<random>/<file name>; this table holds what the app
-- needs to list, filter and search them.
--
-- Everyone in the workspace can see them. The agency team and client approvers
-- can add them, and the agency team or the person who uploaded a file can
-- rename, move or delete it (the same rules as the storage bucket).
-- =============================================================================

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  path text not null unique
    check (path like workspace_id::text || '/library/%' or path like workspace_id::text || '/brand/%'),
  name text not null check (length(btrim(name)) between 1 and 200),
  folder text not null default 'General' check (length(btrim(folder)) between 1 and 60),
  mime text not null default 'application/octet-stream' check (length(mime) <= 100),
  size bigint not null default 0 check (size >= 0),
  note text check (note is null or length(note) <= 500),
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.assets (workspace_id, created_at desc);

alter table public.assets enable row level security;

create policy "members see the library" on public.assets
  for select to authenticated
  using (public.is_member(workspace_id));

create policy "agency and approvers add to the library" on public.assets
  for insert to authenticated
  with check (
    (public.is_agency_member(workspace_id) or public.is_client_approver(workspace_id))
    and uploaded_by = (select auth.uid())
  );

create policy "agency or uploader edit library files" on public.assets
  for update to authenticated
  using (public.is_agency_member(workspace_id) or uploaded_by = (select auth.uid()))
  with check (public.is_agency_member(workspace_id) or uploaded_by = (select auth.uid()));

create policy "agency or uploader delete library files" on public.assets
  for delete to authenticated
  using (public.is_agency_member(workspace_id) or uploaded_by = (select auth.uid()));

-- Only the name, folder and note can be changed after upload.
revoke update on public.assets from authenticated;
grant update (name, folder, note) on public.assets to authenticated;

-- Product videos can be big.
update storage.buckets set file_size_limit = 524288000 where id = 'workspace-files';

-- Brand kit files uploaded before the Library existed go into its "Brand" folder.
insert into public.assets (workspace_id, path, name, folder, mime, size, uploaded_by, created_at)
select
  w.id,
  o.name,
  left(coalesce(nullif(regexp_replace(split_part(o.name, '/', 3), '^[0-9]+-', ''), ''), split_part(o.name, '/', 3)), 200),
  'Brand',
  left(coalesce(o.metadata ->> 'mimetype', 'application/octet-stream'), 100),
  coalesce((o.metadata ->> 'size')::bigint, 0),
  p.id,
  o.created_at
from storage.objects o
join public.workspaces w on w.id = public.try_uuid(split_part(o.name, '/', 1))
left join public.profiles p on p.id::text = o.owner_id
where o.bucket_id = 'workspace-files'
  and split_part(o.name, '/', 2) = 'brand'
  and split_part(o.name, '/', 3) not in ('', '.emptyFolderPlaceholder')
on conflict (path) do nothing;
