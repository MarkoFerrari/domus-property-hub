/**
 * Tests for a short-term month's combined obligation status.
 *
 * WHY THESE EXIST: a short-term month is only finished when BOTH the stay
 * declaration and ΤΑΚΚ are recorded, and they fall due up to eleven days apart.
 * Now that one row and one dialog cover both, the row's label is the only place
 * a landlord sees which half is still outstanding. A label that rounds "one of
 * two" up to "recorded" tells someone they are compliant when they are one
 * missed filing away from a fine, which is precisely the outcome Domus exists
 * to prevent.
 *
 * Deliberately dependency-free, matching the other tests. Mirrors the row
 * derivation in src/pages/PropertyDetail.tsx; change them in the same commit.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const OBLIGATION_TYPES = ["stay", "takk"];
const OBLIGATION_LABEL = { stay: "Stay declaration", takk: "ΤΑΚΚ" };

function parseAmount(v) {
  const n = Number(String(v ?? "").replace(/[,\s€]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const euro = (n) => `€${n.toLocaleString("en-GB")}`;

/** Mirror of the row derivation. `recs` is [stayRecord, takkRecord]. */
function rowStatus(recs) {
  const doneCount = recs.filter(Boolean).length;
  const total = recs.reduce((sum, r) => sum + (r && !r.zero ? parseAmount(r.amount) : 0), 0);
  const allZero = doneCount === OBLIGATION_TYPES.length && recs.every((r) => r?.zero);

  return {
    done: doneCount === OBLIGATION_TYPES.length,
    partial: doneCount > 0 && doneCount < OBLIGATION_TYPES.length,
    label:
      doneCount === 0
        ? "Neither recorded"
        : doneCount < OBLIGATION_TYPES.length
          ? `${OBLIGATION_LABEL[OBLIGATION_TYPES[recs.findIndex((r) => !r)]]} outstanding`
          : allZero
            ? "Both recorded · nothing to declare"
            : `Both recorded · ${euro(total)}`,
  };
}

const rec = (amount) => ({ zero: false, amount, recordedAt: "2026-08-11T00:00:00.000Z" });
const zeroRec = { zero: true, recordedAt: "2026-08-11T00:00:00.000Z" };

/* --------------------------------- tests --------------------------------- */

test("nothing recorded reads as neither, and is not done", () => {
  const s = rowStatus([undefined, undefined]);
  assert.equal(s.done, false);
  assert.equal(s.partial, false);
  assert.equal(s.label, "Neither recorded");
});

test("one of two is never reported as done", () => {
  // The dangerous case. Reporting this as complete is how a landlord misses ΤΑΚΚ.
  const s = rowStatus([rec("1240"), undefined]);
  assert.equal(s.done, false);
  assert.equal(s.partial, true);
});

test("a half-finished month names the obligation still outstanding", () => {
  assert.equal(rowStatus([rec("1240"), undefined]).label, "ΤΑΚΚ outstanding");
  assert.equal(rowStatus([undefined, rec("60")]).label, "Stay declaration outstanding");
});

test("both recorded is done and totals the two figures", () => {
  const s = rowStatus([rec("1240"), rec("60")]);
  assert.equal(s.done, true);
  assert.equal(s.partial, false);
  assert.equal(s.label, "Both recorded · €1,300");
});

test("a zero month still counts as recorded", () => {
  // Earning nothing does not remove the obligation, and the row must show the
  // landlord they have met it rather than nagging them forever.
  const s = rowStatus([zeroRec, zeroRec]);
  assert.equal(s.done, true);
  assert.equal(s.label, "Both recorded · nothing to declare");
});

test("one zero and one figure totals only the figure", () => {
  const s = rowStatus([zeroRec, rec("60")]);
  assert.equal(s.done, true);
  assert.equal(s.label, "Both recorded · €60");
});

test("a zero paired with a missing one is still outstanding", () => {
  const s = rowStatus([zeroRec, undefined]);
  assert.equal(s.done, false);
  assert.equal(s.partial, true);
  assert.equal(s.label, "ΤΑΚΚ outstanding");
});

test("amounts with separators and currency symbols still add up", () => {
  const s = rowStatus([rec("1,240"), rec("€60")]);
  assert.equal(s.label, "Both recorded · €1,300");
});

/* ------------------------- dialog save-rule mirror ------------------------ */

const isFilled = (d) => d.zero || d.amount.trim() !== "";

test("an untouched obligation is not written, so partial saves are possible", () => {
  // Someone who only knows one figure today should be able to bank it rather
  // than invent the other or lose the one they have.
  assert.equal(isFilled({ zero: false, amount: "" }), false);
  assert.equal(isFilled({ zero: false, amount: "1240" }), true);
  assert.equal(isFilled({ zero: true, amount: "" }), true);
});

test("whitespace alone does not count as filled in", () => {
  assert.equal(isFilled({ zero: false, amount: "   " }), false);
});
