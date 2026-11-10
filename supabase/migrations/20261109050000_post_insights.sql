-- =============================================================================
-- Post results: how published posts are doing on Instagram and Facebook.
--
-- Results are fetched through the agency's Make.com connection (a Make
-- scenario reads Instagram insights and Facebook Page post engagement) and
-- cached here, one row per published content item per platform. Everyone who
-- can see the post can see its results; only the server writes them.
-- =============================================================================

-- Which Instagram professional account and Facebook Page belong to this client.
alter table public.workspaces
  add column instagram_account_id text check (instagram_account_id is null or instagram_account_id ~ '^[0-9]{5,30}$'),
  add column facebook_page_id text check (facebook_page_id is null or facebook_page_id ~ '^[0-9]{5,30}$');

create table public.post_insights (
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook')),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  media_id text,                                           -- Instagram media ID or Facebook post ID
  permalink text,
  posted_at timestamptz,
  -- Instagram: {views, reach, likes, comments, shares, saved, total_interactions}
  -- Facebook:  {reactions, comments, shares}
  metrics jsonb not null default '{}'::jsonb,
  status text not null default 'ok' check (status in ('ok', 'not_found', 'error')),
  error text,
  fetched_at timestamptz not null default now(),
  primary key (content_item_id, platform)
);
create index on public.post_insights (workspace_id);

alter table public.post_insights enable row level security;

create policy "see post results" on public.post_insights
  for select to authenticated
  using (
    public.is_agency_member(workspace_id)
    or (public.is_client_member(workspace_id) and public.item_visible_to_client(content_item_id))
  );

-- Written only by the server (service role) after it checks access.
revoke all on public.post_insights from anon;
revoke insert, update, delete on public.post_insights from authenticated;
