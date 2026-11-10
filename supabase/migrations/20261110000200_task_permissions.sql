-- =============================================================================
-- Task permissions: only agency admins delete tasks, and only the person a
-- task is assigned to submits work for it.
-- =============================================================================

-- Split "agency manages tasks" (everything) so deleting can be admin-only.
drop policy if exists "agency manages tasks" on public.tasks;

create policy "agency adds tasks" on public.tasks
  for insert to authenticated
  with check (public.is_agency_member(workspace_id));

create policy "agency updates tasks" on public.tasks
  for update to authenticated
  using (public.is_agency_member(workspace_id))
  with check (public.is_agency_member(workspace_id));

create policy "agency admins delete tasks" on public.tasks
  for delete to authenticated
  using (public.is_agency_admin());

-- Submitting work: the assignee only (anyone on the team when nobody is assigned).
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
  if v_task.owner_id is not null and v_task.owner_id <> auth.uid() then
    raise exception 'Only the person this task is assigned to can submit work for it.';
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
