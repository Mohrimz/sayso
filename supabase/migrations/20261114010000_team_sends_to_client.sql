-- =============================================================================
-- The team sends posts straight to the client (user, 2026-11-14), and can
-- upload a new version of work they have already sent.
--
-- * send_to_client: anyone on the agency team sends a post (draft or internal
--   review) to the client. Admins are told when a team member sends one.
-- * replace_sent_version: a new version of a post that's with the client goes
--   to the client straight away, and the approvers are asked again.
-- * submit_task_work: whoever submitted work that's waiting for review can send
--   a new version; the earlier round is marked "replaced".
-- * Published posts that never had a date get their publish date.
--
-- Sharing a month with the client and publishing stay admin-only.
-- =============================================================================

-- Anyone on the agency team may send a post to the client now.
drop trigger if exists content_items_send_guard on public.content_items;
drop function if exists public.content_items_send_guard();

create or replace function public.send_to_client(p_item uuid, p_deadline timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item public.content_items;
  v_version uuid;
begin
  select * into v_item from public.content_items where id = p_item for update;
  if not found or not public.is_agency_member(v_item.workspace_id) then
    raise exception 'Post not found.';
  end if;
  if v_item.status not in ('draft', 'internal_review') then
    raise exception 'This post can''t be sent to the client right now.';
  end if;
  if not public.plan_shared(v_item.plan_id) then
    raise exception 'An admin needs to share this month''s plan with the client first.';
  end if;

  -- The hop through internal review isn't a request for review, so it doesn't notify the admins.
  perform set_config('app.approved_send', 'on', true);
  if v_item.status = 'draft' then
    update public.content_items set status = 'internal_review' where id = p_item;
  end if;
  v_version := public.send_for_approval(p_item, p_deadline);
  perform set_config('app.approved_send', '', true);

  -- Admins hear about posts their team sends (an admin sending one needs no note).
  if not public.is_agency_admin() then
    perform public.notify_users(
      array(select id from public.profiles where side = 'agency' and agency_role = 'admin'),
      v_item.workspace_id,
      'sent_to_client',
      coalesce(public.display_name(auth.uid()), 'The team') || ' sent ' || v_item.title || ' to the client',
      'It''s waiting for the client''s approval.',
      '/w/' || public.workspace_slug(v_item.workspace_id) || '/content/' || p_item
    );
  end if;
  return v_version;
end;
$$;

revoke execute on function public.send_to_client(uuid, timestamptz) from anon, public;
grant execute on function public.send_to_client(uuid, timestamptz) to authenticated;

-- A new version of a post the client is reviewing replaces what they see.
create or replace function public.replace_sent_version(p_item uuid, p_files jsonb, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item public.content_items;
  v_file jsonb;
  v_prefix text;
  v_version uuid;
begin
  select * into v_item from public.content_items where id = p_item for update;
  if not found or not public.is_agency_member(v_item.workspace_id) then
    raise exception 'Post not found.';
  end if;
  if v_item.status <> 'client_review' then
    raise exception 'This post isn''t with the client.';
  end if;
  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) = 0 or jsonb_array_length(p_files) > 20 then
    raise exception 'Add between 1 and 20 files.';
  end if;
  v_prefix := v_item.workspace_id::text || '/' || p_item::text || '/';
  for v_file in select value from jsonb_array_elements(p_files) loop
    if coalesce(v_file ->> 'path', '') not like v_prefix || '%' or (v_file ->> 'path') like '%..%' then
      raise exception 'A file doesn''t belong to this post.';
    end if;
  end loop;

  -- The "send" flow lets the version in while the post is with the client, already marked as sent.
  perform set_config('app.workflow', 'send', true);
  insert into public.content_versions (
    content_item_id, media, captions, hashtags, on_screen_text, link_url, tracked_links, note, created_by, sent_to_client_at
  ) values (
    p_item, p_files, v_item.captions, v_item.hashtags, v_item.on_screen_text, v_item.link_url, v_item.tracked_links,
    nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now()
  ) returning id into v_version;
  perform set_config('app.workflow', 'send', true);
  update public.content_items set client_decision = null, sent_for_approval_at = now() where id = p_item;
  perform set_config('app.workflow', '', true);

  perform public.notify_users(
    array(select user_id from public.workspace_members where workspace_id = v_item.workspace_id and role = 'approver'),
    v_item.workspace_id,
    'approval_requested',
    'New version ready for your approval: ' || v_item.title,
    case when v_item.approval_deadline is not null
      then 'Please review by ' || to_char(v_item.approval_deadline at time zone 'UTC', 'Dy DD Mon') || '.'
      else null end,
    '/w/' || public.workspace_slug(v_item.workspace_id) || '/content/' || p_item
  );
  return v_version;
end;
$$;

revoke execute on function public.replace_sent_version(uuid, jsonb, text) from anon, public;
grant execute on function public.replace_sent_version(uuid, jsonb, text) to authenticated;

-- Task work: a round replaced by a newer version before anyone reviewed it.
alter table public.task_submissions drop constraint if exists task_submissions_decision_check;
alter table public.task_submissions
  add constraint task_submissions_decision_check check (decision in ('approved', 'changes_requested', 'replaced'));

create or replace function public.submit_task_work(p_task uuid, p_item uuid, p_files jsonb, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_item public.content_items;
  v_pending public.task_submissions;
  v_resend boolean := false;
  v_prefix text;
  v_file jsonb;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
  v_name text;
begin
  select * into v_task from public.tasks where id = p_task for update;
  if not found or v_task.owner_side <> 'agency' or not public.is_agency_member(v_task.workspace_id) then
    raise exception 'Task not found' using errcode = '42501';
  end if;
  if v_task.owner_id is not null and v_task.owner_id <> auth.uid() then
    raise exception 'Only the person this task is assigned to can submit work for it.';
  end if;
  if v_task.status = 'in_review' then
    -- A new version of work that's still waiting for review, from whoever sent it.
    select * into v_pending from public.task_submissions
    where task_id = p_task and decision is null
    order by submitted_at desc limit 1
    for update;
    if not found or v_pending.submitted_by is distinct from auth.uid() then
      raise exception 'Only the person who sent this work can send a new version.';
    end if;
    v_resend := true;
  elsif v_task.status not in ('todo', 'in_progress') then
    raise exception 'This task is already done.';
  end if;

  select * into v_item from public.content_items where id = p_item and workspace_id = v_task.workspace_id;
  if not found then
    raise exception 'Choose a post from this client.';
  end if;
  if v_item.status not in ('planned', 'draft', 'internal_review') then
    raise exception 'That post is already with the client. Pick one that''s planned or in draft.';
  end if;

  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) = 0 or jsonb_array_length(p_files) > 20 then
    raise exception 'Add between 1 and 20 files.';
  end if;
  v_prefix := v_task.workspace_id::text || '/' || p_item::text || '/';
  for v_file in select value from jsonb_array_elements(p_files) loop
    if coalesce(v_file ->> 'path', '') not like v_prefix || '%' or (v_file ->> 'path') like '%..%' then
      raise exception 'A file doesn''t belong to that post.';
    end if;
  end loop;

  insert into public.task_submissions (task_id, workspace_id, content_item_id, files, note, submitted_by)
  values (p_task, v_task.workspace_id, p_item, p_files, v_note, auth.uid())
  returning id into v_id;
  if v_resend then
    update public.task_submissions set decision = 'replaced' where task_id = p_task and decision is null and id <> v_id;
  end if;

  perform set_config('app.task_flow', 'on', true);
  update public.tasks set status = 'in_review', content_item_id = p_item, completed_at = null where id = p_task;
  perform set_config('app.task_flow', '', true);

  select coalesce(nullif(full_name, ''), split_part(email, '@', 1)) into v_name from public.profiles where id = auth.uid();
  perform public.notify_users(
    array(select id from public.profiles where side = 'agency' and agency_role = 'admin' and id <> auth.uid()),
    v_task.workspace_id,
    'task_submitted',
    coalesce(v_name, 'Someone') || case when v_resend then ' sent a new version: ' else ' submitted: ' end || v_task.title,
    coalesce(v_note, 'Ready for your review.'),
    '/tasks?review=' || p_task::text
  );
  return v_id;
end;
$$;

-- A post published without a date takes its publish date, so it shows on the calendar.
create or replace function public.content_items_live_date()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' and new.planned_at is null then
    new.planned_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

-- Named to run after content_items_guard, which stamps published_at.
create trigger content_items_set_live_date
  before insert or update on public.content_items
  for each row execute function public.content_items_live_date();

update public.content_items
set planned_at = published_at
where status = 'published' and planned_at is null and published_at is not null;
