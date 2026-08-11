import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Euro, Plus } from "lucide-react";

import { AppShell } from "../components/AppShell";
import { Card, EmptyBlock, Eyebrow, SeverityPill, Skeleton, TypeTag } from "../components/patterns";
import { useStore } from "../lib/store";
import { formatEuro, parseAmount, type Property } from "../lib/compliance";
import { completedMonths, declarationKey, rentKey } from "../lib/ledger";

/** Dashboard — source of truth §5.2. */

type Range = "month" | "year";

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return "Kalimera";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { loading, properties, notifications } = useStore();
  const hasData = properties.length > 0;

  const topRight = hasData ? (
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
  ) : undefined;

  return (
    <AppShell activeKey="dashboard" topbarRight={topRight}>
      {loading ? <SkeletonDashboard /> : <DashboardContent hasData={hasData} actionCount={notifications.length} />}
    </AppShell>
  );
}

function DashboardContent({ hasData, actionCount }: { hasData: boolean; actionCount: number }) {
  const g = greeting();
  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <Eyebrow>PORTFOLIO OVERVIEW</Eyebrow>
      <h1 className="mt-2" style={{ fontWeight: 700, fontSize: 30, lineHeight: 1.15, color: "#111827" }}>
        {hasData
          ? actionCount > 0
            ? `${g}. ${actionCount} ${actionCount === 1 ? "thing needs" : "things need"} you today.`
            : `${g}. You're all caught up.`
          : `${g}. Let's set up your portfolio.`}
      </h1>
      <p className="mt-2 max-w-[640px]" style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.55 }}>
        {hasData
          ? "Short-term compliance and long-term rent collection, one screen."
          : "Add your first property to start tracking declarations, certificates and rent in one place."}
      </p>

      {!hasData ? (
        <Link
          to="/properties/new"
          className="mt-5 inline-flex items-center gap-1.5"
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
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EarningsCard />
        <ActionQueueCard />
      </div>
    </div>
  );
}

/* -------------------------------- Earnings -------------------------------- */

