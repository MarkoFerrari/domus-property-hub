/**
 * The payment history that comes with the example portfolio.
 *
 * WHY THIS EXISTS: `demoPortfolio()` in db.ts creates five properties and their
 * certificates and nothing else, so a visitor who chose "Explore with an example
 * portfolio" landed on a dashboard whose Earnings card said "No earnings yet".
 * The first card a prospect looks at was empty, on a product whose whole pitch is
 * "every deadline, every euro, one screen".
 *
 * This module supplies the missing half: twelve completed months of declarations
 * and rent, minus a deliberate gap at the recent end so the Action queue has
 * something real to show.
 *
 * TWO RULES THIS FILE FOLLOWS:
 *
 *   1. It is PURE. It returns records; it never writes them. Persistence lives in
 *      db.ts, the same split ledger.ts already keeps between month maths and
 *      storage.
 *
 *   2. It is DETERMINISTIC. No Math.random(). The same `now` always produces the
 *      same portfolio, so a pitch reproduces exactly, screenshots stay valid, and
 *      the tests below `src/lib/__tests__/` can assert on real numbers.
 */

import {
  completedMonths,
  type DeclRecord,
  type MonthRef,
  type ObligationType,
  type RentRecord,
} from "./ledger";

/**
 * How many of the most recent completed months are left unrecorded.
 *
 * This is the demo's most load-bearing number and it is a product decision, not
 * a technical one. Every blank month becomes work in the Action queue, and
 * short-term properties carry TWO obligations each (stay + ΤΑΚΚ), so with three
 * short-term and two long-term properties each blank month adds eight items.
 *
 * Measured on the example portfolio:
 *
 *   2 -> 20 open actions (12 declarations, 4 rent, 4 certificates),
 *        €21,020 recorded so far this year
 *   1 -> 12 open actions (6 declarations, 2 rent, 4 certificates),
 *        €30,510 recorded so far this year
 *
 * One is the calmer first impression and it has a flaw. A stay declaration only
 * enters the queue once its deadline is within fourteen days, and that deadline
 * is the 20th of the following month — so for roughly the first six days of any
 * month, a single blank month produces NO ledger notifications at all and the
 * demo opens on "you're all caught up" with nothing but certificates. Two blank
 * months always leaves one genuinely overdue, on every day of the year.
 *
 * Change this one number to retune it. Nothing else needs to move.
 */
export const MONTHS_LEFT_UNRECORDED = 2;

export type SeededDeclaration = {
  /** Matched to a property by name at seed time. See `seedDemoPortfolio`. */
  propertyName: string;
  /** YYYY-MM */
  month: string;
  type: ObligationType;
  rec: DeclRecord;
};

export type SeededRent = {
  propertyName: string;
  month: string;
  rec: RentRecord;
};

export type SeededLedger = {
  declarations: SeededDeclaration[];
  rents: SeededRent[];
};

/* ========================================================================== */
/* The figures                                                                 */
/* ========================================================================== */

/**
 * Monthly short-term income, index 0 = January.
 *
 * Shaped like an Athens season rather than a flat line: dead in February, peak
 * in August, a small Christmas bump inland. A demo portfolio that earns the same
 * amount every month tells a prospect nothing about what the donut and the
 * month-by-month table are for.
 *
 * The zeros are deliberate and are recorded as `zero: true`, NOT as missing
 * records. A coastal let closed over winter is real, and it is the only thing in
 * the demo that demonstrates the rule the Welcome screen already promises:
 * "Months that earned nothing count too."
 */
const SHORT_TERM_INCOME: Record<string, readonly number[]> = {
  // €120/night, 82 m², inland Athens. Steady, with a Christmas week.
  "Koukaki Loft": [640, 580, 910, 1480, 2050, 2460, 2880, 3120, 2340, 1520, 780, 1150],
  // €95/night, small studio in the old town. Closed for repairs one February.
  "Plaka Studio": [420, 0, 680, 1140, 1610, 1920, 2280, 2470, 1850, 1190, 560, 880],
  // €180/night, coastal. Shuts for the winter, which is why January and
  // February are zero months rather than gaps.
  "Glyfada Sea View": [0, 0, 540, 1620, 2700, 3780, 4860, 5220, 3420, 1800, 360, 540],
};

/** Monthly rent and the day of the month it is due. Matches `demoPortfolio()`. */
const LONG_TERM_RENT: Record<string, { amount: number; payday: number }> = {
  "Pagkrati 2BR": { amount: 750, payday: 5 },
  "Kypseli Apartment": { amount: 580, payday: 1 },
};

