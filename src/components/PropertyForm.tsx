import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { Field, SectionCard, StatusPill } from "./patterns";
import { Btn, SelectInput, TextInput } from "./ui-primitives";
import { ConfirmDialog } from "./ConfirmDialog";
import { CertificateDialog } from "./CertificateDialog";
import { ImageUpload } from "./ImageUpload";
import {
  CERTIFICATES,
  CERT_STATUS_LABEL,
  certExpiryLabel,
  certStatus,
  type CertRecord,
  type Property,
  type PropertyType,
} from "../lib/compliance";

export type PropertyDraft = Omit<Property, "id">;

/** A document picked before the property exists, plus the expiry set with it. */
export type PendingCert = { file: File; expiry?: string };

const EMPTY: PropertyDraft = {
  name: "",
  address: "",
  city: "",
  type: "short",
  size: "",
  photo: "",
  nightly: "",
  minStay: "",
  ama: "",
  rent: "",
  tenant: "",
  payday: "",
  certDetails: {},
};

/**
 * One form, used by both Add and Edit. Certificates are edited in local state
 * and saved with the rest of the property, so a brand-new property can be
 * created already compliant — and an existing one can always be made compliant
 * again (§10, item 5).
 */
export function PropertyForm({
  initial,
  submitLabel,
  onSubmit,
  onCancelTo,
}: {
  initial?: Property;
  submitLabel: string;
  onSubmit: (draft: PropertyDraft, pendingCerts: Record<string, PendingCert>) => Promise<void>;
  onCancelTo: string;
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<PropertyDraft>(() => ({ ...EMPTY, ...(initial ?? {}) }));
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [certOpen, setCertOpen] = useState<string | null>(null);
  /* Documents chosen before the property has an id. Uploaded by the caller once
     it does. Kept out of `draft` so a provisional record can never be saved as
     a real one with no document behind it. */
  const [pendingCerts, setPendingCerts] = useState<Record<string, PendingCert>>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const pristine = useRef(JSON.stringify({ ...EMPTY, ...(initial ?? {}) }));

  const dirty = useMemo(
    () => JSON.stringify(draft) !== pristine.current || Object.keys(pendingCerts).length > 0,
    [draft, pendingCerts],
  );

  /* Discard guard — warn before a hard navigation away with unsaved edits. */
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = <K extends keyof PropertyDraft>(key: K, value: PropertyDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /**
   * What the certificate list and dialog should show: the saved record, or the
   * document waiting to upload, whichever is more recent. A pending file counts
   * as present so the status preview is honest about where you will land.
   */
  const certView = (name: string): CertRecord | undefined => {
    const pending = pendingCerts[name];
    if (pending) return { file: pending.file.name, expiry: pending.expiry };
    return draft.certDetails?.[name];
  };

  const nameError = submitted && !draft.name.trim() ? "Give this property a name." : undefined;
  const paydayError =
    submitted && draft.type === "long" && draft.payday
      ? (() => {
          const n = Number(draft.payday);
          return Number.isFinite(n) && n >= 1 && n <= 31
            ? undefined
            : "Use a day between 1 and 31.";
        })()
      : undefined;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    if (!draft.name.trim() || paydayError) return;
    setBusy(true);
    try {
      await onSubmit({ ...draft, name: draft.name.trim() }, pendingCerts);
      pristine.current = JSON.stringify(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (dirty) setDiscardOpen(true);
    else navigate(onCancelTo);
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <SectionCard title="The basics">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Property name" error={nameError}>
              <TextInput
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Koukaki Loft"
              />
            </Field>
          </div>

          <Field label="Rental type" hint="This decides what Domus watches for you.">
            <SelectInput
              value={draft.type}
              onChange={(e) => set("type", e.target.value as PropertyType)}
            >
              <option value="short">Short-term (Airbnb and similar)</option>
              <option value="long">Long-term lease</option>
            </SelectInput>
          </Field>

          <Field label="Size">
            <TextInput
              value={draft.size ?? ""}
              onChange={(e) => set("size", e.target.value)}
              placeholder="82 m²"
            />
          </Field>

          <Field label="Address">
            <TextInput
              value={draft.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Piraeus 185 32"
            />
          </Field>

          <Field label="City">
            <TextInput
              value={draft.city ?? ""}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Athens"
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              label="Photo (optional)"
              hint="JPG, PNG or WebP. Domus resizes it for you, so a phone photo is fine."
            >
              <ImageUpload value={draft.photo} onChange={(next) => set("photo", next)} />
            </Field>
          </div>
        </div>
      </SectionCard>

      {draft.type === "short" ? (
        <SectionCard title="Short-term details">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field label="Base nightly rate">
              <TextInput
                value={draft.nightly ?? ""}
                onChange={(e) => set("nightly", e.target.value)}
                placeholder="€120"
              />
            </Field>
            <Field label="Minimum stay">
              <TextInput
                value={draft.minStay ?? ""}
                onChange={(e) => set("minStay", e.target.value)}
                placeholder="2 nights"
              />
            </Field>
            <Field label="AMA number" hint="Your AADE property registry number.">
              <TextInput
                value={draft.ama ?? ""}
                onChange={(e) => set("ama", e.target.value)}
                placeholder="00254871"
              />
            </Field>
          </div>
          <p className="mt-4 rounded-lg bg-[#F9F9F9] px-4 py-3 text-[13px] leading-relaxed text-[#4b5563]">
            Short-term properties carry two obligations for every completed month, the stay
            declaration and ΤΑΚΚ, each with its own deadline. Months that earned nothing still count.
            Domus tracks both and reminds you. Confirm the rules that apply to you with your
            accountant.
          </p>
        </SectionCard>
      ) : (
        <SectionCard title="Lease details">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field label="Monthly rent">
              <TextInput
                value={draft.rent ?? ""}
                onChange={(e) => set("rent", e.target.value)}
                placeholder="€750"
              />
            </Field>
            <Field label="Tenant">
              <TextInput
                value={draft.tenant ?? ""}
                onChange={(e) => set("tenant", e.target.value)}
                placeholder="Maria K."
              />
            </Field>
            <Field
              label="Rent due on day"
              hint="1 to 31. In shorter months Domus uses the last day."
              error={paydayError}
            >
              <TextInput
                inputMode="numeric"
                value={draft.payday ?? ""}
                onChange={(e) => set("payday", e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="5"
              />
            </Field>
          </div>
          <p className="mt-4 rounded-lg bg-[#F9F9F9] px-4 py-3 text-[13px] leading-relaxed text-[#4b5563]">
            Domus reminds you to confirm each month&apos;s rent once the due day has passed. It
            never touches your bank account.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Certificates">
        <p className="-mt-2 mb-4 text-[13px] leading-relaxed text-[#4b5563]">
          Domus tracks six certificates per property. Anything expired or not uploaded puts the
          property into &ldquo;Action needed&rdquo; until you resolve it. Check which ones apply to
          you with your accountant.
        </p>
        <ul className="flex flex-col divide-y" style={{ borderColor: "#f3f4f6" }}>
          {CERTIFICATES.map((name) => {
            const rec = certView(name);
            const status = certStatus(rec);
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
                      {pendingCerts[name]
                        ? `${pendingCerts[name].file.name} · uploads when you save`
                        : certExpiryLabel(rec, status)}
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

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[14px] text-[#DC2626]"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <div className="sm:w-[220px]">
          <Btn type="submit" loading={busy}>
            {submitLabel}
          </Btn>
        </div>
        <div className="sm:w-[160px]">
          <Btn type="button" variant="secondary" onClick={cancel} disabled={busy}>
            Cancel
          </Btn>
        </div>
      </div>

      <CertificateDialog
        open={certOpen !== null}
        name={certOpen ?? ""}
        record={certOpen ? certView(certOpen) : undefined}
        onSave={({ file, expiry }) => {
          if (!certOpen) return;
          if (file) {
            setPendingCerts((m) => ({ ...m, [certOpen]: { file, expiry } }));
            return;
          }
          /* Expiry-only change on a record that already exists. */
          const existing = draft.certDetails?.[certOpen];
          if (existing) set("certDetails", { ...(draft.certDetails ?? {}), [certOpen]: { ...existing, expiry } });
          else if (pendingCerts[certOpen]) {
            setPendingCerts((m) => ({ ...m, [certOpen]: { ...m[certOpen], expiry } }));
          }
        }}
        onRemove={() => {
          if (!certOpen) return;
          const next = { ...(draft.certDetails ?? {}) };
          delete next[certOpen];
          set("certDetails", next);
          setPendingCerts((m) => {
            const n = { ...m };
            delete n[certOpen];
            return n;
          });
        }}
        onClose={() => setCertOpen(null)}
      />

      <ConfirmDialog
        open={discardOpen}
        title="Discard your changes?"
        description="You have unsaved edits on this property. Leaving now loses them."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => navigate(onCancelTo)}
        onClose={() => setDiscardOpen(false)}
      />
    </form>
  );
}
