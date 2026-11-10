-- =============================================================================
-- Client Portal: core schema (Phase 1 MVP)
--
-- Every record belongs to one client workspace (apart from user profiles), and
-- row-level security limits each query to the workspaces the user belongs to.
-- The content workflow (Planned -> Draft -> Internal review -> Client review ->
-- Approved -> Scheduled -> Published) is enforced here, so the app cannot skip
-- the client's decision even by mistake.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_side as enum ('agency', 'client');
create type public.agency_role as enum ('admin', 'member');
create type public.member_role as enum ('team_member', 'approver', 'viewer');
create type public.workspace_status as enum ('onboarding', 'active', 'paused', 'archived');
create type public.approval_rule as enum ('any', 'all');
create type public.content_type as enum ('feed_post', 'carousel', 'reel', 'story');
create type public.content_status as enum (
  'planned', 'draft', 'internal_review', 'client_review', 'approved', 'scheduled', 'published'
);
create type public.plan_status as enum ('draft', 'active', 'closed');
create type public.task_status as enum ('todo', 'in_progress', 'done');
create type public.approval_decision as enum ('approved', 'changes_requested');
create type public.internal_decision as enum ('passed', 'fixes_needed');

-- ---------------------------------------------------------------------------
-- Utility
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  side public.user_side not null default 'client',
  agency_role public.agency_role,
  notification_prefs jsonb not null default
    '{"email_approvals": true, "email_comments": true, "email_changes": true, "email_tasks": true}'::jsonb,
  created_at timestamptz not null default now(),
  constraint agency_role_only_for_agency check (side = 'agency' or agency_role is null)
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  website text,
  time_zone text not null default 'UTC',
  social_accounts jsonb not null default '[]'::jsonb,      -- [{platform, handle, url}]
  status public.workspace_status not null default 'active',
  approval_rule public.approval_rule not null default 'any',
  main_contact_name text,
  main_contact_email text,
  -- Monthly deliverable quotas, visible to everyone in the workspace.
  -- Carousels count toward the feed_post quota.
  quotas jsonb not null default '{"feed_post": 12, "reel": 4, "story": 8, "report": 1}'::jsonb,
  revision_rounds int not null default 2 check (revision_rounds >= 0),
  goals_focus text,
  success_measures text,
  rules jsonb not null default '[]'::jsonb,                -- [{tag, requirement: 'all_approvers', note}]
  baseline jsonb not null default '{}'::jsonb,             -- {recorded_on, followers, reach, engagement_rate, notes}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Billing details: agency admins and client approvers only.
create table public.packages (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  service_name text not null default '',
  monthly_fee numeric(12, 2),
  currency text not null default 'USD',
  start_date date,
  term_months int check (term_months is null or term_months > 0),
  notes text,
  updated_at timestamptz not null default now()
);

