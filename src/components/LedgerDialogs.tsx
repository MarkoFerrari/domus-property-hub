import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Field, Modal, WarningNote } from "./patterns";
import { ConfirmDialog } from "./ConfirmDialog";
import { Btn, TextArea, TextInput } from "./ui-primitives";
import {
  OBLIGATION_LABEL,
  deadlineLabel,
  todayISO,
  type DeclRecord,
  type MonthRef,
  type ObligationType,
  type RentRecord,
} from "../lib/ledger";
import { DEADLINE_CAVEAT } from "../lib/legal";

/* ========================================================================== */
/* Obligation — short-term. A month carries two: the stay declaration and ΤΑΚΚ */
/* ========================================================================== */

export function RecordDeclarationDialog({
  open,
  month,
  type,
  propertyName,
  existing,
  onSave,
  onDelete,
  onClose,
}: {
  open: boolean;
  month: MonthRef | null;
  type: ObligationType;
  propertyName: string;
  existing?: DeclRecord;
  onSave: (rec: DeclRecord) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [zero, setZero] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setZero(existing?.zero ?? false);
    setAmount(existing?.amount ?? "");
    setError(null);
    setConfirmOpen(false);
  }, [open, existing]);

  if (!month) return null;

  const save = async () => {
    if (!zero) {
      const n = Number(amount.replace(/[,\s€]/g, ""));
      if (!amount.trim() || !Number.isFinite(n) || n <= 0) {
        setError("Enter the income for this month, or mark it as a zero-income month.");
        return;
      }
    }
    setBusy(true);
    try {
      await onSave({
        zero,
        amount: zero ? undefined : amount.replace(/[,\s€]/g, ""),
        recordedAt: new Date().toISOString(),
      });
      toast.success(`${month.label} ${OBLIGATION_LABEL[type]} recorded`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /* Confirmed, never immediate. Clearing a record makes the month outstanding
     again everywhere: the badge, the action queue and the reminder email. */
  const remove = async () => {
    setBusy(true);
    try {
      await onDelete();
      toast.success(`${month.label} ${OBLIGATION_LABEL[type]} cleared`);
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
      title={`${month.label} · ${OBLIGATION_LABEL[type]}`}
      description={`${propertyName} · due ${deadlineLabel(month, type)}. ${DEADLINE_CAVEAT}`}
      footer={
        <>
          <Btn onClick={save} loading={busy}>
            {existing ? "Update record" : `Record ${OBLIGATION_LABEL[type]}`}
          </Btn>
          <Btn variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={zero}
            onChange={(e) => setZero(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#0D0D0D]"
          />
          <span className="text-[14px] text-[#374151]">
            <strong className="font-semibold text-[#0D0D0D]">Nothing to declare this month.</strong>{" "}
            The property earned nothing, but the obligation still has to be met.
          </span>
        </label>

        {!zero ? (
          <Field
            label={type === "takk" ? "Amount declared" : "Income declared"}
            hint="Domus stores the figure you entered elsewhere. It does not calculate it."
            error={error ?? undefined}
          >
            <TextInput
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1,240"
              aria-label="Income declared in euro"
            />
          </Field>
        ) : error ? (
          <p className="text-[12px] text-[#DC2626]">{error}</p>
        ) : null}

        <WarningNote>
          <strong style={{ fontWeight: 700 }}>This does not file anything.</strong> Recording it
          here marks it done <em>in Domus only</em>. You still have to file it yourself. Domus never
          files on your behalf and never moves money.
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
        title={`Clear the ${month.label} ${OBLIGATION_LABEL[type]} record?`}
        description={`${propertyName} goes back to outstanding for this month, and it will reappear in your action queue, your badges and your reminder emails. The figure you entered is not kept. This cannot be undone.`}
        confirmLabel="Clear record"
        destructive
        onConfirm={remove}
        onClose={() => setConfirmOpen(false)}
      />
    </>
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
