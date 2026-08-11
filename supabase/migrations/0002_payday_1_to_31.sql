-- Rent can legitimately fall due on any day of the month, including the 29th,
-- 30th or 31st. The original 1–28 ceiling rejected those, and code that reads
-- `payday` now clamps to the month's last day instead (see notifications.ts).

alter table public.properties
  drop constraint if exists properties_payday_check;

alter table public.properties
  add constraint properties_payday_check check (payday between 1 and 31);
