-- =============================================================================
-- Approved task work goes back to the person who made it.
--
-- When an admin marks a team member's submitted work as done, the files
-- become the post's next version (as before) and the team member is told
-- "Marked as done". They then send the post to the client themselves with
-- send_approved_work(). The admin no longer sends it; they see whether it has
-- gone to the client yet, and are told when it has.
--
-- A post counts as "approved work waiting to be sent" while:
--   * its latest approved task submission is newer than its last send, and
--   * its latest version still has the approved files.
-- =============================================================================

-- Marking work done notifies the submitter with a link to the post.
create or replace function public.review_task_work(p_task uuid, p_decision text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_sub public.task_submissions;
  v_version uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_post text;
begin
  if not public.is_agency_admin() then
    raise exception 'Only an agency admin can review work.';
  end if;
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'Unknown decision.';
  end if;
  if p_decision = 'changes_requested' and v_note is null then
    raise exception 'Say what needs to change.';
  end if;

  select * into v_task from public.tasks where id = p_task for update;
  if not found or v_task.status <> 'in_review' then
    raise exception 'This task isn''t waiting for review.';
  end if;
  select * into v_sub from public.task_submissions
  where task_id = p_task and decision is null
  order by submitted_at desc limit 1
  for update;
  if not found then
    raise exception 'There''s no submitted work to review.';
  end if;

  if p_decision = 'approved' and v_sub.content_item_id is not null then
    -- The work becomes the post's next version, as if it had been uploaded on the post.
    insert into public.content_versions
      (content_item_id, workspace_id, version_number, media, captions, hashtags, on_screen_text, link_url, tracked_links, note, created_by)
    select i.id, i.workspace_id, 0, v_sub.files, i.captions, i.hashtags, i.on_screen_text, i.link_url, i.tracked_links,
           left('From task "' || v_task.title || '"' || coalesce(': ' || v_sub.note, ''), 500), v_sub.submitted_by
    from public.content_items i
    where i.id = v_sub.content_item_id
    returning id into v_version;
  end if;

  update public.task_submissions
  set decision = p_decision, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now(), version_id = v_version
  where id = v_sub.id;

  perform set_config('app.task_flow', 'on', true);
  update public.tasks
  set status = case when p_decision = 'approved' then 'done'::public.task_status else 'in_progress'::public.task_status end,
      completed_at = case when p_decision = 'approved' then now() else null end
  where id = p_task;
  perform set_config('app.task_flow', '', true);

  if p_decision = 'approved' and v_sub.content_item_id is not null then
    select title into v_post from public.content_items where id = v_sub.content_item_id;
    perform public.notify_users(
      array_remove(array[v_sub.submitted_by], null),
      v_task.workspace_id,
      'task_reviewed',
      'Marked as done: ' || v_task.title,
      coalesce(public.display_name(auth.uid()), 'An admin') || ' approved your work. Send ' || coalesce(v_post, 'the post') || ' to the client for review.',
      '/w/' || public.workspace_slug(v_task.workspace_id) || '/content/' || v_sub.content_item_id
    );
  else
    perform public.notify_users(
      array_remove(array[v_sub.submitted_by, v_task.owner_id], null),
      v_task.workspace_id,
      'task_reviewed',
      case when p_decision = 'approved' then 'Marked as done: ' else 'Changes requested: ' end || v_task.title,
      case when p_decision = 'approved' then 'Your work was approved and the task is done.' else v_note end,
      '/tasks?scope=mine'
    );
  end if;
end;
$$;

-- The team member whose work was approved sends the post to the client.
create or replace function public.send_approved_work(p_item uuid, p_deadline timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item public.content_items;
  v_sub public.task_submissions;
  v_version uuid;
begin
  select * into v_item from public.content_items where id = p_item for update;
  if not found or not public.is_agency_member(v_item.workspace_id) then
    raise exception 'Post not found.';
  end if;

  select * into v_sub from public.task_submissions
  where content_item_id = p_item and decision = 'approved'
  order by reviewed_at desc limit 1;
  if not found or v_sub.submitted_by is distinct from auth.uid() then
    raise exception 'Only the person whose work was approved can send this post to the client.';
  end if;
  if v_item.sent_for_approval_at is not null and v_item.sent_for_approval_at >= v_sub.reviewed_at then
    raise exception 'This post was already sent to the client.';
  end if;
  if v_item.status not in ('draft', 'internal_review') then
    raise exception 'This post can''t be sent to the client right now.';
  end if;
  if (select media from public.content_versions where content_item_id = p_item order by version_number desc limit 1)
     is distinct from (select media from public.content_versions where id = v_sub.version_id) then
    raise exception 'The files changed after they were approved. Send it to an admin for review again.';
  end if;
  if not public.plan_shared(v_item.plan_id) then
    raise exception 'An admin needs to share this month''s plan with the client first.';
  end if;

  perform set_config('app.approved_send', 'on', true);
  if v_item.status = 'draft' then
    update public.content_items set status = 'internal_review' where id = p_item;
  end if;
  v_version := public.send_for_approval(p_item, p_deadline);
  perform set_config('app.approved_send', '', true);

  -- Let the admin who approved it know it's with the client now.
  perform public.notify_users(
    array_remove(array[v_sub.reviewed_by], null),
    v_item.workspace_id,
    'sent_to_client',
    coalesce(public.display_name(auth.uid()), 'The team') || ' sent ' || v_item.title || ' to the client',
    'It''s waiting for the client''s approval.',
    '/w/' || public.workspace_slug(v_item.workspace_id) || '/content/' || p_item
  );
  return v_version;
end;
$$;

revoke execute on function public.send_approved_work(uuid, timestamptz) from anon, public;
grant execute on function public.send_approved_work(uuid, timestamptz) to authenticated;

-- Admins send posts to the client, except approved work its maker sends above.
create or replace function public.content_items_send_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'internal_review' and new.status = 'client_review'
     and (select auth.uid()) is not null
     and coalesce(current_setting('app.approved_send', true), '') <> 'on'
     and not public.is_agency_admin() then
    raise exception 'Only an agency admin can send posts to the client. An admin will check it and send it.';
  end if;
  return new;
end;
$$;

-- The quick hop through internal review while sending approved work isn't a
-- request for review, so it doesn't notify the admins.
create or replace function public.on_content_sent_for_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_admins uuid[] := array(select id from public.profiles where side = 'agency' and agency_role = 'admin');
begin
  if new.status = 'internal_review' and old.status is distinct from 'internal_review'
     and coalesce(current_setting('app.approved_send', true), '') <> 'on' then
    perform public.notify_users(
      case when new.reviewer_id = any (v_admins) then array[new.reviewer_id] else v_admins end,
      new.workspace_id,
      'review_requested',
      coalesce(public.display_name((select auth.uid())), 'The team') || ' sent ' || new.title || ' for review',
      'Check it, then send it to the client or send it back with fixes.',
      '/w/' || public.workspace_slug(new.workspace_id) || '/content/' || new.id
    );
  end if;
  return new;
end;
$$;
