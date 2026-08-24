/**
 * The data layer.
 *
 * Two interchangeable backends behind one API:
 *   - Supabase (Postgres + RLS) when `.env` has credentials
 *   - localStorage under the `domus.*` namespace otherwise (demo mode)
 *
 * Nothing above this file knows or cares which one is active.
 *
 * NOTE ON THE ARCHITECTURE RULE (§6): there is no `compliance` field and no
 * notifications table here, in either backend. Those are always derived from
 * certificates + declarations + rent at read time.
 */

import { isDemo } from "./demoMode";
import { supabase } from "./supabase";
import { CERTIFICATES, parseAmount, type CertRecord, type Property } from "./compliance";
import { demoLedger } from "./demoLedger";
import {
  deadlineKey,
  obligationKey,
  parseObligationKey,
  parseRentKey,
  rentKey,
  type DeadlineOverride,
  type DeadlineTarget,
  type DeclRecord,
  type ObligationType,
  type RentRecord,
} from "./ledger";
import { appendHistory, changeEntries } from "./history";

/* ========================================================================== */
/* localStorage helpers (demo mode)                                            */
/* ========================================================================== */

const LS = {
  properties: "domus.properties",
  declarations: "domus.ledger.declarations",
  rent: "domus.ledger.rent",
  overrides: "domus.deadlines.overrides",
  dismissed: "domus.notifications.dismissed",
  onboarded: "domus.onboarded",
  seeded: "domus.seeded",
  schema: "domus.schemaVersion",
} as const;

/** Per-month edit logs live under this prefix, one key each. See history.ts. */
const HISTORY_PREFIX = "domus.history.";

function lsRead<T>(key: string, fallback: T): T {
  ensureMigrated();
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * A write that fails is DATA LOSS, and it used to be swallowed silently.
 *
 * localStorage is ~5MB and property photos are stored as data URLs, so a real
 * portfolio can fill it. When that happened the landlord recorded rent, saw it
 * appear on screen, and found it gone after a refresh, with no warning at any
 * point. Anything that cannot be persisted now throws, so the calling dialog
 * shows its error state instead of reporting success.
 */
function lsWrite(key: string, value: unknown) {
  ensureMigrated();
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    const quota =
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED");
    throw new Error(
      quota
        ? "This browser is out of storage, so that change was not saved. Remove a property photo to free space, or connect a database to stop relying on browser storage."
        : "That change could not be saved to this browser. If you are in a private window, browser storage may be switched off.",
    );
  }
}

/* ========================================================================== */
/* Schema migration (demo mode)                                                */
/* ========================================================================== */

/**
 * 1 -> 2  A short-term month grew from one obligation to two, so declaration
 *         keys gained a type segment: `p:2026-06` became `p:2026-06:stay`.
 *         Everything already stored was a stay declaration. Long-term rent
 *         keys are untouched: still one record a month.
 *
 * Runs once, before anything reads. `lsRead` and `lsWrite` both call through
 * `ensureMigrated`, so there is no read path that can see the old shape.
 */
const SCHEMA_VERSION = 2;

let migrationChecked = false;

function ensureMigrated() {
  if (migrationChecked) return;
  migrationChecked = true; // set first: migrate* uses the raw helpers below
  if (!isDemo()) return; // Postgres is migrated by 0003_*.sql
  try {
    migrateLocalStorage();
  } catch {
    /* never let a migration failure take the app down with it */
  }
}

function migrateLocalStorage() {
  const stored = Number(localStorage.getItem(LS.schema));
  const version = Number.isFinite(stored) && stored > 0 ? stored : 1;
  if (version >= SCHEMA_VERSION) return;

  if (version < 2) migrateDeclarationKeysToObligations();

  localStorage.setItem(LS.schema, String(SCHEMA_VERSION));
}

