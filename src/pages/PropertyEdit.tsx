import { Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { AppShell } from "../components/AppShell";
import { PropertyForm, type PendingCert, type PropertyDraft } from "../components/PropertyForm";
import { Skeleton } from "../components/patterns";
import { useProperty, useStore } from "../lib/store";

export default function PropertyEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loading, editProperty, saveCertificate } = useStore();
  const property = useProperty(id);

  if (loading) {
    return (
      <AppShell activeKey="properties" title="Edit property" topbarRight={<span />}>
        <div className="mx-auto w-full max-w-[840px]">
          <Skeleton width="40%" height={24} />
          <div style={{ marginTop: 24 }}>
            <Skeleton width="100%" height={280} radius={16} />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!property) return <Navigate to="/properties" replace />;

  const submit = async (draft: PropertyDraft, pending: Record<string, PendingCert>) => {
    await editProperty(property.id, draft);

    const failed: string[] = [];
    for (const [name, cert] of Object.entries(pending)) {
      try {
        await saveCertificate(property.id, name, { file: cert.file, expiry: cert.expiry });
      } catch {
        failed.push(name);
      }
    }

    if (failed.length > 0) {
      toast.error(
        `Saved, but ${failed.length} document${
          failed.length === 1 ? "" : "s"
        } did not upload. Try again from the property page.`,
      );
    } else {
      toast.success("Property updated");
    }
    navigate(`/properties/${property.id}`);
  };

  return (
    <AppShell activeKey="properties" title="Edit property" topbarRight={<span />}>
      <div className="mx-auto w-full max-w-[840px]">
        <h1 style={{ fontWeight: 700, fontSize: 24, color: "#111827" }}>Edit {property.name}</h1>
        <p className="mt-1 mb-6" style={{ fontSize: 14, color: "#4b5563" }}>
          Every field here is editable. Updating a certificate clears its alert everywhere the
          moment you save.
        </p>
        <PropertyForm
          initial={property}
          submitLabel="Save changes"
          onSubmit={submit}
          onCancelTo={`/properties/${property.id}`}
        />
      </div>
    </AppShell>
  );
}
