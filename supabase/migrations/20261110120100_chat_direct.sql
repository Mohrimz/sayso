-- The direct chat: agency admins and the client's own people, nobody else.
--   client  the client and the whole agency team on that client (as before)
--   team    agency only (as before)
--   direct  agency admins + the client's approvers and viewers
create or replace function public.can_access_chat(p_ws uuid, p_channel public.chat_channel)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_channel::text
    when 'client' then public.is_agency_member(p_ws) or public.is_client_member(p_ws)
    when 'team' then public.is_agency_member(p_ws)
    when 'direct' then public.is_agency_admin() or public.is_client_member(p_ws)
    else false
  end;
$$;

-- Storage paths are <workspace>/<channel>/<upload id>/<file>.
create or replace function public.can_access_chat_path(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_parts text[] := storage.foldername(p_name);
begin
  if coalesce(array_length(v_parts, 1), 0) < 2 or v_parts[2] not in ('client', 'team', 'direct') then
    return false;
  end if;
  return public.can_access_chat(public.try_uuid(v_parts[1]), v_parts[2]::public.chat_channel);
end;
$$;

-- Realtime topics for typing indicators and presence: chat:<workspace>:<channel>.
create or replace function public.can_join_chat_topic(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_parts text[] := string_to_array(p_topic, ':');
begin
  if coalesce(array_length(v_parts, 1), 0) <> 3 or v_parts[1] <> 'chat' or v_parts[3] not in ('client', 'team', 'direct') then
    return false;
  end if;
  return public.can_access_chat(public.try_uuid(v_parts[2]), v_parts[3]::public.chat_channel);
end;
$$;

create or replace function public.chat_link(p_ws uuid, p_channel public.chat_channel)
returns text language sql stable security definer set search_path = '' as $$
  select '/w/' || public.workspace_slug(p_ws) || '/chat'
    || case p_channel::text when 'team' then '/team' when 'direct' then '/direct' else '' end;
$$;

-- Notifications: a direct message goes to the admins and the client, never to team members.
create or replace function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ws_name text;
  v_author text := coalesce(public.display_name(new.author_id), 'Someone');
  v_link text := public.chat_link(new.workspace_id, new.channel);
  v_where text;
  v_preview text;
  v_agency uuid[];
  v_clients uuid[] := '{}';
begin
  select name into v_ws_name from public.workspaces where id = new.workspace_id;
  v_where := v_ws_name || case new.channel::text when 'team' then ' team chat' when 'direct' then ' direct chat' else ' chat' end;
  v_preview := public.message_preview(new.author_id, new.body, new.attachments);

  -- Mentioned people: their own notification, unless they're reading the chat right now.
  insert into public.notifications (user_id, workspace_id, type, title, body, link)
  select u, new.workspace_id, 'mention', v_author || ' mentioned you in ' || v_where, v_preview, v_link
  from unnest(new.mentions) as u
  where not exists (
    select 1 from public.chat_reads cr
    where cr.workspace_id = new.workspace_id and cr.channel = new.channel and cr.user_id = u
      and cr.last_read_at > now() - interval '2 minutes'
  );

  -- Agency side: the client's assigned team, plus every agency admin.
  v_agency := array(
    select m.user_id from public.workspace_members m
    where m.workspace_id = new.workspace_id and m.role = 'team_member'
      and new.channel::text <> 'direct' -- the direct chat is for admins and the client only
    union
    select p.id from public.profiles p
    where p.side = 'agency' and p.agency_role = 'admin'
  );

  if new.channel::text in ('client', 'direct') then
    v_clients := array(
      select m.user_id from public.workspace_members m
      where m.workspace_id = new.workspace_id and m.role in ('approver', 'viewer')
    );
  end if;

  -- Everyone else: one unread "new message" notification per conversation, refreshed by later messages.
  with recipients as (
    select distinct r.uid, p.side
    from unnest(v_agency || v_clients) as r(uid)
    join public.profiles p on p.id = r.uid
    where r.uid is distinct from new.author_id
      and r.uid <> all (new.mentions)
      and not exists (
        select 1 from public.chat_reads cr
        where cr.workspace_id = new.workspace_id and cr.channel = new.channel and cr.user_id = r.uid
          and cr.last_read_at > now() - interval '2 minutes'
      )
  ), refreshed as (
    update public.notifications n
    set title = 'New messages in ' || v_where,
        body = v_preview,
        created_at = now()
    from recipients r
    where n.user_id = r.uid and n.type = 'message' and n.link = v_link and n.read_at is null
    returning n.user_id
  )
  insert into public.notifications (user_id, workspace_id, type, title, body, link)
  select r.uid, new.workspace_id, 'message',
         case when r.side = 'agency' then 'New message in ' || v_where else 'New message from ' || v_author end,
         v_preview, v_link
  from recipients r
  where r.uid not in (select user_id from refreshed);

  return new;
end;
$$;
