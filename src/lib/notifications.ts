/**
 * Notifications are DERIVED, never stored.  (source of truth §6.3)
 *
 * The whole feed is recomputed from current certificate + ledger data on every
 * call. The only thing persisted anywhere is the set of dismissed ids.
 *
 * This module is pure. Persistence lives in `db.ts`.
 */

import {
  CERT_STATUS_LABEL,
  certExpiryLabel,
  getCompliance,
  type Property,
} from "./compliance";
import {
  OBLIGATION_LABEL,
  OBLIGATION_TYPES,
  completedMonths,
  daysBetween,
  deadlineLabel,
  defaultDeadline,
  obligationKey,
  rentKey,
  type DeclRecord,
  type MonthRef,
  type ObligationType,
  type RentRecord,
} from "./ledger";

export type NotificationItem = {
  id: string;
  priority: "high" | "medium";
  source: "certificate" | "declaration" | "rent";
  title: string;
  subtitle: string;
  actionLabel: string;
  /** Where the user goes to resolve it. */
  to: string;
  propertyId: string;
};

export const SOURCE_LABEL: Record<NotificationItem["source"], string> = {
  certificate: "Certificates",
  declaration: "Declarations",
  rent: "Rent",
};

export const PRIORITY_LABEL: Record<NotificationItem["priority"], string> = {
  high: "High priority",
  medium: "Medium priority",
};

/** More than three outstanding months collapses to oldest + one summary. */
const OUTSTANDING_CAP = 3;

/** A declaration surfaces once its deadline is within this many days. */
const DECLARATION_LEAD_DAYS = 14;

function paydayOf(p: Property) {
  const n = parseInt(String(p.payday ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : 1;
}

/**
 * A due day of 29–31 does not exist in every month. Clamping to the month's
 * last day is what stops "due on the 31st" from silently rolling into the next
 * month and marking every February and April payment late.
 */
function dueDayIn(year: number, monthIdx: number, day: number) {
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return Math.min(day, lastDay);
}

function paymentsRoute(propertyId: string, month: MonthRef, type?: ObligationType) {
  const base = `/properties/${propertyId}?tab=payments&month=${month.key}`;
  return type ? `${base}&obligation=${type}` : base;
}

function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

export function getNotifications(
  properties: Property[],
  declarations: Record<string, DeclRecord>,
  rents: Record<string, RentRecord>,
  now: Date = new Date(),
): NotificationItem[] {
  const items: NotificationItem[] = [];
  const months = completedMonths(now);

  for (const p of properties) {
    /* ---- certificates: reuse the compliance engine, never duplicate it ---- */
    const compliance = getCompliance(p, now);
    for (const c of compliance.outstanding) {
      const { rec, status } = compliance.byName[c.name];
      items.push({
        id: `cert:${p.id}:${c.name}`,
        priority: status === "renew" ? "medium" : "high",
        source: "certificate",
        title: `${c.name} — ${CERT_STATUS_LABEL[status]}`,
        subtitle: `${p.name} · ${certExpiryLabel(rec, status)}`,
        actionLabel: status === "missing" ? "Upload" : "Update",
        to: `/properties/${p.id}?tab=overview&cert=${encodeURIComponent(c.name)}`,
        propertyId: p.id,
      });
    }

    if (p.type === "short") {
      /* ----------------------------------------------------------------------
       * A short-term month carries TWO obligations with two different
       * deadlines. Both have to surface here. ΤΑΚΚ used to be silent, which
       * meant a landlord could file every stay declaration Domus asked for and
       * still miss half of what they owed, with the app's quiet reading as
       * reassurance. Never collapse this back to a single obligation.
       * -------------------------------------------------------------------- */
      for (const type of OBLIGATION_TYPES) {
        const label = OBLIGATION_LABEL[type];

        const outstanding = months.filter((m) => {
          if (declarations[obligationKey(p.id, m, type)]) return false;
          return daysBetween(defaultDeadline(m, type), now) <= DECLARATION_LEAD_DAYS;
        });

        const shown = outstanding.length > OUTSTANDING_CAP ? outstanding.slice(0, 1) : outstanding;

        shown.forEach((m) => {
          const days = daysBetween(defaultDeadline(m, type), now);
          items.push({
            id: `decl:${p.id}:${m.key}:${type}`,
            priority: "high",
            source: "declaration",
            title:
              days < 0
                ? `${m.label} ${label} is overdue`
                : `${m.label} ${label} due in ${days} day${days === 1 ? "" : "s"}`,
            subtitle: `${p.name} · due ${deadlineLabel(m, type)}`,
            actionLabel: "Record",
            to: paymentsRoute(p.id, m, type),
            propertyId: p.id,
          });
        });

        if (outstanding.length > OUTSTANDING_CAP) {
          const rest = outstanding.length - 1;
          items.push({
            id: `decl-summary:${p.id}:${type}`,
            priority: "high",
            source: "declaration",
            title: `${rest} more months of ${label} outstanding`,
            subtitle: `${p.name} · ${outstanding[1].label} to ${
              outstanding[outstanding.length - 1].label
            }`,
            actionLabel: "Review",
            to: `/properties/${p.id}?tab=payments`,
            propertyId: p.id,
          });
        }
      }
    } else {
      /* ---- rent: unconfirmed past its payment day ---- */
      const day = paydayOf(p);
      const outstanding = months.filter((m) => {
        if (rents[rentKey(p.id, m)]) return false;
        return daysBetween(now, new Date(m.year, m.monthIdx, dueDayIn(m.year, m.monthIdx, day))) >= 0;
      });

      const shown = outstanding.length > OUTSTANDING_CAP ? outstanding.slice(0, 1) : outstanding;

      shown.forEach((m) => {
        const due = dueDayIn(m.year, m.monthIdx, day);
        items.push({
          id: `rent:${p.id}:${m.key}`,
          priority: "medium",
          source: "rent",
          title: `${m.label} rent not confirmed`,
          subtitle: `${p.name}${p.rent ? ` · ${p.rent}` : ""} · was due on the ${due}${ordinal(due)}`,
          actionLabel: "Confirm",
          to: paymentsRoute(p.id, m),
          propertyId: p.id,
        });
      });

      if (outstanding.length > OUTSTANDING_CAP) {
        const rest = outstanding.length - 1;
        items.push({
          id: `rent-summary:${p.id}`,
          priority: "medium",
          source: "rent",
          title: `${rest} more months of rent unconfirmed`,
          subtitle: `${p.name} · ${outstanding[1].label} to ${outstanding[outstanding.length - 1].label}`,
          actionLabel: "Review",
          to: `/properties/${p.id}?tab=payments`,
          propertyId: p.id,
        });
      }
    }
  }

  const nameById = new Map(properties.map((p) => [p.id, p.name]));
  return items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
    const an = nameById.get(a.propertyId) ?? "";
    const bn = nameById.get(b.propertyId) ?? "";
    if (an !== bn) return an.localeCompare(bn);
    return a.id.localeCompare(b.id);
  });
}

/** High-priority, non-dismissed count — the red badge in the nav. */
export function getNotificationCount(items: NotificationItem[], dismissed: Set<string>): number {
  return items.filter((n) => n.priority === "high" && !dismissed.has(n.id)).length;
}
