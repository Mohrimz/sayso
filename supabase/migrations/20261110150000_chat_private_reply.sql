-- =============================================================================
-- "Reply privately": a message in a client's Direct chat (agency admins + the
-- client) may quote a message from that client's shared chat.
--
-- Everyone in a Direct chat can already read the client chat, so the quote
-- reveals nothing new. Any other cross-conversation reply is still dropped.
-- =============================================================================

create or replace function public.messages_clean_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from public.messages m
    where m.id = new.reply_to
      and m.workspace_id = new.workspace_id
      and (m.channel = new.channel or (new.channel = 'direct' and m.channel = 'client'))
  ) then
    new.reply_to := null;
  end if;
  return new;
end;
$$;
