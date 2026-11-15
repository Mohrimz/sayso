-- =============================================================================
-- Phone notifications for the Sayso app (sayso-app, Flutter).
--
-- Each signed-in phone saves its Firebase Cloud Messaging token in
-- push_devices. Every new notification row (the same rows the website's bell
-- and the app's Alerts tab show) is handed to the sayso-push server function,
-- which sends it to that person's phones.
--
-- The function's address and a shared secret live in Vault
-- (sayso_push_url, sayso_push_secret). Until they're set, nothing is sent, so
-- this is safe to apply before push is switched on. Sending can never block
-- or fail the creation of a notification.
-- =============================================================================

create extension if not exists pg_net with schema extensions;

create table public.push_devices (
  token text primary key check (length(token) between 10 and 4096),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_devices_user on public.push_devices (user_id);

alter table public.push_devices enable row level security;

create policy "people see their own phones" on public.push_devices
  for select to authenticated using (user_id = (select auth.uid()));
create policy "people remove their own phones" on public.push_devices
  for delete to authenticated using (user_id = (select auth.uid()));

-- Saves this phone for the signed-in person. A phone that someone else used
-- before (signed out without unregistering) moves to whoever is signed in now.
create or replace function public.register_push_device(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_platform not in ('android', 'ios') then
    raise exception 'Unknown platform.';
  end if;
  insert into public.push_devices (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

revoke execute on function public.register_push_device(text, text) from anon, public;
grant execute on function public.register_push_device(text, text) to authenticated;

-- Hands each new notification to the sender, for people with a phone registered.
create or replace function public.push_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.push_devices where user_id = new.user_id) then
    return new;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'sayso_push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'sayso_push_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('content-type', 'application/json', 'x-sayso-push-secret', v_secret),
    timeout_milliseconds := 20000
  );
  return new;
exception when others then
  return new;
end;
$$;

create trigger push_notification
  after insert on public.notifications
  for each row execute function public.push_notification();
