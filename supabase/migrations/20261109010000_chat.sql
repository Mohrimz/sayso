-- =============================================================================
-- Chat
--
-- Each client workspace has two conversations:
--   client  everyone in the workspace: the client's approvers and viewers plus
--           the agency team working on that client
--   team    agency only, for talking about the client privately. Clients never
--           see it (enforced below by row-level security, not by the UI).
--
-- Unread counts come from chat_reads (one "read up to" marker per person per
-- conversation). New messages create at most one unread notification per
-- person per conversation, so a busy chat doesn't flood inboxes or email.
-- =============================================================================

create type public.chat_channel as enum ('client', 'team');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  channel public.chat_channel not null default 'client',
  author_id uuid references public.profiles (id) on delete set null,
  body text not null default '' check (length(body) <= 4000),
  attachments jsonb not null default '[]'::jsonb,          -- [{path, name, mime, size}] in the chat-files bucket
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint message_has_content check (
    deleted_at is not null
    or length(btrim(body, E' \t\r\n')) > 0
    or jsonb_array_length(attachments) > 0
  )
);
create index on public.messages (workspace_id, channel, created_at desc);

create table public.chat_reads (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  channel public.chat_channel not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (workspace_id, channel, user_id)
);

-- New accounts get the chat email preference too (missing keys count as "on").
alter table public.profiles alter column notification_prefs set default
  '{"email_approvals": true, "email_comments": true, "email_changes": true, "email_tasks": true, "email_messages": true}'::jsonb;

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_access_chat(p_ws uuid, p_channel public.chat_channel)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_agency_member(p_ws) or (p_channel = 'client' and public.is_client_member(p_ws));
$$;

-- Storage paths are <workspace>/<channel>/<upload id>/<file>.
create or replace function public.can_access_chat_path(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_parts text[] := storage.foldername(p_name);
begin
  if coalesce(array_length(v_parts, 1), 0) < 2 or v_parts[2] not in ('client', 'team') then
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
  if coalesce(array_length(v_parts, 1), 0) <> 3 or v_parts[1] <> 'chat' or v_parts[3] not in ('client', 'team') then
    return false;
  end if;
  return public.can_access_chat(public.try_uuid(v_parts[2]), v_parts[3]::public.chat_channel);
end;
$$;

create or replace function public.chat_link(p_ws uuid, p_channel public.chat_channel)
returns text language sql stable security definer set search_path = '' as $$
  select '/w/' || public.workspace_slug(p_ws) || '/chat' || case when p_channel = 'team' then '/team' else '' end;
$$;

-- "Name: first 300 characters" (or "Name: sent 2 files"), as shown in notifications.
create or replace function public.message_preview(p_author uuid, p_body text, p_attachments jsonb)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(public.display_name(p_author), 'Someone') || ': ' || case
    when length(p_body) > 0 then left(p_body, 300)
    when jsonb_array_length(p_attachments) = 1 then 'sent a file'
    else 'sent ' || jsonb_array_length(p_attachments) || ' files'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Message guard: authors can't backdate messages, post as someone else, or
-- attach files from another conversation.
-- ---------------------------------------------------------------------------
create or replace function public.messages_before_insert()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_prefix text := new.workspace_id::text || '/' || new.channel::text || '/';
begin
  new.author_id := coalesce(auth.uid(), new.author_id);
  new.deleted_at := null;
  if current_user in ('authenticated', 'anon') then
    new.created_at := now();
  end if;
  new.body := btrim(coalesce(new.body, ''), E' \t\r\n');

  if jsonb_typeof(new.attachments) is distinct from 'array' then
    raise exception 'Attachments must be a list';
  end if;
  if jsonb_array_length(new.attachments) > 10 then
    raise exception 'You can attach up to 10 files to one message';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.attachments) a
    where jsonb_typeof(a) <> 'object'
       or coalesce(a ->> 'path', '') not like v_prefix || '%'
       or (a ->> 'path') like '%..%'
  ) then
    raise exception 'That file doesn''t belong to this conversation';
  end if;
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

