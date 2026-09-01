import { Link } from "react-router-dom";
import { Building2, MapPin, Plus } from "lucide-react";

import { AppShell } from "../components/AppShell";
import { Card, EmptyBlock, Skeleton, StatusPill, TypeTag } from "../components/patterns";
import { useStore } from "../lib/store";
import { COMPLIANCE_LABEL, getCompliance, type Property } from "../lib/compliance";
import { getPropertyStatus } from "../lib/notifications";

/** Properties list. Compliance badges are derived on every render. */
export default function PropertiesList() {
  const { loading, properties } = useStore();

  const topRight = (
    <Link
      to="/properties/new"
      className="tap-44 inline-flex items-center gap-1.5"
      style={{
        height: 36,
        padding: "0 14px",
        borderRadius: 8,
        backgroundColor: "#171717",
        color: "#fff",
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      <Plus size={14} aria-hidden="true" /> Add property
    </Link>
  );

  return (
    <AppShell activeKey="properties" topbarRight={topRight}>
      <div className="mx-auto w-full max-w-[1200px]">
        <h1 style={{ fontWeight: 700, fontSize: 24, color: "#111827" }}>Your properties</h1>
        <p className="mt-1" style={{ fontSize: 14, color: "#4b5563" }}>
          {loading
            ? "Loading…"
            : properties.length === 0
              ? "Nothing here yet."
              : `${properties.length} propert${properties.length === 1 ? "y" : "ies"} · status is recalculated every time you open this page.`}
        </p>

        {loading ? (
          <SkeletonGrid />
        ) : properties.length === 0 ? (
          <Card className="mt-6">
            <EmptyBlock
              icon={<Building2 size={28} color="#6b7280" aria-hidden="true" />}
              title="No properties yet"
              body="Add your first property and Domus starts tracking its declarations, rent and certificates straight away."
              action={
                <Link
                  to="/properties/new"
                  className="tap-44 inline-flex items-center gap-1.5"
                  style={{
                    height: 44,
                    padding: "0 20px",
                    borderRadius: 10,
                    backgroundColor: "#171717",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  <Plus size={16} aria-hidden="true" /> Add property
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {properties.map((p, i) => (
              <PropertyCard key={p.id} property={p} first={i === 0} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function PropertyCard({ property, first = false }: { property: Property; first?: boolean }) {
  const { notifications } = useStore();
  /* Not getCompliance() — that only knows about certificates, so it called a
     property with zero recorded months "Compliant" while the badge counted
     twelve overdue declarations. See getPropertyStatus for the reasoning. */
  const status = getPropertyStatus(property.id, notifications);
  const compliance = getCompliance(property);
  const outstanding = compliance.outstanding.length;

  return (
    <Link
      to={`/properties/${property.id}`}
      className="block overflow-hidden rounded-2xl border transition-shadow hover:shadow-md"
      style={{ borderColor: "#e5e7eb", backgroundColor: "#fff" }}
      /* Only the first card is a tour target. The spotlight needs one element,
         and highlighting the whole grid would explain nothing. */
      data-tour={first ? "property-card" : undefined}
    >
      <div style={{ height: 140, backgroundColor: "#f3f4f6" }}>
        {property.photo ? (
          <img
            src={property.photo}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Building2 size={28} color="#6b7280" aria-hidden="true" />
          </div>
        )}
      </div>

      <div style={{ padding: 16 }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate" style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>
              {property.name}
            </div>
            <div className="mt-0.5">
              <TypeTag type={property.type} />
            </div>
          </div>
          <StatusPill status={status} size="sm">
            {COMPLIANCE_LABEL[status]}
          </StatusPill>
        </div>

        {property.address || property.city ? (
          <div
            className="mt-3 flex items-center gap-1.5 truncate"
            style={{ fontSize: 12, color: "#4b5563" }}
          >
            <MapPin size={13} aria-hidden="true" />
            {[property.address, property.city].filter(Boolean).join(", ")}
          </div>
        ) : null}

        <div
          className="mt-3 flex items-center justify-between border-t pt-3"
          style={{ borderColor: "#f3f4f6", fontSize: 12, color: "#4b5563" }}
        >
          <span>
            {property.type === "short"
              ? property.nightly
                ? `${property.nightly} / night`
                : "Short-term rental"
              : property.rent
                ? `${property.rent} / month${property.tenant ? ` · ${property.tenant}` : ""}`
                : "Long-term lease"}
          </span>
          <span style={{ fontWeight: 600, color: outstanding > 0 ? "#b91c1c" : "#15803d" }}>
            {outstanding > 0
              ? `${outstanding} to resolve`
              : "All certificates valid"}
          </span>
        </div>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: "#e5e7eb", backgroundColor: "#fff" }}
        >
          <Skeleton width="100%" height={140} radius={0} />
          <div style={{ padding: 16 }}>
            <Skeleton width="60%" height={16} />
            <div style={{ marginTop: 10 }}>
              <Skeleton width="40%" height={12} />
            </div>
            <div style={{ marginTop: 16 }}>
              <Skeleton width="100%" height={12} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
