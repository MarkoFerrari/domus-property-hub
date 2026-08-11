/**
 * The daily reminder digest.
 *
 * WHY THIS EXISTS: Domus only ever reminded a landlord when they opened Domus.
 * A deadline product that requires you to remember to check it works for
 * exactly the people who did not need it. This is the fix.
 *
 * ARCHITECTURAL RULE (§6): the digest is DERIVED on every run from certificates,
 * declarations and rent. There is no notifications table and this function must
 * never create one. The only thing written back is `last_reminded_on`, which
 * records that an email actually went out, so a cron retry cannot send twice.
 *
 * The deadline maths is duplicated from src/lib/ledger.ts because an edge
 * function cannot import from the app bundle. THAT DUPLICATION IS A LIABILITY:
 * if you change a deadline rule in ledger.ts, change it here in the same commit.
 * The tests in src/lib/__tests__/ledger.test.ts pin the app side.
 *
 * Deploy:  supabase functions deploy send-reminders
 * Secrets: RESEND_API_KEY, REMINDER_FROM, APP_URL
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* -------------------------------------------------------------------------- */
/* Deadline maths — keep in step with src/lib/ledger.ts                        */
/* -------------------------------------------------------------------------- */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** stay: the 20th of the following month. */
function stayDeadline(year: number, monthIdx: number) {
  return new Date(year, monthIdx + 1, 20);
}

/** takk: the last working day of the following month. */
function takkDeadline(year: number, monthIdx: number) {
  const d = new Date(year, monthIdx + 2, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

/** A due day of 29 to 31 does not exist in every month. */
function dueDayIn(year: number, monthIdx: number, day: number) {
  return Math.min(day, new Date(year, monthIdx + 1, 0).getDate());
}

function daysBetween(a: Date, b: Date) {
  const s = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.floor((s(a) - s(b)) / 86_400_000);
}

/** The last 12 COMPLETED months. The current month cannot be recorded yet. */
function completedMonths(now: Date) {
  const out: { key: string; label: string; year: number; monthIdx: number }[] = [];
  for (let i = 12; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      year: d.getFullYear(),
      monthIdx: d.getMonth(),
    });
  }
  return out;
}

