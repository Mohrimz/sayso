-- =============================================================================
-- Offers: a client's sales, discounts and promotions, so the agency team knows
-- about them in time to plan posts.
--
-- Everyone in the workspace can see them. Client approvers and the agency team
-- can add them. The agency team, or the client approver who added an offer,
-- can change or remove it. Flyers and photos live in the workspace-files
-- bucket under <workspace>/offers/<random>/<file name>; `files` holds their
-- paths (the app checks access before it shows them).
-- =============================================================================

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  deal text check (deal is null or length(deal) <= 60),
  details text check (details is null or length(details) <= 2000),
  code text check (code is null or length(code) <= 40),
  starts_on date not null default current_date,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 10),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.offers (workspace_id, starts_on desc);

create trigger set_updated_at before update on public.offers
  for each row execute function public.set_updated_at();

alter table public.offers enable row level security;

create policy "members see offers" on public.offers
  for select to authenticated
  using (public.is_member(workspace_id));

create policy "agency and approvers add offers" on public.offers
  for insert to authenticated
  with check (
    (public.is_agency_member(workspace_id) or public.is_client_approver(workspace_id))
    and created_by = (select auth.uid())
  );

create policy "agency or the approver who added it edit offers" on public.offers
  for update to authenticated
  using (
    public.is_agency_member(workspace_id)
    or (created_by = (select auth.uid()) and public.is_client_approver(workspace_id))
  )
  with check (
    public.is_agency_member(workspace_id)
    or (created_by = (select auth.uid()) and public.is_client_approver(workspace_id))
  );

create policy "agency or the approver who added it remove offers" on public.offers
  for delete to authenticated
  using (
    public.is_agency_member(workspace_id)
    or (created_by = (select auth.uid()) and public.is_client_approver(workspace_id))
  );

-- The client and the author never change after an offer is added.
revoke update on public.offers from authenticated;
grant update (title, deal, details, code, starts_on, ends_on, files) on public.offers to authenticated;

-- New accounts get the offers email preference too (missing keys count as "on").
alter table public.profiles alter column notification_prefs set default
  '{"email_approvals": true, "email_comments": true, "email_changes": true, "email_tasks": true, "email_messages": true, "email_offers": true}'::jsonb;

-- Offers pages update live.
alter publication supabase_realtime add table public.offers;