/**
 * Every property name this module writes records for.
 *
 * Exported so a test can assert it still matches `demoPortfolio()`. Names are the
 * join key between the two, and if one drifts the seed silently writes nothing —
 * a failure that looks exactly like the bug this file was written to fix.
 */
export const SEEDED_PROPERTY_NAMES: readonly string[] = [
  ...Object.keys(SHORT_TERM_INCOME),
  ...Object.keys(LONG_TERM_RENT),
];

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A timestamp a few days into the month AFTER the one being recorded, which is
 * when a landlord actually sits down and files.
 *
 * Built from string parts rather than `toISOString()` on purpose: `toISOString`
 * converts from local time, so the same seed would produce different values on a
 * laptop in Athens and a CI runner in UTC. `dayOffset` staggers the properties so
 * twelve months of records do not all carry the same timestamp, which is the
 * detail that makes seeded data read as invented the moment anyone looks.
 */
function filedAt(month: MonthRef, dayOffset: number): string {
  const d = new Date(month.year, month.monthIdx + 1, 3 + dayOffset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:15:00.000Z`;
}

/** yyyy-mm-dd for a given day inside the recorded month itself. */
function dayIn(month: MonthRef, day: number): string {
  const d = new Date(month.year, month.monthIdx, day);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * An illustrative ΤΑΚΚ figure.
 *
 * IMPORTANT: Domus does not calculate this and holds no rate for it, by design —
 * it records what the landlord tells it. This is demo data standing in for a
 * number the landlord would have worked out elsewhere, sized to be plausible
 * against the month's income rather than derived from any published rate. Do not
 * turn it into a formula the app relies on.
 */
function illustrativeTakk(income: number): number {
  return income <= 0 ? 0 : Math.round((income * 0.06) / 5) * 5;
}

/* ========================================================================== */
/* Build                                                                       */
/* ========================================================================== */

/**
 * The months the example portfolio has records for: the last twelve completed
 * months, minus the most recent `MONTHS_LEFT_UNRECORDED` of them.
 *
 * `completedMonths` already excludes the current month, because you cannot record
 * a month that has not ended. So the gap this leaves is genuinely overdue or
 * nearly due work, which is exactly what the Action queue is for.
 */
export function seededMonths(now: Date = new Date()): MonthRef[] {
  const all = completedMonths(now);
  return MONTHS_LEFT_UNRECORDED > 0 ? all.slice(0, -MONTHS_LEFT_UNRECORDED) : all;
}

export function demoLedger(now: Date = new Date()): SeededLedger {
  const months = seededMonths(now);
  const declarations: SeededDeclaration[] = [];
  const rents: SeededRent[] = [];

  let offset = 0;
  for (const [propertyName, byMonth] of Object.entries(SHORT_TERM_INCOME)) {
    offset += 1;
    for (const month of months) {
      const income = byMonth[month.monthIdx] ?? 0;
      const takk = illustrativeTakk(income);

      /* BOTH obligations, every month. Seeding only `stay` would leave twelve
         months of ΤΑΚΚ unrecorded, and the notification feed loops over both
         types — the demo would open with a wall of red. */
      declarations.push({
        propertyName,
        month: month.key,
        type: "stay",
        rec:
          income > 0
            ? { zero: false, amount: String(income), recordedAt: filedAt(month, offset) }
            : { zero: true, recordedAt: filedAt(month, offset) },
      });
      declarations.push({
        propertyName,
        month: month.key,
        type: "takk",
        rec:
          takk > 0
            ? { zero: false, amount: String(takk), recordedAt: filedAt(month, offset + 1) }
            : { zero: true, recordedAt: filedAt(month, offset + 1) },
      });
    }
  }

  for (const [propertyName, { amount, payday }] of Object.entries(LONG_TERM_RENT)) {
    offset += 1;
    months.forEach((month, i) => {
      /* One late month, on the first property only. A twelve-for-twelve record
         paid on the dot every time looks synthetic; one month where the tenant
         was travelling is what a real ledger looks like, and it gives the Rent
         tab a row with a note in it. Index 3 rather than a fixed calendar month
         so it lands inside the window whatever today's date is. */
      const late = propertyName === "Pagkrati 2BR" && i === 3;
      rents.push({
        propertyName,
        month: month.key,
        rec: {
          amount: String(amount),
          date: dayIn(month, late ? payday + 9 : payday),
          note: late ? "Paid late, tenant travelling." : undefined,
          recordedAt: filedAt(month, offset),
        },
      });
    });
  }

  return { declarations, rents };
}
