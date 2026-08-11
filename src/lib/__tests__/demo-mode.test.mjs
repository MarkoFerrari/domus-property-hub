/**
 * Tests for the demo-mode state machine.
 *
 * WHY THESE EXIST: the landing page makes a promise, that nothing a visitor
 * types is stored anywhere or survives them leaving. Every one of the rules
 * below is that promise expressed as code. If one of them breaks, Domus keeps
 * working and looking correct while quietly lying to people about their data,
 * which is the one thing a compliance product cannot do.
 *
 * The second thing pinned here is the split between "this visitor chose the
 * demo" and "this build has no database". Those were a single boolean before,
 * which meant a demo visitor saw a deployment-fault warning and a genuinely
 * broken deploy looked like a friendly demo. Backwards in both directions.
 *
 * Deliberately dependency-free, matching the other tests. Mirrors the logic in
 * src/lib/demoMode.ts; change them in the same commit.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const DEMO_SESSION_KEY = "domus.demo.session";
const DEMO_KEY_PREFIX = "domus.";

/* -------------------------------------------------------------------------- */
/* A stand-in for localStorage, including the Safari-private-mode failure       */
/* -------------------------------------------------------------------------- */

function makeStorage({ throws = false } = {}) {
  const map = new Map();
  return {
    getItem(k) {
      if (throws) throw new Error("localStorage unavailable");
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (throws) throw new Error("localStorage unavailable");
      map.set(k, String(v));
    },
    removeItem(k) {
      if (throws) throw new Error("localStorage unavailable");
      map.delete(k);
    },
    key(i) {
      return [...map.keys()][i] ?? null;
    },
    get length() {
      return map.size;
    },
    _keys: () => [...map.keys()],
    _seed: (k, v) => map.set(k, v),
  };
}

/* ------------------------- mirrors of demoMode.ts ------------------------- */

function isDemo(storage, supabaseConfigured) {
  if (!supabaseConfigured) return true;
  try {
    return storage.getItem(DEMO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function isMisconfigured(supabaseConfigured) {
  return !supabaseConfigured;
}

function clearDemoData(storage) {
  try {
    const doomed = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(DEMO_KEY_PREFIX)) doomed.push(key);
    }
    doomed.forEach((k) => storage.removeItem(k));
  } catch {
    /* nothing stored */
  }
}

/* --------------------------------- tests --------------------------------- */

test("a normal visitor with a real backend is not in demo mode", () => {
  const s = makeStorage();
  assert.equal(isDemo(s, true), false);
});

test("setting the session flag puts the visitor in demo mode", () => {
  const s = makeStorage();
  s.setItem(DEMO_SESSION_KEY, "1");
  assert.equal(isDemo(s, true), true);
});

test("a build with no backend is always demo, flag or no flag", () => {
  const s = makeStorage();
  assert.equal(isDemo(s, false), true);
});

test("chosen demo and broken deploy are told apart", () => {
  const chosen = makeStorage();
  chosen.setItem(DEMO_SESSION_KEY, "1");
  // In the demo by choice, on a healthy build: friendly notice, not an alarm.
  assert.equal(isDemo(chosen, true), true);
  assert.equal(isMisconfigured(true), false);

  // No backend at all: this is a fault and must be reported as one.
  assert.equal(isMisconfigured(false), true);
});

test("clearing removes every domus key", () => {
  const s = makeStorage();
  s._seed(DEMO_SESSION_KEY, "1");
  s._seed("domus.properties", "[{}]");
  s._seed("domus.ledger.rent", "{}");
  s._seed("domus.history.abc:2026-08", "[]");
  s._seed("domus.demo.user", "{}");
  clearDemoData(s);
  assert.deepEqual(s._keys(), []);
});

test("clearing never touches a real Supabase session", () => {
  // The single most damaging possible bug here: a demo visitor signing out and
  // taking a real landlord's session with them in the same browser.
  const s = makeStorage();
  s._seed("sb-cahgonzqkxxkbyoempqw-auth-token", "real-session");
  s._seed("domus.properties", "[{}]");
  clearDemoData(s);
  assert.deepEqual(s._keys(), ["sb-cahgonzqkxxkbyoempqw-auth-token"]);
});

test("starting a demo wipes whatever the last visitor left", () => {
  const s = makeStorage();
  s._seed("domus.properties", '[{"id":"previous-visitor"}]');
  clearDemoData(s);
  s.setItem(DEMO_SESSION_KEY, "1");
  assert.equal(s.getItem("domus.properties"), null);
  assert.equal(isDemo(s, true), true);
});

test("leaving the demo ends it and leaves nothing behind", () => {
  const s = makeStorage();
  s.setItem(DEMO_SESSION_KEY, "1");
  s._seed("domus.properties", "[{}]");
  clearDemoData(s);
  assert.equal(isDemo(s, true), false);
  assert.deepEqual(s._keys(), []);
});

test("blocked storage falls back to the real backend, not a lossy demo", () => {
  // Safari private mode throws on localStorage. Guessing "demo" there would
  // hand someone an app that silently discards everything they type.
  const s = makeStorage({ throws: true });
  assert.equal(isDemo(s, true), false);
});
