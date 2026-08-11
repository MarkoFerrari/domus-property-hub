import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Field, Modal, StatusPill, WarningNote } from "./patterns";
import { ConfirmDialog } from "./ConfirmDialog";
import { Btn, TextArea, TextInput } from "./ui-primitives";
import {
  OBLIGATION_LABEL,
  OBLIGATION_TYPES,
  deadlineLabel,
  todayISO,
  type DeclRecord,
  type MonthRef,
  type ObligationType,
  type RentRecord,
} from "../lib/ledger";
import { DEADLINE_CAVEAT } from "../lib/legal";

/* ========================================================================== */
/* Obligations — short-term. A month carries two: the stay declaration and ΤΑΚΚ */
/* ========================================================================== */

/** One obligation's worth of form state. */
type Draft = { zero: boolean; amount: string };

const EMPTY_DRAFT: Draft = { zero: false, amount: "" };

/** Filled in means the landlord has told us something about this obligation. */
function isFilled(d: Draft): boolean {
  return d.zero || d.amount.trim() !== "";
}

/**
 * Records both of a month's obligations in one dialog.
 *
 * WHY BOTH TOGETHER: a short-term month carries a stay declaration and a ΤΑΚΚ,
 * with two different deadlines. They were two separate dialogs opened from two
 * separate rows, which meant recording one month was: open, type, save, close,
 * find the second row, open, type, save, close. Landlords do these together,
 * sitting with the same figures in front of them, so the interface should let
 * them. The deadlines still differ and are still shown per obligation, because
 * merging the input must not imply they are one filing.
 *
 * PARTIAL SAVES ARE ALLOWED on purpose. Someone who only knows one of the two
 * figures today should be able to bank it and come back, rather than being made
 * to choose between inventing a number and losing the one they have.
 */
