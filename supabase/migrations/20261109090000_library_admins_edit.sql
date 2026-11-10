-- =============================================================================
-- Library: only agency admins rename, move, annotate or delete files.
-- Everyone in the workspace can still see and download them, and the agency
-- team and client approvers can still upload.
-- =============================================================================

drop policy if exists "agency or uploader edit library files" on public.assets;
drop policy if exists "agency or uploader delete library files" on public.assets;

create policy "admins edit library files" on public.assets
  for update to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

create policy "admins delete library files" on public.assets
  for delete to authenticated
  using (public.is_agency_admin());
