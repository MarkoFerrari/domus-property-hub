/**
 * The edit log. Append-only.
 *
 * WHY THIS EXISTS: a landlord who corrects a figure needs to be able to see
 * what they first entered and when they changed it. That record is only worth
 * anything if it cannot be quietly rewritten, so this module exposes exactly
 * two operations: append, and read. There is deliberately no delete, no update
 * and no clear. Do not add one.
 *
 * It is wired into the write paths in `db.ts`, never into dialog components,
 * so a future screen cannot save a change without logging it.
 *
 * WHAT THIS IS NOT: it is not proof of a filing. It records what was entered
 * into Domus and when. Domus cannot know whether anything was filed with AADE.
 *
 * Storage mirrors `db.ts`: Supabase when configured, localStorage otherwise.
 */

import { isSupabaseConfigured, supabase } from "./supabase";

/** One change to one field. `from` undefined means the field had no value. */
export type HistoryEntry = {
  /** ISO timestamp. */
  ts: string;
  /** Dotted path, e.g. "stay.amount", "takk.amount", "rent.date". */
  field: string;
  from?: string;
  to?: string;
};

/** `domus.history.<propertyId>:<YYYY-MM>` */
export function historyKey(propertyId: string, month: string): string {
  return `domus.history.${propertyId}:${month}`;
}

/* ========================================================================== */
/* Building entries                                                            */
/* ========================================================================== */

/**
 * The value written when a month goes from having no record to having one, or
 * back again. The landlord marked it done in Domus; that is all it means.
 */
export const DONE = "recorded";
export const NOT_DONE = "not recorded";

function norm(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

/**
 * Diff two versions of a record into entries, one per changed field.
 * Unchanged fields produce nothing, so re-saving without edits logs nothing.
 */
export function changeEntries(
  prefix: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  fields: string[],
  ts: string = new Date().toISOString(),
): HistoryEntry[] {
  const out: HistoryEntry[] = [];

  const wasRecorded = Boolean(before);
  const isRecorded = Boolean(after);
  if (wasRecorded !== isRecorded) {
    out.push({
      ts,
      field: `${prefix}.status`,
      from: wasRecorded ? DONE : NOT_DONE,
      to: isRecorded ? DONE : NOT_DONE,
    });
  }

  for (const f of fields) {
    const from = norm(before?.[f]);
    const to = norm(after?.[f]);
    if (from === to) continue;
    out.push({ ts, field: `${prefix}.${f}`, from, to });
  }

  return out;
}

/* ========================================================================== */
/* Append                                                                      */
/* ========================================================================== */

/**
 * Add entries to a month's log. Never rewrites or removes what is already
 * there. A failure here must not lose the write it is logging, so it throws
 * nothing — a missing log line is bad, a lost amount is worse.
 */
export async function appendHistory(
  userId: string,
  propertyId: string,
  month: string,
  entries: HistoryEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  try {
    if (!isSupabaseConfigured) {
      const key = historyKey(propertyId, month);
      const existing = readLocal(key);
      localStorage.setItem(key, JSON.stringify([...existing, ...entries]));
      return;
    }

    const { error } = await supabase!.from("ledger_history").insert(
      entries.map((e) => ({
        user_id: userId,
        property_id: propertyId,
        month,
        ts: e.ts,
        field: e.field,
        from_value: e.from ?? null,
        to_value: e.to ?? null,
      })),
    );
    if (error) throw error;
  } catch {
    /* quota, private mode, offline — the record itself is already saved */
  }
}

/* ========================================================================== */
/* Read                                                                        */
/* ========================================================================== */

/** One month's log, oldest entry first. The first entry is the original one. */
export async function readHistory(
  userId: string,
  propertyId: string,
  month: string,
): Promise<HistoryEntry[]> {
  if (!isSupabaseConfigured) {
    return sortByTs(readLocal(historyKey(propertyId, month)));
  }

  const { data, error } = await supabase!
    .from("ledger_history")
    .select("ts, field, from_value, to_value")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .eq("month", month)
    .order("ts", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((r) => ({
    ts: r.ts as string,
    field: r.field as string,
    from: (r.from_value as string | null) ?? undefined,
    to: (r.to_value as string | null) ?? undefined,
  }));
}

/* ========================================================================== */
/* Internals                                                                   */
/* ========================================================================== */

function readLocal(key: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function sortByTs(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}
