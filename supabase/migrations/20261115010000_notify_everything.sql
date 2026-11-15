-- =============================================================================
-- Every meaningful action now reaches the bell (and the phone app, and email).
--
-- Fixes:
--   * Comments, approvals and change requests on a post only reached the
--     post's assignee, reviewer and creator. Agency admins heard nothing about
--     work a team member made or sent, so they now always hear about it.
-- New notifications:
--   * a client finishes (or reopens) one of their tasks   -> agency
--   * a month's plan is shared with the client            -> client
--   * the agency posts a progress update on a plan        -> client
--   * a post goes live                                    -> client + agency
--   * a client edits the brand kit                        -> agency
-- notify_users() never notifies the person who did the action.
-- =============================================================================

create or replace function public.agency_admins()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(id), '{}') from public.profiles where side = 'agency' and agency_role = 'admin';
$$;

create or replace function public.client_people(p_ws uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(user_id), '{}') from public.workspace_members
  where workspace_id = p_ws and role in ('approver', 'viewer');
$$;

create or replace function public.workspace_team(p_ws uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(user_id), '{}') from public.workspace_members
  where workspace_id = p_ws and role = 'team_member';
$$;

revoke execute on function public.agency_admins() from anon, authenticated, public;
revoke execute on function public.client_people(uuid) from anon, authenticated, public;
revoke execute on function public.workspace_team(uuid) from anon, authenticated, public;

-- The agency people who hear about a post: whoever made, owns or reviews it
-- (or the client's team when nobody does), plus the agency admins.
create or replace function public.agency_recipients(p_item uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  with direct as (
    select unnest(array[i.assignee_id, i.reviewer_id, i.created_by]) as uid
    from public.content_items i where i.id = p_item
  ), direct_agency as (
    select d.uid from direct d join public.profiles p on p.id = d.uid where p.side = 'agency'
  ), everyone as (
    select uid from direct_agency
    union
    select m.user_id from public.content_items i
      join public.workspace_members m on m.workspace_id = i.workspace_id and m.role = 'team_member'
      where i.id = p_item and not exists (select 1 from direct_agency)
    union
    select unnest(public.agency_admins())
  )
  select coalesce(array_agg(uid) filter (where uid is not null), '{}') from everyone;
$$;

-- A client task finished or reopened.
create or replace function public.on_client_task_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owners uuid[];
begin
  if new.owner_side <> 'client' or new.internal or new.status is not distinct from old.status then
    return new;
  end if;
  if new.status <> 'done' and old.status <> 'done' then
    return new; -- to do <-> in progress isn't worth a notification
  end if;
  v_owners := case when new.owner_id is not null then array[new.owner_id]
    else array(select user_id from public.workspace_members where workspace_id = new.workspace_id and role = 'approver') end;
  perform public.notify_users(
    public.agency_admins() || array[new.created_by] || v_owners,
    new.workspace_id,
    'task_completed',
    coalesce(public.display_name((select auth.uid())), 'Someone')
      || case when new.status = 'done' then ' finished: ' else ' reopened: ' end || new.title,
    null,
    '/w/' || public.workspace_slug(new.workspace_id) || '/tasks'
  );
  return new;
end;
$$;

create trigger on_client_task_status
  after update of status on public.tasks
  for each row execute function public.on_client_task_status();

-- A month shared with the client.
create or replace function public.on_plan_shared()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'draft' and new.status = 'active' then
    perform public.notify_users(
      public.client_people(new.workspace_id),
      new.workspace_id,
      'plan_shared',
      'Your ' || trim(to_char(new.month, 'FMMonth YYYY')) || ' plan is ready',
      nullif(left(coalesce(new.themes, ''), 300), ''),
      '/w/' || public.workspace_slug(new.workspace_id) || '/plan/' || to_char(new.month, 'YYYY-MM')
    );
  end if;
  return new;
end;
$$;

create trigger on_plan_shared
  after update of status on public.monthly_plans
  for each row execute function public.on_plan_shared();

-- A progress update on a plan. Clients only hear about months shared with them.
create or replace function public.on_progress_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan record;
begin
  select month, status into v_plan from public.monthly_plans where id = new.plan_id;
  perform public.notify_users(
    case when v_plan.status <> 'draft' then public.client_people(new.workspace_id) else '{}'::uuid[] end
      || public.agency_admins(),
    new.workspace_id,
    'progress_update',
    'Update from ' || coalesce(public.display_name(new.author_id), 'the team')
      || ' on the ' || trim(to_char(v_plan.month, 'FMMonth')) || ' plan',
    new.body,
    '/w/' || public.workspace_slug(new.workspace_id) || '/plan/' || to_char(v_plan.month, 'YYYY-MM')
  );
  return new;
end;
$$;

create trigger on_progress_update
  after insert on public.progress_updates
  for each row execute function public.on_progress_update();

-- A post went live.
create or replace function public.on_content_published()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    perform public.notify_users(
      public.client_people(new.workspace_id) || public.agency_recipients(new.id),
      new.workspace_id,
      'published',
      'Live now: ' || new.title,
      null,
      '/w/' || public.workspace_slug(new.workspace_id) || '/content/' || new.id
    );
  end if;
  return new;
end;
$$;

create trigger on_content_published
  after update of status on public.content_items
  for each row execute function public.on_content_published();

-- A client changed the brand kit.
create or replace function public.on_brand_kit_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and side = 'client') then
    return new;
  end if;
  perform public.notify_users(
    public.agency_admins() || public.workspace_team(new.workspace_id),
    new.workspace_id,
    'brand_kit_updated',
    public.display_name((select auth.uid())) || ' updated the brand kit',
    null,
    '/w/' || public.workspace_slug(new.workspace_id) || '/brand'
  );
  return new;
end;
$$;

create trigger on_brand_kit_changed
  after insert or update on public.brand_kits
  for each row execute function public.on_brand_kit_changed();
