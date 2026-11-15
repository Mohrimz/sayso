-- =============================================================================
-- Published posts that disappear from Instagram (deleted or archived there).
--
-- Instagram never says when a post is deleted, so Sayso looks: when someone
-- opens a plan or a published post (at most every few hours per client, to
-- stay inside Make's allowance), it lists the client's latest Instagram posts
-- and flags published posts that should be in that list but aren't.
--
--   removed_at     when Sayso found the post missing. Such posts leave the plan
--                  and the counts; the agency sees them under "Not on Instagram
--                  anymore", where they can be restored or deleted for good.
--   removed_from   where it went missing ('instagram').
--   keep_on_plan   the team restored it: never flag it again.
--   workspaces.posts_checked_at   the last check, so checks stay rare.
-- =============================================================================

alter table public.content_items
  add column removed_at timestamptz,
  add column removed_from text check (removed_from is null or removed_from in ('instagram', 'facebook')),
  add column keep_on_plan boolean not null default false;

alter table public.workspaces add column posts_checked_at timestamptz;

create index content_items_removed on public.content_items (workspace_id) where removed_at is not null;

-- Tell the agency when a post goes missing.
create or replace function public.on_post_removed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.removed_at is not null and old.removed_at is null then
    perform public.notify_users(
      public.agency_recipients(new.id),
      new.workspace_id,
      'post_removed',
      'Not on ' || case when new.removed_from = 'facebook' then 'Facebook' else 'Instagram' end || ' anymore: ' || new.title,
      'It was deleted or archived there, so it''s off the plan. Restore it from the plan if that''s a mistake.',
      '/w/' || public.workspace_slug(new.workspace_id) || '/content/' || new.id
    );
  end if;
  return new;
end;
$$;

create trigger on_post_removed
  after update of removed_at on public.content_items
  for each row execute function public.on_post_removed();
