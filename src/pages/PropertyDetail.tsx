import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "../components/AppShell";
import {
  Card,
  MetricCard,
  ReadOnly,
  SectionCard,
  Skeleton,
  StatusPill,
  TypeTag,
} from "../components/patterns";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CertificateDialog } from "../components/CertificateDialog";
import { RecordDeclarationDialog, RecordRentDialog } from "../components/LedgerDialogs";
import { CalendarTab } from "../components/CalendarTab";
import { useProperty, useStore } from "../lib/store";
import {
  connect as connectCalendar,
  disconnect as disconnectCalendar,
  getConnection,
  simulatedMonth,
  type Channel,
  type Connection,
} from "../lib/calendarPreview";
import { calendarAvailable } from "../lib/features";
import {
  CERTIFICATES,
  CERT_STATUS_LABEL,
  COMPLIANCE_LABEL,
  certExpiryLabel,
  complianceMessage,
  formatEuro,
  getCompliance,
  parseAmount,
} from "../lib/compliance";
import {
  OBLIGATION_LABEL,
  OBLIGATION_TYPES,
  completedMonths,
  deadlineLabel,
  isObligationType,
  obligationKey,
  parseMonthKey,
  rentKey,
  type MonthRef,
  type ObligationType,
} from "../lib/ledger";
import { getPropertyStatus } from "../lib/notifications";
import { DEADLINE_CAVEAT_LONG } from "../lib/legal";

/** "calendar" is conditional. See calendarAvailable() in features.ts and tabsFor() below. */
type Tab = "overview" | "payments" | "calendar";

/**
 * Deriving the tab list in one place stops the tab strip and the `?tab=` parser
 * drifting apart, which is how you end up with a deep link to a tab that cannot
 * be reached by clicking.
 */
function tabsFor(withCalendar: boolean): readonly Tab[] {
  return withCalendar
    ? (["overview", "payments", "calendar"] as const)
    : (["overview", "payments"] as const);
}

