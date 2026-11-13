-- A third conversation per client: "direct", between the agency admins and the
-- client only (team members can't see it). The new channel value is added
-- here on its own; the rules that use it are in the next migration, because a
-- new enum value can't be used in the transaction that creates it.
alter type public.chat_channel add value if not exists 'direct';
