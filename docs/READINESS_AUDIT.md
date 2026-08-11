# Domus, Readiness Audit

**Date:** 10 August 2026 · **Revised same day after remediation**
**Scope:** full codebase review of `domus-property-hub` against two shipping bars
**Companion docs:** `HANDOFF_DOCUMENTATION.md` (scope and acceptance), `DOMUS_SOURCE_OF_TRUTH.md` (design and rules)

---

## 0. Status after remediation, 10 August 2026

Everything below was written against the codebase as it stood this morning. A remediation pass has since landed. This section is the current position; the original findings are kept underneath, unedited, because the reasoning is what makes the fixes reviewable.

**Fixed and verified (TypeScript clean, 18 tests passing):**

| Finding | State |
|---|---|
| P0-1 ΤΑΚΚ unreachable | **Fixed.** Two rows per month in the Payments tab, a type-aware record dialog, ΤΑΚΚ in the notification feed, and a separate branch in the reminder email. Month counts as done only when both obligations are recorded. |
| P0-2 Certificates were filenames | **Fixed.** Private Supabase Storage bucket with per-user policies, real upload, signed URLs to view. The free-text filename box is gone. Demo-mode records are flagged and labelled honestly. |
| P0-3 Load failure looked like no data | **Fixed.** `LoadFailureBanner` in AppShell with a retry, on every screen. |
| P0-4 No error boundary | **Fixed.** `ErrorBoundary` around the app, with reload and a technical detail panel. |
| P0-5 Silent failures | **Fixed.** localStorage quota failures now throw and surface. Demo mode on a non-localhost host shows a loud banner. The plaintext password is no longer written to localStorage, and the stale key is cleaned up. |
| P0-6 No tests | **Partly fixed.** 18 tests on the date logic, the part where being wrong costs money. Run with `npm test`. No component tests yet. |
| P1-1 No password reset | **Fixed.** `/forgot-password` and `/reset-password`, with enumeration-safe messaging. |
| P1-2 No reminders | **Fixed, pending deploy.** `send-reminders` edge function plus a pg_cron schedule, with a preferences UI and a working unsubscribe. |
| P1-3 No export or deletion | **Fixed.** Ledger CSV, certificates CSV, full JSON, and a `delete-account` edge function for Article 17 erasure. |
| P1-4 No privacy policy | **Drafted.** `/privacy`, accurate on what the code does, with bracketed gaps a lawyer fills. |
| P1-6 Unverified legal claims | **Removed.** The €5,000 fine and the Law 5170/2025 reference are gone. All legal copy now lives in `src/lib/legal.ts` behind a `LEGAL_REVIEW.reviewed` flag. |

**Still open, and still blocking:**

- ~~**P1-5 Google Fonts from Google's CDN.**~~ **Fixed.** Manrope is now self-hosted from `public/fonts` (latin, latin-ext and Greek subsets, `unicode-range` split so a browser only fetches what it needs). The `fonts.googleapis.com` link is gone from `index.html` and the built output contains zero requests to Google.
- **P1-6 (the other half).** Removing the claims removed the exposure, not the question. A Greek tax professional still has to confirm the deadline rules themselves.
- **P1-4 (the other half).** The policy needs a lawyer and the bracketed entity, processor and retention details.
- **P1-7 No backups.** Unchanged.
- **All P2 items.** Unchanged, including `deadline_overrides` still being built and unused.
- **Everything in §5.** No new product features were built. Expenses, leases, partial payments and Greek language are all still missing.

**Caveat, narrowed.** The **production build now passes** (verified in a clean Linux install: 636KB, 182KB gzipped, with a chunk-size warning worth addressing later). RLS was verified by direct query, not just by reading policy definitions: as the `anon` role, every table returns zero rows. What is still unverified is the **UI in a browser** — no screen has been clicked, and responsive behaviour at 1600px and 393px is still assumed.

**Found during the first real run:** Supabase's default "Confirm signup" email template uses `{{ .ConfirmationURL }}`, which sends a link and no code, while the app's verify screen asks for a 6-digit code. The screen could never work as designed until the template is switched to `{{ .Token }}`. The copy now covers both cases and `SETUP_SUPABASE.md` step 5e has the fix.

**Update, same day:** the Supabase project now exists. Project `cahgonzqkxxkbyoempqw` in Frankfurt, all five migrations applied, RLS verified on all eight tables, private certificate bucket live, both edge functions deployed, `.env` written. The security advisor found two SECURITY DEFINER trigger functions callable as public RPC; migration 0005 revokes that and the advisor is now clean. Google sign-in and the Resend key are the only external steps left, and both need a human in a third-party console.