function migrateDeclarationKeysToObligations() {
  const raw = localStorage.getItem(LS.declarations);
  if (!raw) return;

  let map: Record<string, DeclRecord>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    map = parsed as Record<string, DeclRecord>;
  } catch {
    return; // unreadable — leave it exactly as it is rather than destroy it
  }

  const next: Record<string, DeclRecord> = {};
  for (const [key, rec] of Object.entries(map)) {
    if (parseObligationKey(key)) {
      next[key] = rec; // already carries a type
      continue;
    }
    const old = parseRentKey(key);
    if (!old) {
      next[key] = rec; // unrecognised shape: keep it verbatim, lose nothing
      continue;
    }
    const moved = obligationKey(old.propertyId, old.month, "stay");
    // An existing :stay record wins over a re-migrated old one.
    if (!(moved in next)) next[moved] = rec;
  }

  localStorage.setItem(LS.declarations, JSON.stringify(next));
}

/** Exposed for the migration test only. Not part of the data API. */
export const __migration = {
  SCHEMA_VERSION,
  run: migrateLocalStorage,
  reset: () => {
    migrationChecked = false;
  },
};

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/* ========================================================================== */
/* Row shapes (Supabase)                                                       */
/* ========================================================================== */

type PropertyRow = {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  city: string | null;
  type: "short" | "long";
  size: string | null;
  photo_url: string | null;
  nightly: string | null;
  min_stay: string | null;
  ama: string | null;
  rent: string | null;
  tenant: string | null;
  payday: number | null;
};

type CertRow = {
  property_id: string;
  name: string;
  file_name: string | null;
  storage_path: string | null;
  expiry: string | null;
};

function rowToProperty(r: PropertyRow, certs: CertRow[]): Property {
  const certDetails: Record<string, CertRecord> = {};
  for (const c of certs) {
    if (c.property_id !== r.id) continue;
    certDetails[c.name] = {
      file: c.file_name ?? undefined,
      path: c.storage_path ?? undefined,
      expiry: c.expiry ?? undefined,
    };
  }
  return {
    id: r.id,
    name: r.name,
    address: r.address ?? undefined,
    city: r.city ?? undefined,
    type: r.type,
    size: r.size ?? undefined,
    photo: r.photo_url,
    nightly: r.nightly ?? undefined,
    minStay: r.min_stay ?? undefined,
    ama: r.ama ?? undefined,
    rent: r.rent ?? undefined,
    tenant: r.tenant ?? undefined,
    payday: r.payday != null ? String(r.payday) : undefined,
    certDetails,
  };
}

function propertyToRow(p: Partial<Property>) {
  const row: Record<string, unknown> = {};
  if (p.name !== undefined) row.name = p.name;
  if (p.address !== undefined) row.address = p.address || null;
  if (p.city !== undefined) row.city = p.city || null;
  if (p.type !== undefined) row.type = p.type;
  if (p.size !== undefined) row.size = p.size || null;
  if (p.photo !== undefined) row.photo_url = p.photo || null;
  if (p.nightly !== undefined) row.nightly = p.nightly || null;
  if (p.minStay !== undefined) row.min_stay = p.minStay || null;
  if (p.ama !== undefined) row.ama = p.ama || null;
  if (p.rent !== undefined) row.rent = p.rent || null;
  if (p.tenant !== undefined) row.tenant = p.tenant || null;
  if (p.payday !== undefined) {
    const n = parseInt(String(p.payday).replace(/\D/g, ""), 10);
    row.payday = Number.isFinite(n) && n >= 1 && n <= 31 ? n : null;
  }
  return row;
}

/* ========================================================================== */
/* Properties                                                                  */
/* ========================================================================== */

