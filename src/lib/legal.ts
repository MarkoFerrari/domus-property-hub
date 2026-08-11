/**
 * Every legal-sounding string in Domus lives here.
 *
 * WHY THIS EXISTS: the app used to assert, in copy a landlord acts on, that the
 * first fine is €5,000 and that the obligation comes from Law 5170/2025. Nobody
 * qualified had signed either claim off. A compliance tool that states a penalty
 * confidently and gets it wrong does more damage than one that says nothing,
 * because the landlord stops checking for themselves.
 *
 * The rule now: Domus states DATES and never states CONSEQUENCES. Deadlines are
 * presented as indicative and the landlord is told, on every screen that shows
 * one, to confirm with their accountant.
 *
 * If and when a Greek tax professional signs off in writing, put their claims
 * back HERE and nowhere else, and flip LEGAL_REVIEW.reviewed to true. Do not
 * scatter penalty amounts or statute references through components again.
 */

export const LEGAL_REVIEW = {
  /** Flip to true only when a named professional has signed off in writing. */
  reviewed: false,
  reviewedBy: null as string | null,
  reviewedOn: null as string | null,
} as const;

/**
 * Shown wherever Domus displays a deadline it derived itself.
 *
 * Deliberately short: it has to fit in a dialog subtitle and a notification
 * subtitle without pushing the actual information off screen.
 */
export const DEADLINE_CAVEAT = "Dates in Domus are indicative. Confirm them with your accountant.";

/** The longer version, for screens with room: Help, Settings, onboarding. */
export const DEADLINE_CAVEAT_LONG =
  "Domus works out deadlines from the rules as we understand them, and does not account for " +
  "Greek public holidays. Treat every date here as a reminder to check, not as tax advice. " +
  "Domus records and reminds. It never files anything, never calculates what you owe, and " +
  "never moves money.";

/**
 * What Domus is careful never to claim.
 * Kept as a comment-in-code so the next person does not helpfully re-add them:
 *
 *   - a specific fine or penalty amount
 *   - a specific statute or law number
 *   - that a filing was made, accepted, or is late in the eyes of AADE
 *   - any figure Domus calculated rather than the landlord entering
 */