**Also fixed, 10 Aug (not in the original audit, and it should have been):** four destructive actions deleted data on a single click with no confirmation — remove certificate, clear stay/ΤΑΚΚ record, clear rent record, remove property photo. All now confirm. The reason they could not have been fixed by simply dropping in a `ConfirmDialog` is worth noting: `Modal` had no stacking, so a confirmation opened from inside a dialog shared `z-50` with its parent and a single Escape keypress closed both, which would have let a landlord dismiss "are you sure?" by accident. Modal stacking was fixed first.

**Revised verdict:** pilot-ready once someone has actually used it for an hour. Public launch still needs the legal review, the fonts, and a backup story.

---

## 1. The verdict (as at the original audit)

| Bar | Status | Short version |
|---|---|---|
| **Pilot, 5 to 20 friendly landlords** | **Not yet. Roughly 2 to 3 weeks of work.** | The engineering is good. But a short-term landlord is never told about ΤΑΚΚ, certificates are stored as filenames with no actual document, and a load failure shows an empty app instead of an error. Those three will burn trust with exactly the people you cannot afford to lose. |
| **Public launch, paying customers** | **No. A quarter or more of work, and it is not mostly code.** | No password reset, no email reminders, no export, no account deletion, no privacy policy, and legal copy asserting a specific law and a specific fine that nobody qualified has signed off. |

The honest framing: **this is a very well built product skeleton with a soft centre.** The architecture is better than most funded seed-stage products I would expect to see. What is missing is not craft, it is the last 20% where a compliance tool either earns trust or destroys it.

---

## 2. What I actually checked, and what I did not

**Checked:** every file in `src/`, all three SQL migrations, RLS policies, auth flows in both modes, the derived-state architecture, `package.json`, deploy configs, and a TypeScript compile.

**`npx tsc --noEmit` passes clean.** Zero type errors.

**Not checked, and you should not assume these are fine:**

- **The production build.** `npm run build` failed in my sandbox on a missing rollup native binary, which is an environment problem, not a project problem. Run it locally before believing anything ships.
- **The app running in a browser.** I read code. I did not click a single button. Every claim about visual behaviour is inferred.
- **Responsive behaviour** at 1600px and 393px.
- **Greek tax law.** See finding P1-6. I am not qualified and I did not try to verify it.

---

## 3. What is genuinely solid

Worth saying plainly, because the rest of this document is problems.

