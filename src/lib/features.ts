/**
 * Feature flags.
 *
 * WHY THIS EXISTS: a feature that is half-built should be off in one place, not
 * commented out across several files. When Google sign-in is ready, flipping
 * this single constant to true restores the button on both auth screens with
 * no other edits, and nothing has drifted out of step in the meantime.
 */

/**
 * Google sign-in.
 *
 * OFF because the OAuth client has not been registered in Google Cloud Console
 * yet. The application code is complete and tested; only the provider config is
 * missing, so this is deliberately a flag rather than deleted code.
 *
 * Before flipping this to true:
 *   1. Create a Web application OAuth client in Google Cloud Console
 *   2. Authorised JavaScript origin: https://ferrarim1987.github.io
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
