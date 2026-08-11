/**
 * Data export.
 *
 * Two jobs, and they are not the same job:
 *
 *   1. GDPR Article 20 (portability). Everything Domus holds, in a form the
 *      landlord can take elsewhere. That is `exportJson`.
 *   2. The accountant's spreadsheet. The thing a landlord actually asks for
 *      once a year. That is `exportCsv`.
 *
 * Both run entirely in the browser from data already loaded. No server round
 * trip, so an export cannot itself become a way to leak a portfolio.
 */

import { CERTIFICATES, certStatus, parseAmount, type Property } from "./compliance";
import {
  OBLIGATION_LABEL,
  OBLIGATION_TYPES,
  completedMonths,
  deadlineLabel,
  obligationKey,
  rentKey,
  type DeclRecord,
  type RentRecord,
} from "./ledger";

export type ExportInput = {
  properties: Property[];
  declarations: Record<string, DeclRecord>;
  rents: Record<string, RentRecord>;
  email: string;
};

/** RFC 4180: quote everything, double any inner quotes. Excel-safe. */
function cell(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(rows: unknown[][]): string {
  // The BOM is what stops Excel mangling ΤΑΚΚ and Greek property names.
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

/**
 * One row per property per month per obligation. Long and boring on purpose:
 * an accountant filters and pivots it, they do not read it.
 */
export function buildLedgerCsv({ properties, declarations, rents }: ExportInput): string {
  const months = completedMonths();
  const rows: unknown[][] = [
    [
      "Property",
      "Type",
      "Address",
      "City",
      "Month",
      "Obligation",
      "Due date",
      "Status",
      "Amount (EUR)",
      "Date received",
      "Note",
      "Recorded at",
    ],
  ];

  for (const p of properties) {
    const typeLabel = p.type === "short" ? "Short-term" : "Long-term";
    for (const m of months) {
      if (p.type === "short") {
        for (const t of OBLIGATION_TYPES) {
          const rec = declarations[obligationKey(p.id, m, t)];
          rows.push([
            p.name,
            typeLabel,
            p.address ?? "",
            p.city ?? "",
            m.key,
            OBLIGATION_LABEL[t],
            deadlineLabel(m, t),
            rec ? (rec.zero ? "Recorded, nothing to declare" : "Recorded") : "Not recorded",
            rec && !rec.zero ? parseAmount(rec.amount) : "",
            "",
            "",
            rec?.recordedAt ?? "",
          ]);
        }
      } else {
        const rec = rents[rentKey(p.id, m)];
        rows.push([
          p.name,
          typeLabel,
          p.address ?? "",
          p.city ?? "",
          m.key,
          "Rent",
          p.payday ? `Day ${p.payday}` : "",
          rec ? "Confirmed" : "Not confirmed",
          rec ? parseAmount(rec.amount) : "",
          rec?.date ?? "",
          rec?.note ?? "",
          rec?.recordedAt ?? "",
        ]);
      }
    }
  }

  return toCsv(rows);
}

/** One row per certificate, with status worked out at export time. */
export function buildCertificatesCsv({ properties }: ExportInput): string {
  const rows: unknown[][] = [
    ["Property", "Certificate", "Status", "Expiry", "Document", "Document stored"],
  ];
  for (const p of properties) {
    for (const name of CERTIFICATES) {
      const rec = p.certDetails?.[name];
      rows.push([
        p.name,
        name,
        certStatus(rec),
        rec?.expiry ?? "",
        rec?.file ?? "",
        rec?.path ? "Yes" : rec?.file ? "No, name only" : "",
      ]);
    }
  }
  return toCsv(rows);
}

/** Everything, unflattened. This is the portability copy, not the readable one. */
export function buildFullJson(input: ExportInput): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      account: { email: input.email },
      note:
        "Amounts are what you entered into Domus. Domus does not calculate tax and this file is " +
        "not evidence of any filing.",
      properties: input.properties,
      declarations: input.declarations,
      rents: input.rents,
    },
    null,
    2,
  );
}

/** Trigger a download without leaving the page or touching a server. */
export function download(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoking immediately can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
