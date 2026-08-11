/**
 * App-screen patterns — source of truth §7.2 / §7.3.
 * These are THE building blocks for every authenticated screen. Reuse them.
 * Do not invent a parallel component system.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { TriangleAlert, X } from "lucide-react";
import type { CertStatus } from "../lib/compliance";

/* --------------------------------- Cards ---------------------------------- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border ${className}`}
      style={{ backgroundColor: "#fff", borderColor: "#e5e7eb", padding: 20 }}
    >
      {children}
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      {title || action ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <SectionTitle>{title}</SectionTitle> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </Card>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 style={{ fontWeight: 700, fontSize: 16, color: "#111827", margin: 0 }}>{children}</h2>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "#9ca3af" }}>
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  caption,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  tone?: "default" | "warn" | "danger" | "good";
}) {
  const valueColor =
    tone === "danger" ? "#b91c1c" : tone === "warn" ? "#b45309" : tone === "good" ? "#15803d" : "#111827";
  return (
    <div
      className="rounded-xl border"
      style={{ borderColor: "#e5e7eb", backgroundColor: "#fff", padding: 16 }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{label}</div>
      <div className="mt-1" style={{ fontSize: 24, fontWeight: 700, color: valueColor, lineHeight: 1.2 }}>
        {value}
      </div>
      {caption ? (
        <div className="mt-1" style={{ fontSize: 12, color: "#9ca3af" }}>
          {caption}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------- Status ---------------------------------- */

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  valid: { bg: "#dcfce7", fg: "#15803d" },
  compliant: { bg: "#dcfce7", fg: "#15803d" },
  renew: { bg: "#fef3c7", fg: "#b45309" },
  expired: { bg: "#fee2e2", fg: "#b91c1c" },
  missing: { bg: "#fee2e2", fg: "#b91c1c" },
  action: { bg: "#fee2e2", fg: "#b91c1c" },
  neutral: { bg: "#f3f4f6", fg: "#6b7280" },
};

/**
 * Status is never conveyed by colour alone (§4.4) — the label is always
 * rendered next to the colour.
 */
export function StatusPill({
  status,
  children,
  size = "md",
}: {
  status: CertStatus | "compliant" | "action" | "neutral";
  children: ReactNode;
  size?: "sm" | "md";
}) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        backgroundColor: s.bg,
        color: s.fg,
        borderRadius: 999,
        fontSize: size === "sm" ? 11 : 12,
        fontWeight: 700,
        padding: size === "sm" ? "2px 8px" : "4px 10px",
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: s.fg, display: "inline-block" }}
      />
      {children}
    </span>
  );
}

export function SeverityPill({ severity }: { severity: "high" | "medium" }) {
  const high = severity === "high";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 6,
        backgroundColor: high ? "#fee2e2" : "#fef3c7",
        color: high ? "#b91c1c" : "#b45309",
        whiteSpace: "nowrap",
      }}
    >
      {high ? "High" : "Medium"}
    </span>
  );
}

export function TypeTag({ type }: { type: "short" | "long" }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: "#9ca3af",
        whiteSpace: "nowrap",
      }}
    >
      {type === "short" ? "SHORT TERM" : "LONG TERM"}
    </span>
  );
}

/* ------------------------------- Read-only -------------------------------- */

export function ReadOnly({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{label}</div>
      <div className="mt-1" style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-[13px] font-semibold text-[#0D0D0D]">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[12px] text-[#DC2626]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-[#6B7280]">{hint}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------- Warning --------------------------------- */

/**
 * The "Domus did not do this for you" callout.
 *
 * WHY IT LOOKS LIKE A WARNING: this sentence is the single most important thing
 * on a record dialog, and it used to be grey text on a grey box, which reads as
 * boilerplate and gets skipped. A landlord who ticks a month as recorded and
 * believes Domus filed it has been actively harmed by the product. Amber, an
 * icon and a border are what stop it scanning as decoration.
 *
 * Colours are the existing medium-severity pair from the design system
 * (§4.2), so this is not a new visual language. `#92400E` on `#FFFBEB` is about
 * 8:1, comfortably past WCAG AA.
 *
 * `role="note"` rather than `role="alert"`: it is always present and never
 * interrupts, so it should not shout at a screen reader on every render.
 */
export function WarningNote({ children }: { children: ReactNode }) {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-lg px-4 py-3"
      style={{
        backgroundColor: "#FFFBEB",
        border: "1px solid #FDE68A",
        borderLeft: "4px solid #F59E0B",
      }}
    >
      <TriangleAlert
        size={17}
        color="#B45309"
        className="mt-px shrink-0"
        aria-hidden="true"
      />
      <div style={{ fontSize: 13, lineHeight: 1.55, color: "#92400E" }}>{children}</div>
    </div>
  );
}

/* --------------------------------- Empty ---------------------------------- */

export function EmptyBlock({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="mt-3 flex flex-col items-center justify-center text-center"
      style={{ minHeight: 160 }}
    >
      {icon}
      <p className="mt-2" style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
        {title}
      </p>
      {body ? (
        <p className="mt-1" style={{ fontSize: 13, color: "#6b7280", maxWidth: 320, lineHeight: 1.5 }}>
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({
  width = "100%",
  height = 16,
  radius = 6,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
}) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius }} />;
}

/* --------------------------------- Modal ---------------------------------- */

/**
 * The stack of currently-open modals, newest last.
 *
 * WHY THIS EXISTS: a confirmation dialog opened from inside another dialog used
 * to break in three ways at once. Both modals rendered at `z-50`, so which one
 * appeared on top was down to DOM order. Both bound Escape to `document`, so one
 * keypress dismissed both, meaning "are you sure?" could be answered by
 * accident. And both restored `body.overflow` on unmount, so closing the inner
 * one unlocked background scrolling while the outer one was still open.
 *
 * Confirming a deletion from within a dialog is exactly the case that has to be
 * hard to get wrong, so the stack is tracked properly instead.
 */
let modalStack: symbol[] = [];

/**
 * Accessible modal: focus moves in on open, Escape closes the TOP modal only,
 * background scroll locked while any modal is open, click-outside closes.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<symbol>(Symbol("modal"));
  const [depth, setDepth] = useState(0);

  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    modalStack.push(id);
    setDepth(modalStack.length - 1);

    const onKey = (e: KeyboardEvent) => {
      // Only the topmost modal reacts, so Escape closes one layer at a time.
      if (e.key === "Escape" && modalStack[modalStack.length - 1] === id) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const t = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 30);

    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      modalStack = modalStack.filter((m) => m !== id);
      // Only the last modal out restores scrolling.
      if (modalStack.length === 0) document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center"
      style={{
        backgroundColor: "rgba(15,23,42,0.45)",
        padding: 16,
        zIndex: 50 + depth * 10,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full overflow-y-auto"
        style={{
          maxWidth: width,
          maxHeight: "90vh",
          backgroundColor: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          padding: 20,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}>{title}</h2>
            {description ? (
              <p className="mt-1" style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="tap-44 rounded-lg p-1 text-[#6b7280] transition-colors hover:bg-[#f3f4f6]"
          >
            <X size={18} />
          </button>
        </div>

        {children ? <div className="mt-5">{children}</div> : null}
        {footer ? <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">{footer}</div> : null}
      </div>
    </div>
  );
}
