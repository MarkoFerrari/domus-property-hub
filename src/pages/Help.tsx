import { AppShell } from "../components/AppShell";
import { SectionCard } from "../components/patterns";
import { CERTIFICATES, RENEW_WINDOW_DAYS } from "../lib/compliance";
import { DEADLINE_CAVEAT_LONG } from "../lib/legal";

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "When is a short-term declaration due?",
    a: "Domus works to the 20th of the month following the month you are declaring, so June is due by 20 July. ΤΑΚΚ is separate and Domus works to the last working day of the following month. Both dates are indicative: they do not account for public holidays and they are not tax advice. Confirm them with your accountant.",
  },
  {
    q: "Do I have to declare a month where I earned nothing?",
    a: "Yes. Zero-income months still have to be declared. Domus has a dedicated toggle for that so the month counts as done.",
  },
  {
    q: "Why did an alert disappear on its own?",
    a: "Every alert in Domus is calculated from your current data each time a screen renders. Upload the missing certificate or record the declaration, and the alert clears from the property card, the banner, the topbar and the notification list at the same moment.",
  },
  {
    q: "Why can't I record this month?",
    a: "Only completed months can be recorded. A month appears in the list once it has ended, so you never report income for a month that is still running.",
  },
  {
    q: "Does Domus file anything for me?",
    a: "No. Domus records and reminds. It never files with AADE, never moves money, and never edits your listings. You stay in control of every submission.",
  },
  {
    q: "What does 'snooze' do to a notification?",
    a: "It hides the row from your main list without pretending the problem is solved. The underlying item is still unresolved and you can unsnooze it any time from the bottom of the Notifications page.",
  },
];

export default function Help() {
  return (
    <AppShell activeKey="dashboard" title="Help Center">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <h1 style={{ fontWeight: 700, fontSize: 24, color: "#111827" }}>Help Center</h1>
        <p className="-mt-2" style={{ fontSize: 14, color: "#4b5563" }}>
          The rules Domus is built around, in plain language.
        </p>

        <SectionCard title="How compliance is decided">
          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
            A property is <strong>Action needed</strong> when any certificate is expired or has not
            been uploaded. It is <strong>Renew soon</strong> when one is within{" "}
            {RENEW_WINDOW_DAYS} days of expiring. Otherwise it is <strong>Compliant</strong>. These
            are worked out live from your certificate dates, never stored, so they cannot go stale.
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CERTIFICATES.map((c) => (
              <li
                key={c}
                className="rounded-lg px-3 py-2"
                style={{ backgroundColor: "#f9f9f9", fontSize: 13, color: "#374151" }}
              >
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-4" style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.55 }}>
            {DEADLINE_CAVEAT_LONG}
          </p>
        </SectionCard>

        <SectionCard title="Common questions">
          <ul className="flex flex-col divide-y" style={{ borderColor: "#f3f4f6" }}>
            {FAQ.map((f) => (
              <li key={f.q} className="py-4 first:pt-0 last:pb-0">
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{f.q}</h3>
                <p className="mt-1" style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
                  {f.a}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Not built yet">
          <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
            This is a pilot. The Airbnb calendar connection on the property page, and per-certificate
            renewal history, are still to come. Everything else on these screens is working.
          </p>
        </SectionCard>
      </div>
    </AppShell>
  );
}
