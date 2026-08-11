import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { AppShell } from "../components/AppShell";
import { PropertyForm, type PendingCert, type PropertyDraft } from "../components/PropertyForm";
import { useStore } from "../lib/store";

export default function PropertyNew() {
  const navigate = useNavigate();
  const { addProperty, saveCertificate } = useStore();

  const submit = async (draft: PropertyDraft, pending: Record<string, PendingCert>) => {
    const created = await addProperty(draft);

    /* Documents could not upload before this point: there was no property id to
       file them under. The property is already saved, so a failed upload must
       not read as a failed save. */
    const failed: string[] = [];
    for (const [name, cert] of Object.entries(pending)) {
      try {
        await saveCertificate(created.id, name, { file: cert.file, expiry: cert.expiry });
      } catch {
        failed.push(name);
      }
    }

    if (failed.length > 0) {
      toast.error(
        `${created.name} was added, but ${failed.length} document${
          failed.length === 1 ? "" : "s"
        } did not upload. Try again from the property page.`,
      );
    } else {
      toast.success(`${created.name} added`);
    }
    navigate(`/properties/${created.id}`, { replace: true });
  };

  return (
    <AppShell activeKey="properties" title="Add property" topbarRight={<span />}>
      <div className="mx-auto w-full max-w-[840px]">
        <h1 style={{ fontWeight: 700, fontSize: 24, color: "#111827" }}>Add a property</h1>
        <p className="mt-1 mb-6" style={{ fontSize: 14, color: "#6b7280" }}>
          You can change any of this later. Certificates can be added now or whenever you have them.
        </p>
        <PropertyForm submitLabel="Add property" onSubmit={submit} onCancelTo="/properties" />
      </div>
    </AppShell>
  );
}
