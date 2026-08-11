# Domus — Handoff Documentation

**For:** external development agency / contractor, fixed-scope engagement
**From:** Marko (product owner)
**Project:** Domus — Property Management (`domus-property-hub`)
**Document version:** 1.0
**Last updated:** 10 August 2026

---

## 0. How to read this document

This is the contract-side document. It tells you **what you are being asked to build, where the boundaries are, and what "done" means.**

There is a second document in this folder, `DOMUS_SOURCE_OF_TRUTH.md`. That one is the design and product specification: colours, copy, screen-by-screen behaviour, business rules. You need both.

| Question | Document |
|---|---|
| What am I contracted to deliver? | **This document** (§6) |
| What does "accepted" mean? | **This document** (§7) |
| What colour is a high-priority pill? | `DOMUS_SOURCE_OF_TRUTH.md` §4 |
| How does the notification feed decide what to show? | `DOMUS_SOURCE_OF_TRUTH.md` §6 + `src/lib/notifications.ts` |
| Which one wins if they disagree? | **The code**, then this document, then the source-of-truth doc. See §9. |

> **Standing rule for both documents:** every change to the application must be reflected in `HANDOFF_DOCUMENTATION.md` (§10 change log, plus any affected section) **and** in `DOMUS_SOURCE_OF_TRUTH.md` in the same working session. A change is not finished until both documents match the code. This applies to you and to us.

---

## 1. What Domus is

Property management for small Greek landlords. One screen that answers two questions: *what do I owe the tax office, and did the rent arrive.*

It handles both rental models a small landlord actually has:

- **Short-term** (Airbnb-style). Each completed month carries **two separate obligations** with two different deadlines: the stay declaration and **ΤΑΚΚ**.
- **Long-term.** One rent record per month, due on the tenant's payday.

On top of both sits **compliance**: six certificates per property, each with an expiry date, which drive the red/amber status you see across the app.

**What Domus deliberately does not do:** it does not calculate tax, holds no rates, and never claims something was filed with AADE. It records what the landlord tells it and shows them the dates. Do not add a calculation engine. Amounts are the landlord's own note of what they typed elsewhere.

**Target user:** a landlord with 1–10 properties, not an accountant, on a phone as often as a laptop.

---

## 2. Current state — what already exists

The application is **built and functional**, not a greenfield project. You are extending a working product.

### Working end to end

| Area | State |
|---|---|
| Landing, Sign up, Sign in, OTP verification | Built, with error states |
| Onboarding (`/welcome`) | Built, gates the app on first run |
| Dashboard | Built — earnings card (month/year toggle, donut split, top-3 properties) + action queue |
| Properties list | Built |
| Add / edit property | Built, including certificate management |
| Property detail | Built — **Overview** and **Payments** tabs |
| Notifications | Built — derived, priority-sorted, filterable, snooze + unsnooze |
| Settings | Built — account read-out, demo data reset |
| Help | Built |
| Auth (demo + real Supabase) | Built, dual-mode |
| Database schema + 3 migrations | Written and applied |
| Deployment configs (Netlify + Vercel) | Present |

### Not built (this is your scope — see §6)

1. Property detail → **Calendar tab** (Airbnb connect empty state + connected state)
2. **Certificate detail / renewal panel** as a focused view (the upload dialog now stores real documents, but there is still no focused per-certificate view)
3. Add-property **discard guard on browser Back** (Cancel and page-refresh are already guarded)
4. Verified responsive behaviour at the two Figma breakpoints
5. Verified WCAG 2.1 AA pass

> **Read `READINESS_AUDIT.md` first.** A remediation pass on 10 August 2026 closed most P0 and P1 blockers and added storage, reminders, export, deletion and password reset. Several items still open there (self-hosted fonts, legal review, backups, `deadline_overrides` being dead code) are larger than D1 to D5 and should be priced alongside them.

---

## 3. Getting it running

### Requirements

Node.js LTS. Nothing else.

### Run it

```bash
cd domus-property-hub
npm install
npm run dev          # http://localhost:5173, opens automatically
```

There is also a `start.command` in the project folder that does both steps for non-technical users. You will not need it.

### Scripts

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type check only |

**`npm run build` must pass with zero TypeScript errors before any delivery.** `strict` is on.

### Demo mode vs connected mode

Domus runs in one of two modes and reports which one in the sidebar footer and on Settings.