- **The derived-never-stored architecture is right, and it is enforced structurally**, not by convention. One store, `useMemo` derivations, no compliance column in either backend. The comments explain the bug that caused the rule. This is the thing most teams get wrong and it is correct here.
- **Row-level security is properly configured.** Every table has `auth.uid() = user_id` on both `using` and `with check`. The history table has insert and select policies only, so append-only is enforced at the database, not just in the code.
- **Migration 0003 correctly drops and rebuilds the unique constraint** when declarations gained an obligation type. That is the kind of thing that silently corrupts data when done carelessly.
- **Demo mode has its own schema migration system** with a version gate that runs before any read. Genuinely thoughtful.
- **The payday clamp** (a due day of 29 to 31 falls back to the month's last day) is exactly the bug most calendars ship with.
- **Pure business-logic modules** with no I/O. Testable, if anyone ever writes tests.
- **The product has a clear spine:** it records and reminds, it never files, it never claims a filing happened. That discipline is visible in the code comments and the copy, and it is the correct legal posture.

---

## 4. Blockers, severity ranked

### P0, must fix before a pilot

---

**P0-1. ΤΑΚΚ is unreachable. A short-term landlord is never told about it.**

The two-obligation model exists everywhere except where the user can see it:

| Layer | ΤΑΚΚ supported? |
|---|---|
| `ledger.ts` deadline logic | Yes. Last working day of the following month |
| Migration 0003, `type` column | Yes |
| `db.ts` read and write paths | Yes |
| `store.recordDeclaration(…, type, …)` | Yes |
| **Payments tab UI** | **No.** One row per month, stay only |
| **The only call site** | **No.** `PropertyDetail.tsx:350` hardcodes `"stay"` |
| **Notification feed** | **No.** `getNotifications` only checks the stay declaration |

So: a landlord uses Domus for a year, files every stay declaration it reminds them about, and is never once told about ΤΑΚΚ. For a product whose promise is "every deadline, one screen", this is the worst possible failure mode, because the app's silence reads as reassurance.

*Fix:* a second row or a second column per month in the Payments tab, a type argument at the call site, and a ΤΑΚΚ branch in `getNotifications`. The hard part is already built.

---

**P0-2. Certificates store a filename, not a document.**

`CertificateDialog` records `file.name` as a string. No file is uploaded, no bytes are stored, there is no Supabase Storage bucket. The field is even a free-text input, so a landlord can type `whatever.pdf` and Domus will mark the certificate Valid and clear the alert.

Two problems, and the second is worse than the first:

1. When the landlord actually needs the Fire Safety Certificate, it is not there.
2. **The green state is unearned.** Domus tells someone they are compliant based on a string they typed. That is worse than not tracking it, because it replaces a real worry with a false calm.

*Fix:* Supabase Storage bucket with an RLS policy per user, upload on save, store the object path. In demo mode, keep the filename-only behaviour but label it honestly.

---

**P0-3. A load failure looks identical to having no data.**

`store.tsx` catches load errors into an `error` field. **Nothing renders it.** I grepped every page.

If the network drops, or the anon key is wrong, or an RLS policy is misconfigured, the landlord sees a clean empty dashboard saying "Let's set up your portfolio." Their reasonable conclusion is that Domus lost everything. During a pilot you will get that phone call, and you will not get a second chance.

*Fix:* render `error` in `AppShell` as a persistent banner with a retry. Half a day.

---

**P0-4. No error boundary. Any render crash is a white screen.**

`main.tsx` wraps the app in providers, and nothing else. One thrown error in one component and the landlord gets a blank page with no path back.

*Fix:* an error boundary around `<App />` with a "something went wrong, reload" screen. An hour.

---

**P0-5. Demo mode fails silently, and can be shipped by accident.**

Three related problems:

- **`lsWrite` swallows quota errors.** A `try/catch` with an empty catch. When localStorage fills (property photos are stored as base64 data URLs, roughly 120KB each, against a 5MB browser cap), writes stop working and **the landlord is told nothing.** They record rent, it looks saved, it is gone on refresh. This is the single most dangerous line in the codebase.
- **Deploying without env vars silently ships demo mode.** The Netlify and Vercel builds succeed, the app is fully functional, and every visitor's data lives in their own browser. The only signal is small grey text in the sidebar.
- **The demo password is stored in plaintext and never cleaned up.** `auth.tsx:141` writes `{fullName, email, password}` to `localStorage` under `domus.demo.pendingName`, and only `domus.demo.pending` is removed after verification. People reuse passwords. Even in demo mode, do not do this.

*Fix:* surface quota failures as a toast and a persistent warning. Add a build-time check or a loud banner when `isSupabaseConfigured` is false on a non-localhost host. Store the name only, never the password.

---

**P0-6. Zero tests, on logic where being wrong means a fine.**

No test files anywhere. The modules that decide *when a deadline falls* have no coverage:

- `lastWorkingDayOf`, which walks backwards over weekends
- `dueDayIn`, the payday clamp
- `completedMonths`, the rolling 12-month window
- `defaultDeadline` for both obligation types
- The whole of `getNotifications`

These are pure functions with no I/O. They are the easiest things in the codebase to test and the most expensive to get wrong. A day of work buys you the ability to change this logic later without fear.

---

### P1, must fix before public launch

**P1-1. No password reset.** There is no forgot-password flow anywhere. `supabase.auth.resetPasswordForEmail` is never called. A customer who forgets their password is permanently locked out and must email you. This is a hard blocker.

**P1-2. No reminders that reach the landlord.** Domus only reminds you when you open Domus. There is no email, no push, no SMS, nothing. **This is the biggest product gap in the whole system**, and I have ranked it P1 only because a hand-held pilot can paper over it. See §5.

**P1-3. No data export and no account deletion.** GDPR gives EU residents the right to their data and the right to erasure. Neither exists. For a Greek product handling financial records this is not optional.

**P1-4. No privacy policy, terms, or cookie handling.** None of these files exist.

**P1-5. Google Fonts loaded from Google's CDN.** `index.html` pulls Manrope from `fonts.googleapis.com`, which transmits every visitor's IP address to Google. EU courts have found against exactly this pattern. Self-host the font. It is an hour of work and it also makes the app faster.

**P1-6. Legal claims are hardcoded in UI copy and unverified.** The app asserts, in strings a landlord will act on:

- `"first fine €5,000"` in every declaration notification
- `"Resolve to stay compliant under Law 5170/2025"` in the compliance message
- Stay declarations are due `the 20th of the following month`
- ΤΑΚΚ is due `the last working day of the following month`

**I did not verify any of these and I am not able to.** Tax law is exactly where a confident-sounding wrong answer does real damage. Before anyone pays for this, a Greek tax professional needs to sign off on all four, in writing. If a deadline is wrong, Domus does not just fail to help, it actively causes the fine it promised to prevent.

The code already handles this honestly in one place: `lastWorkingDayOf` carries a comment admitting Greek public holidays are not accounted for, so a deadline landing on a holiday reads one day late. **That caveat is in a code comment where a developer sees it, and not in the UI where the landlord does.** Move it.

**P1-7. No backups or recovery story.** Supabase's free tier retention is limited and there is no export. If a landlord deletes a property, the cascade takes its certificates, declarations, rent and history with it, with a confirm dialog as the only safeguard. There is no undo and no soft delete.

---

### P2, quality and carrying cost

- **`deadline_overrides` is fully built and completely unused.** A table, an RLS policy, a migration, store methods, localStorage keys, and no UI calls any of it. Either surface it or delete it. Dead infrastructure rots.
- **`ledger_history` is written on every change and never displayed.** More defensible, since capturing early is right, but a landlord cannot see their own edit log. Help.tsx already promises it is coming.
- **Onboarding offers to seed demo data into a real account.** A new landlord who clicks "Load example portfolio" gets five fake Athens properties in their real database and has to delete them one at a time.
- **No profile editing.** Name and email are read-only in Settings, forever.
- **No favicon.**
- **Property photos as base64 in a Postgres text column.** Works at ten properties, wrong at a thousand. Same fix as P0-2, one storage bucket serves both.

---

## 5. What a landlord actually needs that Domus does not do

Separate from bugs. This is the product gap.

### Tier 1, without these it is a nice demo rather than a tool

**1. Reminders that arrive without opening the app.**
This is the whole ballgame. A landlord does not open a property app on a Tuesday for fun. They open it when something has already gone wrong. Every alert in Domus today is a notification you have to go and look for, which means the deadline product only works for people who did not need it. Email is enough to start: a weekly digest and a "due in 3 days" nudge. Supabase has scheduled functions and Resend is cheap. **Nothing else on this list matters as much.**

**2. Expenses, not just income.**
Domus tracks money coming in. A landlord's actual question is *what did I clear*, and their accountant's question is *what can we deduct*. Repairs, insurance, ENFIA, building charges, management fees, mortgage interest. Without the cost side, the earnings card shows a number nobody makes a decision with.

**3. Year-end export for the accountant.**
Every landlord has an accountant, and every accountant wants a spreadsheet. A per-property, per-month CSV or PDF of declared income, confirmed rent and expenses would, on its own, be the reason some people pay. It is also the cheapest item on this list.

**4. Lease and tenancy tracking.**
Right now a long-term property has a `tenant` string and a `payday` number. That is not a tenancy. Missing: lease start and end, deposit held, rent review dates, and a renewal reminder. A lease expiring unnoticed costs a landlord a month of rent, which is the same order of magnitude as the fines Domus already warns about.

### Tier 2, the difference between useful and sticky

**5. Partial and late payments.** `RentRecord` is a single amount for a month. Real rent arrives late, in two transfers, or short. There is no arrears balance and no payment history within a month.

**6. Annual obligations.** Only monthly obligations are modelled. ENFIA and the annual income tax return are the deadlines that carry the largest numbers.

**7. Document storage generally.** Once P0-2 gives you a storage bucket, the lease, insurance policy, and property deed belong there too. "Everything about this property in one place" is a stronger promise than compliance alone.

**8. Greek language.** You are building for Greek landlords in English. The ΤΑΚΚ and Kalimera touches show the product knows its market, which makes the English-only interface more jarring, not less. This is an adoption ceiling, not a bug.

**9. Accountant access.** A read-only invite for the person who actually files. It also turns every accountant into a distribution channel, which is worth more than any ad spend at this stage.

### Tier 3, later

**10. Airbnb calendar sync** (already scoped as D1 in the handoff).
**11. Bank reconciliation**, matching an incoming transfer to an expected rent. High value, high effort, needs an open-banking provider.
**12. Multi-property bulk actions**, which only matters above roughly 10 properties.

---

## 6. Suggested sequence

**Weeks 1 to 2, pilot-ready.** P0-1 ΤΑΚΚ, P0-3 error surface, P0-4 error boundary, P0-5 silent-failure fixes, P0-6 tests on the date logic. Get the legal review started in parallel, it has the longest lead time and it gates everything.

**Weeks 3 to 4, worth paying for.** P0-2 real document storage, plus Tier 1 items 1 and 3, email reminders and the accountant export. After this the product does something no spreadsheet does.

**Then, launchable.** P1-1 password reset, P1-3 export and deletion, P1-4 policies, P1-5 self-hosted fonts, P1-6 legal sign-off landed in the copy. Tier 1 items 2 and 4, expenses and leases.

The ordering logic: fix what breaks trust, then add what creates value, then satisfy what the law requires before you take money. Legal review starts on day one regardless, because a lawyer's calendar is the one thing you cannot compress.

---

## 7. One structural recommendation

The gap between what the data layer supports and what the UI exposes is the pattern worth naming. ΤΑΚΚ, `deadline_overrides` and `ledger_history` are all fully built underneath and invisible on top. That is three features paid for and zero delivered.

It is a good problem to have, the expensive half is done. But before starting anything new, spend a week surfacing what already exists. It is the highest return work available in this codebase, and it will make the product feel considerably more finished than a sprint of new features would.

---

*Findings are from source review on 10 August 2026. Nothing here was verified in a running browser, and no legal or tax claim was verified at all.*
