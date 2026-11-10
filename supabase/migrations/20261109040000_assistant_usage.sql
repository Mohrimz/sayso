-- =============================================================================
-- Sayso assistant: spending allowance per person, in 24-hour periods.
--
-- A period starts with a person's first question and lasts 24 hours; the
-- first question after it ends starts the next one. Each row is one period
-- with the estimated Claude API cost of its questions. People can read their
-- own rows (to show what's left) but can't change them: only the server, using
-- the service role, adds to them. Deleting chats or editing data from the
-- browser can't reset the allowance.
-- =============================================================================

create table public.assistant_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  window_start timestamptz not null default now(),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  questions integer not null default 0 check (questions >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, window_start)
);

alter table public.assistant_usage enable row level security;

create policy "see own assistant usage" on public.assistant_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.assistant_usage from anon;
revoke insert, update, delete on public.assistant_usage from authenticated;

-- Adds one question's cost to the person's current 24-hour period, starting a
-- new period if the last one has ended. Returns the period's new total.
create or replace function public.add_assistant_usage(p_user uuid, p_cost numeric)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz;
  v_total numeric;
begin
  -- One writer per person at a time, so two answers finishing together
  -- can't open two periods.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select window_start into v_start
  from public.assistant_usage
  where user_id = p_user and window_start > now() - interval '24 hours'
  order by window_start desc
  limit 1;

  if v_start is null then
    insert into public.assistant_usage (user_id, window_start, cost_usd, questions)
    values (p_user, now(), greatest(p_cost, 0), 1)
    returning cost_usd into v_total;
  else
    update public.assistant_usage
    set cost_usd = cost_usd + greatest(p_cost, 0), questions = questions + 1, updated_at = now()
    where user_id = p_user and window_start = v_start
    returning cost_usd into v_total;
  end if;
  return v_total;
end;
$$;

revoke execute on function public.add_assistant_usage(uuid, numeric) from anon, authenticated, public;
grant execute on function public.add_assistant_usage(uuid, numeric) to service_role;
