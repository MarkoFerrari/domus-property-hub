import { useEffect, useRef, useState } from "react";
import { Download, FileCheck2, Paperclip, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Modal, Field, WarningNote } from "./patterns";
import { ConfirmDialog } from "./ConfirmDialog";
import { Btn, TextInput } from "./ui-primitives";
import { certStatus, CERT_STATUS_LABEL, type CertRecord } from "../lib/compliance";
import { isSupabaseConfigured } from "../lib/supabase";
import { certificateUrl, isAcceptedCertFile, MAX_CERT_BYTES } from "../lib/storage";

/**
 * Upload or update one certificate.
 *
 * The free-text file-name box is GONE and must not come back. It let a landlord
 * type any string and be marked compliant, which meant Domus could hand out a
 * green status nobody had earned. A certificate now counts as uploaded only
 * when a real file has been chosen.
 */
export function CertificateDialog({
  open,
  name,
  record,
  onSave,
  onRemove,
  onClose,
}: {
  open: boolean;
  name: string;
  record: CertRecord | undefined;
  /** `file` is undefined when only the expiry changed on an existing record. */
  onSave: (input: { file?: File; expiry?: string }) => Promise<void> | void;
  onRemove: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<File | null>(null);
  const [expiry, setExpiry] = useState(record?.expiry ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setExpiry(record?.expiry ?? "");
    setError(null);
    setConfirmOpen(false);
  }, [open, record]);

  const hasExisting = Boolean(record?.file);
  const willHaveFile = Boolean(picked) || hasExisting;
  const preview = certStatus({
    file: willHaveFile ? "x" : undefined,
    expiry: expiry || undefined,
  });

  const choose = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_CERT_BYTES) {
      setError("That file is over 10MB. Try a smaller scan or a PDF export.");
      return;
    }
    if (!isAcceptedCertFile(f)) {
      setError("Attach a PDF or a photo (JPG, PNG or HEIC).");
      return;
    }
    setError(null);
    setPicked(f);
  };

  const save = async () => {
    if (!willHaveFile) {
      setError("Attach the document. Domus will not mark a certificate valid without one.");
      return;
    }
    setBusy(true);
    try {
      await onSave({ file: picked ?? undefined, expiry: expiry || undefined });
      toast.success(`${name} updated`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /* Never wired directly to the button. Removing a certificate deletes the
     stored document as well as the record, and it puts the property back into
     "Action needed" everywhere. That is not something to do on a stray click. */
  const remove = async () => {
    setBusy(true);
    try {
      await onRemove();
      toast.success(`${name} removed`);
      setConfirmOpen(false);
      onClose();
    } catch (e) {
      setConfirmOpen(false);
      setError(e instanceof Error ? e.message : "Could not remove. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const openStored = async () => {
    if (!record?.path) return;
    const url = await certificateUrl(record.path);
    if (!url) {
      toast.error("Could not open that document. Try again in a moment.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <Modal
      open={open}
      onClose={onClose}
      title={name}
      description="Domus records and reminds. It never files anything on your behalf."
      footer={
        <>
          <Btn onClick={save} loading={busy}>
            Save certificate
          </Btn>
          <Btn variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Document"
          hint={
            isSupabaseConfigured
              ? "PDF or photo, up to 10MB. Stored privately, only your account can open it."
              : "Demo mode cannot store the document itself. Connect a database to keep the file."
          }
        >
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-12 w-full items-center gap-2 rounded-lg border-[1.5px] border-dashed border-[#E8E8E8] px-4 text-[14px] font-semibold text-[#0D0D0D] transition-colors hover:bg-[#F9F9F9]"
            >
              <Paperclip size={16} aria-hidden="true" />
              {picked ? "Choose a different file" : hasExisting ? "Replace document" : "Attach document"}
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.heic"
              onChange={(e) => choose(e.target.files?.[0])}
            />

            {picked ? (
              <p className="flex items-center gap-2 text-[13px] text-[#166534]">
                <FileCheck2 size={15} aria-hidden="true" />
                {picked.name} · {(picked.size / 1024 / 1024).toFixed(1)}MB, ready to upload
              </p>
            ) : hasExisting ? (
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#6b7280]">
                <FileCheck2 size={15} aria-hidden="true" />
                <span className="truncate">{record?.file}</span>
                {record?.path ? (
                  <button
                    type="button"
                    onClick={openStored}
                    className="inline-flex items-center gap-1 font-semibold text-[#2563EB] hover:underline"
                  >
                    <Download size={13} aria-hidden="true" /> Open
                  </button>
                ) : null}
              </div>
            ) : null}

            {record?.demo && !picked ? (
              <p className="flex items-start gap-2 rounded-lg bg-[#FFFBEB] px-3 py-2 text-[12px] leading-relaxed text-[#92400E]">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                This was recorded in demo mode, so only the file name was kept. The document itself
                is not stored anywhere. Upload it again once a database is connected.
              </p>
            ) : null}
          </div>
        </Field>

        <Field
          label="Valid until"
          hint="Leave blank if this certificate has no expiry date."
          error={error ?? undefined}
        >
          <TextInput
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            aria-label="Expiry date"
          />
        </Field>

        <div className="rounded-lg bg-[#F9F9F9] px-4 py-3 text-[13px] text-[#6b7280]">
          Status after saving:{" "}
          <strong className="font-semibold text-[#111827]">{CERT_STATUS_LABEL[preview]}</strong>
          {preview === "renew" ? ". Domus will keep reminding you until it is renewed." : ""}
        </div>

        <WarningNote>
          <strong style={{ fontWeight: 700 }}>This does not renew anything.</strong> Domus stores
          your document and warns you before it expires. Booking the inspection and getting the new
          certificate is still on you.
        </WarningNote>

        {hasExisting ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            className="inline-flex items-center gap-2 self-start text-[13px] font-semibold text-[#b91c1c] transition-colors hover:text-[#991b1b] disabled:opacity-40"
          >
            <Trash2 size={15} aria-hidden="true" />
            Remove this certificate
          </button>
        ) : null}
      </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title={`Remove ${name}?`}
        description={
          record?.path
            ? "The stored document is deleted along with the record, and this property goes back to \u201cAction needed\u201d until you upload a replacement. This cannot be undone."
            : "This property goes back to \u201cAction needed\u201d until you upload a replacement. This cannot be undone."
        }
        confirmLabel="Remove certificate"
        destructive
        onConfirm={remove}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
