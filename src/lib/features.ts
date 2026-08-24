/**
 * Feature flags.
 *
 * WHY THIS EXISTS: a feature that is half-built should be off in one place, not
 * commented out across several files. When Google sign-in is ready, flipping
 * this single constant to true restores the button on both auth screens with
 * no other edits, and nothing has drifted out of step in the meantime.
 */

import { isDemo } from "./demoMode";

/**
 * Google sign-in.
 *
 * OFF because the OAuth client has not been registered in Google Cloud Console
 * yet. The application code is complete and tested; only the provider config is
 * missing, so this is deliberately a flag rather than deleted code.
 *
 * Before flipping this to true:
 *   1. Create a Web application OAuth client in Google Cloud Console
 *   2. Authorised JavaScript origin: https://markoferrari.github.io
 *   3. Authorised redirect URI: the callback URL shown on Supabase's Google
 *      provider page
 *   4. Paste the Client ID and Secret into Supabase, Authentication ->
 *      Providers -> Google, and enable it
 *
 * Worth doing the custom domain first. Without one, Google's consent screen
 * shows the raw Supabase project ID to the landlord, which reads as a phishing
 * attempt on the exact screen where they are deciding whether to trust Domus.
 */
export const GOOGLE_SIGN_IN_ENABLED = false;

/**
 * The Calendar tab on short-term properties (D1 in the handoff doc).
 *
 * ON, but this is not the only gate. Because the nights are invented, the tab is
 * additionally restricted to **demo mode** in `calendarAvailable()` in
 * `src/pages/PropertyDetail.tsx`. A landlord signed into a real portfolio does
 * not see it at all.
 *
 * That split is deliberate: the preview does its job in a pitch and never puts
 * sample booking data in front of someone who might act on it. Turning this
 * constant off hides the tab everywhere, including the demo.
 */
export const CALENDAR_TAB_ENABLED = true;

/**
 * Whether the calendar nights are invented.
 *
 * TRUE means `src/lib/calendarPreview.ts` is generating them and nothing has
 * been read from Airbnb or Booking.com. Every surface that shows a night count
 * must carry CALENDAR_SIMULATED_SHORT or _LONG from `legal.ts` while this is
 * true. That is not decoration: a compliance product showing a landlord an
 * invented number without saying so is the worst thing in this codebase.
 *
 * To flip it to false you need, at minimum:
 *   1. A `sync-calendars` edge function holding the feed URLs as secrets, since
 *      a browser cannot fetch an .ics (CORS) and the URL must never be bundled
 *   2. Tables for the feeds and their raw events, with RLS
 *   3. A parser that handles the four traps in D1_CALENDAR_CONNECTION_SPEC.md §5
 *
 * Flipping this without doing that work leaves the disclaimers off while the
 * numbers are still fake. Nothing in the build will stop you. Do not.
 */
export const CALENDAR_IS_SIMULATED = true;

/* ========================================================================== */
/* Derived availability                                                        */
/* ========================================================================== */

/**
 * Whether a property gets a Calendar tab at all.
 *
 * Three conditions, and the third is the interesting one:
 *
 *   1. The feature is on.
 *   2. The property is short-term. A long-term let has no booking calendar.
 *   3. **We are in demo mode.**
 *
 * WHY DEMO ONLY: the nights are invented (see `src/lib/calendarPreview.ts`).
 * Showing a demo visitor sample data is exactly what a demo is for. Showing it
 * to a landlord with a real portfolio, on a product whose whole promise is
 * keeping their records straight, is a different thing entirely, however many
 * amber warnings sit next to it. So the preview reaches prospects and pitches
 * and never reaches someone who might act on it.
 *
 * Flip this to unconditional when the connection is real, not before. That is
 * the same moment `CALENDAR_IS_SIMULATED` goes false.
 *
 * This lives here rather than in PropertyDetail because two callers need the
 * same answer: the tab strip, and the product tour deciding whether its Calendar
 * step has anywhere to land. A tour step pointing at a tab that does not exist
 * is exactly the drift the `tabsFor` comment in PropertyDetail warns about.
 */
export function calendarAvailable(isShort: boolean): boolean {
  return CALENDAR_TAB_ENABLED && isShort && isDemo();
}