- **Demo mode (default, no `.env`)** — everything persists to `localStorage` under the `domus.*` namespace. Fake accounts, OTP is always `123456`.
- **Connected mode** — copy `.env.example` to `.env` and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Real accounts, real email codes, Postgres with row-level security.

The switch is `isSupabaseConfigured` in `src/lib/supabase.ts`, which also rejects the placeholder values shipped in `.env.example`. Every screen and every rule is identical in both modes.

**You must test your work in both modes.** A feature that only works in demo mode is not complete.

### Deployment

Both configs are in the repo and both handle the client-side-routing rewrite:

- `netlify.toml` — build `npm run build`, publish `dist`, `/*` → `/index.html` (200)
- `vercel.json` — rewrite `/(.*)` → `/index.html`

---

## 4. Architecture and the rules you cannot break

### 4.1 Stack

React 19 · TypeScript (strict) · Vite 6 · Tailwind CSS 4 (`@tailwindcss/vite`) · React Router 6 · `lucide-react` icons · `sonner` toasts · `@supabase/supabase-js`.

**No new npm dependencies without written approval.** If you think you need one, ask first with a one-paragraph justification. The whole app is ~7,000 lines and deliberately has almost no dependency surface.

### 4.2 The one rule that matters most: derived, never stored

This exists because of a real shipped bug. `Property.compliance` used to be a stored field and the "Action needed" banner was a hardcoded sentence naming two specific certificates. Once a landlord fixed the problem, the alert never cleared — it sat on the property card forever, because nothing recomputed it.

The rule, applied to every alert, status, badge and notification:

- Status is **computed at render time** from current source data. It is never a stored column, never a state field, never cached.
- Alert copy is **generated from the actual offending items**, listed by name. Never hardcode a certificate or month name into UI copy.
- Resolving something clears it from **every surface at once, in the same interaction, no reload**: property card badge, property page banner, topbar alert pill, sidebar badge, mobile nav badge, notifications list.
- Undoing a resolution brings it back everywhere.

Structurally this is guaranteed by `src/lib/store.tsx`: one context holds the raw data, and `notifications` / `visibleNotifications` / `notificationCount` are `useMemo` derivations of it. **Nothing derived is ever written back into state.** If you add a new derived value, derive it in the store the same way — do not compute it inline in a component, and do not add a second source.

There is no `compliance` column and no `notifications` table in the database, in either backend. The migration files say so in comments. Do not add them. The only notification-related thing that is persisted is the set of **dismissed ids** (`dismissed_notifications` in Postgres, `domus.notifications.dismissed` in demo mode) — the feed itself is always recomputed.

### 4.3 Layers

```
pages/*.tsx        screens — layout and interaction only
components/*.tsx   shared UI — AppShell, patterns, primitives, dialogs
lib/store.tsx      the single React context store; the only place components read data from
lib/db.ts          persistence. Two interchangeable backends behind one API. Nothing above it knows which
lib/supabase.ts    client + isSupabaseConfigured
lib/compliance.ts  pure. certificate status derivation
lib/ledger.ts      pure. month maths, obligation + rent keys, deadlines
lib/notifications.ts pure. the derived feed
lib/history.ts     append-only edit log
lib/auth.tsx       auth context, dual-mode
```

`compliance.ts`, `ledger.ts` and `notifications.ts` are **pure — no I/O**. Keep them that way; they are the parts that are actually testable.

`history.ts` is **append-only by design**: it exposes append and read, and no delete, update or clear. It is wired into the write paths in `db.ts`, not into dialog components, so a future screen physically cannot save a change without logging it. Do not add a delete. Do not call it from a component.

### 4.4 Repo map (verified against the code, 10 Aug 2026)

