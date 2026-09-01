/**
 * The Calendar tab. D1 in the handoff doc.
 *
 * Shows which nights a short-term property was booked, per month, from a
 * "connected" Airbnb or Booking.com calendar.
 *
 * THE CONNECTION IS SIMULATED. See `src/lib/calendarPreview.ts` for why, and for
 * the rule that keeps the numbers stable across screens. Everything user-facing
 * in here that shows a night count sits next to a disclaimer from `legal.ts`
 * saying so, and that pairing is not optional while `CALENDAR_IS_SIMULATED` is
 * true.
 *
 * A calendar connection carries NIGHTS, NOT MONEY. Real Airbnb and Booking.com
 * iCal feeds deliberately exclude prices and guest details, so the copy in here
 * must never imply Domus will fill in income. The empty state says so before the
 * landlord connects, rather than leaving them to discover it afterwards and
 * conclude the feature is broken.
 */

import { useMemo, useState } from "react";
import { CalendarDays, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";

import { EmptyBlock, Modal, SectionCard, WarningNote } from "./patterns";
import { ConfirmDialog } from "./ConfirmDialog";
import { Btn } from "./ui-primitives";
import {
  CHANNELS,
  CHANNEL_LABEL,
  daysInMonth,
  nightsSummary,
  simulatedMonth,
  type Channel,
  type Connection,
} from "../lib/calendarPreview";
import { CALENDAR_IS_SIMULATED } from "../lib/features";
import { CALENDAR_SIMULATED_LONG } from "../lib/legal";
import { completedMonths, monthRef, type MonthRef } from "../lib/ledger";

/* Monday first. Greek weeks start on Monday and so does every calendar the
   landlord already uses. Sunday-first would read as an American import. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** JS getDay() is Sunday-0. Shift it so Monday sits in column 0. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/* Btn is full-width by design, which is right in a form and wrong in a toolbar.
   Inline style rather than a utility class so it cannot lose to the base
   classes depending on stylesheet order. */
const INLINE_BTN = { width: "auto", paddingLeft: 16, paddingRight: 16 } as const;

export function CalendarTab({
  propertyId,
  connection,
  onConnect,
  onDisconnect,
}: {
  propertyId: string;
  connection: Connection | null;
  onConnect: (channel: Channel) => void;
  onDisconnect: () => void;
}) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  /* The same 12 completed months every other screen uses, plus the month we are
     in. The current month cannot be recorded yet, but hiding it from a calendar
     would read as a bug rather than as a rule. */
  const months = useMemo<MonthRef[]>(() => {
    const now = new Date();
    return [...completedMonths(now), monthRef(now.getFullYear(), now.getMonth())];
  }, []);

  /* Open on the most recent COMPLETED month: the one they are most likely to be
     about to record. */
  const [index, setIndex] = useState(Math.max(0, months.length - 2));
  const month = months[index] ?? months[months.length - 1];

  if (!connection) {
    return (
      <div className="mt-5">
        <SectionCard title="Calendar">
          <EmptyBlock
            icon={<CalendarDays size={26} color="#6b7280" aria-hidden="true" />}
            title="See your booked nights here"
            body="Connect a calendar and Domus shows which nights were booked each month, so you are not counting them by hand. Nights only: a calendar connection never includes prices."
            action={
              <Btn onClick={() => setConnectOpen(true)} style={INLINE_BTN}>
                <Link2 size={16} aria-hidden="true" /> Connect a calendar
              </Btn>
            }
          />
        </SectionCard>

        <ConnectDialog
          open={connectOpen}
          onClose={() => setConnectOpen(false)}
          onPick={(channel) => {
            onConnect(channel);
            setConnectOpen(false);
            toast.success(`${CHANNEL_LABEL[channel]} calendar connected`);
          }}
        />
      </div>
    );
  }

  const data = simulatedMonth(propertyId, connection.channel, month.year, month.monthIdx);
  const total = daysInMonth(month.year, month.monthIdx);
  const leading = mondayIndex(new Date(month.year, month.monthIdx, 1));

  return (
    <div className="mt-5 flex flex-col gap-4">
      {CALENDAR_IS_SIMULATED ? (
        <WarningNote>
          <strong style={{ fontWeight: 700 }}>Preview feature.</strong> {CALENDAR_SIMULATED_LONG}
        </WarningNote>
      ) : null}

      <SectionCard
        title={`${CHANNEL_LABEL[connection.channel]} calendar`}
        action={
          <button
            type="button"
            onClick={() => setDisconnectOpen(true)}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-[#111827]"
            style={{ fontSize: 13, fontWeight: 600, color: "#4b5563" }}
          >
            <Unlink size={14} aria-hidden="true" /> Disconnect
          </button>
        }
      >
        {/* Month switcher */}
        <div className="flex items-center justify-between gap-3">
          <Btn
            variant="secondary"
            style={INLINE_BTN}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            aria-label="Previous month"
          >
            ←
          </Btn>
          <div className="min-w-0 text-center">
            <p style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>
              {month.label} {month.year}
            </p>
            <p style={{ fontSize: 13, color: "#4b5563" }}>{nightsSummary(data)}</p>
          </div>
          <Btn
            variant="secondary"
            style={INLINE_BTN}
            onClick={() => setIndex((i) => Math.min(months.length - 1, i + 1))}
            disabled={index === months.length - 1}
            aria-label="Next month"
          >
            →
          </Btn>
        </div>

        {/* Grid */}
        <div className="mt-5">
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                aria-hidden="true"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: "#6b7280",
                  textAlign: "center",
                  paddingBottom: 4,
                }}
              >
                {d.toUpperCase()}
              </div>
            ))}

            {Array.from({ length: leading }, (_, i) => (
              <div key={`pad-${i}`} aria-hidden="true" />
            ))}

            {Array.from({ length: total }, (_, i) => {
              const day = i + 1;
              const booked = data.bookedDays.has(day);
              return (
                <div
                  key={day}
                  /* Screen readers get the state in words. Colour alone would
                     fail the AA target the project is working to. */
                  aria-label={`${day} ${month.label}: ${booked ? "booked" : "free"}`}
                  className="flex items-center justify-center"
                  style={{
                    aspectRatio: "1 / 1",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: booked ? 700 : 500,
                    color: booked ? "#9A3412" : "#4b5563",
                    backgroundColor: booked ? "#FFF1EA" : "#ffffff",
                    border: `1px solid ${booked ? "#FFD5C6" : "#f3f4f6"}`,
                  }}
                >
                  {day}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-4" style={{ fontSize: 12, color: "#4b5563" }}>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  backgroundColor: "#FFF1EA",
                  border: "1px solid #FFD5C6",
                  display: "inline-block",
                }}
              />
              Booked night
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  backgroundColor: "#ffffff",
                  border: "1px solid #f3f4f6",
                  display: "inline-block",
                }}
              />
              Free
            </span>
          </div>

          {/* The checkout-day rule, said out loud. A landlord counting squares
              and getting one more than Domus will assume Domus is wrong. */}
          <p className="mt-3" style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
            A night is counted where the guest sleeps, so a checkout day is not a
            booked night. A stay from the 10th to the 12th is two nights.
          </p>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={disconnectOpen}
        title={`Disconnect the ${CHANNEL_LABEL[connection.channel]} calendar?`}
        description="The Calendar tab goes back to its empty state and night counts stop appearing when you record a month. Nothing you have already recorded is changed or removed. You can reconnect at any time."
        confirmLabel="Disconnect"
        destructive
        onConfirm={async () => {
          onDisconnect();
          setDisconnectOpen(false);
          toast.success("Calendar disconnected");
        }}
        onClose={() => setDisconnectOpen(false)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Connect dialog                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Picks a channel. There is no URL field, because there is nothing to fetch.
 *
 * When the real integration lands this becomes two `.ics` URL inputs. Keeping
 * the connection decision in one dialog means that change is contained here
 * rather than spread across the tab.
 */
function ConnectDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (channel: Channel) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect a calendar"
      description="Choose where this property is listed. Domus will show which nights were booked each month."
      footer={
        <Btn variant="secondary" onClick={onClose}>
          Cancel
        </Btn>
      }
    >
      <div className="flex flex-col gap-3">
        {CHANNELS.map((channel) => (
          <button
            key={channel}
            type="button"
            onClick={() => onPick(channel)}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3.5 text-left transition-colors hover:bg-[#fafafa]"
            style={{ border: "1.5px solid #e8e8e8" }}
          >
            <Link2 size={18} color="#4b5563" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block" style={{ fontSize: 15, fontWeight: 600, color: "#0D0D0D" }}>
                {CHANNEL_LABEL[channel]}
              </span>
              <span className="block" style={{ fontSize: 12, color: "#4b5563" }}>
                Booked nights only. No prices, no guest details.
              </span>
            </span>
          </button>
        ))}

        {CALENDAR_IS_SIMULATED ? (
          <WarningNote>
            <strong style={{ fontWeight: 700 }}>This is a preview.</strong> Connecting here does not
            reach Airbnb or Booking.com. Domus will show sample nights so you can see how the
            finished feature works.
          </WarningNote>
        ) : null}
      </div>
    </Modal>
  );
}
