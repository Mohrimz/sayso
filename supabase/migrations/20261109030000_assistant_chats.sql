-- =============================================================================
-- Sayso assistant: saved conversations.
--
-- Each agency team member's chats with the assistant are private to them.
-- `messages` is the full Claude transcript (including tool results and signed
-- reasoning), replayed unchanged with the next question. `metas` records which
-- model answered each turn and its estimated cost. Deleting a profile deletes
-- its chats.
-- =============================================================================

create table public.assistant_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null default 'New chat' check (length(title) between 1 and 120),
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  metas jsonb not null default '[]'::jsonb check (jsonb_typeof(metas) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assistant_chats_user_recent on public.assistant_chats (user_id, updated_at desc);

alter table public.assistant_chats enable row level security;

-- Only the person who had the chat can see, change or delete it, and only
-- agency staff can start one.
create policy "own assistant chats" on public.assistant_chats
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.is_agency()));

revoke all on public.assistant_chats from anon;