```
domus-property-hub/
  .env.example              two Supabase vars
  netlify.toml, vercel.json deployment
  start.command             double-click launcher for non-technical users
  supabase/migrations/
    0001_init.sql           profiles, properties, certificates, declarations, rent + RLS
    0002_payday_1_to_31.sql payday ceiling raised from 28 to 31
    0003_obligation_type_history_overrides.sql
                            declarations gain `type` (stay|takk); adds ledger_history + deadline_overrides
  src/
    App.tsx                 routes + the three gates (RequireAuth, RequireOnboarded, PublicOnly)
    main.tsx, styles.css
    components/
      AppShell.tsx          sidebar (desktop) / bottom nav (mobile), topbar, avatar menu, derived alert pill
      AuthShell.tsx         shared layout for signup / signin / verify
      CertificateDialog.tsx upload or update a certificate (file + expiry)
      ConfirmDialog.tsx     generic confirm / destructive modal
      ImageUpload.tsx       property photo
      LedgerDialogs.tsx     record declaration / record rent modals
      Logo.tsx              DOMUS wordmark, light + dark variants
      patterns.tsx          Card, SectionCard, SectionTitle, Eyebrow, MetricCard, StatusPill,
                            SeverityPill, TypeTag, ReadOnly, Field, EmptyBlock, Skeleton, Modal
      ui-primitives.tsx     Btn, TextInput, SelectInput, TextArea, FieldLabel, HelperText,
                            ErrorBanner, InfoBanner, LabelledInput, GoogleGlyph
    lib/
      auth.tsx, store.tsx, db.ts, supabase.ts,
      compliance.ts, ledger.ts, notifications.ts, history.ts
    pages/
      Landing.tsx SignUp.tsx SignIn.tsx Verify.tsx Welcome.tsx
      Dashboard.tsx PropertiesList.tsx PropertyNew.tsx PropertyDetail.tsx PropertyEdit.tsx
      Notifications.tsx Settings.tsx Help.tsx NotFound.tsx
```

> `DOMUS_SOURCE_OF_TRUTH.md` §3 still describes an older TanStack-Router file tree (`src/routes/*`, `ledger.tsx`, `src/components/ui/*`). **That section is stale — the map above is correct.** See §9.

### 4.6 Destructive actions always confirm

**Anything that destroys data asks first. No exceptions, and no "it's only a small one".**

A destructive action is anything the landlord cannot undo from the UI: deleting a
record, clearing a figure they entered, removing an uploaded document, wiping an
account. Use the existing `ConfirmDialog`. Do not wire a delete handler straight
to an `onClick`, and do not invent a second confirmation pattern.

The confirmation copy must say **what disappears** and **what changes as a result**,
in that order. "Clear record" is not enough; "this month goes back to outstanding
and reappears in your reminders" is what a landlord actually needs to weigh.

Reversible actions are exempt and should stay frictionless. Snoozing a
notification is reversible from the same screen, so it does not confirm.

`Modal` supports stacking, so a `ConfirmDialog` opened from inside another dialog
works correctly: each layer gets its own z-index, Escape closes only the topmost,
and background scroll stays locked until the last layer closes. Do not reintroduce
a fixed `z-50` or a document-level Escape handler that ignores the stack.

### 4.5 Routes

| Path | Screen | Gate |
|---|---|---|
| `/` | Landing | signed-out only |
| `/signup`, `/signin` | Auth | signed-out only |
| `/verify` | OTP | none |
| `/welcome` | Onboarding | auth only |
| `/dashboard` | Dashboard | auth + onboarded |
| `/properties` | Properties list | auth + onboarded |
| `/properties/new` | Add property | auth + onboarded |
| `/properties/:id` | Detail (`?tab=overview\|payments`) | auth + onboarded |
| `/properties/:id/edit` | Edit | auth + onboarded |
| `/notifications` | Notifications | auth + onboarded |
| `/settings`, `/help` | Settings, Help | auth + onboarded |
| `*` | NotFound | none |

Do not restructure routing.

---

## 5. Data model

### Keys — use the helpers, never build strings by hand

Records are keyed by **property id, never by a slug of the property name.** Names change, ids do not. This was a real bug.

| Thing | Key shape | Helper |
|---|---|---|
| Short-term obligation | `propertyId:YYYY-MM:stay\|takk` | `obligationKey()` |
| Long-term rent | `propertyId:YYYY-MM` | `rentKey()` |
| Deadline override | `propertyId:YYYY-MM:stay\|takk\|rent` | `deadlineKey()` |
| Edit history | `domus.history.propertyId:YYYY-MM` | `historyKey()` |

A short-term month carries two obligations with two deadlines, which is why `propertyId:YYYY-MM` alone no longer identifies a declaration. Long-term rent is still one record per month and keeps the two-part key.

### localStorage namespace (demo mode)

`domus.properties` · `domus.ledger.declarations` · `domus.ledger.rent` · `domus.deadlines.overrides` · `domus.notifications.dismissed` · `domus.onboarded` · `domus.seeded` · `domus.schemaVersion` · `domus.history.*`

