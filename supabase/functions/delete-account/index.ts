/**
 * GDPR Article 17 erasure.
 *
 * Deleting an auth user requires the service-role key, which must never reach
 * the browser. That is the only reason this runs on a server: everything else
 * cascades from `auth.users` in the schema, so one delete takes the whole
 * portfolio, the certificates, the ledger and the edit log with it.
 *
 * The caller's own JWT decides WHOSE account is deleted. The request body is
 * ignored entirely, so a user cannot pass someone else's id.
 *
 * Deploy:  supabase functions deploy delete-account
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Identify the caller from their own token. Never from the request body.
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Not signed in" }, 401);

  const userId = userData.user.id;
  const admin = createClient(url, serviceKey);

  try {
    /* Storage objects do NOT cascade with the auth user, so they go first.
       Orphaned files would otherwise sit in the bucket after erasure, which is
       exactly what Article 17 says must not happen. */
    const { data: files } = await admin.storage.from("certificates").list(userId, { limit: 1000 });
    if (files?.length) {
      // Documents live at <userId>/<propertyId>/<file>, so list one level down.
      const paths: string[] = [];
      for (const entry of files) {
        const { data: inner } = await admin.storage
          .from("certificates")
          .list(`${userId}/${entry.name}`, { limit: 1000 });
        for (const f of inner ?? []) paths.push(`${userId}/${entry.name}/${f.name}`);
      }
      if (paths.length) await admin.storage.from("certificates").remove(paths);
    }

    /* Everything in public.* references auth.users on delete cascade, so this
       single call removes properties, certificates, declarations, rent,
       dismissals, deadline overrides, the edit log and the profile row. */
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;

    return json({ ok: true });
  } catch (e) {
    console.error("delete-account failed", e);
    return json({ error: "Deletion failed. Nothing was removed." }, 500);
  }
});
