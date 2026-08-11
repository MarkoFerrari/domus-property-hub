-- ===========================================================================
-- 0004 — the three things that were missing to ship
--
--   1. certificates.storage_path  a certificate is a DOCUMENT, not a filename
--   2. a private storage bucket   with per-user access
--   3. reminder preferences       so deadlines can reach a landlord by email
--
-- ARCHITECTURAL RULE (§6) still holds. Nothing here stores a derived value.
-- There is still no compliance column and still no notifications table. The
-- reminder job recomputes the feed on every run exactly as the app does.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Certificates gain the object path
--
-- `file_name` is what the landlord sees. `storage_path` is what proves the
-- document exists. Before this, a certificate could be marked valid from a
-- free-text box, which meant Domus handed out a compliant status nobody earned.
-- ---------------------------------------------------------------------------
alter table public.certificates
  add column if not exists storage_path text;

comment on column public.certificates.storage_path is
  'Object path in the certificates bucket. Null means only a file name was ever recorded (demo mode), and the UI must say so rather than implying the document is stored.';

-- ---------------------------------------------------------------------------
-- 2. Private bucket for certificate documents
--
-- Not public. Reads go through short-lived signed URLs, so a link that gets
-- forwarded stops working instead of exposing a landlord's fire safety report.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'certificates',
  'certificates',
  false,
  10485760, -- 10MB, matching MAX_CERT_BYTES in src/lib/storage.ts
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects are stored at `<user_id>/<property_id>/<file>`, so the first path
-- segment IS the owner. That is what these policies match on.
drop policy if exists "own certificate files read" on storage.objects;
create policy "own certificate files read" on storage.objects
  for select using (
    bucket_id = 'certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own certificate files insert" on storage.objects;
create policy "own certificate files insert" on storage.objects
  for insert with check (
    bucket_id = 'certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own certificate files update" on storage.objects;
create policy "own certificate files update" on storage.objects
  for update using (
    bucket_id = 'certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own certificate files delete" on storage.objects;
create policy "own certificate files delete" on storage.objects
  for delete using (
    bucket_id = 'certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 3. Reminder preferences
--
-- Domus only ever reminded you when you opened Domus, which meant the deadline
-- product worked for exactly the people who did not need it.
--
-- `last_reminded_on` is not a derived value: it is a record of an email that
-- was actually sent, and it is what stops a cron retry sending twice.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists reminders_enabled boolean not null default true;

alter table public.profiles
  add column if not exists reminder_lead_days integer not null default 7
    check (reminder_lead_days between 1 and 30);

alter table public.profiles
  add column if not exists last_reminded_on date;

comment on column public.profiles.last_reminded_on is
  'Date the last reminder email actually went out. Guards against a cron retry sending the same digest twice.';

-- ---------------------------------------------------------------------------
-- 4. Let the reminder job read across users
--
-- The job runs as the service role, which bypasses RLS. This view exists so it
-- reads one shaped result instead of joining five tables in edge-function
-- TypeScript, where a mistake is harder to see.
--
-- security_invoker = on: the view does NOT become a way for a signed-in
-- landlord to read past their own RLS. It respects the caller's policies.
-- ---------------------------------------------------------------------------
create or replace view public.reminder_recipients
with (security_invoker = on) as
select
  p.id            as user_id,
  p.email,
  p.full_name,
  p.reminder_lead_days,
  p.last_reminded_on
from public.profiles p
where p.reminders_enabled
  and p.email is not null;

comment on view public.reminder_recipients is
  'Who wants a reminder digest. The digest CONTENTS are always recomputed from certificates, declarations and rent, never stored.';
