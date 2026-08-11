/**
 * The authenticated app shell — source of truth §4.2.
 * Dark 240px sidebar on desktop, dark bottom nav on mobile, 60px white topbar.
 *
 * The topbar alert pill and both nav badges read from the SAME derived
 * notification feed in the store. There is no second, inline derivation
 * anywhere — that duplication is exactly what let the topbar drift out of sync
 * with certificate data in the original build (§10, item 1).
 */

import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Building2,
  HelpCircle,
  Home,
  LogOut,
  Settings as SettingsIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Logo } from "./Logo";
import { useAuth } from "../lib/auth";
import { useStore } from "../lib/store";
import { isSupabaseConfigured } from "../lib/supabase";

export type NavKey = "dashboard" | "properties" | "notifications";

const NAV: Array<{ key: NavKey; label: string; icon: typeof Home; to: string }> = [
  { key: "dashboard", label: "Dashboard", icon: Home, to: "/dashboard" },
  { key: "properties", label: "Properties", icon: Building2, to: "/properties" },
  { key: "notifications", label: "Notifications", icon: Bell, to: "/notifications" },
];

const shellVars: React.CSSProperties = {
  ["--canvas" as string]: "#fafafa",
  ["--surface" as string]: "#ffffff",
  ["--surface-sunken" as string]: "#f3f4f6",
  ["--border" as string]: "#e5e7eb",
  ["--text" as string]: "#111827",
  ["--text-subtle" as string]: "#374151",
  ["--text-muted" as string]: "#6b7280",
  ["--accent" as string]: "#FF6B35",
  ["--accent-hover" as string]: "#e5511b",
  ["--accent-subtle" as string]: "#fff4ee",
};

