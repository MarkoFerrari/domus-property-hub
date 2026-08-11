/**
 * Tests for the onboarding gate's loading logic.
 *
 * WHY THESE EXIST: returning landlords were sent through "add your first
 * property" on every single sign-in. Their profile said onboarded: true in the
 * database the whole time. The cause was a one-render window where auth had
 * resolved but the store still held signed-out state and already reported
 * loading: false, so RequireOnboarded read onboarded: false and redirected.
 *
 * That is a state-sequence bug, not a data bug, so it is worth pinning: the
 * failure is invisible in the database, invisible in the network tab, and
 * reads to the landlord as "this app has forgotten who I am", which is fatal
 * for something they are meant to trust with tax deadlines.
 *
 * Deliberately dependency-free, matching deadlines.test.mjs. Mirrors the
 * derivation in src/lib/store.tsx and the gate in src/App.tsx. If either
 * changes, change these in the same commit.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

/* --------------------------------------------------------------------------
 * Mirrors of the real logic.
 * ----------------------------------------------------------------------- */

/** src/lib/store.tsx — the derived loading flag. */
function storeLoading({ authLoading, loadedFor, userId }) {
  return authLoading || loadedFor !== userId;
}

/** src/App.tsx — RequireOnboarded. Returns where the gate sends the landlord. */
function gate({ loading, onboarded, error }) {
  if (loading) return "splash";
  if (!onboarded && !error) return "welcome";
  return "app";
}

/**
 * The old, broken version, kept so the regression test proves it actually
 * reproduces the bug rather than passing for some unrelated reason.
 */
function storeLoadingOld(loadingFlag) {
  return loadingFlag;
}

/* --------------------------------------------------------------------------
 * The sign-in sequence
 * ----------------------------------------------------------------------- */

const USER = "b6cc98fe-8504-46b0-8858-4e75c0031fa8";

test("the old logic reproduces the bug: gate says welcome mid sign-in", () => {
  // Render where auth has just resolved but the store's effect has not run.
  // The old boolean was set false by the signed-out branch of refresh().
  const loading = storeLoadingOld(false);
  assert.equal(gate({ loading, onboarded: false, error: null }), "welcome");
});

test("returning landlord is never sent to welcome during sign-in", () => {
  // Render 1: auth still resolving, nothing loaded.
  let s = { authLoading: true, loadedFor: undefined, userId: null };
  assert.equal(gate({ loading: storeLoading(s), onboarded: false, error: null }), "splash");

  // Render 2: auth resolved, user present, store effect has NOT run yet.
  // This is the exact render the old code got wrong.
  s = { authLoading: false, loadedFor: null, userId: USER };
  assert.equal(gate({ loading: storeLoading(s), onboarded: false, error: null }), "splash");

  // Render 3: store finished loading this user's data.
  s = { authLoading: false, loadedFor: USER, userId: USER };
  assert.equal(gate({ loading: storeLoading(s), onboarded: true, error: null }), "app");
});

test("a genuinely new landlord still reaches welcome", () => {
  const s = { authLoading: false, loadedFor: USER, userId: USER };
  assert.equal(gate({ loading: storeLoading(s), onboarded: false, error: null }), "welcome");
});

test("signed out is a settled state, not a permanent splash", () => {
  const s = { authLoading: false, loadedFor: null, userId: null };
  assert.equal(storeLoading(s), false);
});

test("switching accounts re-enters loading before the gate can act", () => {
  const OTHER = "fa4e04bf-5e4e-4530-89b0-673c38c19c4c";
  // Data belongs to USER, but OTHER just signed in.
  const s = { authLoading: false, loadedFor: USER, userId: OTHER };
  assert.equal(storeLoading(s), true);
  assert.equal(gate({ loading: storeLoading(s), onboarded: true, error: null }), "splash");
});

test("a failed load shows the app with its error banner, not onboarding", () => {
  // WHY: on a dropped connection we do not know whether they onboarded.
  // Guessing "no" drags an established landlord back through setup.
  const s = { authLoading: false, loadedFor: USER, userId: USER };
  assert.equal(
    gate({ loading: storeLoading(s), onboarded: false, error: "Could not load your portfolio." }),
    "app",
  );
});

test("a failed load never parks the landlord on the splash forever", () => {
  // refresh() sets loadedFor even in its catch block, so loading settles.
  const s = { authLoading: false, loadedFor: USER, userId: USER };
  assert.equal(storeLoading(s), false);
});