-- ---------------------------------------------------------------------------
-- Notifications: one unread notification per person per conversation. Later
-- messages refresh it instead of adding more, and people who are reading the
-- chat right now (marker updated in the last two minutes) aren't notified.
-- ---------------------------------------------------------------------------
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

  with recipients as (
    select distinct r.uid, p.side
    from unnest(v_agency || v_clients) as r(uid)
    join public.profiles p on p.id = r.uid
    where r.uid is distinct from new.author_id
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

create trigger on_message_insert
  after insert on public.messages
  for each row execute function public.on_message_insert();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Marks a conversation read up to now and clears its unread notification.
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
  where user_id = v_uid and workspace_id = p_ws and type = 'message'
    and link = public.chat_link(p_ws, p_channel) and read_at is null;
end;
$$;

-- Authors (and agency admins) can delete a message. The text and file list are
-- cleared; the app removes the files themselves. Returns the removed files.
create or replace function public.delete_message(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_msg public.messages;
begin
  select * into v_msg from public.messages where id = p_id for update;
  if not found
     or not public.can_access_chat(v_msg.workspace_id, v_msg.channel)
     or not (v_msg.author_id = auth.uid() or public.is_agency_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_msg.deleted_at is not null then
    return '[]'::jsonb;
  end if;
  update public.messages set body = '', attachments = '[]'::jsonb, deleted_at = now() where id = p_id;

  -- Don't leave the deleted text behind in anyone's notification preview.
  update public.notifications
  set body = coalesce(public.display_name(v_msg.author_id), 'Someone') || ': message deleted'
  where type = 'message'
    and workspace_id = v_msg.workspace_id
    and link = public.chat_link(v_msg.workspace_id, v_msg.channel)
    and body = public.message_preview(v_msg.author_id, v_msg.body, v_msg.attachments);

  return v_msg.attachments;
end;
$$;

-- One row per conversation the caller can see: unread count and the latest
-- message. Runs with the caller's permissions, so row-level security applies.
create or replace function public.chat_threads()
returns table (
  workspace_id uuid,
  channel public.chat_channel,
  unread int,
  last_at timestamptz,
  last_author uuid,
  last_body text,
  last_files int,
  last_deleted boolean
)
language sql stable set search_path = '' as $$
  with latest as (
    select distinct on (m.workspace_id, m.channel)
      m.workspace_id, m.channel, m.created_at, m.author_id, m.body,
      jsonb_array_length(m.attachments) as files, m.deleted_at is not null as deleted
    from public.messages m
    order by m.workspace_id, m.channel, m.created_at desc
  ), counts as (
    select m.workspace_id, m.channel, count(*)::int as unread
    from public.messages m
    left join public.chat_reads r
      on r.workspace_id = m.workspace_id and r.channel = m.channel and r.user_id = (select auth.uid())
    where m.author_id is distinct from (select auth.uid())
      and m.deleted_at is null
      and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
    group by m.workspace_id, m.channel
  )
  select l.workspace_id, l.channel, coalesce(c.unread, 0), l.created_at, l.author_id,
         left(l.body, 160), l.files, l.deleted
  from latest l
  left join counts c on c.workspace_id = l.workspace_id and c.channel = l.channel;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.messages enable row level security;
alter table public.chat_reads enable row level security;

create policy "see messages" on public.messages
  for select to authenticated
  using (public.can_access_chat(workspace_id, channel));
create policy "post messages" on public.messages
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_access_chat(workspace_id, channel));
-- No update or delete policies: changes go through delete_message().

-- Read markers are visible to everyone in the conversation ("Seen by ...")
-- and written only through mark_chat_read().
create policy "see read markers" on public.chat_reads
  for select to authenticated
  using (public.can_access_chat(workspace_id, channel));

revoke all on public.messages, public.chat_reads from anon;
revoke update, delete on public.messages from authenticated;
revoke insert, update, delete on public.chat_reads from authenticated;

revoke execute on function public.mark_chat_read(uuid, public.chat_channel) from anon, public;
revoke execute on function public.delete_message(uuid) from anon, public;
revoke execute on function public.chat_threads() from anon, public;
grant execute on function public.mark_chat_read(uuid, public.chat_channel) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.chat_threads() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket laid out as <workspace>/<channel>/<upload id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 52428800)
on conflict (id) do nothing;

create policy "chat files: people in the conversation read" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-files' and public.can_access_chat_path(name));
create policy "chat files: people in the conversation upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-files' and public.can_access_chat_path(name));
create policy "chat files: uploader or admin deletes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-files'
    and (owner_id = (select auth.uid())::text or (public.is_agency_admin() and public.can_access_chat_path(name)))
  );

-- ---------------------------------------------------------------------------
-- Realtime: new messages and read markers stream to the page. Typing and
-- presence use private broadcast channels limited to people in the chat.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages, public.chat_reads;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    create policy "chat members receive typing and presence" on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension in ('broadcast', 'presence')
        and public.can_join_chat_topic((select realtime.topic()))
      );
    create policy "chat members send typing and presence" on realtime.messages
      for insert to authenticated
      with check (
        realtime.messages.extension in ('broadcast', 'presence')
        and public.can_join_chat_topic((select realtime.topic()))
      );
  else
    raise warning 'realtime.messages not found: typing indicators need its policies (re-run this block once Realtime is up)';
  end if;
end;
$$;
