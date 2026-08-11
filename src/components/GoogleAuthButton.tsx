/**
 * "Continue with Google", in both its working and its not-yet states.
 *
 * WHY THIS EXISTS: sign-in and sign-up both offer Google, and a feature that is
 * switched off has to look switched off on both, identically. One component
 * means the two screens cannot drift apart, and the day the flag flips they
 * both come back to life together.
 *
 * WHY IT IS NOT JUST `disabled`: a natively disabled button is removed from the
 * tab order, so a screen reader user tabbing through the form never meets it
 * and never hears why Google is missing. They are left to assume Domus does not
 * support it at all. `aria-disabled` keeps the button reachable and announced as
 * unavailable, and `aria-describedby` ties it to the sentence explaining when it
 * is coming back. The click is blocked in the handler instead.
 */

import { Btn, GoogleGlyph } from "./ui-primitives";
import { GOOGLE_SIGN_IN_ENABLED } from "../lib/features";

type Props = {
  /** Runs only when the feature is enabled. */
  onClick: () => void;
  /** True while the email form is submitting, to stop competing requests. */
  busy?: boolean;
};

export function GoogleAuthButton({ onClick, busy }: Props) {
  if (GOOGLE_SIGN_IN_ENABLED) {
    return (
      <Btn type="button" variant="secondary" onClick={onClick} disabled={busy}>
        <GoogleGlyph />
        Continue with Google
      </Btn>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Btn
        type="button"
        variant="secondary"
        aria-disabled="true"
        aria-describedby="google-unavailable"
        onClick={(e) => e.preventDefault()}
        className="opacity-40 hover:bg-white"
      >
        <GoogleGlyph />
        Continue with Google
      </Btn>
      <p id="google-unavailable" className="text-center text-[13px] leading-snug text-[#6B7280]">
        Google sign-in is coming soon. Use your email address for now.
      </p>
    </div>
  );
}
