/**
 * Tests for the example portfolio's payment history and the Earnings range.
 *
 * WHY THESE EXIST: two failures here are silent. A property name that drifts
 * between `demoPortfolio()` and `demoLedger()` seeds nothing at all and looks
 * exactly like the empty-Earnings-card bug this work was done to fix. And the
 * Earnings range filter previously asked `completedMonths()` for a month that
 * function deliberately never returns, so the "This month" toggle showed the
 * empty state permanently regardless of the data.
 *
 * Neither breaks a build, neither throws, and both make the demo look broken to
 * the one person you most want it to impress.
 *
 * Deliberately dependency-free, matching the other tests. The month maths below
 * mirrors src/lib/ledger.ts and src/lib/demoLedger.ts; change them in the same
 * commit.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

/* ========================================================================== */
/* The join key between the portfolio and its ledger                           */
/* ========================================================================== */

test("every property demoLedger writes for exists in demoPortfolio", () => {
  const ledgerSrc = readFileSync(here("../demoLedger.ts"), "utf8");
  const dbSrc = readFileSync(here("../db.ts"), "utf8");

  /* The keys of SHORT_TERM_INCOME and LONG_TERM_RENT, i.e. every property the
     seed writes declarations or rent for. */
  const seeded = [...ledgerSrc.matchAll(/^\s{2}"([^"]+)":\s*(?:\[|\{ amount)/gm)].map(
    (m) => m[1],
  );

  /* The `name:` of every property demoPortfolio() creates. */
  const portfolio = [...dbSrc.matchAll(/^\s{6}name:\s*"([^"]+)"/gm)].map((m) => m[1]);

  assert.ok(seeded.length >= 5, `expected at least 5 seeded properties, found ${seeded.length}`);
  assert.ok(portfolio.length >= 5, `expected at least 5 portfolio properties, found ${portfolio.length}`);

  for (const name of seeded) {
    assert.ok(
      portfolio.includes(name),
      `demoLedger writes records for "${name}", which demoPortfolio() does not create. ` +
        `The seed joins on name, so this property would silently get no history.`,
    );
  }
});

/* ========================================================================== */
/* Month maths — mirrors ledger.ts                                             */
/* ========================================================================== */

function monthKey(year, monthIdx) {
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
}

/** The last 12 COMPLETED months, oldest first. The current month is excluded. */
function completedMonths(now) {
  const out = [];
  for (let back = 12; back >= 1; back -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    out.push({ key: monthKey(d.getFullYear(), d.getMonth()), year: d.getFullYear(), monthIdx: d.getMonth() });
  }
  return out;
}

const MONTHS_LEFT_UNRECORDED = 2;

/** Mirror of seededMonths() in demoLedger.ts. */
function seededMonths(now) {
  const all = completedMonths(now);
  return MONTHS_LEFT_UNRECORDED > 0 ? all.slice(0, -MONTHS_LEFT_UNRECORDED) : all;
}

test("completedMonths never contains the month in progress", () => {
  for (const now of [new Date(2026, 7, 23), new Date(2026, 0, 1), new Date(2026, 11, 31)]) {
    const keys = completedMonths(now).map((m) => m.key);
    assert.ok(
      !keys.includes(monthKey(now.getFullYear(), now.getMonth())),
      `${monthKey(now.getFullYear(), now.getMonth())} should not be a completed month`,
    );
  }
});

test("the old Earnings 'this month' filter could never match anything", () => {
  /* This is the bug, preserved so nobody reintroduces it. The filter asked for a
     month with the current month's index AND the current year; the only month
     carrying that index is twelve back, which is the previous year. */
  const now = new Date(2026, 7, 23);
  const matched = completedMonths(now).filter(
    (m) => m.year === now.getFullYear() && m.monthIdx === now.getMonth(),
  );
  assert.equal(matched.length, 0);
});

test("the two Earnings windows both hold months, in January included", () => {
  /* January is the case that decides the shape of this toggle: "this year" is
     nearly empty all month, so the other window has to be a rolling one rather
     than a single month, or the card has nothing to total. */
  const now = new Date(2026, 0, 14); // 14 Jan 2026
  const all = completedMonths(now);

  const rolling = all;
  const thisYear = all.filter((m) => m.year === now.getFullYear());

  assert.equal(rolling.length, 12);
  assert.equal(rolling[0].key, "2025-01");
  assert.equal(rolling[rolling.length - 1].key, "2025-12");
  assert.equal(thisYear.length, 0, "nothing is complete yet in January");
});

/* ========================================================================== */
/* The deliberate gap                                                          */
/* ========================================================================== */

test("the seed leaves exactly the most recent completed months unrecorded", () => {
  const now = new Date(2026, 7, 23);
  const all = completedMonths(now).map((m) => m.key);
  const seeded = seededMonths(now).map((m) => m.key);

  assert.equal(seeded.length, all.length - MONTHS_LEFT_UNRECORDED);

  const gap = all.filter((k) => !seeded.includes(k));
  assert.deepEqual(gap, ["2026-06", "2026-07"]);

  /* The gap must be at the RECENT end. A gap in the middle would produce
     notifications for months whose deadlines passed long ago, which reads as a
     broken app rather than a to-do list. */
  assert.deepEqual(seeded, all.slice(0, -MONTHS_LEFT_UNRECORDED));
});

test("the most recent completed month is always unrecorded, so the queue is never empty", () => {
  for (const now of [new Date(2026, 7, 23), new Date(2026, 0, 1), new Date(2025, 11, 31)]) {
    const seeded = seededMonths(now).map((m) => m.key);
    const mostRecent = completedMonths(now).slice(-1)[0].key;
    assert.ok(!seeded.includes(mostRecent), `${mostRecent} should have been left blank`);
  }
});
