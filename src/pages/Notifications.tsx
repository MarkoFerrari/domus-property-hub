import { useMemo, useState } from "react";
import { CheckCircle2, Undo2 } from "lucide-react";

import { ActionRow } from "../components/ActionRow";
import { AppShell } from "../components/AppShell";
import { Card, EmptyBlock, SectionTitle, Skeleton } from "../components/patterns";
import { useStore } from "../lib/store";
import { SOURCE_LABEL } from "../lib/notifications";

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
                  <ActionRow key={n.id} item={n} onSnooze={() => dismiss(n.id)} />
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
