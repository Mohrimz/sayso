-- Library: everyone on the client side (approvers and viewers) can add files,
-- and whatever a client adds lands in its own folder, "From the client", so
-- the agency's folders stay as the agency arranged them. Renaming, moving and
-- deleting files is still for agency admins only.
drop policy "agency and approvers add to the library" on public.assets;
create policy "members add to the library" on public.assets
  for insert to authenticated
  with check (public.is_member(workspace_id) and uploaded_by = (select auth.uid()));

create or replace function public.assets_client_folder()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.uploaded_by and p.side = 'client') then
    new.folder := 'From the client';
  end if;
  return new;
end;
$$;

create trigger assets_client_folder
  before insert on public.assets
  for each row execute function public.assets_client_folder();
