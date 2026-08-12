/**
 * Tests for the simulated calendar.
 *
 * WHY THESE EXIST: the nights are invented, so "is the number right" has no
 * meaning. What DOES have meaning, and is the whole reason this code is
 * defensible in a compliance product, is that the same three inputs always
 * produce the same number. The calendar grid and the record dialog read this
 * generator separately. If it drifts between two calls, a landlord sees 14
 * nights on one screen and 11 on the next, and stops trusting every number in
 * Domus, including the real ones.
 *
 * The second thing worth pinning is the exclusive end date. A stay of 10 -> 12
 * is two nights, not three. Real iCal feeds work this way, so getting it right
 * in the fake means the UI contract survives a real integration later.
 *
 * Deliberately dependency-free, same as the other tests here. These mirror
 * src/lib/calendarPreview.ts by hand because that file is TypeScript and
 * node:test runs plain ESM with no build step. Change one, change both, in the
 * same commit.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

/* --------------------------------------------------------------------------
 * Mirrors of src/lib/calendarPreview.ts
 * ----------------------------------------------------------------------- */

function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function seeded(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OCCUPANCY = [0.24, 0.27, 0.34, 0.46, 0.61, 0.76, 0.88, 0.93, 0.79, 0.56, 0.29, 0.36];
const CHANNEL_WEIGHT = { airbnb: 1, booking: 0.82 };

function daysInMonth(year, monthIdx) {
  return new Date(year, monthIdx + 1, 0).getDate();
}

function simulatedMonth(propertyId, channel, year, monthIdx) {
  const total = daysInMonth(year, monthIdx);
  const rnd = seeded(hashString(`${propertyId}|${channel}|${year}-${monthIdx}`));
  const target = Math.round(
    total * OCCUPANCY[monthIdx] * CHANNEL_WEIGHT[channel] * (0.82 + rnd() * 0.36),
  );

  const stays = [];
  const bookedDays = new Set();
  let nights = 0;
  let cursor = 1 + Math.floor(rnd() * 4);

  while (cursor <= total && nights < target) {
    const length = 2 + Math.floor(rnd() * 6);
    const end = Math.min(cursor + length, total + 1);
    const staked = end - cursor;
    if (staked < 1) break;

    stays.push({ start: cursor, end });
    for (let d = cursor; d < end; d += 1) bookedDays.add(d);
    nights += staked;

    const peak = OCCUPANCY[monthIdx] > 0.7;
    cursor = end + 1 + Math.floor(rnd() * (peak ? 2 : 4));
  }

  return { nights, daysInMonth: total, stays, bookedDays };
}

/* --------------------------------------------------------------------------
 * Stability — the one that actually protects the landlord
 * ----------------------------------------------------------------------- */

test("the same property, channel and month always give the same nights", () => {
  const a = simulatedMonth("prop-abc", "airbnb", 2026, 6);
  const b = simulatedMonth("prop-abc", "airbnb", 2026, 6);
  assert.equal(a.nights, b.nights);
  assert.deepEqual(a.stays, b.stays);
});

test("stability holds across many months, not just one lucky seed", () => {
  for (let m = 0; m < 12; m += 1) {
    const first = simulatedMonth("prop-xyz", "booking", 2026, m);
    const second = simulatedMonth("prop-xyz", "booking", 2026, m);
    assert.equal(first.nights, second.nights, `month ${m} drifted`);
  }
});

test("different properties do not all show the same calendar", () => {
  const seen = new Set();
  for (const id of ["a", "b", "c", "d", "e", "f"]) {
    seen.add(simulatedMonth(id, "airbnb", 2026, 6).nights);
  }
  assert.ok(seen.size > 1, "every property produced an identical night count");
});

test("switching channel changes the calendar", () => {
  const air = simulatedMonth("prop-abc", "airbnb", 2026, 6);
  const bkg = simulatedMonth("prop-abc", "booking", 2026, 6);
  assert.notDeepEqual(air.stays, bkg.stays);
});

/* --------------------------------------------------------------------------
 * The exclusive end date
 * ----------------------------------------------------------------------- */

test("a stay counts nights slept, not days touched", () => {
  /* 10 -> 12 is two nights: the 10th and the 11th. The guest leaves on the
     12th. Counting it as three is the classic iCal off-by-one. */
  const stay = { start: 10, end: 12 };
  assert.equal(stay.end - stay.start, 2);
});

test("nights equals the sum of the stays, with no double counting", () => {
  for (const m of [0, 3, 7, 11]) {
    const month = simulatedMonth("prop-sum", "airbnb", 2026, m);
    const summed = month.stays.reduce((n, s) => n + (s.end - s.start), 0);
    assert.equal(month.nights, summed, `month ${m} does not add up`);
  }
});

test("the checkout day is never marked as a booked night", () => {
  const month = simulatedMonth("prop-checkout", "airbnb", 2026, 7);
  for (const stay of month.stays) {
    assert.ok(month.bookedDays.has(stay.start), "check-in night missing");
    assert.ok(!month.bookedDays.has(stay.end), "checkout day counted as a night");
  }
});

/* --------------------------------------------------------------------------
 * Staying inside the month
 * ----------------------------------------------------------------------- */

test("no stay ever runs past the end of the month", () => {
  for (const m of [0, 1, 3, 6, 8, 11]) {
    const month = simulatedMonth("prop-bounds", "airbnb", 2026, m);
    for (const stay of month.stays) {
      assert.ok(stay.start >= 1, `stay started on day ${stay.start}`);
      assert.ok(stay.end <= month.daysInMonth + 1, `stay ran to ${stay.end}`);
    }
  }
});

test("February is handled, including a leap year", () => {
  assert.equal(simulatedMonth("p", "airbnb", 2026, 1).daysInMonth, 28);
  assert.equal(simulatedMonth("p", "airbnb", 2028, 1).daysInMonth, 29);
});

test("nights never exceed the days in the month", () => {
  for (let m = 0; m < 12; m += 1) {
    for (const id of ["p1", "p2", "p3", "p4"]) {
      const month = simulatedMonth(id, "airbnb", 2026, m);
      assert.ok(
        month.nights <= month.daysInMonth,
        `${id} month ${m}: ${month.nights} nights in ${month.daysInMonth} days`,
      );
    }
  }
});

test("stays never overlap and always leave a gap between guests", () => {
  for (let m = 0; m < 12; m += 1) {
    const month = simulatedMonth("prop-gap", "airbnb", 2026, m);
    for (let i = 1; i < month.stays.length; i += 1) {
      assert.ok(
        month.stays[i].start > month.stays[i - 1].end,
        `month ${m}: stay ${i} starts before the previous one ends`,
      );
    }
  }
});

/* --------------------------------------------------------------------------
 * Seasonality — the thing that stops it looking obviously fake
 * ----------------------------------------------------------------------- */

test("August is busier than January across a spread of properties", () => {
  const ids = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
  const jan = ids.reduce((n, id) => n + simulatedMonth(id, "airbnb", 2026, 0).nights, 0);
  const aug = ids.reduce((n, id) => n + simulatedMonth(id, "airbnb", 2026, 7).nights, 0);
  assert.ok(aug > jan, `August ${aug} was not busier than January ${jan}`);
});