export async function listProperties(userId: string): Promise<Property[]> {
  if (isDemo()) {
    return lsRead<Property[]>(LS.properties, []);
  }
  const sb = supabase!;
  const [{ data: props, error: e1 }, { data: certs, error: e2 }] = await Promise.all([
    sb.from("properties").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    sb.from("certificates").select("property_id, name, file_name, storage_path, expiry").eq("user_id", userId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return (props ?? []).map((r) => rowToProperty(r as PropertyRow, (certs ?? []) as CertRow[]));
}

export async function createProperty(
  userId: string,
  data: Omit<Property, "id">,
): Promise<Property> {
  if (isDemo()) {
    const list = lsRead<Property[]>(LS.properties, []);
    const next: Property = { ...data, id: uid() };
    list.push(next);
    lsWrite(LS.properties, list);
    return next;
  }
  const sb = supabase!;
  const { data: row, error } = await sb
    .from("properties")
    .insert({ ...propertyToRow(data), user_id: userId })
    .select()
    .single();
  if (error) throw error;

  const created = row as PropertyRow;
  const certDetails = data.certDetails ?? {};
  const certRows = Object.entries(certDetails)
    .filter(([, rec]) => rec && (rec.file || rec.expiry))
    .map(([name, rec]) => ({
      user_id: userId,
      property_id: created.id,
      name,
      file_name: rec.file ?? null,
      storage_path: rec.path ?? null,
      expiry: rec.expiry ?? null,
    }));
  if (certRows.length) {
    const { error: ce } = await sb.from("certificates").insert(certRows);
    if (ce) throw ce;
  }
  return { ...data, id: created.id };
}

export async function updateProperty(
  userId: string,
  id: string,
  patch: Partial<Property>,
): Promise<void> {
  if (isDemo()) {
    const list = lsRead<Property[]>(LS.properties, []);
    const i = list.findIndex((p) => p.id === id);
    if (i !== -1) {
      list[i] = { ...list[i], ...patch, id };
      lsWrite(LS.properties, list);
    }
    return;
  }
  const row = propertyToRow(patch);
  if (Object.keys(row).length) {
    const { error } = await supabase!.from("properties").update(row).eq("id", id).eq("user_id", userId);
    if (error) throw error;
  }
  if (patch.certDetails) {
    for (const name of CERTIFICATES) {
      await setCertificate(userId, id, name, patch.certDetails[name]);
    }
  }
}

export async function deleteProperty(userId: string, id: string): Promise<void> {
  if (isDemo()) {
    lsWrite(
      LS.properties,
      lsRead<Property[]>(LS.properties, []).filter((p) => p.id !== id),
    );
    // cascade in demo mode
    const decls = lsRead<Record<string, DeclRecord>>(LS.declarations, {});
    const rents = lsRead<Record<string, RentRecord>>(LS.rent, {});
    const overrides = lsRead<Record<string, DeadlineOverride>>(LS.overrides, {});
    for (const k of Object.keys(decls)) if (k.startsWith(`${id}:`)) delete decls[k];
    for (const k of Object.keys(rents)) if (k.startsWith(`${id}:`)) delete rents[k];
    for (const k of Object.keys(overrides)) if (k.startsWith(`${id}:`)) delete overrides[k];
    lsWrite(LS.declarations, decls);
    lsWrite(LS.rent, rents);
    lsWrite(LS.overrides, overrides);
    // History is append-only and is deliberately NOT cascaded. It outlives the
    // property it describes. See the note in history.ts.
    return;
  }
  const { error } = await supabase!.from("properties").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

/* ========================================================================== */
/* Certificates                                                                */
/* ========================================================================== */

/** Upsert one certificate. Passing `undefined` removes it entirely. */
export async function setCertificate(
  userId: string,
  propertyId: string,
  name: string,
  rec: CertRecord | undefined,
): Promise<void> {
  if (isDemo()) {
    const list = lsRead<Property[]>(LS.properties, []);
    const i = list.findIndex((p) => p.id === propertyId);
    if (i === -1) return;
    const details = { ...(list[i].certDetails ?? {}) };
    if (!rec || (!rec.file && !rec.expiry)) delete details[name];
    else details[name] = rec;
    list[i] = { ...list[i], certDetails: details };
    lsWrite(LS.properties, list);
    return;
  }
  const sb = supabase!;
  if (!rec || (!rec.file && !rec.expiry)) {
    const { error } = await sb
      .from("certificates")
      .delete()
      .eq("property_id", propertyId)
      .eq("name", name)
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = await sb.from("certificates").upsert(
    {
      user_id: userId,
      property_id: propertyId,
      name,
      file_name: rec.file ?? null,
      storage_path: rec.path ?? null,
      expiry: rec.expiry ?? null,
    },
    { onConflict: "property_id,name" },
  );
  if (error) throw error;
}

/* ========================================================================== */
/* Declarations                                                                */
/* ========================================================================== */

/** The fields an obligation record change is logged against. */
const DECL_FIELDS = ["amount", "zero"];

export async function loadDeclarations(userId: string): Promise<Record<string, DeclRecord>> {
  if (isDemo()) return lsRead<Record<string, DeclRecord>>(LS.declarations, {});
  const { data, error } = await supabase!
    .from("declarations")
    .select("property_id, month, type, zero, amount, recorded_at")
    .eq("user_id", userId);
  if (error) throw error;
  const out: Record<string, DeclRecord> = {};
  for (const r of data ?? []) {
    // `type` is null only on rows written before 0003 ran. Those are stays.
    const type: ObligationType = r.type === "takk" ? "takk" : "stay";
    out[obligationKey(r.property_id, r.month, type)] = {
      zero: r.zero,
      amount: r.amount != null ? String(r.amount) : undefined,
      recordedAt: r.recorded_at,
    };
  }
  return out;
}

async function getDeclaration(
  userId: string,
  propertyId: string,
  month: string,
  type: ObligationType,
): Promise<DeclRecord | undefined> {
  if (isDemo()) {
    return lsRead<Record<string, DeclRecord>>(LS.declarations, {})[
      obligationKey(propertyId, month, type)
    ];
  }
  const { data } = await supabase!
    .from("declarations")
    .select("zero, amount, recorded_at")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .eq("month", month)
    .eq("type", type)
    .maybeSingle();
  if (!data) return undefined;
  return {
    zero: data.zero,
    amount: data.amount != null ? String(data.amount) : undefined,
    recordedAt: data.recorded_at,
  };
}

export async function saveDeclaration(
  userId: string,
  propertyId: string,
  month: string,
  type: ObligationType,
  rec: DeclRecord,
): Promise<void> {
  const before = await getDeclaration(userId, propertyId, month, type);

  if (isDemo()) {
    const map = lsRead<Record<string, DeclRecord>>(LS.declarations, {});
    map[obligationKey(propertyId, month, type)] = rec;
    lsWrite(LS.declarations, map);
  } else {
    const amount = rec.zero ? null : Number(String(rec.amount ?? "").replace(/[,\s€]/g, "")) || 0;
    const { error } = await supabase!.from("declarations").upsert(
      {
        user_id: userId,
        property_id: propertyId,
        month,
        type,
        zero: rec.zero,
        amount,
        recorded_at: rec.recordedAt,
      },
      { onConflict: "property_id,month,type" },
    );
    if (error) throw error;
  }

  await appendHistory(
    userId,
    propertyId,
    month,
    changeEntries(type, before, rec, DECL_FIELDS, rec.recordedAt),
  );
}

export async function deleteDeclaration(
  userId: string,
  propertyId: string,
  month: string,
  type: ObligationType,
): Promise<void> {
  const before = await getDeclaration(userId, propertyId, month, type);

  if (isDemo()) {
    const map = lsRead<Record<string, DeclRecord>>(LS.declarations, {});
    delete map[obligationKey(propertyId, month, type)];
    lsWrite(LS.declarations, map);
  } else {
    const { error } = await supabase!
      .from("declarations")
      .delete()
      .eq("user_id", userId)
      .eq("property_id", propertyId)
      .eq("month", month)
      .eq("type", type);
    if (error) throw error;
  }

  await appendHistory(userId, propertyId, month, changeEntries(type, before, undefined, DECL_FIELDS));
}

/* ========================================================================== */
/* Rent                                                                        */
/* ========================================================================== */

export async function loadRent(userId: string): Promise<Record<string, RentRecord>> {
  if (isDemo()) return lsRead<Record<string, RentRecord>>(LS.rent, {});
  const { data, error } = await supabase!
    .from("rent_payments")
    .select("property_id, month, amount, paid_date, note, recorded_at")
    .eq("user_id", userId);
  if (error) throw error;
  const out: Record<string, RentRecord> = {};
  for (const r of data ?? []) {
    out[rentKey(r.property_id, r.month)] = {
      amount: String(r.amount),
      date: r.paid_date ?? undefined,
      note: r.note ?? undefined,
      recordedAt: r.recorded_at,
    };
  }
  return out;
}

const RENT_FIELDS = ["amount", "date", "note"];

async function getRent(
  userId: string,
  propertyId: string,
  month: string,
): Promise<RentRecord | undefined> {
  if (isDemo()) {
    return lsRead<Record<string, RentRecord>>(LS.rent, {})[rentKey(propertyId, month)];
  }
  const { data } = await supabase!
    .from("rent_payments")
    .select("amount, paid_date, note, recorded_at")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .eq("month", month)
    .maybeSingle();
  if (!data) return undefined;
  return {
    amount: String(data.amount),
    date: data.paid_date ?? undefined,
    note: data.note ?? undefined,
    recordedAt: data.recorded_at,
  };
}

export async function saveRent(
  userId: string,
  propertyId: string,
  month: string,
  rec: RentRecord,
): Promise<void> {
  const before = await getRent(userId, propertyId, month);

  if (isDemo()) {
    const map = lsRead<Record<string, RentRecord>>(LS.rent, {});
    map[rentKey(propertyId, month)] = rec;
    lsWrite(LS.rent, map);
  } else {
    const { error } = await supabase!.from("rent_payments").upsert(
      {
        user_id: userId,
        property_id: propertyId,
        month,
        amount: Number(String(rec.amount).replace(/[,\s€]/g, "")) || 0,
        paid_date: rec.date || null,
        note: rec.note || null,
        recorded_at: rec.recordedAt,
      },
      { onConflict: "property_id,month" },
    );
    if (error) throw error;
  }

  await appendHistory(
    userId,
    propertyId,
    month,
    changeEntries("rent", before, rec, RENT_FIELDS, rec.recordedAt),
  );
}

export async function deleteRent(userId: string, propertyId: string, month: string): Promise<void> {
  const before = await getRent(userId, propertyId, month);

  if (isDemo()) {
    const map = lsRead<Record<string, RentRecord>>(LS.rent, {});
    delete map[rentKey(propertyId, month)];
    lsWrite(LS.rent, map);
  } else {
    const { error } = await supabase!
      .from("rent_payments")
      .delete()
      .eq("user_id", userId)
      .eq("property_id", propertyId)
      .eq("month", month);
    if (error) throw error;
  }

  await appendHistory(userId, propertyId, month, changeEntries("rent", before, undefined, RENT_FIELDS));
}

/* ========================================================================== */
/* Deadline overrides                                                          */
/*                                                                             */
/* Defaults are DERIVED in ledger.ts. This store holds only the exceptions:     */
/* a deadline the landlord has moved, or a reminder they have snoozed. An       */
/* absent entry means "use the derived date", which is the normal case.         */
/* ========================================================================== */

export async function loadDeadlineOverrides(
  userId: string,
): Promise<Record<string, DeadlineOverride>> {
  if (isDemo()) return lsRead<Record<string, DeadlineOverride>>(LS.overrides, {});
  const { data, error } = await supabase!
    .from("deadline_overrides")
    .select("property_id, month, target, due_date, snoozed_until, updated_at")
    .eq("user_id", userId);
  if (error) throw error;
  const out: Record<string, DeadlineOverride> = {};
  for (const r of data ?? []) {
    out[deadlineKey(r.property_id, r.month, r.target as DeadlineTarget)] = {
      date: r.due_date ?? undefined,
      snoozedUntil: r.snoozed_until ?? undefined,
      updatedAt: r.updated_at,
    };
  }
  return out;
}

export async function setDeadlineOverride(
  userId: string,
  propertyId: string,
  month: string,
  target: DeadlineTarget,
  override: DeadlineOverride,
): Promise<void> {
  if (isDemo()) {
    const map = lsRead<Record<string, DeadlineOverride>>(LS.overrides, {});
    map[deadlineKey(propertyId, month, target)] = override;
    lsWrite(LS.overrides, map);
    return;
  }
  const { error } = await supabase!.from("deadline_overrides").upsert(
    {
      user_id: userId,
      property_id: propertyId,
      month,
      target,
      due_date: override.date || null,
      snoozed_until: override.snoozedUntil || null,
      updated_at: override.updatedAt,
    },
    { onConflict: "property_id,month,target" },
  );
  if (error) throw error;
}

/** Back to the derived deadline. Removes the exception, not the obligation. */
export async function clearDeadlineOverride(
  userId: string,
  propertyId: string,
  month: string,
  target: DeadlineTarget,
): Promise<void> {
  if (isDemo()) {
    const map = lsRead<Record<string, DeadlineOverride>>(LS.overrides, {});
    delete map[deadlineKey(propertyId, month, target)];
    lsWrite(LS.overrides, map);
    return;
  }
  const { error } = await supabase!
    .from("deadline_overrides")
    .delete()
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .eq("month", month)
    .eq("target", target);
  if (error) throw error;
}

/* ========================================================================== */
/* Dismissed notifications — the only persisted notification state             */
/* ========================================================================== */

export async function loadDismissed(userId: string): Promise<Set<string>> {
  if (isDemo()) return new Set(lsRead<string[]>(LS.dismissed, []));
  const { data, error } = await supabase!
    .from("dismissed_notifications")
    .select("notification_id")
    .eq("user_id", userId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.notification_id));
}

export async function dismissNotification(userId: string, notificationId: string): Promise<void> {
  if (isDemo()) {
    const set = new Set(lsRead<string[]>(LS.dismissed, []));
    set.add(notificationId);
    lsWrite(LS.dismissed, [...set]);
    return;
  }
  const { error } = await supabase!
    .from("dismissed_notifications")
    .upsert({ user_id: userId, notification_id: notificationId }, { onConflict: "user_id,notification_id" });
  if (error) throw error;
}

export async function restoreNotification(userId: string, notificationId: string): Promise<void> {
  if (isDemo()) {
    const set = new Set(lsRead<string[]>(LS.dismissed, []));
    set.delete(notificationId);
    lsWrite(LS.dismissed, [...set]);
    return;
  }
  const { error } = await supabase!
    .from("dismissed_notifications")
    .delete()
    .eq("user_id", userId)
    .eq("notification_id", notificationId);
  if (error) throw error;
}

/* ========================================================================== */
/* Profile / onboarding                                                        */
/* ========================================================================== */

export async function getOnboarded(userId: string): Promise<boolean> {
  if (isDemo()) return lsRead<boolean>(LS.onboarded, false);
  const { data, error } = await supabase!
    .from("profiles")
    .select("onboarded")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.onboarded);
}

export async function setOnboarded(userId: string, value: boolean): Promise<void> {
  if (isDemo()) {
    lsWrite(LS.onboarded, value);
    return;
  }
  const { error } = await supabase!
    .from("profiles")
    .upsert({ id: userId, onboarded: value }, { onConflict: "id" });
  if (error) throw error;
}

/* ========================================================================== */
/* Demo portfolio — source of truth §9                                         */
/* ========================================================================== */

function shiftISO(days: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The §9 demo portfolio.
 *
 * Deviation worth knowing about: the source of truth lists fixed expiry dates
 * AND the statuses they are meant to produce, but those two no longer agree
 * under a 60-day renewal window. The intended STATUSES are what the Figma
 * shows, so the seed uses dates relative to today that reliably reproduce
 * them — Koukaki Loft always derives to "action needed".
 */
export function demoPortfolio(): Array<Omit<Property, "id">> {
  return [
    {
      name: "Koukaki Loft",
      address: "Piraeus 185 32",
      city: "Athens",
      type: "short",
      size: "82 m²",
      nightly: "€120",
      minStay: "2 nights",
      ama: "00254871",
      photo:
        "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=60",
      certDetails: {
        "Fire Safety Certificate": { file: "fire-safety.pdf", expiry: shiftISO(145) },
        "Electrical Installation Report": { file: "electrical.pdf", expiry: shiftISO(219) },
        "Gas Safety Certificate": { file: "gas-safety.pdf", expiry: shiftISO(45) },
        "Energy Performance Certificate (EPC)": { file: "epc.pdf", expiry: shiftISO(120) },
        // Structural Integrity Report deliberately absent -> Missing
        "Noise Level Compliance Certificate": { file: "noise.pdf", expiry: shiftISO(-54) },
      },
    },
    {
      name: "Plaka Studio",
      city: "Athens",
      type: "short",
      nightly: "€95",
      minStay: "2 nights",
      photo:
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=60",
      certDetails: {
        "Fire Safety Certificate": { file: "fire-safety.pdf", expiry: shiftISO(300) },
        "Electrical Installation Report": { file: "electrical.pdf", expiry: shiftISO(280) },
        "Gas Safety Certificate": { file: "gas.pdf", expiry: shiftISO(200) },
        "Energy Performance Certificate (EPC)": { file: "epc.pdf", expiry: shiftISO(400) },
        "Structural Integrity Report": { file: "structural.pdf", expiry: shiftISO(500) },
        "Noise Level Compliance Certificate": { file: "noise.pdf", expiry: shiftISO(250) },
      },
    },
    {
      name: "Glyfada Sea View",
      city: "Glyfada",
      type: "short",
      nightly: "€180",
      minStay: "3 nights",
      photo:
        "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=60",
      certDetails: {
        "Fire Safety Certificate": { file: "fire-safety.pdf", expiry: shiftISO(30) },
        "Electrical Installation Report": { file: "electrical.pdf", expiry: shiftISO(340) },
        "Gas Safety Certificate": { file: "gas.pdf", expiry: shiftISO(190) },
        "Energy Performance Certificate (EPC)": { file: "epc.pdf", expiry: shiftISO(410) },
        "Structural Integrity Report": { file: "structural.pdf", expiry: shiftISO(520) },
        "Noise Level Compliance Certificate": { file: "noise.pdf", expiry: shiftISO(260) },
      },
    },
    {
      name: "Pagkrati 2BR",
      city: "Athens",
      type: "long",
      rent: "€750",
      tenant: "Maria K.",
      payday: "5",
      photo:
        "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=60",
      certDetails: {
        "Fire Safety Certificate": { file: "fire-safety.pdf", expiry: shiftISO(210) },
        "Electrical Installation Report": { file: "electrical.pdf", expiry: shiftISO(330) },
        "Gas Safety Certificate": { file: "gas.pdf", expiry: shiftISO(160) },
        "Energy Performance Certificate (EPC)": { file: "epc.pdf", expiry: shiftISO(380) },
        "Structural Integrity Report": { file: "structural.pdf", expiry: shiftISO(430) },
        "Noise Level Compliance Certificate": { file: "noise.pdf", expiry: shiftISO(240) },
      },
    },
    {
      name: "Kypseli Apartment",
      city: "Athens",
      type: "long",
      rent: "€580",
      tenant: "Nikos P.",
      payday: "1",
      photo:
        "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=60",
      certDetails: {
        "Fire Safety Certificate": { file: "fire-safety.pdf", expiry: shiftISO(150) },
        "Electrical Installation Report": { file: "electrical.pdf", expiry: shiftISO(290) },
        "Gas Safety Certificate": { file: "gas.pdf", expiry: shiftISO(175) },
        "Energy Performance Certificate (EPC)": { file: "epc.pdf", expiry: shiftISO(360) },
        "Structural Integrity Report": { file: "structural.pdf", expiry: shiftISO(460) },
        "Noise Level Compliance Certificate": { file: "noise.pdf", expiry: shiftISO(230) },
      },
    },
  ];
}

/**
 * Adds the demo portfolio for a user, properties AND their payment history.
 * Returns how many properties were added.
 */
export async function seedDemoPortfolio(userId: string): Promise<number> {
  const existing = await listProperties(userId);
  if (existing.length > 0) return 0;

  const demo = demoPortfolio();
  /* The ledger is joined to properties by name, so the ids have to be captured
     as they come back. `demoLedger()` never sees an id. */
  const idByName = new Map<string, string>();
  for (const p of demo) {
    const created = await createProperty(userId, p);
    idByName.set(created.name, created.id);
  }

  await seedDemoLedger(userId, idByName);

  if (isDemo()) lsWrite(LS.seeded, true);
  return demo.length;
}

/**
 * Writes the example portfolio's declarations and rent in bulk.
 *
 * WHY THIS IS NOT JUST A LOOP OVER `saveDeclaration`/`saveRent`: those three
 * things each — a read to find the previous value, the write itself, and a
 * history append. Around eighty records would be some two hundred and forty
 * Supabase round trips, and this runs on a button a signed-up landlord can press
 * ("Explore with an example portfolio" is on the Welcome screen AND in Settings,
 * not only in demo mode). One upsert per table instead.
 *
 * NO HISTORY IS WRITTEN, deliberately. `history.ts` records what a landlord
 * changed, and nobody changed these — they arrived with the example portfolio.
 * Inventing an edit log for them would put a fiction into the one store in Domus
 * that is append-only and meant to be trustworthy. Nothing reads history yet, so
 * this costs nothing today either.
 */
async function seedDemoLedger(userId: string, idByName: Map<string, string>): Promise<void> {
  const { declarations, rents } = demoLedger();

  if (isDemo()) {
    /* One read and one write per store, not one per record. localStorage is
       synchronous and a JSON round trip per record on eighty records is a
       visible pause on the click that loads the demo. */
    const declMap = lsRead<Record<string, DeclRecord>>(LS.declarations, {});
    for (const d of declarations) {
      const propertyId = idByName.get(d.propertyName);
      if (propertyId) declMap[obligationKey(propertyId, d.month, d.type)] = d.rec;
    }
    lsWrite(LS.declarations, declMap);

    const rentMap = lsRead<Record<string, RentRecord>>(LS.rent, {});
    for (const r of rents) {
      const propertyId = idByName.get(r.propertyName);
      if (propertyId) rentMap[rentKey(propertyId, r.month)] = r.rec;
    }
    lsWrite(LS.rent, rentMap);
    return;
  }

  const sb = supabase!;

  const declRows = declarations
    .map((d) => {
      const propertyId = idByName.get(d.propertyName);
      if (!propertyId) return null;
      return {
        user_id: userId,
        property_id: propertyId,
        month: d.month,
        type: d.type,
        zero: d.rec.zero,
        amount: d.rec.zero ? null : parseAmount(d.rec.amount),
        recorded_at: d.rec.recordedAt,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (declRows.length) {
    const { error } = await sb
      .from("declarations")
      .upsert(declRows, { onConflict: "property_id,month,type" });
    if (error) throw error;
  }

  const rentRows = rents
    .map((r) => {
      const propertyId = idByName.get(r.propertyName);
      if (!propertyId) return null;
      return {
        user_id: userId,
        property_id: propertyId,
        month: r.month,
        amount: parseAmount(r.rec.amount),
        paid_date: r.rec.date ?? null,
        note: r.rec.note ?? null,
        recorded_at: r.rec.recordedAt,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rentRows.length) {
    const { error } = await sb
      .from("rent_payments")
      .upsert(rentRows, { onConflict: "property_id,month" });
    if (error) throw error;
  }
}

/**
 * Demo mode only: wipe everything and start over.
 *
 * This clears the per-month edit logs too. That is not a hole in the
 * append-only rule — it is the demo reset button removing the whole dataset,
 * not an app path that can edit one landlord's log.
 */
export function resetDemoData() {
  try {
    for (const key of Object.values(LS)) localStorage.removeItem(key);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(HISTORY_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
  migrationChecked = false;
}
