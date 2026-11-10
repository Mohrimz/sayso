-- =============================================================================
-- Task review.
--
-- A team member working on an agency task submits their work: they pick the
-- post it's for and upload files to that post's folder, with an optional note.
-- The task waits "in review" until an agency admin either marks it done (the
-- files become the post's next version, as if uploaded on the post) or asks
-- for changes with a note (the task goes back to "in progress").
--
-- Only admins can mark agency tasks done or move them out of review; the
-- trigger below enforces that, and the two functions are the only way in.
-- =============================================================================

create table public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  content_item_id uuid references public.content_items (id) on delete set null,
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  note text check (note is null or length(note) <= 2000),
  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz not null default now(),
  decision text check (decision in ('approved', 'changes_requested')),
  review_note text check (review_note is null or length(review_note) <= 2000),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  -- The post version created from this work when it was approved.
  version_id uuid references public.content_versions (id) on delete set null
);
create index task_submissions_task on public.task_submissions (task_id, submitted_at desc);

alter table public.task_submissions enable row level security;

create policy "agency sees task submissions" on public.task_submissions
  for select to authenticated
  using (public.is_agency_member(workspace_id));

revoke all on public.task_submissions from anon;
revoke insert, update, delete on public.task_submissions from authenticated;

-- Team members can move their agency tasks between "to do" and "in progress";
-- review and "done" belong to admins (or to the functions below).
create or replace function public.tasks_review_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is not distinct from old.status
     or new.owner_side <> 'agency'
     or (select auth.uid()) is null
     or coalesce(current_setting('app.task_flow', true), '') = 'on'
     or public.is_agency_admin() then
    return new;
  end if;
  if new.status in ('done', 'in_review') or old.status in ('done', 'in_review') then
    -- Plain-English message, passed through to the person as is.
    raise exception 'Only an agency admin can do that. Submit your work for review instead.';
  end if;
  return new;
end;
$$;

create trigger tasks_review_guard
  before update of status on public.tasks
  for each row execute function public.tasks_review_guard();

-- A team member submits their work on a task for review.
create or replace function public.submit_task_work(p_task uuid, p_item uuid, p_files jsonb, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_item public.content_items;
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
  if v_task.status not in ('todo', 'in_progress') then
    raise exception 'This task is already waiting for review or done.';
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

  perform set_config('app.task_flow', 'on', true);
  update public.tasks set status = 'in_review', content_item_id = p_item, completed_at = null where id = p_task;
  perform set_config('app.task_flow', '', true);

  select coalesce(nullif(full_name, ''), split_part(email, '@', 1)) into v_name from public.profiles where id = auth.uid();
  perform public.notify_users(
    array(select id from public.profiles where side = 'agency' and agency_role = 'admin' and id <> auth.uid()),
    v_task.workspace_id,
    'task_submitted',
    coalesce(v_name, 'Someone') || ' submitted: ' || v_task.title,
    coalesce(v_note, 'Ready for your review.'),
    '/tasks?review=' || p_task::text
  );
  return v_id;
end;
$$;

-- An agency admin marks submitted work done, or asks for changes.
create or replace function public.review_task_work(p_task uuid, p_decision text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_sub public.task_submissions;
  v_version uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
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

  perform public.notify_users(
    array_remove(array[v_sub.submitted_by, v_task.owner_id], null),
    v_task.workspace_id,
    'task_reviewed',
    case when p_decision = 'approved' then 'Approved: ' else 'Changes requested: ' end || v_task.title,
    case when p_decision = 'approved' then 'Your work was approved and the task is done.' else v_note end,
    '/tasks?scope=mine'
  );
end;
$$;

revoke execute on function public.submit_task_work(uuid, uuid, jsonb, text) from anon, public;
revoke execute on function public.review_task_work(uuid, text, text) from anon, public;
grant execute on function public.submit_task_work(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.review_task_work(uuid, text, text) to authenticated;