export function RecordDeclarationDialog({
  open,
  month,
  propertyName,
  existing,
  focusType,
  onSave,
  onDelete,
  onClose,
}: {
  open: boolean;
  month: MonthRef | null;
  propertyName: string;
  /** What is already recorded, per obligation. */
  existing: Partial<Record<ObligationType, DeclRecord>>;
  /** Which obligation to put the cursor in, when arriving from a notification. */
  focusType?: ObligationType;
  onSave: (type: ObligationType, rec: DeclRecord) => Promise<void>;
  onDelete: (type: ObligationType) => Promise<void>;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<ObligationType, Draft>>({
    stay: EMPTY_DRAFT,
    takk: EMPTY_DRAFT,
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ObligationType, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmType, setConfirmType] = useState<ObligationType | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDrafts({
      stay: { zero: existing.stay?.zero ?? false, amount: existing.stay?.amount ?? "" },
      takk: { zero: existing.takk?.zero ?? false, amount: existing.takk?.amount ?? "" },
    });
    setErrors({});
    setFormError(null);
    setConfirmType(null);
    // Deep links from a ΤΑΚΚ reminder should land on the ΤΑΚΚ field, not the top.
    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, existing]);

  if (!month) return null;

  const patch = (type: ObligationType, next: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [type]: { ...d[type], ...next } }));
    setErrors((e) => ({ ...e, [type]: undefined }));
    setFormError(null);
  };

  const save = async () => {
    const nextErrors: Partial<Record<ObligationType, string>> = {};
    const toWrite: Array<[ObligationType, DeclRecord]> = [];

    for (const type of OBLIGATION_TYPES) {
      const d = drafts[type];
      if (!isFilled(d)) continue;
      if (!d.zero) {
        const n = Number(d.amount.replace(/[,\s€]/g, ""));
        if (!Number.isFinite(n) || n <= 0) {
          nextErrors[type] = "Enter a figure above zero, or tick nothing to declare.";
          continue;
        }
      }
      toWrite.push([
        type,
        {
          zero: d.zero,
          amount: d.zero ? undefined : d.amount.replace(/[,\s€]/g, ""),
          recordedAt: new Date().toISOString(),
        },
      ]);
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    if (toWrite.length === 0) {
      setFormError("Fill in at least one of the two before saving.");
      return;
    }

    setBusy(true);
    try {
      /* Sequential, not Promise.all. If the second write fails, the first has
         still landed and the dialog reopens showing it as recorded, which is
         the truth. Parallel writes with a partial failure would leave the
         landlord unsure which of the two actually saved. */
      for (const [type, rec] of toWrite) {
        await onSave(type, rec);
      }
      const names = toWrite.map(([t]) => OBLIGATION_LABEL[t]).join(" and ");
      toast.success(`${month.label} · ${names} recorded`);
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /* Confirmed, never immediate. Clearing a record makes the month outstanding
     again everywhere: the badge, the action queue and the reminder email. */
  const remove = async () => {
    if (!confirmType) return;
    setBusy(true);
    try {
      await onDelete(confirmType);
      toast.success(`${month.label} ${OBLIGATION_LABEL[confirmType]} cleared`);
      setConfirmType(null);
      onClose();
    } catch (e) {
      setConfirmType(null);
      setFormError(e instanceof Error ? e.message : "Could not clear. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const recordedCount = OBLIGATION_TYPES.filter((t) => existing[t]).length;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`${month.label} · both obligations`}
        description={`${propertyName}. Two filings, two deadlines, recorded together. ${DEADLINE_CAVEAT}`}
        footer={
          <>
            <Btn onClick={save} loading={busy}>
              {recordedCount > 0 ? "Save month" : "Record month"}
            </Btn>
            <Btn variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Btn>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {OBLIGATION_TYPES.map((type, i) => (
            <ObligationSection
              key={type}
              type={type}
              month={month}
              draft={drafts[type]}
              existing={existing[type]}
              error={errors[type]}
              disabled={busy}
              inputRef={
                (focusType ?? OBLIGATION_TYPES[0]) === type ? firstFieldRef : undefined
              }
              onChange={(next) => patch(type, next)}
              onClear={() => setConfirmType(type)}
              divided={i > 0}
            />
          ))}

          {formError ? <p className="text-[13px] text-[#DC2626]">{formError}</p> : null}

          <WarningNote>
            <strong style={{ fontWeight: 700 }}>This does not file anything.</strong> Recording
            these marks them done <em>in Domus only</em>. You still have to file both yourself, and
            they have different deadlines. Domus never files on your behalf and never moves money.
          </WarningNote>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmType !== null}
        title={
          confirmType
            ? `Clear the ${month.label} ${OBLIGATION_LABEL[confirmType]} record?`
            : ""
        }
        description={`${propertyName} goes back to outstanding for this obligation, and it will reappear in your action queue, your badges and your reminder emails. The other obligation for this month is not affected. The figure you entered is not kept. This cannot be undone.`}
        confirmLabel="Clear record"
        destructive
        onConfirm={remove}
        onClose={() => setConfirmType(null)}
      />
    </>
  );
}

/**
 * One obligation inside the month dialog.
 *
 * Each keeps its own deadline visible. Merging the two inputs into one dialog
 * is a convenience for the person entering them; it must not leave anyone with
 * the impression that one submission covers both filings, because it does not,
 * and the two dates are up to eleven days apart.
 */
function ObligationSection({
  type,
  month,
  draft,
  existing,
  error,
  disabled,
  inputRef,
  onChange,
  onClear,
  divided,
}: {
  type: ObligationType;
  month: MonthRef;
  draft: Draft;
  existing?: DeclRecord;
  error?: string;
  disabled: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onChange: (next: Partial<Draft>) => void;
  onClear: () => void;
  divided: boolean;
}) {
  const label = OBLIGATION_LABEL[type];
  return (
    <section
      className={divided ? "border-t pt-6" : undefined}
      style={divided ? { borderColor: "#f3f4f6" } : undefined}
      aria-label={label}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{label}</h3>
        <StatusPill status={existing ? "valid" : "missing"} size="sm">
          {existing ? "Recorded" : "Not recorded"}
        </StatusPill>
      </div>

      <p className="mt-1" style={{ fontSize: 13, color: "#6b7280" }}>
        Due {deadlineLabel(month, type)}
      </p>

      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={draft.zero}
          disabled={disabled}
          onChange={(e) => onChange({ zero: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#0D0D0D]"
        />
        <span className="text-[14px] text-[#374151]">
          <strong className="font-semibold text-[#0D0D0D]">Nothing to declare.</strong> The property
          earned nothing this month, but the obligation still has to be met.
        </span>
      </label>

      {!draft.zero ? (
        <div className="mt-4">
          <Field
            label={type === "takk" ? "Amount declared" : "Income declared"}
            hint="Domus stores the figure you entered elsewhere. It does not calculate it."
            error={error}
          >
            <TextInput
              ref={inputRef}
              inputMode="decimal"
              value={draft.amount}
              disabled={disabled}
              onChange={(e) => onChange({ amount: e.target.value })}
              placeholder="1,240"
              aria-label={`${label} amount in euro`}
            />
          </Field>
        </div>
      ) : error ? (
        <p className="mt-2 text-[12px] text-[#DC2626]">{error}</p>
      ) : null}

      {existing ? (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="tap-44 mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-[#b91c1c] transition-colors hover:text-[#991b1b] disabled:opacity-40"
        >
          <Trash2 size={15} aria-hidden="true" />
          Clear this record
        </button>
      ) : null}
    </section>
  );
}

/* ========================================================================== */
/* Rent — long-term, confirm the money actually arrived                        */
/* ========================================================================== */

export function RecordRentDialog({
  open,
  month,
  propertyName,
  expectedRent,
  existing,
  onSave,
  onDelete,
  onClose,
}: {
  open: boolean;
  month: MonthRef | null;
  propertyName: string;
  expectedRent?: string;
  existing?: RentRecord;
  onSave: (rec: RentRecord) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(existing?.amount ?? (expectedRent ?? "").replace(/[^\d.]/g, ""));
    setDate(existing?.date ?? todayISO());
    setNote(existing?.note ?? "");
    setError(null);
    setConfirmOpen(false);
  }, [open, existing, expectedRent]);

  if (!month) return null;

  const save = async () => {
    const n = Number(amount.replace(/[,\s€]/g, ""));
    if (!amount.trim() || !Number.isFinite(n) || n <= 0) {
      setError("Enter the amount that actually arrived.");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        amount: amount.replace(/[,\s€]/g, ""),
        date: date || undefined,
        note: note.trim() || undefined,
        recordedAt: new Date().toISOString(),
      });
      toast.success(`${month.label} rent confirmed`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /* Confirmed, never immediate. Clearing this makes the month read as unpaid
     again on every surface. */
  const remove = async () => {
    setBusy(true);
    try {
      await onDelete();
      toast.success(`${month.label} rent record cleared`);
      setConfirmOpen(false);
      onClose();
    } catch (e) {
      setConfirmOpen(false);
      setError(e instanceof Error ? e.message : "Could not clear. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
      open={open}
      onClose={onClose}
      title={`${month.label} rent`}
      description={`${propertyName}${expectedRent ? ` · expected ${expectedRent}` : ""}`}
      footer={
        <>
          <Btn onClick={save} loading={busy}>
            {existing ? "Update record" : "Confirm rent received"}
          </Btn>
          <Btn variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Amount received" error={error ?? undefined}>
          <TextInput
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="750"
            aria-label="Amount received in euro"
          />
        </Field>

        <Field label="Date received" hint="Timestamped in your audit log.">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="Note (optional)">
          <TextArea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Paid by bank transfer, 3 days late"
          />
        </Field>

        <WarningNote>
          <strong style={{ fontWeight: 700 }}>Domus never touches your bank.</strong> This records
          what you are telling it, nothing more. Check the money actually arrived before confirming.
        </WarningNote>

        {existing ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            className="tap-44 inline-flex items-center gap-2 self-start text-[13px] font-semibold text-[#b91c1c] transition-colors hover:text-[#991b1b] disabled:opacity-40"
          >
            <Trash2 size={15} aria-hidden="true" />
            Clear this record
          </button>
        ) : null}
      </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title={`Clear the ${month.label} rent record?`}
        description={`${propertyName} will read as unpaid for this month again, and it will reappear in your action queue and reminder emails. The amount, date and note you entered are not kept. This cannot be undone.`}
        confirmLabel="Clear record"
        destructive
        onConfirm={remove}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