function EarningsCard() {
  const { properties, declarations, rents } = useStore();
  const [range, setRange] = useState<Range>("year");
  const now = new Date();

  const { total, shortTotal, longTotal, topProps } = useMemo(() => {
    const months = completedMonths(now).filter((m) =>
      range === "year"
        ? m.year === now.getFullYear()
        : m.year === now.getFullYear() && m.monthIdx === now.getMonth(),
    );

    let short = 0;
    let long = 0;
    const perProp: Record<string, number> = {};

    for (const p of properties) {
      for (const m of months) {
        let amount = 0;
        if (p.type === "short") {
          const d = declarations[declarationKey(p.id, m)];
          if (d && !d.zero) amount = parseAmount(d.amount);
        } else {
          const r = rents[rentKey(p.id, m)];
          if (r) amount = parseAmount(r.amount);
        }
        if (amount <= 0) continue;
        if (p.type === "short") short += amount;
        else long += amount;
        perProp[p.id] = (perProp[p.id] ?? 0) + amount;
      }
    }

    const topProps = properties
      .map((p) => ({ p, amount: perProp[p.id] ?? 0 }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    return { total: short + long, shortTotal: short, longTotal: long, topProps };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, declarations, rents, range]);

  const shortPct = total > 0 ? Math.round((shortTotal / total) * 100) : 0;
  const longPct = total > 0 ? 100 - shortPct : 0;
  const maxTop = topProps[0]?.amount ?? 0;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>Earnings</h2>
        <div
          className="flex items-center"
          style={{ backgroundColor: "#f3f4f6", borderRadius: 999, padding: 3, fontSize: 12, fontWeight: 600 }}
        >
          {(["month", "year"] as const).map((r) => (
            <button
              key={r}
              type="button"
              className="tap-44"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              style={{
                height: 26,
                padding: "0 12px",
                borderRadius: 999,
                backgroundColor: range === r ? "#171717" : "transparent",
                color: range === r ? "#fff" : "#6b7280",
                border: "none",
                cursor: "pointer",
              }}
            >
              {r === "month" ? "This month" : "This year"}
            </button>
          ))}
        </div>
      </div>

      {total > 0 ? (
        <>
          <div className="mt-4">
            <div style={{ fontWeight: 700, fontSize: 34, color: "#111827" }}>{formatEuro(total)}</div>
            <div className="mt-1" style={{ fontSize: 13, color: "#6b7280" }}>
              {range === "year"
                ? `${now.getFullYear()} so far`
                : new Date(now.getFullYear(), now.getMonth()).toLocaleString("en-GB", {
                    month: "long",
                    year: "numeric",
                  })}{" "}
              · recorded income
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-6">
            <DonutChart shortPct={shortPct} />
            <div className="min-w-[180px] flex-1">
              <LegendRow color="#FF6B35" label="Short term" pct={`${shortPct}%`} amount={formatEuro(shortTotal)} />
              <div className="mt-2">
                <LegendRow color="#1E3A8A" label="Long term" pct={`${longPct}%`} amount={formatEuro(longTotal)} />
              </div>
            </div>
          </div>

          {topProps.length > 0 && (
            <div className="mt-5 border-t pt-4" style={{ borderColor: "#f3f4f6" }}>
              <div
                className="flex items-center justify-between"
                style={{ fontSize: 11, letterSpacing: "0.08em", fontWeight: 700, color: "#9ca3af" }}
              >
                TOP EARNING PROPERTIES
                <Link to="/properties" style={{ color: "#6b7280", fontWeight: 600, fontSize: 12 }}>
                  See all →
                </Link>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {topProps.map(({ p, amount }) => (
                  <PropertyBar
                    key={p.id}
                    property={p}
                    amount={formatEuro(amount)}
                    pct={maxTop ? Math.round((amount / maxTop) * 100) : 0}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyBlock
          icon={<Euro size={26} color="#9ca3af" aria-hidden="true" />}
          title="No earnings yet"
          body={
            "Record a declaration or confirm rent on any property to see your breakdown here. Only completed months count."
          }
        />
      )}
    </Card>
  );
}

function DonutChart({ shortPct }: { shortPct: number }) {
  const size = 140;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shortLen = (shortPct / 100) * c;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${shortPct}% short term, ${100 - shortPct}% long term`}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1E3A8A" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#FF6B35"
        strokeWidth={stroke}
        strokeDasharray={`${shortLen} ${c - shortLen}`}
        strokeDashoffset={c / 4}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function LegendRow({
  color,
  label,
  pct,
  amount,
}: {
  color: string;
  label: string;
  pct: string;
  amount: string;
}) {
  return (
    <div className="flex items-center gap-3" style={{ fontSize: 14 }}>
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color, display: "inline-block" }}
      />
      <span style={{ flex: 1, color: "#111827", fontWeight: 500 }}>{label}</span>
      <span style={{ color: "#9ca3af", fontSize: 13 }}>{pct}</span>
      <span style={{ color: "#111827", fontWeight: 600, minWidth: 60, textAlign: "right" }}>{amount}</span>
    </div>
  );
}

function PropertyBar({ property, amount, pct }: { property: Property; amount: string; pct: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3" style={{ fontSize: 13 }}>
        <div className="min-w-0 truncate">
          <Link to={`/properties/${property.id}`} style={{ fontWeight: 600, color: "#111827" }}>
            {property.name}
          </Link>{" "}
          <TypeTag type={property.type} />
        </div>
        <span style={{ fontWeight: 600, color: "#111827" }}>{amount}</span>
      </div>
      <div className="mt-1" style={{ height: 4, backgroundColor: "#f3f4f6", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", backgroundColor: "#171717" }} />
      </div>
    </div>
  );
}

/* ------------------------------ Action queue ------------------------------ */

const MAX_ACTIONS = 7;

function ActionQueueCard() {
  const { visibleNotifications, properties } = useStore();
  const visible = visibleNotifications.slice(0, MAX_ACTIONS);
  const hasMore = visibleNotifications.length > MAX_ACTIONS;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>Action queue</h2>
        {hasMore ? (
          <Link to="/notifications" style={{ color: "#6b7280", fontWeight: 600, fontSize: 12 }}>
            See all →
          </Link>
        ) : (
          <span
            style={{
              fontSize: 12,
              padding: "2px 10px",
              borderRadius: 999,
              backgroundColor: "#f3f4f6",
              color: "#6b7280",
              fontWeight: 600,
            }}
          >
            {visibleNotifications.length} open
          </span>
        )}
      </div>

      {visible.length > 0 ? (
        <div className="mt-4 flex flex-col divide-y" style={{ borderColor: "#f3f4f6" }}>
          {/* Stacks on mobile, single row from sm up. The row packed an icon,
              two lines of text, a pill and a button onto a phone width, which
              truncated the title to nothing useful and squeezed the button to
              30px. Same elements, given room. */}
          {visible.map((it) => (
            <div
              key={it.id}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex min-w-0 items-start gap-3 sm:flex-1 sm:items-center">
                <div
                  className="flex shrink-0 items-center justify-center rounded-lg"
                  style={{
                    width: 32,
                    height: 32,
                    backgroundColor:
                      it.source === "rent"
                        ? "#171717"
                        : it.priority === "medium"
                          ? "#b45309"
                          : "#7f1d1d",
                    color: "#fff",
                  }}
                  aria-hidden="true"
                >
                  {it.source === "rent" ? <Euro size={16} /> : <AlertCircle size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  {/* Full title on mobile. A deadline truncated mid-word is
                      worse than no deadline: it looks handled. */}
                  <div
                    className="sm:truncate"
                    style={{ fontWeight: 600, fontSize: 13, color: "#111827", lineHeight: 1.4 }}
                  >
                    {it.title}
                  </div>
                  <div
                    className="sm:truncate"
                    style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}
                  >
                    {it.subtitle}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <SeverityPill severity={it.priority} />
              </div>

              <Link
                to={it.to}
                className="flex w-full shrink-0 items-center justify-center rounded-lg sm:w-auto"
                style={{
                  minHeight: 44,
                  padding: "0 16px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#fff",
                  color: "#374151",
                  fontWeight: 600,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                {it.actionLabel}
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <EmptyBlock
          icon={<CheckCircle2 size={28} color="#22c55e" aria-hidden="true" />}
          title={properties.length === 0 ? "No actions yet" : "You're all caught up"}
          body="Declarations, certificate renewals and rent to confirm will appear here."
        />
      )}
    </Card>
  );
}

/* -------------------------------- Skeleton -------------------------------- */

function SkeletonDashboard() {
  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <Skeleton width={140} height={12} radius={4} />
      <div style={{ marginTop: 12 }}>
        <Skeleton width="60%" height={30} />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <Skeleton width={100} height={18} radius={4} />
            <div style={{ marginTop: 16 }}>
              <Skeleton width="100%" height={160} radius={8} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
