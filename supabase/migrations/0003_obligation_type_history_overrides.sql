-- ===========================================================================
-- A short-term month has TWO obligations, not one.
--
-- `declarations` held one row per property per month. A short-term property
-- now has a stay declaration and a ΤΑΚΚ obligation, with different deadlines,
-- so (property_id, month) no longer identifies a row. Every row that exists
-- today is a stay declaration.
--
-- Also adds the two stores that go with it:
--   ledger_history     append-only edit log
--   deadline_overrides the exceptions to derived deadlines
--
-- Long-term rent is untouched: still one row per property per month.
--
-- ARCHITECTURAL RULE (§6) still holds. Nothing here stores a derived value.
-- No rate, no calculated amount, no filing status: Domus cannot know whether
-- anything was filed. `amount` is the landlord's own note of what they typed.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- declarations — add the obligation type
-- ---------------------------------------------------------------------------
alter table public.declarations
  add column if not exists type text not null default 'stay'
    check (type in ('stay', 'takk'));

-- Existing rows are all stay declarations. The default above has already
-- backfilled them; this is here so a re-run on a partially migrated database
-- still lands somewhere sane.
update public.declarations set type = 'stay' where type is null;

alter table public.declarations
  drop constraint if exists declarations_property_id_month_key;

alter table public.declarations
  drop constraint if exists declarations_property_id_month_type_key;

alter table public.declarations
  add constraint declarations_property_id_month_type_key
  unique (property_id, month, type);

-- ---------------------------------------------------------------------------
-- ledger_history — APPEND ONLY.
--
-- The value of an edit log is that it cannot be quietly rewritten, so there is
-- no update or delete policy below. Inserts and selects only. Do not add one.
-- Rows outlive the record they describe; they are removed only when the whole
-- property is deleted and the cascade takes them.
-- ---------------------------------------------------------------------------
create table if not exists public.ledger_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  property_id  uuid not null references public.properties (id) on delete cascade,
  month        text not null check (month ~ '^\d{4}-\d{2}$'),
  ts           timestamptz not null default now(),
  field        text not null,        -- 'stay.amount', 'takk.amount', 'rent.date', …
  from_value   text,                 -- null => the field had no value before
  to_value     text,
  created_at   timestamptz not null default now()
);

create index if not exists ledger_history_lookup_idx
  on public.ledger_history (property_id, month, ts);

-- ---------------------------------------------------------------------------
-- deadline_overrides — the exception, never the rule.
--
-- Default deadlines are DERIVED in ledger.ts and are not stored. A row here
-- exists only where the landlord moved a date or snoozed a reminder.
-- `target` covers long-term rent too, which has a payment day of its own.
-- ---------------------------------------------------------------------------
create table if not exists public.deadline_overrides (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  property_id   uuid not null references public.properties (id) on delete cascade,
  month         text not null check (month ~ '^\d{4}-\d{2}$'),
  target        text not null check (target in ('stay', 'takk', 'rent')),
  due_date      date,               -- replaces the derived deadline
  snoozed_until date,               -- holds the reminder back, does not move the deadline
  updated_at    timestamptz not null default now(),
  unique (property_id, month, target)
);

create index if not exists deadline_overrides_property_id_idx
  on public.deadline_overrides (property_id);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.ledger_history     enable row level security;
alter table public.deadline_overrides enable row level security;

-- Append only: insert and select, deliberately no update or delete.
drop policy if exists "own history insert" on public.ledger_history;
create policy "own history insert" on public.ledger_history
  for insert with check (auth.uid() = user_id);

drop policy if exists "own history read" on public.ledger_history;
create policy "own history read" on public.ledger_history
  for select using (auth.uid() = user_id);

drop policy if exists "own deadline overrides" on public.deadline_overrides;
create policy "own deadline overrides" on public.deadline_overrides
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
