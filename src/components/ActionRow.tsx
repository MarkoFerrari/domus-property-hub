/**
 * One outstanding thing, rendered the same way everywhere it appears.
 *
 * WHY THIS EXISTS: the dashboard action queue and the notifications list showed
 * the same items from the same feed in two hand-written layouts that had
 * drifted apart — different icon sizes, different type sizes, the severity
 * label in a different place, and two different button treatments. A landlord
 * moving between the two screens had to re-learn where to look for the thing
 * that tells them how urgent this is.
 *
 * Extracting it is the only fix that holds. Matching the two by hand would have
 * looked identical today and diverged again on the next change, which is
 * exactly how they got here.
 *
 * MOBILE: severity leads, because it is what decides whether this is read now
 * or later, and a marker that moves around cannot be scanned down a list.
 * DESKTOP: single dense row, where there is width for it.
 */

import { Link } from "react-router-dom";
import { BellOff, CalendarClock, Euro, ShieldAlert } from "lucide-react";

import { SeverityPill } from "./patterns";
import { PRIORITY_LABEL, type NotificationItem } from "../lib/notifications";

function sourceIcon(source: NotificationItem["source"]) {
  if (source === "rent") return <Euro size={16} />;
  if (source === "declaration") return <CalendarClock size={16} />;
  return <ShieldAlert size={16} />;
}

export function ActionRow({
  item,
  onSnooze,
}: {
  item: NotificationItem;
  /** Omitted on the dashboard, where snoozing is not offered. */
  onSnooze?: () => void;
}) {
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
            // Severity, not source. The glyph already says what kind of thing
            // this is; the colour is doing the more useful job of saying how
            // badly it needs attention.
            backgroundColor: item.priority === "high" ? "#7f1d1d" : "#b45309",
            color: "#fff",
          }}
          aria-hidden="true"
        >
          {sourceIcon(item.source)}
        </div>

        <div className="min-w-0 flex-1 sm:min-w-[200px]">
          {/* Wraps on mobile, truncates on desktop. A deadline cut off
              mid-word reads as handled, which is the wrong impression. */}
          <div
            className="sm:truncate"
            style={{ fontSize: 14, fontWeight: 600, color: "#111827", lineHeight: 1.35 }}
          >
            {item.title}
          </div>
          <div
            className="mt-0.5 sm:truncate"
            style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}
          >
            {item.subtitle}
          </div>
        </div>
      </div>

      <span className="sr-only">{PRIORITY_LABEL[item.priority]}</span>

      {/* Desktop only: the pill sits inline. */}
      <div className="hidden sm:block">
        <SeverityPill severity={item.priority} />
      </div>

      {/* 16px gap. Snooze sits next to the action people actually want, so it
          needs clear separation from it. */}
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

        {onSnooze ? (
          <button
            type="button"
            onClick={onSnooze}
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
        ) : null}
      </div>
    </li>
  );
}
