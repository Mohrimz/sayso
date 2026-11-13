-- =============================================================================
-- Read receipts ("Seen by") are for the agency only.
--
-- Everyone still has their own "read up to" marker (it drives their unread
-- counts), but only agency staff may read other people's markers. Clients see
-- just their own row, so they can't tell when anyone read their messages,
-- through the app or through the API / realtime.
--
-- Functions that read chat_reads for unread counts and notifications are
-- security definer and are unaffected.
-- =============================================================================

drop policy if exists "see read markers" on public.chat_reads;

create policy "see read markers" on public.chat_reads
  for select to authenticated
  using (
    public.can_access_chat(workspace_id, channel)
    and (user_id = (select auth.uid()) or public.is_agency())
  );
