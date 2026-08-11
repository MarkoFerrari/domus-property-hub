/**
 * Month maths for obligations and rent.  (source of truth §6.2)
 *
 * Records are keyed by property id, never by a slug of the property name.
 * Names change, ids do not.
 *
 *   short-term   `${propertyId}:${YYYY-MM}:${stay|takk}`
 *   long-term    `${propertyId}:${YYYY-MM}`
 *
 * A short-term month carries TWO obligations with two different deadlines, so
 * `${propertyId}:${YYYY-MM}` alone no longer identifies one record. Long-term
 * rent is still one record a month and keeps the two-part key.
 *
 * This module is pure. Persistence lives in `db.ts`.
 */

export type DeclRecord = { zero: boolean; amount?: string; recordedAt: string };
export type RentRecord = { amount: string; date?: string; note?: string; recordedAt: string };

/**
 * The two things a short-term landlord has to deal with each month.
 *
 *   stay — the short-stay declaration
 *   takk — the ΤΑΚΚ obligation
 *
 * Domus records what the landlord tells it and shows dates. It does not
 * calculate either figure and holds no rate for either one.
 */
export type ObligationType = "stay" | "takk";

export const OBLIGATION_TYPES: readonly ObligationType[] = ["stay", "takk"] as const;

export const OBLIGATION_LABEL: Record<ObligationType, string> = {
  stay: "Stay declaration",
  takk: "ΤΑΚΚ",
};

export function isObligationType(v: unknown): v is ObligationType {
  return v === "stay" || v === "takk";
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type MonthRef = {
  /** YYYY-MM */
  key: string;
  year: number;
  /** 0-11 */
  monthIdx: number;
  /** "July" */
  name: string;
  /** "July 2026" */
  label: string;
  /** "JUL 2026" */
  shortLabel: string;
};

export function monthKey(year: number, monthIdx: number) {
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
}

export function monthRef(year: number, monthIdx: number): MonthRef {
  return {
    key: monthKey(year, monthIdx),
    year,
    monthIdx,
    name: MONTH_NAMES[monthIdx],
    label: `${MONTH_NAMES[monthIdx]} ${year}`,
    shortLabel: `${MONTH_SHORT[monthIdx].toUpperCase()} ${year}`,
  };
}

export function parseMonthKey(key: string): MonthRef | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return null;
  return monthRef(year, idx);
}

/**
 * The last 12 COMPLETED months, oldest first. The current month is excluded —
 * you cannot record a month that has not ended yet.
 */
export function completedMonths(now: Date = new Date()): MonthRef[] {
  const out: MonthRef[] = [];
  for (let back = 12; back >= 1; back -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    out.push(monthRef(d.getFullYear(), d.getMonth()));
  }
  return out;
}

/* ------------------------------- deadlines -------------------------------- */

/**
 * The last Monday–Friday of a month.
 *
 * KNOWN LIMIT: Greek public holidays are not accounted for. Orthodox Easter
 * moves every year and the holiday list is not something this app should be
 * carrying, so a deadline landing on a public holiday will read one day late.
 * Every deadline Domus shows is indicative and the landlord verifies it.
 */
