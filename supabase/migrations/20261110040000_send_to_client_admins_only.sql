-- =============================================================================
-- Only agency admins send posts to the client, and only they share a month
-- with the client (or hide it again). Team members send posts for internal
-- review, which notifies the admins.
-- =============================================================================

-- Internal review -> client review (send_for_approval) is for admins.
-- No signed-in user means a trusted server task (service role, SQL editor).
create or replace function public.content_items_send_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'internal_review' and new.status = 'client_review'
     and (select auth.uid()) is not null
     and not public.is_agency_admin() then
    raise exception 'Only an agency admin can send posts to the client. An admin will check it and send it.';
  end if;
  return new;
end;
$$;

create trigger content_items_send_guard
  before update of status on public.content_items
  for each row execute function public.content_items_send_guard();

-- Whether the client can see a month changes only through an admin: sharing
-- it (draft -> active or closed) or hiding it again (back to draft). Team
-- members can still close and reopen a month the client already sees.
create or replace function public.monthly_plans_share_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or public.is_agency_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Only an agency admin can share a month with the client.';
    end if;
  elsif (old.status = 'draft') <> (new.status = 'draft') then
    raise exception 'Only an agency admin can share a month with the client or hide it.';
  end if;
  return new;
end;
$$;

create trigger monthly_plans_share_guard
  before insert or update of status on public.monthly_plans
  for each row execute function public.monthly_plans_share_guard();

-- A post sent for internal review notifies the admin picked as its reviewer,
-- or every agency admin when none is picked. The sender isn't notified.
create or replace function public.on_content_sent_for_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_admins uuid[] := array(select id from public.profiles where side = 'agency' and agency_role = 'admin');
begin
  if new.status = 'internal_review' and old.status is distinct from 'internal_review' then
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

create trigger on_content_sent_for_review
  after update of status on public.content_items
  for each row execute function public.on_content_sent_for_review();
