/**
 * Demo mode, as a choice the visitor makes rather than a build-time accident.
 *
 * WHY THIS EXISTS: Domus already had a complete localStorage fallback, but it
 * only switched on when Supabase credentials were missing, which meant the only
 * way to see it was to break the deployment. A landlord evaluating Domus should
 * be able to walk the whole product in thirty seconds without handing over an
 * email address, and then have every trace of that visit stay in their own
 * browser. This turns that fallback into a front door.
 *
 * TWO DIFFERENT THINGS, deliberately kept apart:
 *
 *   isDemo()          this visitor's data lives in their browser
 *   isMisconfigured() the deployment has no backend at all, which is a bug
 *
 * They used to be the same boolean. Conflating them meant a visitor who chose
 * the demo would be shown the red "someone deployed this wrong" warning, and a
 * genuinely broken production deploy would look like a friendly demo. The first
 * is alarming for no reason; the second is the dangerous one, because it hides
 * a real fault behind reassuring copy.
 */

import { isSupabaseConfigured } from "./supabase";

const DEMO_SESSION_KEY = "domus.demo.session";

/** The signed-in demo landlord. auth.tsx reads this on boot. */
export const DEMO_USER_KEY = "domus.demo.user";

/**
 * The identity a demo visitor gets. There is no sign-up in the demo, so this is
 * invented rather than collected. The email is a reserved example domain
 * (RFC 2606) so it can never reach a real inbox even if something tried.
 */
export const DEMO_USER = {
  id: "demo-user",
  email: "you@example.com",
  fullName: "",
} as const;

/**
 * Everything Domus writes for a demo visitor is namespaced under this prefix.
 *
 * Supabase keeps its own session under `sb-<ref>-auth-token`, which does NOT
 * match, so clearing by prefix can never sign out a real landlord.
 */
const DEMO_KEY_PREFIX = "domus.";

/**
 * True when reads and writes should go to localStorage instead of Supabase.
 *
 * Note this is a function, not a constant. It has to be read at call time
 * because it changes while the app is running. Both transitions do a full page
 * load (see startDemo and exitDemo) so nothing is left holding a stale value.
 */
export function isDemo(): boolean {
  if (!isSupabaseConfigured) return true;
  try {
    return localStorage.getItem(DEMO_SESSION_KEY) === "1";
  } catch {
    // Safari in private mode throws on localStorage. Falling back to "not demo"
    // is the safe direction: the app talks to the real backend and the landlord
    // sees a normal sign-in, rather than a demo that silently loses their work.
    return false;
  }
}

/**
 * True only when the build shipped without Supabase credentials.
 * This is a deployment fault, not a mode. Say so loudly.
 */
export function isMisconfigured(): boolean {
  return !isSupabaseConfigured;
}

/** Remove every trace of a demo visit. Never touches a real Supabase session. */
export function clearDemoData(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DEMO_KEY_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* Nothing was stored, so nothing to clear. */
  }
}

/**
 * Begin a demo. Wipes anything left from a previous visit so each run starts
 * clean, then hard-navigates so every branch re-reads isDemo().
 *
 * The full page load is deliberate. Threading this through React state would
 * mean every component that asks "am I in demo mode?" needs the context, and
 * one missed subscription is a screen writing to the wrong store. A reload is
 * blunt, costs nothing at this point in the flow, and cannot be got wrong.
 */
export function startDemo(destination: string): void {
  clearDemoData();
  try {
    localStorage.setItem(DEMO_SESSION_KEY, "1");
    // Signed in from the first frame. Asking a visitor to invent credentials
    // for an account that does not exist is the friction the demo removes.
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(DEMO_USER));
  } catch {
    /* Storage unavailable; the demo cannot run, so leave the flag unset and let
       the destination render normally rather than half-entering demo mode. */
    return;
  }
  window.location.assign(destination);
}

/** End a demo and bin the data. Same reload reasoning as startDemo. */
export function exitDemo(destination: string): void {
  clearDemoData();
  window.location.assign(destination);
}
