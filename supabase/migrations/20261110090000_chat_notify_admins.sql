-- Chat notifications: agency admins are now told about every new message in
-- every client's chats. Before, an admin only heard about a chat they had
-- already written in (or one with no team assigned), so a client's first
-- messages could go unnoticed. Everything else is unchanged: one unread
-- notification per conversation, refreshed by later messages, and none for
-- someone who is reading that chat right now.
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

  -- Agency side: the client's assigned team, plus every agency admin.
  v_agency := array(
    select m.user_id from public.workspace_members m
    where m.workspace_id = new.workspace_id and m.role = 'team_member'
    union
    select p.id from public.profiles p
    where p.side = 'agency' and p.agency_role = 'admin'
  );

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
