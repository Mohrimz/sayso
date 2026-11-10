-- =============================================================================
-- "Last seen": when each person last used Sayso, shown to agency admins on the
-- Team page and on profile pages.
--
-- Kept out of profiles on purpose. Clients can read some agency profiles, and
-- nobody but agency admins (and the person themselves) should see activity.
-- The time is only written by touch_last_seen(), which uses the database
-- clock, so it can't be faked.
-- =============================================================================

create table public.user_activity (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.user_activity enable row level security;

create policy "admins and self see activity" on public.user_activity
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_agency_admin());

revoke insert, update, delete on public.user_activity from anon, authenticated;

-- Called by the app while someone has Sayso open. Writes at most once every
-- two minutes per person, however often it's called.
create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = '' as $$
  insert into public.user_activity (user_id, last_seen_at)
  select (select auth.uid()), now()
  where (select auth.uid()) is not null
    and exists (select 1 from public.profiles where id = (select auth.uid()))
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at
    where public.user_activity.last_seen_at < now() - interval '2 minutes';
$$;

revoke execute on function public.touch_last_seen() from anon, public;
grant execute on function public.touch_last_seen() to authenticated;

-- Start everyone off from their last sign-in.
insert into public.user_activity (user_id, last_seen_at)
select p.id, u.last_sign_in_at
from public.profiles p
join auth.users u on u.id = p.id
where u.last_sign_in_at is not null
on conflict (user_id) do nothing;