Demo mode has its own **schema migration** system in `db.ts` (currently at version 2, which added the `:stay` segment to declaration keys). `lsRead` and `lsWrite` both run `ensureMigrated()` first, so no read path can see the old shape. If you change a stored shape, you write a migration — both a `.sql` file for Postgres and a step in `migrateLocalStorage()`. Never silently break existing browser data.

### Domain constants worth knowing

- Six certificates per property (`CERTIFICATES` in `compliance.ts`). Statuses: `valid`, `renew`, `expired`, `missing`.
- A certificate turns "Due soon" **60 days** before expiry (`RENEW_WINDOW_DAYS`).
- A declaration appears in the feed **14 days** before its deadline (`DECLARATION_LEAD_DAYS`).
- More than **3** outstanding months collapse to oldest + a summary row (`OUTSTANDING_CAP`).
- Only **completed** months can be recorded — the current month is excluded.
- A payday of 29–31 clamps to the month's last day, so "due on the 31st" does not mark every February late.

---

## 6. Scope of work — deliverables

Five deliverables. Each is accepted only when its acceptance criteria pass **and** the global checklist in §7 passes.

Commercial terms (fee, milestones, payment schedule, delivery dates) are agreed separately and are **not** set by this document.

---

### D1 — Property detail: Calendar tab

Add a third tab alongside Overview and Payments on `/properties/:id`, driven by the same `?tab=` query param pattern already in `PropertyDetail.tsx`.

**Two states:**

1. **Not connected (empty state)** — explains what connecting an Airbnb calendar does for the landlord, with a single primary action. Use the existing `EmptyBlock` pattern.
2. **Connected** — month view showing booked vs free nights for the property.

**Acceptance criteria**

- [ ] Tab appears only for **short-term** properties. A long-term property shows Overview and Payments only.
- [ ] `?tab=calendar` deep-links correctly and survives a page refresh.
- [ ] Tab styling matches the existing tabs exactly: active is `#111827` text with a 2px `#FF6B35` bottom border, inactive `#6b7280`.
- [ ] Empty state uses `EmptyBlock`; no new empty-state component is introduced.
- [ ] No booking data is stored as a derived status anywhere (§4.2).
- [ ] Works at 1600px and 393px.

**Open decision — raise before you start:** whether "connected" means a real Airbnb iCal integration or a designed-but-stubbed state. Scope, cost and risk differ enormously. Default assumption is **stubbed, designed state with the integration point clearly marked in code.** Confirm in writing.

---

### D2 — Certificate detail / renewal panel

Today a certificate is only reachable through `CertificateDialog` (upload file + set expiry). Landlords need a focused view per certificate.

**Acceptance criteria**

- [ ] Reachable by deep link from a certificate notification (`NotificationItem.to`) and from the property Overview.
- [ ] Shows: certificate name, current status, expiry with the existing `certExpiryLabel()` copy, and the uploaded file.
- [ ] Renewing updates the record through `store.saveCertificate()` — **not** by writing to `db.ts` directly.
- [ ] On save, status clears from every surface at once with no reload: property card badge, property banner, topbar pill, sidebar badge, mobile nav badge, notifications list. **This is the single most important test in the whole engagement.**
- [ ] Status labels come from `CERT_STATUS_LABEL`; nothing is hardcoded.
- [ ] Works at 1600px and 393px.

---

### D3 — Loading and zero states

> **Scope reduced after code audit, 10 Aug 2026.** `DOMUS_SOURCE_OF_TRUTH.md` §11 lists four gaps here. Three of them are **already built** and must not be re-quoted or rebuilt:
>
> - Properties list loading skeleton — built (`SkeletonGrid` in `PropertiesList.tsx`)
> - Properties list zero state — built (`EmptyBlock` + "Add property" CTA, `PropertiesList.tsx` line ~47)
> - OTP error state — built (`ErrorBanner` + inline field error in `Verify.tsx`)
>
> Only the item below remains.

**Add-property discard guard — close the in-app gap.**

`PropertyForm.tsx` already guards two of the three exit routes: the Cancel button opens `ConfirmDialog`, and `beforeunload` catches refresh or tab close. **Browser Back is not guarded** — a router `POP` navigation away from `/properties/new` or `/properties/:id/edit` silently discards unsaved edits.

**Acceptance criteria**

