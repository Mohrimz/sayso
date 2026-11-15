-- =============================================================================
-- "Last seen" for people who use the Sayso phone app.
--
-- The website marks people as seen with touch_last_seen() while it's open. The
-- first app release (1.0.0) never calls it, so people who only use the app
-- showed as "Hasn't signed in yet". The app already signs in and registers the
-- phone for notifications every time it opens, so both now count as being seen:
--   * signing in (app or website) updates user_activity;
--   * register_push_device() updates it, so opening the app keeps it fresh;
--   * a one-off backfill fills in anyone who signed in before this.
-- Like touch_last_seen(), times come from the database clock and are written at
-- most every two minutes. Nothing here can block or fail a sign-in.
-- =============================================================================

-- Opening the app (it registers the phone each time) counts as being seen.
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

  insert into public.user_activity (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at
    where public.user_activity.last_seen_at < now() - interval '2 minutes';
end;
$$;

revoke execute on function public.register_push_device(text, text) from anon, public;
grant execute on function public.register_push_device(text, text) to authenticated;

-- Signing in counts as being seen.
create or replace function public.seen_on_sign_in()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at
     and exists (select 1 from public.profiles where id = new.id) then
    insert into public.user_activity (user_id, last_seen_at)
    values (new.id, now())
    on conflict (user_id) do update
      set last_seen_at = excluded.last_seen_at
      where public.user_activity.last_seen_at < now() - interval '2 minutes';
  end if;
  return new;
exception when others then
  return new;
end;
$$;

revoke execute on function public.seen_on_sign_in() from anon, authenticated, public;

create trigger seen_on_sign_in
  after update of last_sign_in_at on auth.users
  for each row execute function public.seen_on_sign_in();

-- Anyone who already signed in (for example in the app) but was never marked as seen.
insert into public.user_activity (user_id, last_seen_at)
select u.id, greatest(u.last_sign_in_at, coalesce(d.last_open, u.last_sign_in_at))
from auth.users u
join public.profiles p on p.id = u.id
left join (
  select user_id, max(updated_at) as last_open from public.push_devices group by user_id
) d on d.user_id = u.id
where u.last_sign_in_at is not null
on conflict (user_id) do update
  set last_seen_at = excluded.last_seen_at
  where public.user_activity.last_seen_at < excluded.last_seen_at;
