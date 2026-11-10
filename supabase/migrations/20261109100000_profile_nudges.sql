-- =============================================================================
-- Profile nudges for clients.
--
-- A client whose profile is missing their name, job title, phone number or
-- photo gets a "Complete your profile" notification linking to the Account
-- page. It's sent when they're added to a client workspace (and once now, for
-- everyone already there). The moment the last detail is filled in, the
-- reminder is marked read and "Your profile is complete" arrives instead.
--
-- Both are in-app only (emailed_at is set, so no email goes out), and they
-- update live in the notification bell (notifications are in Realtime).
-- =============================================================================

-- What's missing from a profile, in words, e.g. {your job title, a profile photo}.
create or replace function public.profile_missing(p public.profiles)
returns text[] language sql immutable set search_path = '' as $$
  select array_remove(array[
    case when nullif(btrim(coalesce(p.full_name, '')), '') is null then 'your name' end,
    case when p.job_title is null then 'your job title' end,
    case when p.phone is null then 'a phone number' end,
    case when p.avatar_path is null then 'a profile photo' end
  ], null);
$$;

-- "a, b and c"
create or replace function public.join_words(p_words text[])
returns text language sql immutable set search_path = '' as $$
  select case coalesce(array_length(p_words, 1), 0)
    when 0 then ''
    when 1 then p_words[1]
    else array_to_string(p_words[1:array_length(p_words, 1) - 1], ', ') || ' and ' || p_words[array_length(p_words, 1)]
  end;
$$;

-- Sends the reminder to a client with an incomplete profile, unless one is
-- already waiting unread.
create or replace function public.nudge_profile(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.profiles;
  v_missing text[];
begin
  select * into v from public.profiles where id = p_user;
  if not found or v.side <> 'client' then
    return;
  end if;
  v_missing := public.profile_missing(v);
  if coalesce(array_length(v_missing, 1), 0) = 0 then
    return;
  end if;
  if exists (
    select 1 from public.notifications
    where user_id = p_user and type = 'profile_incomplete' and read_at is null
  ) then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, link, emailed_at)
  values (
    p_user,
    'profile_incomplete',
    'Complete your profile',
    'Add ' || public.join_words(v_missing) || ', so the team knows who they''re working with.',
    '/account',
    now()
  );
end;
$$;

revoke execute on function public.nudge_profile(uuid) from anon, authenticated, public;

-- Joining a client workspace as an approver or viewer: remind them if needed.
create or replace function public.on_client_member_added()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role in ('approver', 'viewer') then
    perform public.nudge_profile(new.user_id);
  end if;
  return new;
end;
$$;

create trigger on_client_member_added
  after insert on public.workspace_members
  for each row execute function public.on_client_member_added();

-- Profile just became complete: close the reminder and say well done.
create or replace function public.on_profile_completed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.side = 'client'
     and coalesce(array_length(public.profile_missing(old), 1), 0) > 0
     and coalesce(array_length(public.profile_missing(new), 1), 0) = 0 then
    update public.notifications
    set read_at = now()
    where user_id = new.id and type = 'profile_incomplete' and read_at is null;

    insert into public.notifications (user_id, type, title, body, link, emailed_at)
    values (
      new.id,
      'profile_complete',
      'Your profile is complete',
      'Thanks! The team can now see your name, role, phone number and photo.',
      '/account',
      now()
    );
  end if;
  return new;
end;
$$;

create trigger on_profile_completed
  after update of full_name, job_title, phone, avatar_path on public.profiles
  for each row execute function public.on_profile_completed();

-- Everyone already in a client workspace with an incomplete profile.
select public.nudge_profile(p.id)
from public.profiles p
where p.side = 'client'
  and exists (select 1 from public.workspace_members m where m.user_id = p.id and m.role in ('approver', 'viewer'));