export function lastWorkingDayOf(year: number, monthIdx: number): Date {
  const d = new Date(year, monthIdx + 1, 0); // day 0 of next month = last day of this one
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

/**
 * The derived deadline for an obligation, before any override is applied.
 *
 *   stay — the 20th of the month following the recorded month
 *   takk — the last working day of the month following the recorded month
 */
export function defaultDeadline(month: MonthRef, type: ObligationType): Date {
  return type === "takk"
    ? lastWorkingDayOf(month.year, month.monthIdx + 1)
    : new Date(month.year, month.monthIdx + 1, 20);
}

/** Kept for the stay declaration, which is what every current caller means. */
export function declarationDeadline(month: MonthRef): Date {
  return defaultDeadline(month, "stay");
}

/** "20 Aug 2026" */
export function formatDeadline(d: Date): string {
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function deadlineLabel(month: MonthRef, type: ObligationType): string {
  return formatDeadline(defaultDeadline(month, type));
}

/** Month name the obligation is due in, e.g. "August". */
export function deadlineMonthName(month: MonthRef, type: ObligationType): string {
  return MONTH_NAMES[defaultDeadline(month, type).getMonth()];
}

/* ---------------------------- deadline overrides --------------------------- */

/**
 * The exception, not the rule. Defaults stay derived; only a deadline the
 * landlord has actually moved or snoozed is ever persisted.
 */
export type DeadlineOverride = {
  /** ISO yyyy-mm-dd. Replaces the derived deadline. */
  date?: string;
  /** ISO yyyy-mm-dd. Holds the reminder back without moving the deadline. */
  snoozedUntil?: string;
  updatedAt: string;
};

/** yyyy-mm-dd -> local midnight Date, or null if it is not a usable date. */
export function parseISODate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The deadline to actually show, and whether it came from an override. UI needs
 * the flag so an edited date can be marked as the landlord's own, not ours.
 */
export function resolveDeadline(
  month: MonthRef,
  type: ObligationType,
  override?: DeadlineOverride,
): { date: Date; overridden: boolean } {
  const custom = parseISODate(override?.date);
  return custom ? { date: custom, overridden: true } : { date: defaultDeadline(month, type), overridden: false };
}

export function isSnoozed(override: DeadlineOverride | undefined, now: Date = new Date()): boolean {
  const until = parseISODate(override?.snoozedUntil);
  return until !== null && daysBetween(until, now) > 0;
}

/* ------------------------------- record keys ------------------------------- */

function monthPart(month: string | MonthRef) {
  return typeof month === "string" ? month : month.key;
}

/** Short-term: `${propertyId}:${YYYY-MM}:${type}`. */
export function obligationKey(
  propertyId: string,
  month: string | MonthRef,
  type: ObligationType,
): string {
  return `${propertyId}:${monthPart(month)}:${type}`;
}

/** Long-term: `${propertyId}:${YYYY-MM}`. One rent record a month, unchanged. */
export function rentKey(propertyId: string, month: string | MonthRef): string {
  return `${propertyId}:${monthPart(month)}`;
}

/**
 * @deprecated Resolves to the stay declaration. Screens that predate the
 * two-obligation split read through this so they keep showing the record they
 * always showed. Phase 3 replaces these call sites with `obligationKey`.
 */
export function declarationKey(propertyId: string, month: string | MonthRef): string {
  return obligationKey(propertyId, month, "stay");
}

export type ParsedObligationKey = { propertyId: string; month: string; type: ObligationType };

/**
 * Month is matched as 01–12, not `\d{2}`. A key like `p:2026-13` is not a real
 * month and must not parse, otherwise the migration would happily promote junk
 * into a valid-looking stay declaration.
 */
const MONTH_RE = "\\d{4}-(?:0[1-9]|1[0-2])";

/** The inverse of `obligationKey`. Returns null for anything that is not one. */
export function parseObligationKey(key: string): ParsedObligationKey | null {
  const m = new RegExp(`^(.+):(${MONTH_RE}):(stay|takk)$`).exec(key ?? "");
  if (!m) return null;
  return { propertyId: m[1], month: m[2], type: m[3] as ObligationType };
}

/** The inverse of `rentKey`. */
export function parseRentKey(key: string): { propertyId: string; month: string } | null {
  const m = new RegExp(`^(.+):(${MONTH_RE})$`).exec(key ?? "");
  if (!m) return null;
  return { propertyId: m[1], month: m[2] };
}

/**
 * Anything that has a deadline. Long-term rent has one too (the payment day),
 * so the override store covers it even though its ledger key stays two-part.
 */
export type DeadlineTarget = ObligationType | "rent";

/**
 * Key for the deadline override store only. Always three parts, including for
 * rent, so one map covers every target without ambiguity. This is NOT the key
 * a rent record is stored under.
 */
export function deadlineKey(
  propertyId: string,
  month: string | MonthRef,
  target: DeadlineTarget,
): string {
  return `${propertyId}:${monthPart(month)}:${target}`;
}

export function daysBetween(a: Date, b: Date) {
  const s = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.floor((s(a) - s(b)) / 86_400_000);
}

/** Today as yyyy-mm-dd, for date inputs. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}