function fmt(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

/* -------------------------------------------------------------------------- */

type Item = { urgent: boolean; text: string; detail: string };

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function buildEmail(name: string, items: Item[], appUrl: string) {
  const urgent = items.filter((i) => i.urgent);
  const rows = items
    .map(
      (i) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
          <div style="font:600 14px/1.4 -apple-system,Segoe UI,sans-serif;color:${
            i.urgent ? "#991B1B" : "#111827"
          };">${escapeHtml(i.text)}</div>
          <div style="font:400 13px/1.5 -apple-system,Segoe UI,sans-serif;color:#6b7280;margin-top:2px;">${escapeHtml(
            i.detail,
          )}</div>
        </td>
      </tr>`,
    )
    .join("");

  const headline = urgent.length
    ? `${urgent.length} thing${urgent.length === 1 ? "" : "s"} need your attention`
    : `${items.length} thing${items.length === 1 ? "" : "s"} coming up`;

  return `<!doctype html><html><body style="margin:0;background:#fafafa;padding:24px;">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;">
    <tr><td>
      <div style="font:800 18px/1 -apple-system,Segoe UI,sans-serif;color:#0D0D0D;">DOMUS</div>
      <h1 style="font:700 20px/1.3 -apple-system,Segoe UI,sans-serif;color:#111827;margin:22px 0 6px;">
        ${name ? `${escapeHtml(name)}, ` : ""}${escapeHtml(headline)}
      </h1>
      <p style="font:400 14px/1.6 -apple-system,Segoe UI,sans-serif;color:#6b7280;margin:0 0 18px;">
        Here is what Domus is tracking for you right now.
      </p>
      <table role="presentation" width="100%">${rows}</table>
      <a href="${appUrl}/notifications"
         style="display:inline-block;margin-top:24px;background:#171717;color:#fff;text-decoration:none;
                font:600 14px/1 -apple-system,Segoe UI,sans-serif;padding:13px 22px;border-radius:9px;">
        Open Domus
      </a>
      <p style="font:400 12px/1.6 -apple-system,Segoe UI,sans-serif;color:#9ca3af;margin:26px 0 0;">
        Dates in Domus are indicative and do not account for public holidays. Confirm them with your
        accountant. Domus records and reminds. It never files anything and never moves money.
      </p>
      <p style="font:400 12px/1.6 -apple-system,Segoe UI,sans-serif;color:#9ca3af;margin:10px 0 0;">
        <a href="${appUrl}/settings" style="color:#9ca3af;">Turn these emails off</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REMINDER_FROM") ?? "Domus <reminders@example.com>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://app.example.com";

  if (!resendKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY is not set" }), { status: 500 });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const months = completedMonths(now);

  const { data: recipients, error } = await admin.from("reminder_recipients").select("*");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const r of recipients ?? []) {
    // Already emailed today. A cron retry must not send the digest twice.
    if (r.last_reminded_on === today) {
      skipped++;
      continue;
    }

    const lead = r.reminder_lead_days ?? 7;

    const [{ data: properties }, { data: decls }, { data: rents }, { data: certs }] =
      await Promise.all([
        admin.from("properties").select("id, name, type, payday").eq("user_id", r.user_id),
        admin.from("declarations").select("property_id, month, type").eq("user_id", r.user_id),
        admin.from("rent_payments").select("property_id, month").eq("user_id", r.user_id),
        admin.from("certificates").select("property_id, name, expiry").eq("user_id", r.user_id),
      ]);

    const haveDecl = new Set((decls ?? []).map((d) => `${d.property_id}:${d.month}:${d.type}`));
    const haveRent = new Set((rents ?? []).map((x) => `${x.property_id}:${x.month}`));
    const items: Item[] = [];

    for (const p of properties ?? []) {
      if (p.type === "short") {
        // BOTH obligations. ΤΑΚΚ used to be silent everywhere.
        for (const type of ["stay", "takk"] as const) {
          for (const m of months) {
            if (haveDecl.has(`${p.id}:${m.key}:${type}`)) continue;
            const due = type === "takk"
              ? takkDeadline(m.year, m.monthIdx)
              : stayDeadline(m.year, m.monthIdx);
            const days = daysBetween(due, now);
            if (days > lead) continue;
            const label = type === "takk" ? "ΤΑΚΚ" : "stay declaration";
            items.push({
              urgent: days < 0,
              text:
                days < 0
                  ? `${m.label} ${label} is overdue`
                  : `${m.label} ${label} due in ${days} day${days === 1 ? "" : "s"}`,
              detail: `${p.name} · due ${fmt(due)}`,
            });
          }
        }
      } else {
        for (const m of months) {
          if (haveRent.has(`${p.id}:${m.key}`)) continue;
          const day = dueDayIn(m.year, m.monthIdx, Number(p.payday) || 1);
          const due = new Date(m.year, m.monthIdx, day);
          if (daysBetween(now, due) < 0) continue;
          items.push({
            urgent: false,
            text: `${m.label} rent not confirmed`,
            detail: `${p.name} · was due on the ${day}`,
          });
        }
      }
    }

    for (const c of certs ?? []) {
      if (!c.expiry) continue;
      const days = daysBetween(new Date(`${c.expiry}T00:00:00`), now);
      if (days > lead) continue;
      const p = (properties ?? []).find((x) => x.id === c.property_id);
      items.push({
        urgent: days < 0,
        text: days < 0 ? `${c.name} has expired` : `${c.name} expires in ${days} days`,
        detail: `${p?.name ?? "Property"} · ${fmt(new Date(`${c.expiry}T00:00:00`))}`,
      });
    }

    if (items.length === 0) {
      skipped++;
      continue; // Never send "you have nothing to do". That is how digests get muted.
    }

    items.sort((a, b) => Number(b.urgent) - Number(a.urgent));
    const top = items.slice(0, 12);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: r.email,
        subject: items.some((i) => i.urgent)
          ? `Domus: ${items.filter((i) => i.urgent).length} overdue`
          : `Domus: ${items.length} coming up`,
        html: buildEmail(r.full_name ?? "", top, appUrl),
      }),
    });

    if (res.ok) {
      await admin.from("profiles").update({ last_reminded_on: today }).eq("id", r.user_id);
      sent++;
    } else {
      console.error("resend failed", r.user_id, await res.text());
    }
  }

  return new Response(JSON.stringify({ sent, skipped }), {
    headers: { "Content-Type": "application/json" },
  });
});
