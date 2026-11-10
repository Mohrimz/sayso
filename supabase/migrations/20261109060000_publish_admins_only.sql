-- =============================================================================
-- Only agency admins publish. Team members ask an admin with
-- request_publish(), which notifies every agency admin.
-- =============================================================================

alter table public.content_items
  add column publish_requested_at timestamptz,
  add column publish_requested_by uuid references public.profiles (id) on delete set null;

create or replace function public.content_items_publish_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Going live (or being taken back from live) is for agency admins only.
  -- No signed-in user means a trusted server task (service role, SQL editor).
  if new.status is distinct from old.status
     and (new.status = 'published' or old.status = 'published')
     and (select auth.uid()) is not null
     and not public.is_agency_admin() then
    raise exception 'Only an agency admin can publish posts. Ask an admin with "Request publishing".'
      using errcode = '42501';
  end if;

  -- The request is only set through request_publish(), and is cleared once
  -- the post is published or goes back a step.
  if coalesce(current_setting('app.workflow', true), '') <> 'publish_request' then
    new.publish_requested_at := old.publish_requested_at;
    new.publish_requested_by := old.publish_requested_by;
  end if;
  if new.status not in ('approved', 'scheduled') then
    new.publish_requested_at := null;
    new.publish_requested_by := null;
  end if;
  return new;
end;
$$;

create trigger content_items_publish_guard
  before update on public.content_items
  for each row execute function public.content_items_publish_guard();

-- Team member: ask the agency admins to publish an approved post. A reminder
-- can be sent an hour after the last request.
create or replace function public.request_publish(p_item uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_item public.content_items;
begin
  select * into v_item from public.content_items where id = p_item for update;
  if not found then
    raise exception 'Content item not found';
  end if;
  if not public.is_agency_member(v_item.workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_item.status not in ('approved', 'scheduled') then
    raise exception 'Only posts the client has approved can be published';
  end if;
  if v_item.publish_requested_at > now() - interval '1 hour' then
    raise exception 'The admins were asked less than an hour ago. You can send a reminder after that.';
  end if;

  perform set_config('app.workflow', 'publish_request', true);
  update public.content_items
  set publish_requested_at = now(), publish_requested_by = (select auth.uid())
  where id = p_item;
  perform set_config('app.workflow', '', true);

  perform public.notify_users(
    array(select id from public.profiles where side = 'agency' and agency_role = 'admin'),
    v_item.workspace_id,
    'publish_requested',
    public.display_name((select auth.uid())) || ' asked you to publish ' || v_item.title,
    'The client approved it. Publish it from the post page when it''s time.',
    '/w/' || public.workspace_slug(v_item.workspace_id) || '/content/' || v_item.id
  );
end;
$$;

revoke execute on function public.request_publish(uuid) from anon, public;
grant execute on function public.request_publish(uuid) to authenticated;