/** Which month, and for short-term, which of its two obligations. */
type MonthTarget = { month: MonthRef; type: ObligationType };

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const {
    loading,
    declarations,
    rents,
    notifications,
    saveCertificate,
    removeCertificate,
    recordDeclaration,
    removeDeclaration,
    recordRent,
    removeRent,
    removeProperty,
  } = useStore();
  const property = useProperty(id);

  const tabParam = params.get("tab");
  const certParam = params.get("cert");
  const monthParam = params.get("month");
  const obligationParam = params.get("obligation");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [certOpen, setCertOpen] = useState<string | null>(null);
  const [monthOpen, setMonthOpen] = useState<MonthTarget | null>(null);

  /* The calendar "connection" lives in localStorage, not the store, because it
     is a preview and not portfolio data. See src/lib/calendarPreview.ts. Held
     here rather than inside the tab so the record dialog can read the same
     value: one source, so the nights on the calendar and the nights in the
     dialog cannot disagree. */
  const [connection, setConnection] = useState<Connection | null>(() => getConnection(id));

  /* deep links from notifications: ?cert=… and ?month=… */
  useEffect(() => {
    if (certParam && CERTIFICATES.includes(certParam as (typeof CERTIFICATES)[number])) {
      setCertOpen(certParam);
    }
  }, [certParam]);

  useEffect(() => {
    if (!monthParam) return;
    const m = parseMonthKey(monthParam);
    if (!m) return;
    /* ?obligation= comes from a ΤΑΚΚ notification. Anything else opens the stay
       declaration, which is what every pre-ΤΑΚΚ deep link meant. */
    setMonthOpen({ month: m, type: isObligationType(obligationParam) ? obligationParam : "stay" });
  }, [monthParam, obligationParam]);

  const months = useMemo(() => completedMonths().slice().reverse(), []);

  if (loading) {
    return (
      <AppShell activeKey="properties" topbarRight={<span />}>
        <div className="mx-auto w-full max-w-[1000px]">
          <Skeleton width="45%" height={26} />
          <div style={{ marginTop: 20 }}>
            <Skeleton width="100%" height={220} radius={16} />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!property) return <Navigate to="/properties" replace />;

  const isShort = property.type === "short";
  /* Read at render, not memoised: the demo flag inside calendarAvailable() can
     change while the app is running, and both transitions do a full page load,
     so there is no stale value to hold. */
  const withCalendar = calendarAvailable(isShort);
  const tabs = tabsFor(withCalendar);

  /* An unknown or unavailable ?tab= falls back to Overview rather than showing
     an empty page. A long-term property reached by a ?tab=calendar link lands on
     Overview, which is the only honest destination: it has no calendar. */
  const tab: Tab = tabs.includes(tabParam as Tab) ? (tabParam as Tab) : "overview";

  /* DERIVED on every render — never read from a stored field. */
  const compliance = getCompliance(property);
  const message = complianceMessage(compliance);
  /* The headline pill covers everything outstanding, not just certificates.
     `compliance` is still used below for the certificate banner and grid. */
  const headlineStatus = getPropertyStatus(property.id, notifications);

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set("tab", next);
    p.delete("cert");
    p.delete("month");
    p.delete("obligation");
    setParams(p, { replace: true });
  };

  const closeCert = () => {
    setCertOpen(null);
    const p = new URLSearchParams(params);
    p.delete("cert");
    setParams(p, { replace: true });
  };

  const closeMonth = () => {
    setMonthOpen(null);
    const p = new URLSearchParams(params);
    p.delete("month");
    p.delete("obligation");
    setParams(p, { replace: true });
  };

  /* A short-term month only counts as done when BOTH obligations are recorded.
     Counting the stay declaration alone would report a month as complete while
     ΤΑΚΚ is still outstanding, which is the reassuring-but-wrong number. */
  const recordedCount = months.filter((m) =>
    property.type === "short"
      ? OBLIGATION_TYPES.every((t) => declarations[obligationKey(property.id, m, t)])
      : rents[rentKey(property.id, m)],
  ).length;

  /* Income is the stay declaration only. ΤΑΚΚ is a separate obligation, not a
     second stream of rental income, so adding it here would double count. */
  const yearIncome = months
    .filter((m) => m.year === new Date().getFullYear())
    .reduce((sum, m) => {
      if (property.type === "short") {
        const d = declarations[obligationKey(property.id, m, "stay")];
        return sum + (d && !d.zero ? parseAmount(d.amount) : 0);
      }
      const r = rents[rentKey(property.id, m)];
      return sum + (r ? parseAmount(r.amount) : 0);
    }, 0);

  return (
    <AppShell activeKey="properties" title={property.name} topbarRight={<span />}>
      <div className="mx-auto w-full max-w-[1000px]">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link to="/properties" className="text-[13px] text-[#4b5563] hover:text-[#111827]">
              ← All properties
            </Link>
            <h1 className="mt-2" style={{ fontWeight: 700, fontSize: 26, color: "#111827" }}>
              {property.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <TypeTag type={property.type} />
              <span style={{ fontSize: 13, color: "#4b5563" }}>
                {[property.address, property.city].filter(Boolean).join(", ") || "No address set"}
              </span>
              {/* Same feed as the card and the badge. A green pill here on a
                  property with unrecorded months would contradict both. */}
              <StatusPill status={headlineStatus} size="sm">
                {COMPLIANCE_LABEL[headlineStatus]}
              </StatusPill>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              to={`/properties/${property.id}/edit`}
              className="tap-44 inline-flex items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold text-[#374151]"
              style={{ height: 36, borderColor: "#e5e7eb", backgroundColor: "#fff" }}
            >
              <Pencil size={14} aria-hidden="true" /> Edit property
            </Link>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="tap-44 inline-flex items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold text-[#b91c1c]"
              style={{ height: 36, borderColor: "#fecaca", backgroundColor: "#fff" }}
            >
              <Trash2 size={14} aria-hidden="true" /> Delete
            </button>
          </div>
        </div>

        {/* Derived alert banner — copy is built from the actual offending items */}
        {message ? (
          <div
            role="status"
            className="mt-5 flex items-start gap-3 rounded-xl border px-4 py-3"
            style={{
              borderColor: compliance.status === "action" ? "#fecaca" : "#fde68a",
              backgroundColor: compliance.status === "action" ? "#fef2f2" : "#fffbeb",
            }}
          >
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0"
              color={compliance.status === "action" ? "#b91c1c" : "#b45309"}
              aria-hidden="true"
            />
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: compliance.status === "action" ? "#b91c1c" : "#b45309",
                }}
              >
                {compliance.status === "action" ? "Action needed" : "Renewals coming up"}
              </div>
              <p className="mt-0.5" style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                {message}
              </p>
            </div>
          </div>
        ) : null}

        {/* Tabs */}
        <div className="mt-6 flex gap-1 border-b" style={{ borderColor: "#e5e7eb" }}>
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={tab === t ? "page" : undefined}
              /* Anchor for the product tour. See src/lib/tour.tsx. */
              data-tour={`tab-${t}`}
              style={{
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                color: tab === t ? "#111827" : "#4b5563",
                borderBottom: tab === t ? "2px solid #FF6B35" : "2px solid transparent",
                background: "none",
                cursor: "pointer",
              }}
            >
              {t === "overview"
                ? "Overview"
                : t === "calendar"
                  ? "Calendar"
                  : isShort
                    ? "Declarations"
                    : "Rent"}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <div className="mt-5 flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label={new Date().getFullYear() + " income recorded"}
                value={formatEuro(yearIncome)}
                caption={property.type === "short" ? "From declarations" : "From confirmed rent"}
              />
              <MetricCard
                label={property.type === "short" ? "Months declared" : "Months confirmed"}
                value={`${recordedCount} / ${months.length}`}
                caption="Last 12 completed months"
                tone={recordedCount === months.length ? "good" : "warn"}
              />
              <MetricCard
                label="Certificates outstanding"
                value={compliance.outstanding.length}
                caption={
                  compliance.outstanding.length === 0 ? "All valid" : "Expired, missing or due soon"
                }
                tone={
                  compliance.blocking.length > 0
                    ? "danger"
                    : compliance.expiring.length > 0
                      ? "warn"
                      : "good"
                }
              />
            </div>

            <SectionCard title="Details">
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                <ReadOnly label="Type" value={property.type === "short" ? "Short-term" : "Long-term"} />
                <ReadOnly label="Size" value={property.size || "—"} />
                {property.type === "short" ? (
                  <>
                    <ReadOnly label="Base nightly" value={property.nightly || "—"} />
                    <ReadOnly label="Minimum stay" value={property.minStay || "—"} />
                    <ReadOnly label="AMA number" value={property.ama || "—"} />
                  </>
                ) : (
                  <>
                    <ReadOnly label="Monthly rent" value={property.rent || "—"} />
                    <ReadOnly label="Tenant" value={property.tenant || "—"} />
                    <ReadOnly
                      label="Rent due on"
                      value={property.payday ? `Day ${property.payday}` : "—"}
                    />
                  </>
                )}
                <ReadOnly label="City" value={property.city || "—"} />
              </div>
            </SectionCard>

            <SectionCard title="Certificates">
              <ul className="flex flex-col divide-y" style={{ borderColor: "#f3f4f6" }}>
                {CERTIFICATES.map((name) => {
                  const { rec, status } = compliance.byName[name];
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => setCertOpen(name)}
                        className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-[#fafafa]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-[#111827]">
                            {name}
                          </span>
                          <span className="block truncate text-[12px] text-[#4b5563]">
                            {certExpiryLabel(rec, status)}
                            {rec?.file ? ` · ${rec.file}` : ""}
                          </span>
                        </span>
                        <StatusPill status={status} size="sm">
                          {CERT_STATUS_LABEL[status]}
                        </StatusPill>
                        <ChevronRight size={16} color="#6b7280" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          </div>
        ) : tab === "calendar" ? (
          <CalendarTab
            propertyId={property.id}
            connection={connection}
            onConnect={(channel: Channel) => setConnection(connectCalendar(property.id, channel))}
            onDisconnect={() => {
              disconnectCalendar(property.id);
              setConnection(null);
            }}
          />
        ) : (
          <PaymentsTab
            months={months}
            propertyId={property.id}
            isShort={isShort}
            onOpenMonth={setMonthOpen}
          />
        )}
      </div>

      {/* --------------------------------- dialogs -------------------------------- */}

      <CertificateDialog
        open={certOpen !== null}
        name={certOpen ?? ""}
        record={certOpen ? compliance.byName[certOpen]?.rec : undefined}
        onSave={(input) => saveCertificate(property.id, certOpen!, input)}
        onRemove={() => removeCertificate(property.id, certOpen!)}
        onClose={closeCert}
      />

      {isShort ? (
        <RecordDeclarationDialog
          open={monthOpen !== null}
          month={monthOpen?.month ?? null}
          propertyName={property.name}
          /* Same generator, same three inputs, so this is necessarily the same
             figure the Calendar tab shows for this month. If these two ever
             disagree the landlord stops trusting every number in Domus,
             including the real ones. */
          calendarNights={
            withCalendar && connection && monthOpen
              ? simulatedMonth(
                  property.id,
                  connection.channel,
                  monthOpen.month.year,
                  monthOpen.month.monthIdx,
                ).nights
              : undefined
          }
          calendarChannel={withCalendar ? connection?.channel : undefined}
          existing={
            monthOpen
              ? {
                  stay: declarations[obligationKey(property.id, monthOpen.month, "stay")],
                  takk: declarations[obligationKey(property.id, monthOpen.month, "takk")],
                }
              : {}
          }
          /* A ΤΑΚΚ reminder deep-links with ?obligation=takk. The dialog now
             holds both, so the parameter no longer picks the dialog; it picks
             which field the cursor lands in. */
          focusType={monthOpen?.type}
          onSave={(type, rec) =>
            recordDeclaration(property.id, monthOpen!.month.key, type, rec)
          }
          onDelete={(type) => removeDeclaration(property.id, monthOpen!.month.key, type)}
          onClose={closeMonth}
        />
      ) : (
        <RecordRentDialog
          open={monthOpen !== null}
          month={monthOpen?.month ?? null}
          propertyName={property.name}
          expectedRent={property.rent}
          existing={monthOpen ? rents[rentKey(property.id, monthOpen.month)] : undefined}
          onSave={(rec) => recordRent(property.id, monthOpen!.month.key, rec)}
          onDelete={() => removeRent(property.id, monthOpen!.month.key)}
          onClose={closeMonth}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${property.name}?`}
        description="This removes the property and every declaration, rent record and certificate attached to it. This cannot be undone."
        confirmLabel="Delete property"
        destructive
        onConfirm={async () => {
          await removeProperty(property.id);
          toast.success(`${property.name} deleted`);
          navigate("/properties", { replace: true });
        }}
        onClose={() => setDeleteOpen(false)}
      />
    </AppShell>
  );
}

/* ------------------------------- Payments tab ------------------------------ */

/**
 * Short-term months carry TWO obligations, so a short-term table has two rows
 * per month, not one. Rendering only the stay declaration is what let ΤΑΚΚ
 * disappear from the product entirely while the data layer supported it.
 */
function PaymentsTab({
  months,
  propertyId,
  isShort,
  onOpenMonth,
}: {
  months: MonthRef[];
  propertyId: string;
  isShort: boolean;
  onOpenMonth: (t: MonthTarget) => void;
}) {
  const { declarations, rents } = useStore();

  type Row = {
    key: string;
    month: MonthRef;
    obligation: string;
    due: string;
    /** Fully done. For short-term that means BOTH obligations, never one. */
    done: boolean;
    /** True when one of the two is recorded and the other is not. */
    partial: boolean;
    statusLabel: string;
    onOpen: () => void;
  };

  /* ONE ROW PER MONTH, including short-term where a month carries two
     obligations. They used to be two rows opening two dialogs; both are now
     handled in a single dialog, so two rows would offer two routes to the same
     place and split a month's status across two lines that had to be read
     together to mean anything. */
  const rows: Row[] = isShort
    ? months.map((m) => {
        const recs = OBLIGATION_TYPES.map((t) => declarations[obligationKey(propertyId, m, t)]);
        const doneCount = recs.filter(Boolean).length;

        const total = recs.reduce(
          (sum, r) => sum + (r && !r.zero ? parseAmount(r.amount) : 0),
          0,
        );
        const allZero = doneCount === OBLIGATION_TYPES.length && recs.every((r) => r?.zero);

        return {
          key: m.key,
          month: m,
          obligation: OBLIGATION_TYPES.map((t) => OBLIGATION_LABEL[t]).join(" + "),
          // Both deadlines, because they are genuinely different dates and the
          // earlier one is the one that bites first.
          due: OBLIGATION_TYPES.map((t) => deadlineLabel(m, t)).join(" · "),
          done: doneCount === OBLIGATION_TYPES.length,
          partial: doneCount > 0 && doneCount < OBLIGATION_TYPES.length,
          statusLabel:
            doneCount === 0
              ? "Neither recorded"
              : doneCount < OBLIGATION_TYPES.length
                ? // Name the outstanding one. "1 of 2" makes the landlord open
                  // the dialog just to find out which half is missing.
                  `${OBLIGATION_LABEL[OBLIGATION_TYPES[recs.findIndex((r) => !r)]]} outstanding`
                : allZero
                  ? "Both recorded · nothing to declare"
                  : `Both recorded · ${formatEuro(total)}`,
          onOpen: () => onOpenMonth({ month: m, type: "stay" }),
        };
      })
    : months.map((m) => {
        const rent = rents[rentKey(propertyId, m)];
        return {
          key: m.key,
          month: m,
          obligation: "Rent",
          due: rent ? formatEuro(parseAmount(rent.amount)) : "—",
          done: Boolean(rent),
          partial: false,
          statusLabel: rent ? "Confirmed" : "Not confirmed",
          onOpen: () => onOpenMonth({ month: m, type: "stay" }),
        };
      });

  return (
    <Card className="mt-5">
      <div className="mb-4">
        <h2 style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>
          {isShort ? "Monthly obligations" : "Monthly rent"}
        </h2>
        <p className="mt-1" style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
          {isShort
            ? "The last 12 completed months. Each month carries two obligations with two different deadlines, and both are listed. A month that earned nothing still has to be declared."
            : "The last 12 completed months. Confirm each month once the money has actually arrived."}
        </p>
        <p className="mt-2" style={{ fontSize: 12, color: "#6b7280" }}>
          The current month is not listed. You cannot record a month that has not ended.
        </p>
      </div>

      {/* MOBILE: stacked cards.
          The table below needs 560px to hold its five columns, which on a phone
          meant sideways scrolling to reach the one thing anyone came here to
          press. Worse, the action column was the part pushed off-screen, so the
          button was invisible until you scrolled. Same data, same handlers,
          stacked vertically instead. */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {rows.map((r, i) => (
          <li
            key={r.key}
            className="rounded-xl border p-4"
            style={{ borderColor: "#f3f4f6", backgroundColor: "#fff" }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>
                {r.month.label}
              </span>
              {isShort ? (
                <span style={{ fontSize: 13, color: "#374151" }}>{r.obligation}</span>
              ) : null}
            </div>

            <div className="mt-1" style={{ fontSize: 13, color: "#4b5563" }}>
              {isShort ? `Due ${r.due}` : r.due}
            </div>

            <div className="mt-3">
              <StatusPill status={r.done ? "valid" : r.partial ? "renew" : "missing"} size="sm">
                {r.statusLabel}
              </StatusPill>
            </div>

            {/* Full-width on purpose. A phone thumb should not have to aim. */}
            <button
              type="button"
              onClick={r.onOpen}
              aria-label={`${r.done ? "Edit" : "Record"} ${r.obligation} for ${r.month.label}`}
              /* Tour anchor on the newest month only, which is the one still
                 outstanding. The desktop table below carries the same attribute;
                 only one of the two is visible at any width. */
              data-tour={i === 0 ? "record-button" : undefined}
              className="mt-4 flex w-full items-center justify-center rounded-lg border text-[14px] font-semibold text-[#374151]"
              style={{ minHeight: 44, borderColor: "#e5e7eb", backgroundColor: "#fff" }}
            >
              {r.done ? "Edit" : isShort ? "Record" : "Confirm"}
            </button>
          </li>
        ))}
      </ul>

      {/* DESKTOP: the table is the right shape once there is room for it. */}
      <div className="hidden sm:block">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ fontSize: 11, letterSpacing: "0.06em", color: "#6b7280", textAlign: "left" }}>
              <th scope="col" className="py-2 font-bold">MONTH</th>
              <th scope="col" className="py-2 font-bold">{isShort ? "DEADLINES" : "AMOUNT"}</th>
              <th scope="col" className="py-2 font-bold">STATUS</th>
              <th scope="col" className="py-2 font-bold text-right">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td className="py-3" style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                  {r.month.label}
                </td>
                <td className="py-3" style={{ fontSize: 13, color: "#4b5563" }}>
                  {r.due}
                </td>
                <td className="py-3">
                  <StatusPill
                    status={r.done ? "valid" : r.partial ? "renew" : "missing"}
                    size="sm"
                  >
                    {r.statusLabel}
                  </StatusPill>
                </td>
                <td className="py-3 text-right">
                  <button
                    type="button"
                    onClick={r.onOpen}
                    aria-label={`${r.done ? "Edit" : "Record"} ${r.obligation} for ${r.month.label}`}
                    data-tour={i === 0 ? "record-button" : undefined}
                    className="tap-44 rounded-lg border px-3 text-[12px] font-semibold text-[#374151]"
                    style={{ height: 30, borderColor: "#e5e7eb", backgroundColor: "#fff" }}
                  >
                    {r.done ? "Edit" : isShort ? "Record" : "Confirm"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4" style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.55 }}>
        {DEADLINE_CAVEAT_LONG}
      </p>
    </Card>
  );
}