export function AppShell({
  children,
  activeKey,
  title,
  topbarRight,
}: {
  children: ReactNode;
  activeKey: NavKey;
  title?: string;
  topbarRight?: ReactNode;
}) {
  const location = useLocation();
  const { notificationCount } = useStore();

  const navItems = NAV.map((item) => ({
    ...item,
    badge: item.key === "notifications" ? notificationCount || undefined : undefined,
  }));

  return (
    <div className="min-h-screen" style={{ ...shellVars, backgroundColor: "var(--canvas)" }}>
      {/* Sidebar — desktop */}
      <aside
        className="fixed left-0 top-0 hidden h-screen lg:flex lg:flex-col"
        style={{ width: 240, backgroundColor: "#171717" }}
      >
        <div className="px-5 pt-6 pb-8">
          <Link to="/dashboard" aria-label="Domus — go to dashboard" className="block">
            <Logo variant="light" className="h-[22px] w-auto" />
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main">
          {navItems.map((item) => (
            <SidebarNavItem key={item.key} item={item} active={item.key === activeKey} />
          ))}
        </nav>

        <div className="px-5 py-4" style={{ color: "#525252", fontSize: 11, lineHeight: 1.5 }}>
          POC v3 — Greece pilot
          <br />
          {isSupabaseConfigured ? "Connected to your database" : "Demo data. Build v0.4"}
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-[240px]">
        <header
          className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-6 lg:px-8"
          style={{
            height: 60,
            backgroundColor: "var(--surface)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex-1 truncate" style={{ fontWeight: 600, fontSize: 16, color: "var(--text)" }}>
            {title ?? titleFromPath(location.pathname)}
          </div>
          <div className="flex items-center gap-3">
            {topbarRight ?? <ComplianceTopbarAlert />}
            <AvatarMenu />
          </div>
        </header>

        <main className="px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-10">
          <LoadFailureBanner />
          <UnsafeDemoBanner />
          {children}
        </main>
      </div>

      {/* Bottom nav — mobile */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex items-stretch lg:hidden"
        aria-label="Main"
        style={{ height: 60, backgroundColor: "#171717", borderTop: "1px solid #262626", zIndex: 20 }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeKey;
          return (
            <Link
              key={item.key}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-1 flex-col items-center justify-center gap-1"
              style={{
                color: active ? "#FF6B35" : "#9ca3af",
                fontWeight: active ? 600 : 500,
                fontSize: 11,
              }}
            >
              <Icon size={20} aria-hidden="true" />
              {item.label}
              {item.badge ? (
                <span
                  aria-label={`${item.badge} urgent notifications`}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: "50%",
                    marginRight: -20,
                    backgroundColor: "#DC2626",
                    color: "#fff",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                    minWidth: 16,
                    height: 16,
                    padding: "0 5px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {item.badge}
                </span>
              ) : null}
              {active && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: "25%",
                    right: "25%",
                    height: 2,
                    backgroundColor: "#FF6B35",
                    borderRadius: 2,
                  }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarNavItem({
  item,
  active,
}: {
  item: { key: NavKey; label: string; icon: typeof Home; to: string; badge?: number };
  active: boolean;
}) {
  const [hover, setHover] = useState(false);
  const Icon = item.icon;
  const bg = active ? "rgba(255,107,53,0.15)" : hover ? "rgba(255,255,255,0.05)" : "transparent";
  const textColor = active ? "#ffffff" : hover ? "#e5e7eb" : "#a3a3a3";
  const iconColor = active ? "#FF6B35" : hover ? "#d1d5db" : "#737373";
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex items-center gap-3 rounded-lg transition-colors"
      style={{
        height: 44,
        padding: "0 12px",
        backgroundColor: bg,
        color: textColor,
        fontWeight: 600,
        fontSize: 14,
      }}
    >
      <Icon size={18} color={iconColor} aria-hidden="true" />
      <span className="flex-1">{item.label}</span>
      {item.badge ? (
        <span
          aria-label={`${item.badge} urgent`}
          style={{
            backgroundColor: "#DC2626",
            color: "#fff",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            minWidth: 18,
            height: 18,
            padding: "0 6px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function titleFromPath(p: string): string {
  if (p.startsWith("/dashboard")) return "Dashboard";
  if (p === "/properties/new") return "Add property";
  if (p.endsWith("/edit")) return "Edit property";
  if (p.startsWith("/properties")) return "Properties";
  if (p.startsWith("/notifications")) return "Notifications";
  if (p.startsWith("/settings")) return "Settings";
  if (p.startsWith("/help")) return "Help Center";
  return "";
}

function initialsOf(name: string, email: string) {
  const source = name.trim() || email.split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AvatarMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const logout = async () => {
    setOpen(false);
    await signOut();
    navigate("/signin");
  };

  const item: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 500,
    color: "#111827",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    borderRadius: 8,
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: "#e5e7eb", color: "#374151", fontWeight: 700, fontSize: 13 }}
      >
        {initialsOf(user?.fullName ?? "", user?.email ?? "")}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 220,
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
            padding: 6,
            zIndex: 50,
          }}
        >
          <div style={{ padding: "8px 14px 10px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
              {user?.fullName || "Landlord"}
            </div>
            <div className="truncate" style={{ fontSize: 12, color: "#6b7280" }}>
              {user?.email}
            </div>
          </div>
          <div style={{ height: 1, background: "#f3f4f6", margin: "0 0 4px" }} />
          <button type="button" role="menuitem" style={item} onClick={() => go("/settings")}>
            <SettingsIcon size={16} aria-hidden="true" /> Settings
          </button>
          <button type="button" role="menuitem" style={item} onClick={() => go("/help")}>
            <HelpCircle size={16} aria-hidden="true" /> Help Center
          </button>
          <div style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />
          <button
            type="button"
            role="menuitem"
            style={{ ...item, color: "#be123c" }}
            onClick={logout}
          >
            <LogOut size={16} aria-hidden="true" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A load failure used to be invisible: the store caught the error into state
 * and nothing rendered it, so a network drop or a bad key showed the landlord a
 * clean empty dashboard reading "Let's set up your portfolio". Their reasonable
 * conclusion was that Domus had lost everything. Never let this fail quietly.
 */
function LoadFailureBanner() {
  const { error, refresh, loading } = useStore();
  if (!error) return null;
  return (
    <div
      role="alert"
      className="mx-auto mb-5 w-full max-w-[1200px] rounded-xl border px-4 py-3"
      style={{ borderColor: "#FECACA", backgroundColor: "#FEF2F2" }}
    >
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle size={18} color="#DC2626" className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p style={{ fontSize: 14, fontWeight: 700, color: "#991B1B" }}>
            Could not load your portfolio
          </p>
          <p className="mt-0.5" style={{ fontSize: 13, color: "#B91C1C", lineHeight: 1.5 }}>
            Nothing has been deleted. This is a connection problem, not lost data. {error}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="shrink-0 rounded-lg px-3 text-[12px] font-semibold text-white disabled:opacity-50"
          style={{ height: 32, backgroundColor: "#B91C1C" }}
        >
          {loading ? "Retrying…" : "Try again"}
        </button>
      </div>
    </div>
  );
}

/**
 * Demo mode on a real domain means someone deployed without env vars. The build
 * succeeds, every screen works, and the landlord's data lives only in their own
 * browser. Small grey sidebar text was not enough of a warning for that.
 */
function UnsafeDemoBanner() {
  if (isSupabaseConfigured) return null;
  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  if (isLocal) return null;
  return (
    <div
      role="alert"
      className="mx-auto mb-5 w-full max-w-[1200px] rounded-xl border px-4 py-3"
      style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB" }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} color="#B45309" className="mt-0.5 shrink-0" aria-hidden="true" />
        <p style={{ fontSize: 13, color: "#92400E", lineHeight: 1.55 }}>
          <strong style={{ fontWeight: 700 }}>Demo mode, on a live address.</strong> No database is
          connected, so everything you enter here is saved in this browser only. It will not reach
          another device and clearing your browser wipes it. Do not use this for real records until
          the database is connected.
        </p>
      </div>
    </div>
  );
}

/** Derived alert pill. Reads the shared feed — never re-derives compliance. */
function ComplianceTopbarAlert() {
  const { visibleNotifications } = useStore();
  if (visibleNotifications.length === 0) return null;
  const first = visibleNotifications[0].title;
  const label =
    visibleNotifications.length === 1 ? first : `${first} +${visibleNotifications.length - 1} more`;
  return (
    <Link to="/notifications" style={{ textDecoration: "none" }}>
      <TopbarAlert>{label}</TopbarAlert>
    </Link>
  );
}

/** Reusable topbar alert pill: orange dot + text. */
export function TopbarAlert({ children }: { children: ReactNode }) {
  return (
    <div className="hidden items-center gap-2 md:flex" style={{ fontSize: 13, color: "#374151" }}>
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: "#FF6B35",
          display: "inline-block",
        }}
      />
      <span className="max-w-[420px] truncate">{children}</span>
    </div>
  );
}
