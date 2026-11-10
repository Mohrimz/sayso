-- Editing a chat message. Only the person who wrote it can change its text,
-- through edit_message(); edited_at records when, so the chat can say
-- "edited". Files, replies and reactions stay as they are.
alter table public.messages add column edited_at timestamptz;

create or replace function public.edit_message(p_id uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_msg public.messages;
  v_body text := btrim(coalesce(p_body, ''), E' \t\r\n');
begin
  select * into v_msg from public.messages where id = p_id for update;
  if not found
     or v_msg.author_id is distinct from (select auth.uid())
     or not public.can_access_chat(v_msg.workspace_id, v_msg.channel) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_msg.deleted_at is not null then
    raise exception 'That message was deleted.';
  end if;
  if length(v_body) > 4000 then
    raise exception 'Messages can be up to 4000 characters.';
  end if;
  if v_body = '' and jsonb_array_length(v_msg.attachments) = 0 then
    raise exception 'Write a message, or delete it instead.';
  end if;
  if v_body = v_msg.body then
    return;
  end if;

  update public.messages set body = v_body, edited_at = now() where id = p_id;

  -- Keep notification previews in step with the new text.
  update public.notifications
  set body = public.message_preview(v_msg.author_id, v_body, v_msg.attachments)
  where type in ('message', 'mention')
    and workspace_id = v_msg.workspace_id
    and link = public.chat_link(v_msg.workspace_id, v_msg.channel)
    and body = public.message_preview(v_msg.author_id, v_msg.body, v_msg.attachments);
end;
$$;

revoke execute on function public.edit_message(uuid, text) from anon, public;
grant execute on function public.edit_message(uuid, text) to authenticated;
