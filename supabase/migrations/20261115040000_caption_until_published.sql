-- =============================================================================
-- The agency can finish the caption and hashtags of an approved (or scheduled)
-- post right up to publishing, from the post page. Publishing posts the latest
-- caption. Everything else stays locked once the client has seen the post, and
-- the caption stays locked while the client is reviewing it and once it's live.
-- Same function as in core.sql; only the "locked" rule changes.
-- =============================================================================

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

  -- Once the client has seen the content it is locked until it goes back to
  -- draft, except that the caption and hashtags of an approved or scheduled
  -- post can still be finished before it's published.
  if old.status in ('client_review', 'approved', 'scheduled', 'published')
     and new.status = old.status
     and (
       (old.status in ('client_review', 'published')
         and (new.captions is distinct from old.captions or new.hashtags is distinct from old.hashtags))
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