- [ ] Browser Back with a dirty form prompts through the existing `ConfirmDialog`. No native `window.confirm`.
- [ ] The existing `dirty` check (`JSON.stringify(draft) !== pristine.current`) is reused, not reimplemented.
- [ ] A clean form navigates back with no prompt. Saving clears dirty state, so post-save Back does not prompt.
- [ ] Works on both `/properties/new` and `/properties/:id/edit`, since both share `PropertyForm`.
- [ ] The existing Cancel and `beforeunload` paths still behave exactly as before.
- [ ] Works at 1600px and 393px.

---

### D4 — Responsive verification

Every screen must work at the two Figma breakpoints: **desktop 1600px** and **mobile 393px**.

**Acceptance criteria**

- [ ] Every route in §4.5 checked at both widths.
- [ ] No horizontal scroll at 393px anywhere except the Payments table, which is intentionally `min-width: 560px` inside its own scroll container.
- [ ] Sidebar → bottom-nav switch at the `lg` breakpoint behaves correctly, including the red notification badge.
- [ ] Delivered as a screenshot set, one per route per breakpoint.

---

### D5 — Accessibility pass, WCAG 2.1 AA

**Acceptance criteria**

- [ ] All text meets 4.5:1 contrast; large text 3:1. Pay attention to `#6b7280` and `#9ca3af` on white — some are borderline and any that fail must be reported, not silently changed.
- [ ] Every interactive element is keyboard reachable with a visible focus state.
- [ ] Modals trap focus and close on `Escape` (the `Modal` and `AvatarMenu` patterns already do this — match them).
- [ ] Icon-only buttons have `aria-label` (the snooze button in `Notifications.tsx` is the reference).
- [ ] Status is never communicated by colour alone — there is always a text label or `sr-only` equivalent.
- [ ] Delivered as a findings table: issue, location, severity, fix applied or fix recommended.

---

## 7. Global acceptance checklist

Applies to **every** deliverable. Anything failing here is not accepted, regardless of the feature working.

**Build and code**

- [ ] `npm run build` passes with zero TypeScript errors
- [ ] No new npm dependencies (unless approved in writing)
- [ ] No changes to routing structure
- [ ] No new parallel component system — existing patterns reused (§4.3, §4.4)
- [ ] No derived value stored anywhere (§4.2)
- [ ] No record keyed by property name instead of id (§5)
- [ ] Keys built with `obligationKey` / `rentKey` / `deadlineKey`, never string-concatenated
- [ ] `history.ts` still has no delete, update or clear

**Behaviour**

- [ ] Tested in **both** demo mode and connected (Supabase) mode
- [ ] Resolving anything clears it from every surface at once, with no reload
- [ ] Undoing brings it back everywhere
- [ ] No hardcoded certificate or month names in UI copy
- [ ] Existing `localStorage` data still loads (migration written if a shape changed)

**Presentation**

- [ ] 1600px and 393px both verified
- [ ] Colours, radii and spacing taken from `DOMUS_SOURCE_OF_TRUTH.md` §4 — not eyeballed
- [ ] Accessibility baseline applied inline, not deferred

**Documentation**

- [ ] `DOMUS_SOURCE_OF_TRUTH.md` updated for anything that changes behaviour, copy or layout
- [ ] `HANDOFF_DOCUMENTATION.md` §10 change log updated
- [ ] Both committed alongside the code change, not afterwards

---

## 8. Explicitly out of scope

Listed so nobody builds them by accident and nobody bills for them.

- **Tax calculation of any kind.** No rates, no computed liability, no "you owe X". Domus records what the landlord typed. This is a product decision, not a gap.
- **Any claim that something was filed with AADE.** Domus cannot know this. The edit log records what was entered into Domus and when — that is all it may ever claim.
- **A `compliance` column, a `notifications` table, or any cached status.** See §4.2.
- **Deleting or editing history entries.** Append-only is deliberate.
- **Restructuring routing or migrating routers.**
- **Replacing the design system**, adding a component library, or introducing a CSS-in-JS layer.
- **New npm dependencies** without written approval.
- **Multi-user / team accounts, roles, permissions.** One landlord, one portfolio.
- **Payment processing, bank integration, invoicing.**
- **Localisation / Greek-language UI.** English only for now, despite the Greek market. Greek terms that appear (ΤΑΚΚ, Kalimera) are deliberate and stay as they are.
- **Native mobile apps.** Responsive web only.
- **Backend beyond the existing Supabase schema.** No new services, no serverless functions.

