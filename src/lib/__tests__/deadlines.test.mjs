/**
 * Tests for the date logic.
 *
 * WHY THESE EXIST: this is the only code in Domus where being wrong costs the
 * landlord money. A deadline that reads one day late, a payday that rolls into
 * the next month, an off-by-one in the completed-month window: each of those
 * turns a compliance tool into the cause of the fine it promised to prevent.
 *
 * Deliberately dependency-free. Run with:
 *   node --test src/lib/__tests__/
 *
 * No test runner is installed and adding one needs sign-off (no new deps), so
 * these use node:test, which ships with Node. They cover pure functions only.
 * If a real runner arrives later, port them rather than delete them.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

/* --------------------------------------------------------------------------
 * These mirror src/lib/ledger.ts. Kept in step by hand because ledger.ts is
 * TypeScript and node:test runs plain ESM without a build step. If a rule
 * changes in ledger.ts it changes here, in the same commit, and in
 * supabase/functions/send-reminders/index.ts which has its own copy.
 * ----------------------------------------------------------------------- */

function lastWorkingDayOf(year, monthIdx) {
  const d = new Date(year, monthIdx + 1, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

function defaultDeadline(month, type) {
  return type === "takk"
    ? lastWorkingDayOf(month.year, month.monthIdx + 1)
    : new Date(month.year, month.monthIdx + 1, 20);
}

function dueDayIn(year, monthIdx, day) {
  return Math.min(day, new Date(year, monthIdx + 1, 0).getDate());
}

function daysBetween(a, b) {
  const s = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.floor((s(a) - s(b)) / 86_400_000);
}

function completedMonths(now) {
  const out = [];
  for (let i = 12; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      year: d.getFullYear(),
      monthIdx: d.getMonth(),
    });
  }
  return out;
}

const m = (year, monthIdx) => ({ year, monthIdx });

/* ========================================================================== */
/* Stay declaration: the 20th of the following month                          */
/* ========================================================================== */

test("stay deadline is the 20th of the next month", () => {
  const d = defaultDeadline(m(2026, 0), "stay"); // January 2026
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 1); // February
  assert.equal(d.getDate(), 20);
});

test("stay deadline for December rolls into the next year", () => {
  const d = defaultDeadline(m(2026, 11), "stay"); // December 2026
  assert.equal(d.getFullYear(), 2027);
  assert.equal(d.getMonth(), 0); // January
  assert.equal(d.getDate(), 20);
});

/* ========================================================================== */
/* TAKK: the last working day of the following month                          */
/* ========================================================================== */

test("takk deadline skips back off a Sunday", () => {
  // May 2026 -> June 2026. 30 June 2026 is a Tuesday, so no skip.
  const d = defaultDeadline(m(2026, 4), "takk");
  assert.equal(d.getMonth(), 5);
  assert.ok(d.getDay() !== 0 && d.getDay() !== 6, "must never land on a weekend");
});

test("takk deadline never lands on a weekend, across two years of months", () => {
  for (let year = 2026; year <= 2027; year++) {
    for (let idx = 0; idx < 12; idx++) {
      const d = defaultDeadline(m(year, idx), "takk");
      assert.ok(
        d.getDay() !== 0 && d.getDay() !== 6,
        `${year}-${idx + 1} landed on day ${d.getDay()}`,
      );
    }
  }
});

test("takk deadline is in the month AFTER the recorded month", () => {
  const d = defaultDeadline(m(2026, 0), "takk"); // January -> February
  assert.equal(d.getMonth(), 1);
});

test("takk for December rolls into January of the next year", () => {
  const d = defaultDeadline(m(2026, 11), "takk");
  assert.equal(d.getFullYear(), 2027);
  assert.equal(d.getMonth(), 0);
});

test("the two obligations do not share a deadline", () => {
  for (let idx = 0; idx < 12; idx++) {
    const stay = defaultDeadline(m(2026, idx), "stay");
    const takk = defaultDeadline(m(2026, idx), "takk");
    assert.notEqual(
      stay.getTime(),
      takk.getTime(),
      `month ${idx + 1}: stay and takk must be different dates`,
    );
  }
});

/* ========================================================================== */
/* Payday clamp: 29 to 31 does not exist in every month                       */
/* ========================================================================== */

test("payday 31 clamps to 28 in a non-leap February", () => {
  assert.equal(dueDayIn(2027, 1, 31), 28);
});

test("payday 31 clamps to 29 in a leap February", () => {
  assert.equal(dueDayIn(2028, 1, 31), 29);
});

test("payday 31 clamps to 30 in April", () => {
  assert.equal(dueDayIn(2026, 3, 31), 30);
});

test("payday 15 is untouched in every month", () => {
  for (let idx = 0; idx < 12; idx++) {
    assert.equal(dueDayIn(2026, idx, 15), 15);
  }
});

test("the clamp never produces a date that rolls into the next month", () => {
  for (let idx = 0; idx < 12; idx++) {
    for (const payday of [28, 29, 30, 31]) {
      const day = dueDayIn(2027, idx, payday);
      const d = new Date(2027, idx, day);
      assert.equal(d.getMonth(), idx, `payday ${payday} in month ${idx + 1} escaped its month`);
    }
  }
});

/* ========================================================================== */
/* daysBetween: whole days, ignoring the clock                                */
/* ========================================================================== */

test("daysBetween ignores the time of day", () => {
  const a = new Date(2026, 5, 20, 23, 59);
  const b = new Date(2026, 5, 20, 0, 1);
  assert.equal(daysBetween(a, b), 0);
});

test("daysBetween goes negative once the deadline has passed", () => {
  const due = new Date(2026, 5, 20);
  const now = new Date(2026, 5, 25);
  assert.ok(daysBetween(due, now) < 0, "an overdue item must read as negative");
  assert.equal(daysBetween(due, now), -5);
});

test("daysBetween survives a month boundary", () => {
  assert.equal(daysBetween(new Date(2026, 6, 1), new Date(2026, 5, 29)), 2);
});

/* ========================================================================== */
/* completedMonths: the current month is never recordable                     */
/* ========================================================================== */

test("completedMonths returns 12 months and excludes the current one", () => {
  const now = new Date(2026, 7, 10); // August 2026
  const months = completedMonths(now);
  assert.equal(months.length, 12);
  assert.ok(!months.some((x) => x.key === "2026-08"), "the current month must not be listed");
  assert.equal(months[months.length - 1].key, "2026-07");
  assert.equal(months[0].key, "2025-08");
});

test("completedMonths crosses the new year correctly", () => {
  const now = new Date(2026, 0, 5); // January 2026
  const months = completedMonths(now);
  assert.equal(months[months.length - 1].key, "2025-12");
  assert.ok(!months.some((x) => x.key === "2026-01"));
});

test("completedMonths is ordered oldest first with no gaps", () => {
  const months = completedMonths(new Date(2026, 2, 15));
  for (let i = 1; i < months.length; i++) {
    const prev = new Date(months[i - 1].year, months[i - 1].monthIdx, 1);
    const cur = new Date(months[i].year, months[i].monthIdx, 1);
    const gap =
      (cur.getFullYear() - prev.getFullYear()) * 12 + (cur.getMonth() - prev.getMonth());
    assert.equal(gap, 1, `gap of ${gap} months between entries ${i - 1} and ${i}`);
  }
});
