/**
 * Where Domus lives on the host.
 *
 * On GitHub Pages the app is served from a sub-folder
 * (https://<user>.github.io/domus-property-hub/), not from the domain root.
 * Anything that builds a URL by hand has to account for that prefix, or it
 * will point at the domain root and 404.
 *
 * BASE_URL comes from `base` in vite.config.ts and always ends in "/".
 * On a root-level host it is simply "/", so these helpers stay correct
 * without any code changes if Domus moves to a custom domain later.
 */
export const BASE_PATH: string = import.meta.env.BASE_URL;

/**
 * Path inside the app, prefixed with the base.
 * appPath("dashboard") -> "/domus-property-hub/dashboard"
 *
 * Use this for window.location assignments. React Router links do NOT need it:
 * the router is given `basename` in main.tsx and adds the prefix itself.
 */
export function appPath(route: string): string {
  return `${BASE_PATH}${route.replace(/^\/+/, "")}`;
}

/**
 * Full absolute URL including origin.
 * appUrl("dashboard") -> "https://user.github.io/domus-property-hub/dashboard"
 *
 * Supabase auth redirects need this form. Whatever you pass here must also be
 * listed in Supabase under Authentication -> URL Configuration -> Redirect URLs,
 * or the redirect is rejected and the user is stranded on the email link.
 */
export function appUrl(route: string): string {
  return `${window.location.origin}${appPath(route)}`;
}