---

## 9. Known documentation drift — read before trusting the spec

`DOMUS_SOURCE_OF_TRUTH.md` was written against an earlier Lovable build and parts of it describe a codebase that no longer exists. It remains the authority on **design, copy and business rules**. It is **not** currently reliable on file structure or persistence.

**Order of authority: the code, then this document, then `DOMUS_SOURCE_OF_TRUTH.md`.**

Confirmed drift as of 10 August 2026:

| Source-of-truth says | Reality | Impact |
|---|---|---|
| §3 repo map: `src/routes/*`, TanStack Router, `src/components/ui/*` shadcn primitives, `ledger.tsx` | `src/pages/*`, React Router 6, no shadcn directory, no Ledger screen | High — §3 is unusable as a map. Use §4.4 above. |
| §8 rule 4: "All state persists to localStorage. No backend, no Supabase." | Dual-backend `db.ts`: Supabase with RLS when configured, localStorage otherwise | High — contradicts the actual data layer |
| §8 rule 2: dependencies are "React, TanStack Router, Tailwind, lucide-react, sonner" | React Router 6, plus `@supabase/supabase-js` | Medium |
| §6.3: dismissed state syncs via a `window` `CustomEvent` | Sync is React context + `useMemo` in `store.tsx`; no CustomEvent | Medium — do not add event plumbing |
| §5.1 + §10: a central Ledger screen may or may not exist | It does not. Recording lives per-property in the Payments tab | Medium |
| §11 item 1: Notifications "may be a stub" | Fully built | Low |
| §11 item 4: four loading/zero-state gaps | Three of the four are built — properties list skeleton, properties zero state and the OTP error state all exist. Only the discard guard on browser Back remains | **High — this one costs money.** Do not quote work that is already done (see D3) |
| §11 item 5: the Ledger question is open | Settled — per-property | Low |

Not documented in the source of truth at all, and worth knowing: the two-obligation model (`stay` / `takk`), `deadline_overrides`, the append-only `history.ts` log, and the demo-mode schema migration system.

**Reconciling §3, §6.3, §8 and §11 of `DOMUS_SOURCE_OF_TRUTH.md` is a candidate first task** — small, cheap, and it de-risks everything after it. Quote it separately.

---

## 10. Change log

Every change to the app gets a row here, in the same session it is made, alongside the matching edit to `DOMUS_SOURCE_OF_TRUTH.md`.

