-- =============================================================================
-- @mentions in chat.
--
-- The message text keeps plain "@Name", so previews, emails and the Inbox read
-- naturally. messages.mentions lists who was mentioned. The database keeps it
-- to people who can read that conversation (never the author), and each of
-- them gets a "mentioned you" notification instead of the general "new
-- message" one. Opening the chat clears both kinds.
-- =============================================================================

alter table public.messages
  add column mentions uuid[] not null default '{}';

-- Whether a person can read a conversation (the same rule as can_access_chat,
-- for any user rather than the signed-in one).
create or replace function public.user_can_access_chat(p_user uuid, p_ws uuid, p_channel public.chat_channel)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_user and side = 'agency' and agency_role = 'admin')
      or exists (
        select 1 from public.workspace_members m
        where m.workspace_id = p_ws and m.user_id = p_user
          and (m.role = 'team_member' or (p_channel = 'client' and m.role in ('approver', 'viewer')))
      );
$$;

create or replace function public.messages_clean_mentions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.mentions := coalesce(array(
    select distinct u
    from unnest(coalesce(new.mentions, '{}')) as u
    where u is distinct from new.author_id
      and public.user_can_access_chat(u, new.workspace_id, new.channel)
    limit 20
  ), '{}');
  return new;
end;
$$;

create trigger messages_clean_mentions
  before insert on public.messages
  for each row execute function public.messages_clean_mentions();

-- Notifications for a new message (as before), plus mentions.
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
  v_where := v_ws_name || case when new.channel = 'team' then ' team chat' else ' chat' end;
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

  -- Agency side: the client's assigned team, plus admins who have taken part.
  -- If nobody is assigned and no admin has joined in, every admin hears about it.
  v_agency := array(
    select m.user_id from public.workspace_members m
    where m.workspace_id = new.workspace_id and m.role = 'team_member'
    union
    select x.author_id from public.messages x
    join public.profiles p on p.id = x.author_id
    where x.workspace_id = new.workspace_id and x.channel = new.channel
      and p.side = 'agency' and p.agency_role = 'admin'
  );
  if coalesce(cardinality(v_agency), 0) = 0 then
    v_agency := array(select id from public.profiles where side = 'agency' and agency_role = 'admin');
  end if;

  if new.channel = 'client' then
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

-- Opening a conversation clears its message and mention notifications.
create or replace function public.mark_chat_read(p_ws uuid, p_channel public.chat_channel)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.can_access_chat(p_ws, p_channel) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.chat_reads (workspace_id, channel, user_id, last_read_at)
  values (p_ws, p_channel, v_uid, now())
  on conflict (workspace_id, channel, user_id) do update set last_read_at = excluded.last_read_at;

  update public.notifications
  set read_at = now()
  where user_id = v_uid and workspace_id = p_ws and type in ('message', 'mention')
    and link = public.chat_link(p_ws, p_channel) and read_at is null;
end;
$$;
