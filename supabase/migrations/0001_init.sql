-- ===========================================================================
-- DOMUS — database schema
--
-- Run this whole file once in your Supabase project:
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run
--
-- ARCHITECTURAL RULE (source of truth §6): compliance status, alerts and
-- notifications are DERIVED AT READ TIME from certificate + ledger data.
-- They are NEVER stored. That is why there is no `compliance` column on
-- `properties` and no `notifications` table. Do not add them.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated user
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  onboarded   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  address     text,
  city        text,
  type        text not null check (type in ('short', 'long')),
  size        text,               -- e.g. '82 m²'
  photo_url   text,

  -- short-term fields
  nightly     text,               -- e.g. '€120'
  min_stay    text,               -- e.g. '2 nights'
  ama         text,               -- AADE property registry number

  -- long-term fields
  rent        text,               -- e.g. '€750'
  tenant      text,
  payday      integer check (payday between 1 and 31),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists properties_user_id_idx on public.properties (user_id);

-- ---------------------------------------------------------------------------
-- certificates — the raw data compliance is derived from
-- ---------------------------------------------------------------------------
create table if not exists public.certificates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  property_id  uuid not null references public.properties (id) on delete cascade,
  name         text not null,
  file_name    text,              -- null => Missing
  expiry       date,              -- null => no expiry set (treated as Valid)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (property_id, name)
);

create index if not exists certificates_property_id_idx on public.certificates (property_id);

-- ---------------------------------------------------------------------------
-- declarations — short-term AADE filings, one per property per month
-- month is 'YYYY-MM'. Keyed by property id, never by a slug of its name.
-- ---------------------------------------------------------------------------
create table if not exists public.declarations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  property_id  uuid not null references public.properties (id) on delete cascade,
  month        text not null check (month ~ '^\d{4}-\d{2}$'),
  zero         boolean not null default false,
  amount       numeric(12, 2),
  recorded_at  timestamptz not null default now(),
  unique (property_id, month)
);

create index if not exists declarations_property_id_idx on public.declarations (property_id);

-- ---------------------------------------------------------------------------
-- rent_payments — long-term rent confirmations, one per property per month
-- ---------------------------------------------------------------------------
create table if not exists public.rent_payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  property_id  uuid not null references public.properties (id) on delete cascade,
  month        text not null check (month ~ '^\d{4}-\d{2}$'),
  amount       numeric(12, 2) not null,
  paid_date    date,
  note         text,
  recorded_at  timestamptz not null default now(),
  unique (property_id, month)
);

create index if not exists rent_payments_property_id_idx on public.rent_payments (property_id);

-- ---------------------------------------------------------------------------
-- dismissed_notifications — the ONLY persisted notification state.
-- The feed itself is always recomputed. §6.3
-- ---------------------------------------------------------------------------
create table if not exists public.dismissed_notifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  notification_id  text not null,
  created_at       timestamptz not null default now(),
  unique (user_id, notification_id)
);

-- ===========================================================================
-- Row Level Security — a landlord only ever sees their own portfolio
-- ===========================================================================
alter table public.profiles                enable row level security;
alter table public.properties              enable row level security;
alter table public.certificates            enable row level security;
alter table public.declarations            enable row level security;
alter table public.rent_payments           enable row level security;
alter table public.dismissed_notifications enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own properties" on public.properties;
create policy "own properties" on public.properties
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own certificates" on public.certificates;
create policy "own certificates" on public.certificates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own declarations" on public.declarations;
create policy "own declarations" on public.declarations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rent" on public.rent_payments;
create policy "own rent" on public.rent_payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own dismissals" on public.dismissed_notifications;
create policy "own dismissals" on public.dismissed_notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===========================================================================
-- Create a profile row automatically whenever someone signs up
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Keep updated_at honest
-- ===========================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql
security definer set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_properties on public.properties;
create trigger touch_properties before update on public.properties
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_certificates on public.certificates;
create trigger touch_certificates before update on public.certificates
  for each row execute function public.touch_updated_at();
