import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionCard } from "./patterns";
import { SelectInput } from "./ui-primitives";
import { useAuth } from "../lib/auth";
import { isDemo } from "../lib/demoMode";
import { supabase } from "../lib/supabase";

/**
 * Reminder email preferences.
 *
 * This exists as much for the law as for the product: the digest email carries
 * a "turn these emails off" link, and that link has to actually lead somewhere
 * that works. An unsubscribe promise you cannot keep is worse than no email.
 *
 * Reads and writes `profiles` directly rather than going through the store,
 * because the store deliberately holds portfolio data only. Preferences are not
 * portfolio data and pushing them through it would blur that line.
 */
export function ReminderSettings() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [leadDays, setLeadDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isDemo() || !user) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase!
      .from("profiles")
      .select("reminders_enabled, reminder_lead_days")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (!active || !data) return;
        setEnabled(data.reminders_enabled ?? true);
        setLeadDays(data.reminder_lead_days ?? 7);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  if (isDemo()) return null;

  const save = async (next: { enabled?: boolean; leadDays?: number }) => {
    if (!user) return;
    const prevEnabled = enabled;
    const prevLead = leadDays;

    // Optimistic, because a toggle that lags feels broken.
    if (next.enabled !== undefined) setEnabled(next.enabled);
    if (next.leadDays !== undefined) setLeadDays(next.leadDays);

    setSaving(true);
    const { error } = await supabase!
      .from("profiles")
      .update({
        reminders_enabled: next.enabled ?? prevEnabled,
        reminder_lead_days: next.leadDays ?? prevLead,
      })
      .eq("id", user.id);
    setSaving(false);

    if (error) {
      setEnabled(prevEnabled);
      setLeadDays(prevLead);
      toast.error("Could not save that. Try again.");
      return;
    }
    toast.success(
      next.enabled === false ? "Reminder emails turned off" : "Reminder preferences saved",
    );
  };

  return (
    <SectionCard title="Reminder emails">
      <p className="-mt-2 mb-4" style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.55 }}>
        Domus can email you when something is coming due, so you do not have to remember to open it.
        One email a day at most, and only when there is actually something to tell you.
      </p>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={loading || saving}
          onChange={(e) => void save({ enabled: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#0D0D0D]"
        />
        <span style={{ fontSize: 14, color: "#374151" }}>
          <strong style={{ fontWeight: 600, color: "#0D0D0D" }}>Email me about deadlines.</strong>{" "}
          Declarations, ΤΑΚΚ, rent that has not arrived, and certificates about to expire.
        </span>
      </label>

      {enabled ? (
        <div className="mt-5 sm:w-[280px]">
          <label
            htmlFor="lead-days"
            className="mb-1.5 block"
            style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}
          >
            How much warning
          </label>
          <SelectInput
            id="lead-days"
            value={String(leadDays)}
            disabled={loading || saving}
            onChange={(e) => void save({ leadDays: Number(e.target.value) })}
          >
            <option value="3">3 days before</option>
            <option value="7">7 days before</option>
            <option value="14">14 days before</option>
            <option value="30">30 days before</option>
          </SelectInput>
          <p className="mt-1.5" style={{ fontSize: 12, color: "#6b7280" }}>
            Anything already overdue is included regardless.
          </p>
        </div>
      ) : null}
    </SectionCard>
  );
}