create table public.brand_kits (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  logo_paths text[] not null default '{}',
  colours jsonb not null default '[]'::jsonb,              -- [{name, hex}]
  fonts jsonb not null default '[]'::jsonb,                -- [{name, usage}]
  tone text,
  topics_to_avoid text,
  faq jsonb not null default '[]'::jsonb,                  -- [{question, answer}]
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

create table public.monthly_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  themes text,
  goals text,
  key_dates jsonb not null default '[]'::jsonb,            -- [{date, label}]
  status public.plan_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, month)
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_id uuid not null references public.monthly_plans (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  type public.content_type not null,
  platforms text[] not null default '{instagram}',
  planned_at timestamptz,
  status public.content_status not null default 'planned',
  assignee_id uuid references public.profiles (id) on delete set null,
  reviewer_id uuid references public.profiles (id) on delete set null,
  tags text[] not null default '{}',
  captions jsonb not null default '{}'::jsonb,             -- {"default": "...", "facebook": "..."}
  hashtags text,
  on_screen_text text,
  link_url text,
  utm jsonb not null default '{}'::jsonb,                  -- {medium, campaign, content}
  tracked_links jsonb not null default '{}'::jsonb,        -- {"instagram": "https://...utm_source=instagram..."}
  revision_count int not null default 0,
  current_version int not null default 0,
  client_decision public.approval_decision,                -- latest client decision on the version sent
  approval_deadline timestamptz,
  sent_for_approval_at timestamptz,
  approved_at timestamptz,
  live_url text,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.content_items (workspace_id, status);
create index on public.content_items (plan_id);
create index on public.content_items (assignee_id);

-- Immutable snapshots. A version is created for each media upload, and the
-- version the client sees is frozen when it is sent for approval.
create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  version_number int not null,
  media jsonb not null default '[]'::jsonb,                -- [{path | url, name, mime, size}]
  captions jsonb not null default '{}'::jsonb,
  hashtags text,
  on_screen_text text,
  link_url text,
  tracked_links jsonb not null default '{}'::jsonb,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_to_client_at timestamptz,
  unique (content_item_id, version_number)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  version_id uuid references public.content_versions (id) on delete set null,
  parent_id uuid references public.comments (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  pin jsonb,                                               -- {x, y} (0..1) or {t} seconds; Phase 2
  kind text not null default 'comment' check (kind in ('comment', 'change_request')),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.comments (content_item_id, created_at);

-- Agency-only notes and internal review decisions. Never visible to clients.
create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null default '',
  decision public.internal_decision,
  version_number int,
  created_at timestamptz not null default now()
);
create index on public.internal_notes (content_item_id, created_at);

-- Audit trail: who decided what, on which version, and when. Written only
-- through submit_approval().
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  version_id uuid not null references public.content_versions (id) on delete cascade,
  approver_id uuid references public.profiles (id) on delete set null,
  decision public.approval_decision not null,
  comment text,
  created_at timestamptz not null default now(),
  constraint changes_need_comment check (decision = 'approved' or length(trim(coalesce(comment, ''))) > 0)
);
create index on public.approvals (content_item_id, created_at);
create index on public.approvals (version_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_id uuid references public.monthly_plans (id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  description text,
  owner_side public.user_side not null default 'agency',
  owner_id uuid references public.profiles (id) on delete set null,
  due_date date,
  status public.task_status not null default 'todo',
  internal boolean not null default false,                 -- agency-only task, hidden from clients
  content_item_id uuid references public.content_items (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tasks (workspace_id, status);
create index on public.tasks (owner_id);

create table public.progress_updates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_id uuid not null references public.monthly_plans (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index on public.progress_updates (plan_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
create index on public.notifications (created_at) where emailed_at is null;

-- updated_at triggers
create trigger set_updated_at before update on public.workspaces for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.packages for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.brand_kits for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.monthly_plans for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.content_items for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.comments for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tasks for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_agency()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and side = 'agency'
  );
$$;

create or replace function public.is_agency_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and side = 'agency' and agency_role = 'admin'
  );
$$;

-- Agency admin, or an agency user assigned to the workspace.
create or replace function public.is_agency_member(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.side = 'agency'
      and (
        p.agency_role = 'admin'
        or exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = p.id)
      )
  );
$$;

create or replace function public.is_client_member(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and p.side = 'client'
  );
$$;

create or replace function public.is_client_approver(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = ws and m.user_id = (select auth.uid())
      and p.side = 'client' and m.role = 'approver'
  );
$$;

create or replace function public.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_agency_member(ws) or public.is_client_member(ws);
$$;

-- Clients only see a month once its plan has been shared (status <> 'draft').
create or replace function public.plan_shared(p_plan uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.monthly_plans where id = p_plan and status <> 'draft');
$$;

create or replace function public.item_visible_to_client(p_item uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.content_items i
    join public.monthly_plans p on p.id = i.plan_id
    where i.id = p_item and p.status <> 'draft'
  );
$$;

create or replace function public.can_see_profile(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    p_id = (select auth.uid())
    or public.is_agency()
    or exists (select 1 from public.profiles where id = p_id and side = 'agency')
    or exists (
      select 1 from public.workspace_members mine
      join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = p_id
    );
$$;

-- ---------------------------------------------------------------------------
-- New users get a profile. Side and role are never taken from user metadata
-- (users can set their own metadata); the server sets them when inviting.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

-- Members must match their side: agency users are team members, client users
-- are approvers or viewers.
create or replace function public.workspace_members_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_side public.user_side;
begin
  select side into v_side from public.profiles where id = new.user_id;
  if v_side is null then
    raise exception 'User not found';
  end if;
  if new.role = 'team_member' and v_side <> 'agency' then
    raise exception 'Only agency users can be team members';
  end if;
  if new.role in ('approver', 'viewer') and v_side <> 'client' then
    raise exception 'Only client users can be approvers or viewers';
  end if;
  return new;
end;
$$;

create trigger workspace_members_guard
  before insert or update on public.workspace_members
  for each row execute function public.workspace_members_guard();

-- ---------------------------------------------------------------------------
-- Content workflow guard
-- ---------------------------------------------------------------------------
create or replace function public.content_items_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_flow text := coalesce(current_setting('app.workflow', true), '');
  v_ws uuid;
  v_move text;
begin
  if tg_op = 'INSERT' then
    select workspace_id into v_ws from public.monthly_plans where id = new.plan_id;
    if v_ws is null then
      raise exception 'Monthly plan not found';
    end if;
    new.workspace_id := v_ws;
    if new.status not in ('planned', 'draft') then
      raise exception 'New content starts as planned or draft';
    end if;
    new.revision_count := 0;
    new.current_version := 0;
    new.client_decision := null;
    new.approved_at := null;
    new.sent_for_approval_at := null;
    new.created_by := coalesce(new.created_by, auth.uid());
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  new.workspace_id := old.workspace_id;
  if new.plan_id is distinct from old.plan_id then
    select workspace_id into v_ws from public.monthly_plans where id = new.plan_id;
    if v_ws is distinct from old.workspace_id then
      raise exception 'Content can only move between plans of the same client';
    end if;
  end if;

  -- Counters and approval stamps are only changed by the workflow functions.
  if v_flow not in ('approval', 'system') then
    new.revision_count := old.revision_count;
    new.approved_at := old.approved_at;
  end if;
  if v_flow <> 'system' then
    new.current_version := old.current_version;
  end if;
  if v_flow <> 'send' then
    new.sent_for_approval_at := old.sent_for_approval_at;
  end if;
  if v_flow not in ('approval', 'send') then
    new.client_decision := old.client_decision;
  end if;

  -- Once the client has seen the content it is locked until it goes back to draft.
  if old.status in ('client_review', 'approved', 'scheduled', 'published')
     and new.status = old.status
     and (
       new.captions is distinct from old.captions
       or new.hashtags is distinct from old.hashtags
       or new.on_screen_text is distinct from old.on_screen_text
       or new.link_url is distinct from old.link_url
       or new.type is distinct from old.type
     ) then
    raise exception 'This content has been sent to the client. Move it back to draft before editing it.';
  end if;

  if new.status is distinct from old.status then
    v_move := old.status::text || '>' || new.status::text;

    if v_move = 'internal_review>client_review' then
      if v_flow <> 'send' then
        raise exception 'Use "Send for client approval" to send content to the client';
      end if;
    elsif v_move = 'client_review>approved' then
      if v_flow <> 'approval' then
        raise exception 'Only the client can approve content';
      end if;
      new.approved_at := now();
    elsif v_move = 'client_review>draft' then
      null; -- client requested changes (approval flow) or agency withdrew it
    elsif v_move in (
      'planned>draft', 'draft>planned',
      'draft>internal_review', 'internal_review>draft',
      'approved>draft', 'scheduled>draft',
      'approved>scheduled', 'scheduled>approved',
      'approved>published', 'scheduled>published',
      'published>scheduled', 'published>approved'
    ) then
      null;
    else
      raise exception 'Content cannot move from % to %', old.status, new.status;
    end if;

    if new.status = 'published' then
      new.published_at := coalesce(new.published_at, now());
    elsif old.status = 'published' then
      new.published_at := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger content_items_guard
  before insert or update on public.content_items
  for each row execute function public.content_items_guard();

create or replace function public.content_versions_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_flow text := coalesce(current_setting('app.workflow', true), '');
  v_ws uuid;
  v_status public.content_status;
begin
  select workspace_id, status into v_ws, v_status
  from public.content_items where id = new.content_item_id
  for update;

  if v_ws is null then
    raise exception 'Content item not found';
  end if;
  if v_flow <> 'send' and v_status not in ('planned', 'draft', 'internal_review') then
    raise exception 'Move the item back to draft before uploading a new version';
  end if;

  new.workspace_id := v_ws;
  select coalesce(max(version_number), 0) + 1 into new.version_number
  from public.content_versions where content_item_id = new.content_item_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  if v_flow <> 'send' then
    new.sent_to_client_at := null;
  end if;
  return new;
end;
$$;

create trigger content_versions_before_insert
  before insert on public.content_versions
  for each row execute function public.content_versions_before_insert();

create or replace function public.content_versions_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_prev text := coalesce(current_setting('app.workflow', true), '');
begin
  perform set_config('app.workflow', 'system', true);
  update public.content_items
  set current_version = new.version_number,
      status = case when status = 'planned' then 'draft'::public.content_status else status end
  where id = new.content_item_id;
  perform set_config('app.workflow', v_prev, true);
  return new;
end;
$$;

create trigger content_versions_after_insert
  after insert on public.content_versions
  for each row execute function public.content_versions_after_insert();

-- ---------------------------------------------------------------------------
-- Workflow functions (RPC)
-- ---------------------------------------------------------------------------

-- Agency: freeze the latest version and send it to the client approvers.
create or replace function public.send_for_approval(p_item uuid, p_deadline timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item public.content_items;
  v_latest public.content_versions;
  v_version uuid;
begin
  select * into v_item from public.content_items where id = p_item for update;
  if not found then
    raise exception 'Content item not found';
  end if;
  if not public.is_agency_member(v_item.workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_item.status <> 'internal_review' then
    raise exception 'Content must pass internal review before it is sent to the client';
  end if;
  if not public.plan_shared(v_item.plan_id) then
    raise exception 'Share this month''s plan with the client before sending content for approval';
  end if;

  select * into v_latest from public.content_versions
  where content_item_id = p_item order by version_number desc limit 1;
  if v_latest.id is null or jsonb_array_length(v_latest.media) = 0 then
    raise exception 'Upload the media before sending for approval';
  end if;

  perform set_config('app.workflow', 'send', true);

  if v_latest.sent_to_client_at is null then
    update public.content_versions
    set captions = v_item.captions,
        hashtags = v_item.hashtags,
        on_screen_text = v_item.on_screen_text,
        link_url = v_item.link_url,
        tracked_links = v_item.tracked_links,
        sent_to_client_at = now()
    where id = v_latest.id;
    v_version := v_latest.id;
  else
    -- Same media, revised copy: keep the earlier snapshot and add a new one.
    insert into public.content_versions (
      content_item_id, media, captions, hashtags, on_screen_text, link_url, tracked_links,
      note, created_by, sent_to_client_at
    ) values (
      p_item, v_latest.media, v_item.captions, v_item.hashtags, v_item.on_screen_text,
      v_item.link_url, v_item.tracked_links, 'Revised copy', auth.uid(), now()
    ) returning id into v_version;
    perform set_config('app.workflow', 'send', true);
  end if;

  update public.content_items
  set status = 'client_review',
      client_decision = null,
      sent_for_approval_at = now(),
      approval_deadline = coalesce(p_deadline, now() + interval '2 days')
  where id = p_item;

  perform set_config('app.workflow', '', true);
  return v_version;
end;
$$;

-- Client approver: approve or request changes on the version they were sent.
create or replace function public.submit_approval(
  p_item uuid,
  p_decision public.approval_decision,
  p_comment text default null
)
returns public.content_status language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_item public.content_items;
  v_ws public.workspaces;
  v_version uuid;
  v_rule public.approval_rule;
  v_required int;
  v_approved int;
begin
  select * into v_item from public.content_items where id = p_item for update;
  if not found then
    raise exception 'Content item not found';
  end if;
  if not public.is_client_approver(v_item.workspace_id) then
    raise exception 'Only client approvers can approve content' using errcode = '42501';
  end if;
  if v_item.status <> 'client_review' then
    raise exception 'This item is not waiting for approval';
  end if;
  if p_decision = 'changes_requested' and length(trim(coalesce(p_comment, ''))) = 0 then
    raise exception 'Please describe the changes you need';
  end if;

  select id into v_version from public.content_versions
  where content_item_id = p_item and sent_to_client_at is not null
  order by version_number desc limit 1;
  if v_version is null then
    raise exception 'No version has been sent for approval';
  end if;
  if exists (select 1 from public.approvals where version_id = v_version and approver_id = v_uid) then
    raise exception 'You have already responded to this version';
  end if;

  insert into public.approvals (workspace_id, content_item_id, version_id, approver_id, decision, comment)
  values (v_item.workspace_id, p_item, v_version, v_uid, p_decision, nullif(trim(coalesce(p_comment, '')), ''));

  if p_decision = 'changes_requested' then
    insert into public.comments (workspace_id, content_item_id, version_id, author_id, body, kind)
    values (v_item.workspace_id, p_item, v_version, v_uid, trim(p_comment), 'change_request');

    perform set_config('app.workflow', 'approval', true);
    update public.content_items
    set status = 'draft', revision_count = revision_count + 1, client_decision = 'changes_requested'
    where id = p_item;
    perform set_config('app.workflow', '', true);
    return 'draft';
  end if;

  if length(trim(coalesce(p_comment, ''))) > 0 then
    insert into public.comments (workspace_id, content_item_id, version_id, author_id, body)
    values (v_item.workspace_id, p_item, v_version, v_uid, trim(p_comment));
  end if;

  select * into v_ws from public.workspaces where id = v_item.workspace_id;
  v_rule := v_ws.approval_rule;
  -- Client-specific rules, e.g. items tagged "AI-generated" need every approver.
  if exists (
    select 1 from jsonb_array_elements(v_ws.rules) r
    where r ->> 'requirement' = 'all_approvers'
      and lower(r ->> 'tag') in (select lower(t) from unnest(v_item.tags) t)
  ) then
    v_rule := 'all';
  end if;

  if v_rule = 'all' then
    select count(*) into v_required
    from public.workspace_members where workspace_id = v_item.workspace_id and role = 'approver';
    select count(distinct approver_id) into v_approved
    from public.approvals where version_id = v_version and decision = 'approved';
    if v_approved < v_required then
      return 'client_review';
    end if;
  end if;

  perform set_config('app.workflow', 'approval', true);
  update public.content_items set status = 'approved', client_decision = 'approved' where id = p_item;
  perform set_config('app.workflow', '', true);
  return 'approved';
end;
$$;

-- Client: tick off an action item assigned to the client side.
create or replace function public.set_client_task_status(p_task uuid, p_status public.task_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task for update;
  if not found or v_task.internal or v_task.owner_side <> 'client'
     or not public.is_client_member(v_task.workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.tasks
  set status = p_status,
      completed_at = case when p_status = 'done' then now() else null end
  where id = p_task;
end;
$$;

-- ---------------------------------------------------------------------------
-- In-app notifications (emails are sent from these rows by the app)
-- ---------------------------------------------------------------------------
create or replace function public.notify_users(
  p_users uuid[], p_ws uuid, p_type text, p_title text, p_body text, p_link text
)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, workspace_id, type, title, body, link)
  select distinct u, p_ws, p_type, p_title, left(p_body, 500), p_link
  from unnest(p_users) as u
  where u is not null
    and u is distinct from (select auth.uid());
$$;

create or replace function public.agency_recipients(p_item uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  with direct as (
    select unnest(array[i.assignee_id, i.reviewer_id, i.created_by]) as uid
    from public.content_items i where i.id = p_item
  ), direct_agency as (
    select d.uid from direct d join public.profiles p on p.id = d.uid where p.side = 'agency'
  )
  select coalesce(
    (select array_agg(distinct uid) from direct_agency),
    (select array_agg(m.user_id) from public.content_items i
       join public.workspace_members m on m.workspace_id = i.workspace_id and m.role = 'team_member'
       where i.id = p_item),
    '{}'
  );
$$;

create or replace function public.workspace_slug(p_ws uuid)
returns text language sql stable security definer set search_path = '' as $$
  select slug from public.workspaces where id = p_ws;
$$;

create or replace function public.display_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(full_name, ''), split_part(email, '@', 1)) from public.profiles where id = p_user;
$$;

create or replace function public.on_content_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'client_review' and old.status is distinct from 'client_review' then
    perform public.notify_users(
      array(select user_id from public.workspace_members where workspace_id = new.workspace_id and role = 'approver'),
      new.workspace_id,
      'approval_requested',
      'Ready for your approval: ' || new.title,
      case when new.approval_deadline is not null
        then 'Please review by ' || to_char(new.approval_deadline at time zone 'UTC', 'Dy DD Mon') || '.'
        else null end,
      '/w/' || public.workspace_slug(new.workspace_id) || '/content/' || new.id
    );
  end if;
  return new;
end;
$$;

create trigger on_content_status_change
  after update of status on public.content_items
  for each row execute function public.on_content_status_change();

create or replace function public.on_approval_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
begin
  select title into v_title from public.content_items where id = new.content_item_id;
  perform public.notify_users(
    public.agency_recipients(new.content_item_id),
    new.workspace_id,
    case when new.decision = 'approved' then 'approved' else 'changes_requested' end,
    public.display_name(new.approver_id)
      || case when new.decision = 'approved' then ' approved ' else ' requested changes on ' end
      || v_title,
    new.comment,
    '/w/' || public.workspace_slug(new.workspace_id) || '/content/' || new.content_item_id
  );
  return new;
end;
$$;

create trigger on_approval_insert
  after insert on public.approvals
  for each row execute function public.on_approval_insert();

create or replace function public.on_comment_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_side public.user_side;
  v_title text;
  v_recipients uuid[];
begin
  if new.kind <> 'comment' then
    return new; -- change requests are announced by the approval trigger
  end if;
  select side into v_side from public.profiles where id = new.author_id;
  select title into v_title from public.content_items where id = new.content_item_id;

  if v_side = 'client' then
    v_recipients := public.agency_recipients(new.content_item_id);
  elsif exists (
    select 1 from public.content_versions
    where content_item_id = new.content_item_id and sent_to_client_at is not null
  ) then
    v_recipients := array(
      select m.user_id from public.workspace_members m
      where m.workspace_id = new.workspace_id and m.role in ('approver', 'viewer')
    ) || public.agency_recipients(new.content_item_id);
  else
    v_recipients := public.agency_recipients(new.content_item_id);
  end if;

  perform public.notify_users(
    v_recipients,
    new.workspace_id,
    'comment',
    public.display_name(new.author_id) || ' commented on ' || v_title,
    new.body,
    '/w/' || public.workspace_slug(new.workspace_id) || '/content/' || new.content_item_id
  );
  return new;
end;
$$;

create trigger on_comment_insert
  after insert on public.comments
  for each row execute function public.on_comment_insert();

create or replace function public.on_task_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_side = 'client' and not new.internal then
    perform public.notify_users(
      case when new.owner_id is not null then array[new.owner_id]
        else array(select user_id from public.workspace_members where workspace_id = new.workspace_id and role = 'approver')
      end,
      new.workspace_id,
      'task_assigned',
      'New action item: ' || new.title,
      case when new.due_date is not null then 'Due ' || to_char(new.due_date, 'Dy DD Mon') || '.' else null end,
      '/w/' || public.workspace_slug(new.workspace_id) || '/tasks'
    );
  elsif new.owner_side = 'agency' and new.owner_id is not null then
    perform public.notify_users(
      array[new.owner_id], new.workspace_id, 'task_assigned',
      'Assigned to you: ' || new.title, null,
      '/w/' || public.workspace_slug(new.workspace_id) || '/tasks'
    );
  end if;
  return new;
end;
$$;

create trigger on_task_insert
  after insert on public.tasks
  for each row execute function public.on_task_insert();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.packages enable row level security;
alter table public.brand_kits enable row level security;
alter table public.workspace_members enable row level security;
alter table public.monthly_plans enable row level security;
alter table public.content_items enable row level security;
alter table public.content_versions enable row level security;
alter table public.comments enable row level security;
alter table public.internal_notes enable row level security;
alter table public.approvals enable row level security;
alter table public.tasks enable row level security;
alter table public.progress_updates enable row level security;
alter table public.notifications enable row level security;

-- profiles
create policy "see related profiles" on public.profiles
  for select to authenticated using (public.can_see_profile(id));
create policy "update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Users may only change their name and notification settings, never side or role.
revoke insert, update, delete on public.profiles from authenticated, anon;
grant update (full_name, notification_prefs) on public.profiles to authenticated;

-- workspaces
create policy "members see workspace" on public.workspaces
  for select to authenticated using (public.is_member(id));
create policy "admins create workspaces" on public.workspaces
  for insert to authenticated with check (public.is_agency_admin());
create policy "admins update workspaces" on public.workspaces
  for update to authenticated using (public.is_agency_admin()) with check (public.is_agency_admin());
create policy "admins delete workspaces" on public.workspaces
  for delete to authenticated using (public.is_agency_admin());

-- packages (billing)
create policy "admins and approvers see package" on public.packages
  for select to authenticated using (public.is_agency_admin() or public.is_client_approver(workspace_id));
create policy "admins manage package" on public.packages
  for all to authenticated using (public.is_agency_admin()) with check (public.is_agency_admin());

-- brand kits
create policy "members see brand kit" on public.brand_kits
  for select to authenticated using (public.is_member(workspace_id));
create policy "agency and approvers insert brand kit" on public.brand_kits
  for insert to authenticated
  with check (public.is_agency_member(workspace_id) or public.is_client_approver(workspace_id));
create policy "agency and approvers update brand kit" on public.brand_kits
  for update to authenticated
  using (public.is_agency_member(workspace_id) or public.is_client_approver(workspace_id))
  with check (public.is_agency_member(workspace_id) or public.is_client_approver(workspace_id));

-- workspace members (client approvers invite their own team through the server)
create policy "members see members" on public.workspace_members
  for select to authenticated using (public.is_member(workspace_id));
create policy "admins manage members" on public.workspace_members
  for all to authenticated using (public.is_agency_admin()) with check (public.is_agency_admin());

-- monthly plans
create policy "see plans" on public.monthly_plans
  for select to authenticated
  using (public.is_agency_member(workspace_id) or (public.is_client_member(workspace_id) and status <> 'draft'));
create policy "agency manages plans" on public.monthly_plans
  for all to authenticated
  using (public.is_agency_member(workspace_id)) with check (public.is_agency_member(workspace_id));

-- content items
create policy "see content" on public.content_items
  for select to authenticated
  using (public.is_agency_member(workspace_id) or (public.is_client_member(workspace_id) and public.plan_shared(plan_id)));
create policy "agency creates content" on public.content_items
  for insert to authenticated
  with check (
    exists (select 1 from public.monthly_plans p where p.id = plan_id and public.is_agency_member(p.workspace_id))
  );
create policy "agency updates content" on public.content_items
  for update to authenticated
  using (public.is_agency_member(workspace_id)) with check (public.is_agency_member(workspace_id));
create policy "agency deletes content" on public.content_items
  for delete to authenticated
  using (public.is_agency_member(workspace_id) and status in ('planned', 'draft'));

-- content versions: clients only see versions that were sent to them
create policy "see versions" on public.content_versions
  for select to authenticated
  using (
    public.is_agency_member(workspace_id)
    or (public.is_client_member(workspace_id) and sent_to_client_at is not null)
  );
create policy "agency adds versions" on public.content_versions
  for insert to authenticated
  with check (
    exists (select 1 from public.content_items i where i.id = content_item_id and public.is_agency_member(i.workspace_id))
  );

-- comments
create policy "see comments" on public.comments
  for select to authenticated
  using (
    public.is_agency_member(workspace_id)
    or (public.is_client_member(workspace_id) and public.item_visible_to_client(content_item_id))
  );
create policy "members comment" on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and kind = 'comment'
    and exists (
      select 1 from public.content_items i
      where i.id = content_item_id
        and i.workspace_id = comments.workspace_id
        and (
          public.is_agency_member(i.workspace_id)
          or (public.is_client_member(i.workspace_id) and public.item_visible_to_client(i.id))
        )
    )
  );
create policy "authors and agency update comments" on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()) or public.is_agency_member(workspace_id))
  with check (author_id = (select auth.uid()) or public.is_agency_member(workspace_id));
create policy "authors delete comments" on public.comments
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_agency_admin());

-- internal notes: agency only
create policy "agency internal notes" on public.internal_notes
  for all to authenticated
  using (public.is_agency_member(workspace_id))
  with check (public.is_agency_member(workspace_id) and author_id = (select auth.uid()));

-- approvals: read-only audit trail (written by submit_approval)
create policy "see approvals" on public.approvals
  for select to authenticated using (public.is_member(workspace_id));

-- tasks
create policy "see tasks" on public.tasks
  for select to authenticated
  using (public.is_agency_member(workspace_id) or (public.is_client_member(workspace_id) and not internal));
create policy "agency manages tasks" on public.tasks
  for all to authenticated
  using (public.is_agency_member(workspace_id)) with check (public.is_agency_member(workspace_id));

-- progress updates
create policy "see updates" on public.progress_updates
  for select to authenticated
  using (public.is_agency_member(workspace_id) or (public.is_client_member(workspace_id) and public.plan_shared(plan_id)));
create policy "agency posts updates" on public.progress_updates
  for insert to authenticated
  with check (public.is_agency_member(workspace_id) and author_id = (select auth.uid()));
create policy "agency edits updates" on public.progress_updates
  for update to authenticated
  using (public.is_agency_member(workspace_id)) with check (public.is_agency_member(workspace_id));
create policy "agency deletes updates" on public.progress_updates
  for delete to authenticated using (public.is_agency_member(workspace_id));

-- notifications
create policy "own notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "mark own notifications" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own notifications" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;
revoke execute on function public.send_for_approval(uuid, timestamptz) from anon, public;
revoke execute on function public.submit_approval(uuid, public.approval_decision, text) from anon, public;
revoke execute on function public.set_client_task_status(uuid, public.task_status) from anon, public;
revoke execute on function public.notify_users(uuid[], uuid, text, text, text, text) from anon, authenticated, public;
grant execute on function public.send_for_approval(uuid, timestamptz) to authenticated;
grant execute on function public.submit_approval(uuid, public.approval_decision, text) to authenticated;
grant execute on function public.set_client_task_status(uuid, public.task_status) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private buckets laid out as <workspace_id>/...
--   content-media:   <workspace>/<content_item>/<upload_id>/<file>
--   workspace-files: <workspace>/<folder>/<file>   (brand kit, client uploads)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('content-media', 'content-media', false, 524288000),
  ('workspace-files', 'workspace-files', false, 104857600)
on conflict (id) do nothing;

create policy "content media: agency reads, clients read sent versions" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'content-media'
    and (
      public.is_agency_member(public.try_uuid((storage.foldername(name))[1]))
      or (
        public.is_client_member(public.try_uuid((storage.foldername(name))[1]))
        and exists (
          select 1 from public.content_versions v
          where v.content_item_id = public.try_uuid((storage.foldername(name))[2])
            and v.sent_to_client_at is not null
            and v.media @> jsonb_build_array(jsonb_build_object('path', name))
        )
      )
    )
  );
create policy "content media: agency uploads" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'content-media'
    and public.is_agency_member(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "workspace files: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'workspace-files' and public.is_member(public.try_uuid((storage.foldername(name))[1])));
create policy "workspace files: agency and approvers upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workspace-files'
    and (
      public.is_agency_member(public.try_uuid((storage.foldername(name))[1]))
      or public.is_client_approver(public.try_uuid((storage.foldername(name))[1]))
    )
  );
create policy "workspace files: agency or uploader deletes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'workspace-files'
    and (
      public.is_agency_member(public.try_uuid((storage.foldername(name))[1]))
      or owner_id = (select auth.uid())::text
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime: comments, approvals, status changes and notifications update live
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.comments, public.approvals, public.content_items, public.notifications;
