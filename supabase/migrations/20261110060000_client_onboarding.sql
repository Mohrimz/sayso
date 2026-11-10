-- First sign-in setup for clients: their name, job title, phone and photo,
-- their own email address and password (when the agency gave them a
-- placeholder login), then a walkthrough of the portal. onboarded_at records
-- when they finished. Everyone already using Sayso counts as done.
alter table public.profiles add column onboarded_at timestamptz;
update public.profiles set onboarded_at = now();

grant update (onboarded_at) on public.profiles to authenticated;
