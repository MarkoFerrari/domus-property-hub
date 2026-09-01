import { Link } from "react-router-dom";

import { Logo } from "../components/Logo";
import { DEADLINE_CAVEAT_LONG } from "../lib/legal";

/**
 * Public, deliberately outside the auth gate: someone deciding whether to sign
 * up has to be able to read it first.
 *
 * NOT LEGAL ADVICE AND NOT A FINISHED POLICY. It describes accurately what the
 * code actually does today, which is the part only we can write. A lawyer has
 * to review it, fill the bracketed gaps, and confirm it covers Greek and EU
 * obligations before Domus takes a paying customer.
 */
export default function Privacy() {
  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto w-full max-w-[720px]">
        <Link to="/" aria-label="Domus home">
          <Logo className="h-7 w-auto" />
        </Link>

        <h1 className="mt-10 text-[30px] font-extrabold leading-tight text-[#0D0D0D]">
          Privacy at Domus
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#4B5563]">
          Last updated 10 August 2026. This describes what Domus stores, why, and what you can do
          about it.
        </p>

        <div
          className="mt-8 rounded-xl border px-4 py-3 text-[13px] leading-relaxed"
          style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB", color: "#92400E" }}
        >
          <strong className="font-bold">Draft, pending legal review.</strong> The description of
          what the software does is accurate. The legal wording has not yet been reviewed by a
          qualified adviser and the bracketed items below are unfinished. Do not rely on this as a
          final policy.
        </div>

        <Section title="Who is responsible for your data">
          <p>
            [Legal entity name], [registered address], Greece. Questions and any request below go to{" "}
            <a href="mailto:privacy@domus.example" className="font-semibold text-[#2563EB] underline">
              privacy@domus.example
            </a>
            . [Confirm whether a Data Protection Officer is required.]
          </p>
        </Section>

        <Section title="What Domus stores">
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong>Your account:</strong> name, email address, and a securely hashed password.
              Domus never sees or stores your password in readable form. If you sign in with Google,
              Google confirms who you are and Domus receives your name and email, nothing else.
            </li>
            <li>
              <strong>Your properties:</strong> whatever you enter. Name, address, size, rent or
              nightly rate, tenant name, payment day, and an optional photo.
            </li>
            <li>
              <strong>Your records:</strong> the declarations, ΤΑΚΚ entries and rent confirmations
              you record, with the amounts you enter and the time you entered them.
            </li>
            <li>
              <strong>Your certificate documents:</strong> the files you upload, held privately.
              Only your account can open them.
            </li>
            <li>
              <strong>An edit log:</strong> when you change a recorded figure, Domus keeps what it
              was before. This is deliberately append-only so your own history cannot be quietly
              rewritten, including by us.
            </li>
          </ul>
        </Section>

        <Section title="What Domus does not do">
          <ul className="ml-5 list-disc space-y-2">
            <li>No advertising, no ad tracking, no selling or sharing your data with advertisers.</li>
            <li>No analytics or third-party tracking scripts in the application.</li>
            <li>
              Domus never files anything with any authority, never moves money, and never accesses
              your bank or your listings.
            </li>
            <li>Domus does not calculate what you owe. Every figure is one you entered.</li>
          </ul>
        </Section>

        <Section title="Who else can see it">
          <p>
            Your data sits in a Postgres database with row-level security, which means each row is
            tied to your account and the database itself refuses to return another landlord's rows.
            Two processors are involved: [hosting provider] for the database and file storage, and
            [email provider] to send verification, password reset and reminder emails. [Confirm
            data-processing agreements and hosting region, EU preferred, before launch.]
          </p>
        </Section>

        <Section title="How long it is kept">
          <p>
            For as long as your account exists. Delete your account and everything goes with it:
            properties, records, uploaded documents and the edit log, by cascade, not by a scheduled
            job. [Confirm any statutory retention period that overrides this.]
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under the GDPR you can access, correct, export, restrict or erase your data, and object
            to how it is used. Two of these are buttons rather than requests:
          </p>
          <ul className="ml-5 mt-2 list-disc space-y-2">
            <li>
              <strong>Export:</strong> Settings gives you everything as CSV or JSON, immediately.
            </li>
            <li>
              <strong>Erase:</strong> Settings deletes your account and all of it. There is no undo
              and no soft-delete holding period.
            </li>
          </ul>
          <p className="mt-2">
            For anything else, email us. You can also complain to the Hellenic Data Protection
            Authority.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            Domus sets one thing in your browser: the session that keeps you signed in. There are no
            advertising or analytics cookies, which is why you are not being asked to accept
            anything. [Confirm this remains accurate if analytics are ever added.]
          </p>
        </Section>

        <Section title="One thing worth repeating">
          <p>{DEADLINE_CAVEAT_LONG}</p>
        </Section>

        <div className="mt-12 border-t pt-6" style={{ borderColor: "#E8E8E8" }}>
          <Link to="/" className="text-[14px] font-semibold text-[#0D0D0D] underline">
            Back to Domus
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-[18px] font-bold text-[#0D0D0D]">{title}</h2>
      <div className="mt-2 space-y-2 text-[14px] leading-relaxed text-[#374151]">{children}</div>
    </section>
  );
}
