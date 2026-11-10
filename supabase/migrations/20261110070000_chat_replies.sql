-- Replying to a message in chat: messages.reply_to points at the message
-- being answered. A reply can only point at a message in the same
-- conversation; anything else is dropped. If the original is removed from the
-- database, the reply stays and simply loses its quote.
alter table public.messages
  add column reply_to uuid references public.messages (id) on delete set null;

create or replace function public.messages_clean_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from public.messages m
    where m.id = new.reply_to and m.workspace_id = new.workspace_id and m.channel = new.channel
  ) then
    new.reply_to := null;
  end if;
  return new;
end;
$$;

create trigger messages_clean_reply
  before insert on public.messages
  for each row execute function public.messages_clean_reply();
