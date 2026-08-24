import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Compass, Database, Download, FileSpreadsheet, HardDrive, LogOut, ShieldX } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "../components/AppShell";
import { ReadOnly, SectionCard } from "../components/patterns";
import { Btn } from "../components/ui-primitives";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ReminderSettings } from "../components/ReminderSettings";
import { useAuth } from "../lib/auth";
import { useStore } from "../lib/store";
import { isDemo } from "../lib/demoMode";
import { resetDemoData } from "../lib/db";
import { useTour } from "../lib/tour";
import {
  buildCertificatesCsv,
  buildFullJson,
  buildLedgerCsv,
  download,
  stamp,
  type ExportInput,
} from "../lib/export";

export default function Settings() {
  const navigate = useNavigate();
  const { user, signOut, deleteAccount } = useAuth();
  const { properties, seedDemo, notifications, declarations, rents } = useStore();
  const { restart: restartTour } = useTour();
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const exportInput: ExportInput = {
    properties,
    declarations,
    rents,
    email: user?.email ?? "",
  };

  /* Everything is built in the browser from data already loaded. An export
     never round-trips to a server, so it cannot itself leak a portfolio. */
  const exportLedger = () =>
    download(`domus-ledger-${stamp()}.csv`, buildLedgerCsv(exportInput), "text/csv");
  const exportCerts = () =>
    download(`domus-certificates-${stamp()}.csv`, buildCertificatesCsv(exportInput), "text/csv");
  const exportAll = () =>
    download(`domus-full-export-${stamp()}.json`, buildFullJson(exportInput), "application/json");

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      toast.success("Your account and all of its data have been deleted.");
      navigate("/", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete your account.");
      setDeleting(false);
    }
  };

  const loadDemo = async () => {
    setBusy(true);
    try {
      const n = await seedDemo();
      toast[n > 0 ? "success" : "message"](
        n > 0 ? `${n} example properties added` : "You already have properties — nothing added",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the example portfolio.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell activeKey="dashboard" title="Settings">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
        <h1 style={{ fontWeight: 700, fontSize: 24, color: "#111827" }}>Settings</h1>

        <SectionCard title="Your account">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <ReadOnly label="Name" value={user?.fullName || "—"} />
            <ReadOnly label="Email" value={user?.email || "—"} />
            <ReadOnly label="Properties" value={properties.length} />
            <ReadOnly label="Open items" value={notifications.length} />
          </div>
        </SectionCard>

        <SectionCard title="Where your data lives">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{
                backgroundColor: !isDemo() ? "#dcfce7" : "#fef3c7",
                color: !isDemo() ? "#15803d" : "#b45309",
              }}
              aria-hidden="true"
            >
              {!isDemo() ? <Database size={18} /> : <HardDrive size={18} />}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
                {!isDemo() ? "Connected to your database" : "Demo. Nothing is saved"}
              </div>
              <p className="mt-1" style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}>
                {!isDemo()
                  ? "Your portfolio is stored in your own Supabase project. Row-level security means only your account can read or write your rows."
                  : "Everything you have entered is held in this browser and has never left your device. Signing out, clearing your browser, or opening Domus somewhere else all start you from empty. There is no copy and no way to recover it."}
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Example portfolio">
          <p className="-mt-2 mb-4" style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}>
            Adds five Athens properties with a realistic mix of certificate states, so you can see
            how alerts appear and clear. Only works when your portfolio is empty.
          </p>
          <div className="sm:w-[260px]">
            <Btn
              variant="secondary"
              onClick={loadDemo}
              loading={busy}
              disabled={properties.length > 0}
            >
              Load example portfolio
            </Btn>
          </div>
          {properties.length > 0 ? (
            <p className="mt-2" style={{ fontSize: 12, color: "#9ca3af" }}>
              You already have {properties.length} propert{properties.length === 1 ? "y" : "ies"}.
            </p>
          ) : null}
        </SectionCard>

        <SectionCard title="Product tour">
          <p className="-mt-2 mb-4" style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}>
            The six-step walkthrough you saw the first time you signed in. It points at the
            earnings summary, the action queue and the tabs inside a property.
          </p>
          <div className="sm:w-[260px]">
            <Btn variant="secondary" onClick={restartTour} disabled={properties.length === 0}>
              <Compass size={16} aria-hidden="true" /> Replay the tour
            </Btn>
          </div>
          {properties.length === 0 ? (
            <p className="mt-2" style={{ fontSize: 12, color: "#9ca3af" }}>
              Add a property first — the tour points at things that do not exist yet.
            </p>
          ) : null}
        </SectionCard>

        <ReminderSettings />

        <SectionCard title="Export your data">
          <p className="-mt-2 mb-4" style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}>
            Everything Domus holds about you, downloaded straight from this browser. The ledger CSV
            is the one your accountant wants. Amounts are what you entered. None of these files is
            evidence of a filing.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <div className="sm:w-[230px]">
              <Btn variant="secondary" onClick={exportLedger} disabled={properties.length === 0}>
                <FileSpreadsheet size={16} aria-hidden="true" /> Ledger (CSV)
              </Btn>
            </div>
            <div className="sm:w-[230px]">
              <Btn variant="secondary" onClick={exportCerts} disabled={properties.length === 0}>
                <FileSpreadsheet size={16} aria-hidden="true" /> Certificates (CSV)
              </Btn>
            </div>
            <div className="sm:w-[230px]">
              <Btn variant="secondary" onClick={exportAll} disabled={properties.length === 0}>
                <Download size={16} aria-hidden="true" /> Everything (JSON)
              </Btn>
            </div>
          </div>
          {properties.length === 0 ? (
            <p className="mt-2" style={{ fontSize: 12, color: "#9ca3af" }}>
              Nothing to export yet.
            </p>
          ) : null}
        </SectionCard>

        <SectionCard title="Session">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="sm:w-[200px]">
              <Btn
                variant="secondary"
                onClick={async () => {
                  await signOut();
                  navigate("/signin");
                }}
              >
                <LogOut size={16} aria-hidden="true" /> Log out
              </Btn>
            </div>
            {isDemo() ? (
              <div className="sm:w-[220px]">
                <Btn
                  variant="secondary"
                  className="!border-[#fecaca] !text-[#b91c1c] hover:!bg-[#fef2f2]"
                  onClick={() => setResetOpen(true)}
                >
                  Reset all demo data
                </Btn>
              </div>
            ) : null}
          </div>
        </SectionCard>

        {!isDemo() ? (
          <SectionCard title="Delete your account">
            <p className="-mt-2 mb-4" style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}>
              Removes your account and everything attached to it: every property, declaration, rent
              record, uploaded document and edit log entry. It happens immediately, there is no
              holding period and no undo. Export first if you want a copy.
            </p>
            <div className="sm:w-[240px]">
              <Btn
                variant="secondary"
                className="!border-[#fecaca] !text-[#b91c1c] hover:!bg-[#fef2f2]"
                onClick={() => setDeleteOpen(true)}
              >
                <ShieldX size={16} aria-hidden="true" /> Delete account and data
              </Btn>
            </div>
          </SectionCard>
        ) : null}

        <p className="pb-4 text-center" style={{ fontSize: 12, color: "#9ca3af" }}>
          Domus POC v3, Greece pilot. Domus records and reminds. It never moves money and never
          edits your listings.{" "}
          <Link to="/privacy" className="underline">
            Privacy
          </Link>
        </p>
      </div>

      <ConfirmDialog
        open={resetOpen}
        title="Reset all demo data?"
        description="This deletes every property, declaration, rent record and your demo account from this browser. There is no undo."
        confirmLabel="Reset everything"
        destructive
        onConfirm={async () => {
          resetDemoData();
          await signOut();
          navigate("/", { replace: true });
        }}
        onClose={() => setResetOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete your account?"
        description="Every property, declaration, rent record, uploaded document and edit log entry is deleted immediately. This cannot be undone and support cannot recover it."
        confirmLabel={deleting ? "Deleting…" : "Delete everything"}
        destructive
        onConfirm={confirmDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </AppShell>
  );
}
