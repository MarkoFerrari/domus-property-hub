-- ===========================================================================
-- 0005 — stop the trigger functions being callable as RPC
--
-- Found by Supabase's own security advisor after 0001 was applied to the live
-- project. Both functions below are TRIGGER functions, but Postgres grants
-- EXECUTE to `public` by default, which made them callable by anyone holding
-- the anon key at /rest/v1/rpc/handle_new_user and /rest/v1/rpc/touch_updated_at.
--
-- They run as SECURITY DEFINER, and they have to: the signup trigger writes a
-- profiles row before the new user is able to act for themselves. A SECURITY
-- DEFINER function that anyone can call is a privilege-escalation surface, and
-- here it buys nothing at all.
--
-- Triggers do not need EXECUTE granted to a role in order to fire. Revoking it
-- changes no behaviour.
-- ===========================================================================

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

grant execute on function public.handle_new_user() to postgres, service_role;
grant execute on function public.touch_updated_at() to postgres, service_role;
