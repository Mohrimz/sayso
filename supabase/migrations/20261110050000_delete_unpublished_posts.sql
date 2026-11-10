-- The agency team (admins and team members) can delete a post at any stage
-- until it's published: in progress, waiting for the client, or ready.
-- Published posts can't be deleted.
drop policy "agency deletes content" on public.content_items;
create policy "agency deletes content" on public.content_items
  for delete to authenticated
  using (public.is_agency_member(workspace_id) and status <> 'published');