| Date | Change | Files | Doc updated |
|---|---|---|---|
| 2026-08-10 | Removed the "Red means act now, amber means soon, green means relax." legend from the Dashboard subhead. Severity is carried by the pills; the sentence was redundant. | `src/pages/Dashboard.tsx` | `DOMUS_SOURCE_OF_TRUTH.md` §5.2 |
| 2026-08-10 | Notifications page container widened from `max-w-[900px]` to `max-w-[1200px]` (both the loading skeleton and the main view) so its H1 aligns with Dashboard, Properties and the topbar title. | `src/pages/Notifications.tsx` | `DOMUS_SOURCE_OF_TRUTH.md` §4.2 — added the content-width convention that was previously undocumented |
| 2026-08-10 | Created this handoff document. | `HANDOFF_DOCUMENTATION.md` | — |
| 2026-08-10 | **Every destructive action now confirms.** Audited all nine; four were unguarded and deleted on a single click: remove certificate, clear stay/ΤΑΚΚ record, clear rent record, remove property photo. All four now use `ConfirmDialog`. Fixed the underlying blocker first: `Modal` had no stacking, so a confirm inside a dialog rendered at the same `z-50`, and one Escape keypress dismissed both — meaning "are you sure?" could be answered by accident. `Modal` now tracks a stack, gives each layer its own z-index, routes Escape to the topmost only, and keeps scroll locked until the last layer closes. | `src/components/patterns.tsx` (Modal stacking), `CertificateDialog.tsx`, `LedgerDialogs.tsx`, `ImageUpload.tsx` | §4.6 (new rule), `DOMUS_SOURCE_OF_TRUTH.md` §7.2, this log |
| 2026-08-10 | **Fixes from the first real run against live Supabase.** Verified the production build (passes; 636KB, 182KB gzip). **Self-hosted Manrope** and removed the Google Fonts CDN link, closing P1-5: latin, latin-ext and Greek subsets vendored into `public/fonts` with `unicode-range` splitting. Added friendly errors for `provider is not enabled` and `redirect_uri_mismatch` so the Google button explains itself until OAuth is configured. Rewrote the verify screen copy, which promised a 6-digit code that Supabase's default template never sends. Confirmed the stuck `ciao@ciao.com` test account. Proved RLS blocks the anon role by direct query, then removed the probe data. | `index.html`, `src/styles.css`, `public/fonts/*`, `src/lib/auth.tsx`, `src/pages/Verify.tsx` | `SETUP_SUPABASE.md` (new steps 5e, 5f), `READINESS_AUDIT.md` §0, this log |
| 2026-08-10 | **Supabase is live.** Created project `cahgonzqkxxkbyoempqw` (eu-central-1, Frankfurt), applied migrations 0001–0004, added **0005** to revoke public EXECUTE on the two SECURITY DEFINER trigger functions (flagged by Supabase's security advisor; advisor now reports zero issues), created the private `certificates` storage bucket, deployed both edge functions, and wrote `.env`. Also promoted the "Domus does not file this for you" disclaimer to a proper amber `WarningNote` component, now used in the obligation, rent and certificate dialogs. **Still manual: Google OAuth credentials and the Resend API key.** | `src/components/patterns.tsx` (new `WarningNote`), `LedgerDialogs.tsx`, `CertificateDialog.tsx`, `supabase/migrations/0005_*.sql`, `.env` | `SETUP_SUPABASE.md`, `READINESS_AUDIT.md` §0, this log |
| 2026-08-10 | **Remediation pass.** Fixed P0-1 (ΤΑΚΚ now has UI, notifications and reminder coverage), P0-2 (real document storage in a private bucket, free-text filename box removed), P0-3/4 (load-failure banner, error boundary), P0-5 (localStorage quota now throws and surfaces; loud demo-mode banner on live hosts; plaintext password no longer stored), P0-6 (18 tests on the date logic, `npm test`). Added password reset, CSV/JSON export, GDPR account deletion, a drafted privacy policy, reminder emails with preferences, and migration 0004. Removed the €5,000 fine and Law 5170/2025 claims; all legal copy now lives in `src/lib/legal.ts`. | ~20 files across `src/`, `supabase/migrations/0004_*.sql`, `supabase/functions/*` | `READINESS_AUDIT.md` §0, this log, `DOMUS_SOURCE_OF_TRUTH.md`, new `SETUP_SUPABASE.md` |
| 2026-08-10 | Doc-only: full readiness audit of the codebase, written up in `READINESS_AUDIT.md`. It finds six P0 pilot blockers and seven P1 launch blockers, several of which sit inside this document's D1–D5 scope or ahead of it. **Read the audit before agreeing scope or fee with any contractor** — in particular P0-1 (ΤΑΚΚ has no UI and no notification) is larger and more urgent than anything currently in §6. | — | `READINESS_AUDIT.md` (new) |
| 2026-08-10 | Doc-only: exported this document to `HANDOFF_DOCUMENTATION.docx` for formal delivery. **The `.md` is the source.** Any edit is made here first, then the `.docx` is regenerated — do not edit the Word file directly, it will be overwritten. | `HANDOFF_DOCUMENTATION.docx` | — |
| 2026-08-10 | Doc-only: audited the codebase against `DOMUS_SOURCE_OF_TRUTH.md` and recorded the drift (§9). Corrected §11 of the source of truth — items 1 and 5 closed, item 4 reduced to the browser-Back discard guard — and added the companion-document + sync rule to its header. No application code changed. | — | `DOMUS_SOURCE_OF_TRUTH.md` header + §11 |

---

## 11. Contacts and open items to confirm

**To be filled in before the engagement starts:**

- Product owner / approver: Marko
- Repository access and branching strategy: _to confirm_
- Deployment target — Netlify or Vercel (both configs exist): _to confirm_
- Supabase project access for connected-mode testing: _to confirm_
- Figma "High Fidelity UI" access: _to confirm_
- Fee, milestones and delivery dates: _agreed separately_

**Questions we expect you to raise before writing code:**

1. D1 — real Airbnb iCal integration, or designed-and-stubbed? (§6, D1)
2. Do you want the doc-reconciliation task (§9) quoted as a separate line item?
3. Any accessibility contrast failures found in D5 that need a design decision rather than a code fix.
