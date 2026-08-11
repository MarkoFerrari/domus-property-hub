import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BellOff, CalendarClock, CheckCircle2, Euro, ShieldAlert, Undo2 } from "lucide-react";

import { AppShell } from "../components/AppShell";
import { Card, EmptyBlock, SectionTitle, SeverityPill, Skeleton } from "../components/patterns";
import { useStore } from "../lib/store";
import { PRIORITY_LABEL, SOURCE_LABEL, type NotificationItem } from "../lib/notifications";

type Filter = "all" | "certificate" | "declaration" | "rent";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "Everything" },
  { key: "declaration", label: SOURCE_LABEL.declaration },
  { key: "rent", label: SOURCE_LABEL.rent },
  { key: "certificate", label: SOURCE_LABEL.certificate },
];

/**
 * The notification feed. Priority-sorted, per-item actions, and every entry is
 * recomputed from live data — resolving the underlying thing makes the row
 * disappear on its own.
 */
export default function Notifications() {
  const { loading, notifications, visibleNotifications, dismissed, dismiss, restore } = useStore();
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(
    () => (filter === "all" ? visibleNotifications : visibleNotifications.filter((n) => n.source === filter)),
    [visibleNotifications, filter],
  );

  const dismissedItems = useMemo(
    () => notifications.filter((n) => dismissed.has(n.id)),
    [notifications, dismissed],
  );

  const high = visibleNotifications.filter((n) => n.priority === "high").length;

  if (loading) {
    return (
      <AppShell activeKey="notifications">
        <div className="mx-auto w-full max-w-[1200px]">
          <Skeleton width="35%" height={26} />
          <div style={{ marginTop: 24 }}>
            <Skeleton width="100%" height={260} radius={16} />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeKey="notifications">
      <div className="mx-auto w-full max-w-[1200px]">
        <h1 style={{ fontWeight: 700, fontSize: 24, color: "#111827" }}>Notifications</h1>
        <p className="mt-1" style={{ fontSize: 14, color: "#6b7280" }}>
          {visibleNotifications.length === 0
            ? "Nothing needs you right now."
            : `${visibleNotifications.length} open · ${high} high priority. Sorted by urgency.`}
        </p>

        {visibleNotifications.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              const count =
                f.key === "all"
                  ? visibleNotifications.length
                  : visibleNotifications.filter((n) => n.source === f.key).length;
              return (
                <button
                  key={f.key}
                  type="button"
                  className="tap-44"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={active}
                  style={{
                    height: 32,
                    padding: "0 14px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 600,
                    border: `1px solid ${active ? "#171717" : "#e5e7eb"}`,
                    backgroundColor: active ? "#171717" : "#fff",
                    color: active ? "#fff" : "#6b7280",
                    cursor: "pointer",
                  }}
                >
                  {f.label} {count > 0 ? `(${count})` : ""}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-5">
          {shown.length === 0 ? (
            <Card>
              <EmptyBlock
                icon={<CheckCircle2 size={30} color="#22c55e" aria-hidden="true" />}
                title={visibleNotifications.length === 0 ? "You're all caught up" : "Nothing in this filter"}
                body={
                  visibleNotifications.length === 0
                    ? "Declarations, rent confirmations and certificate renewals appear here the moment they need attention."
                    : "Try a different filter to see the rest of your open items."
                }
              />
            </Card>
          ) : (
            <Card>
              <ul className="flex flex-col divide-y" style={{ borderColor: "#f3f4f6" }}>
                {shown.map((n) => (
                  <NotificationRow key={n.id} item={n} onDismiss={() => dismiss(n.id)} />
                ))}
              </ul>
            </Card>
          )}
        </div>

        {dismissedItems.length > 0 ? (
          <div className="mt-6">
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <SectionTitle>Snoozed</SectionTitle>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                  Still unresolved — just hidden from the list above
                </span>
              </div>
              <ul className="flex flex-col divide-y" style={{ borderColor: "#f3f4f6" }}>
                {dismissedItems.map((n) => (
                  <li
                    key={n.id}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className="sm:truncate"
                        style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", lineHeight: 1.4 }}
                      >
                        {n.title}
                      </div>
                      <div
                        className="sm:truncate"
                        style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.45 }}
                      >
                        {n.subtitle}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => restore(n.id)}
                      className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-semibold text-[#374151] sm:w-auto sm:text-[12px]"
                      style={{
                        minHeight: 44,
                        padding: "0 16px",
                        borderColor: "#e5e7eb",
                        backgroundColor: "#fff",
                      }}
                    >
                      <Undo2 size={14} aria-hidden="true" /> Unsnooze
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function sourceIcon(source: NotificationItem["source"]) {
  if (source === "rent") return <Euro size={16} />;
  if (source === "declaration") return <CalendarClock size={16} />;
  return <ShieldAlert size={16} />;
}

/**
 * One notification.
 *
 * MOBILE: severity label first, then title, then the actions on their own row.
 * Priority is the thing that decides whether this is read now or later, so it
 * leads. It used to sit in the middle of a wrapping flex row, which on a phone
 * put it in a different place on every card depending on how long the title
 * was, and there is no scanning a list whose severity marker moves around.
 *
 * DESKTOP: unchanged single row, where horizontal space makes that the denser
 * and faster layout.
 */
function NotificationRow({ item, onDismiss }: { item: NotificationItem; onDismiss: () => void }) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Mobile only: the label leads the card. */}
      <div className="sm:hidden">
        <SeverityPill severity={item.priority} />
      </div>

      <div className="flex min-w-0 items-start gap-3 sm:flex-1 sm:items-center">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: item.priority === "high" ? "#7f1d1d" : "#b45309",
            color: "#fff",
          }}
          aria-hidden="true"
        >
          {sourceIcon(item.source)}
        </div>

        <div className="min-w-0 flex-1 sm:min-w-[200px]">
          <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", lineHeight: 1.35 }}>
            {item.title}
          </div>
          <div className="mt-0.5" style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
            {item.subtitle}
          </div>
        </div>
      </div>

      <span className="sr-only">{PRIORITY_LABEL[item.priority]}</span>

      {/* Desktop only: the pill sits inline, where it always has. */}
      <div className="hidden sm:block">
        <SeverityPill severity={item.priority} />
      </div>

      {/* 16px gap. Snooze is destructive-adjacent and sits next to the action
          people actually want, so it needs clear separation from it. */}
      <div className="flex shrink-0 items-stretch gap-4">
        <Link
          to={item.to}
          className="flex flex-1 items-center justify-center rounded-lg text-[14px] font-semibold text-white sm:flex-none sm:text-[12px]"
          style={{
            minHeight: 44,
            padding: "0 16px",
            backgroundColor: "#171717",
            whiteSpace: "nowrap",
          }}
        >
          {item.actionLabel}
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Snooze: ${item.title}`}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border transition-colors hover:bg-[#fafafa]"
          style={{
            minHeight: 44,
            minWidth: 44,
            borderColor: "#e5e7eb",
            backgroundColor: "#fff",
            color: "#6b7280",
          }}
        >
          <BellOff size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
