-- =============================================================================
-- Offers become plain announcements from the client: one message, like "20%
-- off all earrings this weekend, code WEEKEND20". Only the client side (the
-- client's approvers and viewers) can post one, and the agency team reads it
-- and plans around it. No dates, codes or files, and no editing after posting;
-- the person who posted one can remove it.
--
-- There were no offers yet when this changed, so the old fields are dropped.
-- =============================================================================

drop policy if exists "agency and approvers add offers" on public.offers;
drop policy if exists "agency or the approver who added it edit offers" on public.offers;
drop policy if exists "agency or the approver who added it remove offers" on public.offers;

alter table public.offers
  drop column title,
  drop column deal,
  drop column code,
  drop column starts_on,
  drop column ends_on,
  drop column files;

alter table public.offers rename column details to message;
delete from public.offers where message is null or btrim(message) = '';
alter table public.offers alter column message set not null;
alter table public.offers add constraint offers_message_length check (length(btrim(message)) between 1 and 2000);

create index offers_workspace_recent on public.offers (workspace_id, created_at desc);

-- Only the client side posts offers.
create policy "client side posts offers" on public.offers
  for insert to authenticated
  with check (public.is_client_member(workspace_id) and created_by = (select auth.uid()));

-- The person who posted an offer can take it down.
create policy "authors remove their offers" on public.offers
  for delete to authenticated
  using (created_by = (select auth.uid()) and public.is_client_member(workspace_id));

-- Nothing is edited after posting.
revoke update on public.offers from authenticated;
