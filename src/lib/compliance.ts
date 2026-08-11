/**
 * Compliance is DERIVED, never stored.  (source of truth §6.1)
 *
 * A property's status is computed at render time from its current certificate
 * data. There is no `compliance` column in the database and there must never
 * be one — that stored field is exactly what caused the original bug where a
 * resolved alert never went away.
 *
 * This module is pure. It does no I/O. Persistence lives in `db.ts`.
 */

export const CERTIFICATES = [
  "Fire Safety Certificate",
  "Electrical Installation Report",
  "Gas Safety Certificate",
  "Energy Performance Certificate (EPC)",
  "Structural Integrity Report",
  "Noise Level Compliance Certificate",
] as const;

export type CertificateName = (typeof CERTIFICATES)[number];

/**
 * A certificate as stored. No `file` means Missing.
 *
 * `file` is the display name. `path` is the object actually held in storage,
 * and is what proves a document exists rather than just a string someone typed.
 * `demo` marks a record created in demo mode, where no bytes are kept: the UI
 * must say so rather than implying the document is safe somewhere.
 */
export type CertRecord = {
  file?: string;
  path?: string;
  demo?: boolean;
  /** ISO yyyy-mm-dd */
  expiry?: string;
};

export type PropertyType = "short" | "long";

export type Property = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  type: PropertyType;
  size?: string;
  photo?: string | null;

  /** short-term */
  nightly?: string;
  minStay?: string;
  ama?: string;

  /** long-term */
  rent?: string;
  tenant?: string;
  payday?: string;

  /** name -> { file, expiry } */
  certDetails?: Record<string, CertRecord>;
};

export type CertStatus = "valid" | "renew" | "expired" | "missing";

export const CERT_STATUS_LABEL: Record<CertStatus, string> = {
  valid: "Valid",
  renew: "Due soon",
  expired: "Expired",
  missing: "Missing",
};

/** Days before expiry at which a certificate becomes "Due soon". */
export const RENEW_WINDOW_DAYS = 60;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function certStatus(rec: CertRecord | undefined, now: Date = new Date()): CertStatus {
  if (!rec || !rec.file) return "missing";
  if (!rec.expiry) return "valid";
  const d = new Date(`${rec.expiry}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "valid";
  const days = Math.floor((d.getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= RENEW_WINDOW_DAYS) return "renew";
  return "valid";
}

export type ComplianceResult = {
  status: "compliant" | "renew" | "action";
  /** Expired or Missing. */
  blocking: Array<{ name: string; status: CertStatus }>;
  /** Due soon. */
  expiring: Array<{ name: string; status: CertStatus }>;
  /** Everything outstanding, blocking first. */
  outstanding: Array<{ name: string; status: CertStatus }>;
  byName: Record<string, { rec: CertRecord | undefined; status: CertStatus }>;
};

export function getCompliance(
  property: Pick<Property, "certDetails">,
  now: Date = new Date(),
): ComplianceResult {
  const certs = property.certDetails ?? {};
  const byName: ComplianceResult["byName"] = {};
  const blocking: ComplianceResult["blocking"] = [];
  const expiring: ComplianceResult["expiring"] = [];

  for (const name of CERTIFICATES) {
    const rec = certs[name];
    const status = certStatus(rec, now);
    byName[name] = { rec, status };
    if (status === "expired" || status === "missing") blocking.push({ name, status });
    else if (status === "renew") expiring.push({ name, status });
  }

  const status = blocking.length > 0 ? "action" : expiring.length > 0 ? "renew" : "compliant";
  return { status, blocking, expiring, outstanding: [...blocking, ...expiring], byName };
}

export const COMPLIANCE_LABEL: Record<ComplianceResult["status"], string> = {
  compliant: "Compliant",
  renew: "Renew soon",
  action: "Action needed",
};

/**
 * A human sentence built from the certificates that are ACTUALLY offending.
 * Never hardcode certificate names into UI copy — that was the original bug.
 */
export function complianceMessage(result: ComplianceResult): string | null {
  if (result.outstanding.length === 0) return null;
  const parts: string[] = [];
  const expired = result.blocking.filter((c) => c.status === "expired").map((c) => c.name);
  const missing = result.blocking.filter((c) => c.status === "missing").map((c) => c.name);
  const due = result.expiring.map((c) => c.name);

  if (expired.length) parts.push(`${joinNames(expired)} ${expired.length > 1 ? "have" : "has"} expired`);
  if (missing.length) parts.push(`${joinNames(missing)} ${missing.length > 1 ? "are" : "is"} not uploaded`);
  if (due.length) parts.push(`${joinNames(due)} ${due.length > 1 ? "are" : "is"} due for renewal`);

  return `${capitalize(parts.join("; "))}.`;
}

function joinNames(names: string[]) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* --------------------------------- format --------------------------------- */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 2026-10-22 -> "22 Oct 2026"  (§1 date convention) */
export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function certExpiryLabel(rec: CertRecord | undefined, status: CertStatus): string {
  if (status === "missing") return "Not uploaded yet";
  if (!rec?.expiry) return "No expiry date set";
  return status === "expired" ? `Expired ${formatDate(rec.expiry)}` : `Valid until ${formatDate(rec.expiry)}`;
}

/** "€1,234" from a stored string or number. */
export function parseAmount(s: string | number | undefined | null): number {
  if (typeof s === "number") return Number.isFinite(s) ? s : 0;
  const n = Number(String(s ?? "").replace(/[,\s€]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatEuro(n: number): string {
  return `€${n.toLocaleString("en-US")}`;
}
