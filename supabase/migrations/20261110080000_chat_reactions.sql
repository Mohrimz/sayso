-- Emoji reactions on chat messages. messages.reactions maps an emoji to the
-- people who reacted with it: {"👍": ["<user id>", ...]}. People add or remove
-- their own reaction through toggle_reaction(); because it's a column on the
-- message, everyone in the chat sees the change live like any other update.
alter table public.messages
  add column reactions jsonb not null default '{}'::jsonb check (jsonb_typeof(reactions) = 'object');

create or replace function public.toggle_reaction(p_message uuid, p_emoji text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_msg public.messages;
  v_me text := (select auth.uid())::text;
  v_people jsonb;
  v_next jsonb;
begin
  if p_emoji not in ('👍', '❤️', '😂', '😮', '😢', '🙏') then
    raise exception 'That reaction isn''t available.';
  end if;
  select * into v_msg from public.messages where id = p_message for update;
  if not found or v_me is null or not public.can_access_chat(v_msg.workspace_id, v_msg.channel) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_msg.deleted_at is not null then
    raise exception 'That message was deleted.';
  end if;

  v_people := coalesce(v_msg.reactions -> p_emoji, '[]'::jsonb);
  if v_people ? v_me then
    v_people := v_people - v_me;
  else
    v_people := v_people || to_jsonb(v_me);
  end if;
  v_next := case when jsonb_array_length(v_people) = 0 then v_msg.reactions - p_emoji
                 else jsonb_set(v_msg.reactions, array[p_emoji], v_people) end;
  update public.messages set reactions = v_next where id = p_message;
  return v_next;
end;
$$;

revoke execute on function public.toggle_reaction(uuid, text) from anon, public;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;

-- A deleted message loses its reactions too (otherwise unchanged).
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
  update public.messages set body = '', attachments = '[]'::jsonb, reactions = '{}'::jsonb, deleted_at = now() where id = p_id;

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
