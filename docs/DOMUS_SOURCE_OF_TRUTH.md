# DOMUS — Source of Truth

Compiled 2026-08-08 from the Figma file "Domus" (`zesi6aU2U5ISkG6t1r74Fo`), the Lovable project "Domus Property Hub" (`af799822-a3f8-4cf1-a4bf-866f56732128`, repo `domus-house-hub`), its project knowledge base, its live codebase, and its recent build-chat history. This document is the single reference to recreate or continue Domus outside of Lovable.

> **Companion document:** `HANDOFF_DOCUMENTATION.md` sits next to this file and is the delivery-side document (scope, acceptance criteria, setup, what is out of scope). This document owns **design, copy and business rules**; the handoff doc owns **scope and acceptance**.
>
> **Standing rule:** any change to the application updates **both** documents in the same working session — the relevant section here, and the change log in `HANDOFF_DOCUMENTATION.md` §10. A change is not finished until the code and both documents agree.
>
> **Remediation, 2026-08-10.** A pass landed that changes several things this document describes. ΤΑΚΚ now has a UI (two rows per month in the Payments tab) and its own notifications. Certificates store a real document in a private Supabase Storage bucket, not a file name. New routes: `/forgot-password`, `/reset-password`, `/privacy`. New in Settings: reminder-email preferences, CSV/JSON export, account deletion. New file `src/lib/legal.ts` now owns every legal-sounding string, and **the "first fine €5,000" and "Law 5170/2025" claims have been removed from the app entirely** pending professional sign-off. Migration `0004` adds the storage bucket and reminder columns. See `READINESS_AUDIT.md` §0 and `SETUP_SUPABASE.md`.
>
> **Supabase is live, 2026-08-10.** Project `cahgonzqkxxkbyoempqw`, eu-central-1. Five migrations applied, private `certificates` bucket, two edge functions (`delete-account`, `send-reminders`). Google sign-in is wired in code and awaits OAuth credentials. New design-system component: `WarningNote` in `patterns.tsx`, amber (`#FFFBEB` / `#FDE68A` / `#F59E0B` left rule, text `#92400E`), used for every "Domus did not do this for you" disclaimer. Use it rather than grey boilerplate for anything a landlord could mistake for an action Domus performed.
>
> **Destructive actions, 2026-08-10.** Every action that destroys data now routes through `ConfirmDialog`: delete property, delete account, reset demo data, discard unsaved edits, **remove certificate**, **clear stay/ΤΑΚΚ record**, **clear rent record**, **remove property photo**. The last four were previously one-click. `Modal` gained stacking support so a confirmation can open from inside another dialog: per-layer z-index, Escape closes only the topmost, scroll stays locked until the last layer closes. Reversible actions such as snoozing a notification deliberately do NOT confirm. Confirmation copy states what is lost, then what changes as a result.
>
> **Known drift:** sections **§3 (repo map)**, **§6.3 (dismissed-state sync)**, **§8 (build rules 2 and 4)** and **§11 (open gaps)** were written against an earlier Lovable build and no longer match the codebase — the app now uses React Router with `src/pages/*` and a dual Supabase/localStorage data layer. `HANDOFF_DOCUMENTATION.md` §9 lists every confirmed discrepancy and gives the corrected repo map. Trust the code first, then the handoff doc, then this file, until those sections are reconciled.

> **Figma access note:** the Figma MCP session could only see the file's **Cover** page (marketing/App-Store style mockup frames of the landing screen). The project knowledge base references a second page, **High Fidelity UI**, that holds the actual product screens — that page wasn't open in the connected Figma desktop app during this analysis and its frames could not be read. Everything below about screen-level layout for the *app* (post-login) comes from the live Lovable codebase, which is authoritative and already implements the Figma designs. The **auth flow** (Landing/Sign up/Sign in/OTP) is documented pixel-for-pixel from the original build brief, which is still the literal spec for those four screens.

---

## 1. What Domus is

**One-liner:** "Every deadline, every euro, one screen."

Domus is a proptech web app for small, individual Greek landlords who rent out property either short-term (Airbnb-style) or long-term (leases). It keeps them out of "fine territory" with AADE (the Greek tax authority) and gives them a single view of whether rent actually arrived.

Landing page positioning copy (verbatim, current build):

- "Domus keeps small Greek landlords out of fine territory and on top of their rental income, for both Airbnb and long-term leases."
- Never miss an AADE declaration — monthly filings tracked per property, zero-income months included.
- Know if the rent actually arrived — one-tap confirmation with a timestamped audit log.
- Certificate reminders — alerts at 45 days before anything expires (product copy; the shipped renewal window constant is 60 days — see §6.1).

**What Domus explicitly does NOT do:** it never moves money and never edits external listings (Airbnb, etc.). It only records and reminds. This distinction must survive in all copy.

**Regulatory assumptions the product works to** — ⚠️ **none of these are verified, and the specific ones have been REMOVED from the app's copy** (2026-08-10, see `READINESS_AUDIT.md` P1-6):
- ~~Compliance regime referenced in copy: **Law 5170/2025**.~~ **Removed from the UI.** No statute is named anywhere in the app.
- ~~First fine for a late/missing filing: **€5,000**.~~ **Removed from the UI.** Domus states dates and never states consequences.
- Filings go to **AADE**. Domus never files anything itself.
- A short-term month carries **two** obligations: the stay declaration (worked to the 20th of the following month) and **ΤΑΚΚ** (worked to the last working day of the following month). Both are treated as *indicative* and neither accounts for Greek public holidays.
- Zero-income months still must be declared (a "zero" declaration).
- Currency: EUR. Dates are written `20 June` or `22 Oct 2026`. Addresses are Greek.

> **Before any of this goes back into user-facing copy, a Greek tax professional must sign it off in writing.** All legal strings live in `src/lib/legal.ts` behind `LEGAL_REVIEW.reviewed`. Do not scatter fines or statute numbers back through components.

**Status:** POC / MVP, "Greece pilot". **Since 2026-08-10 there IS a backend**: Supabase Postgres with row-level security, plus a private storage bucket and two edge functions, with `localStorage` as the demo-mode fallback. The line below about "no backend, client-side only" is superseded.

---

## 2. Tech stack

> ⚠️ **This whole section describes the OLD Lovable build and is wrong.** The app is a plain Vite + React SPA using **React Router 6**, not TanStack Start. There is no `src/routes/`, no `routeTree.gen.ts`, no shadcn `ui/` directory and no Bun lockfile. The corrected stack and repo map are in `HANDOFF_DOCUMENTATION.md` §4.1 and §4.4. Left here only so the drift is visible rather than silently misleading.

Original text, as built in Lovable:

| Layer | Choice |
|---|---|
| Framework | **TanStack Start** (file-based routing via TanStack Router, SSR-capable) — `@tanstack/react-start`, `@tanstack/react-router` |
| Language | TypeScript, React 19 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first `@theme` config, no `tailwind.config.js`) |
| Component primitives | shadcn/ui (`src/components/ui/*`, Radix-based) — pre-installed but **frozen**, not to be edited |
| Forms | `react-hook-form` + `zod` + `@hookform/resolvers` (available; simple screens just use `useState`) |
| Icons | `lucide-react` |
| Toasts | `sonner` |
| Charts | `recharts` (available); the dashboard donut chart is hand-rolled SVG, not Recharts |
| Dates | `date-fns` |
| Package manager | Bun (`bun.lock`, `bunfig.toml`) |
| Lint/format | ESLint 9 (flat config) + Prettier |
| Persistence | **Superseded.** Dual backend in `src/lib/db.ts`: Supabase Postgres with RLS + private storage bucket when `.env` is configured, `localStorage` under `domus.*` otherwise. |

Do **not** introduce new npm dependencies, a component library other than the existing shadcn primitives, or a backend, without a deliberate decision to do so — the current build has an explicit "no new dependencies" rule baked into every change request (see §8).

### Routing convention (TanStack Start file-based)

| File pattern | Resulting URL |
|---|---|
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `users/index.tsx` | `/users` |
| `users/$id.tsx` | `/users/:id` |
| `posts/{-$category}.tsx` | `/posts/:category?` |
| `files/$.tsx` | `/files/*` (splat, read via `_splat`) |
| `_layout.tsx` | layout route, renders `<Outlet />` |
| `__root.tsx` | app shell wrapping every page |

`src/routeTree.gen.ts` is auto-generated — never hand-edited. Never create `src/pages/`, Next.js/Remix-style directories, or a second root layout.

---

## 3. Repository map (as of latest commit)

```
AGENTS.md                              — Lovable git-sync warning banner
components.json                        — shadcn config
src/
  assets/
    domus-logo.svg
    domus-sidebar-logo.svg
  components/
    AppShell.tsx                       — authenticated app shell: sidebar (desktop) / bottom nav (mobile), topbar, avatar menu, derived compliance alert pill
    AuthShell.tsx                      — shared layout for signup/signin/verify (centered column, back link)
    CertificateDialog.tsx              — upload/update a certificate (file + expiry date)
    ConfirmDialog.tsx                  — generic confirm/destructive action modal
    LedgerDialogs.tsx                  — "record declaration" / "record rent" modals
    Logo.tsx                           — DOMUS wordmark component (see §4.3)
    ui-primitives.tsx                  — Btn, TextInput, FieldLabel, HelperText, ErrorBanner, GoogleGlyph (see §7.1)
    ui/*                               — shadcn/Radix primitives — DO NOT MODIFY
  hooks/use-mobile.tsx
  lib/
    compliance.ts                      — certificate/compliance derivation engine (see §6.1)
    ledger.ts                          — declarations + rent recording, month math (see §6.2)
    notifications.ts                   — derived notification feed (see §6.3)
    error-capture.ts, error-page.ts, lovable-error-reporting.ts, utils.ts
  routes/
    __root.tsx                         — app-wide root
    index.tsx                          — Landing page (/)
    signup.tsx / signin.tsx / verify.tsx
    welcome.tsx                        — onboarding (redirects here if `domus.onboarded` isn't set)
    dashboard.tsx                      — post-login home (see §5.2, fully documented)
    properties.tsx                     — properties layout/wrapper
    properties.index.tsx               — properties list
    properties.new.tsx                 — add property
    properties.$id.tsx                 — property detail (Overview + Payments tabs)
    properties_.$id.edit.tsx           — edit property (incl. certificate management)
    ledger.tsx                         — Ledger screen (Declarations / Rent tabs)
    notifications.tsx                  — Notifications screen
    settings.tsx
    help.tsx
    README.md                          — routing conventions cheat-sheet
  router.tsx, server.ts, start.ts, styles.css
```

---

## 4. Design system

### 4.1 Original auth-flow spec (Landing / Sign up / Sign in / OTP)

This is the literal, pixel-level brief the first four screens were built from. Treat it as the ground truth for those specific routes.

**Font:** Manrope, loaded from Google Fonts, applied globally:
```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
```

**Original color tokens:**

| Token | Hex | Use |
|---|---|---|
| Brand black | `#0D0D0D` | primary text, primary buttons |
| White | `#FFFFFF` | — |
| Accent orange | `#FF6B35` | originally scoped to the logo's house glyph only |
| Gray 50 | `#F9F9F9` | page backgrounds |
| Gray 100 | `#F3F3F3` | input backgrounds |
| Gray 200 | `#E8E8E8` | borders |
| Gray 400 | `#9CA3AF` | placeholder text |
| Gray 600 | `#6B7280` | secondary / caption text |
| Gray 900 | `#111827` | primary text (app screens) |
| Error red | `#DC2626` | errors |
| Link blue | `#2563EB` | inline links (Terms/Privacy, "Create one") |

**Radius:** inputs & buttons 8px, cards/panels 12px, OTP boxes 8px.
**Spacing:** Tailwind default scale (4/6/8/12/16/20/24/32/48px).
**Icons:** lucide-react only, import per-use (`Eye`, `EyeOff`, `Check`, `Euro`, `Clock`, `ArrowLeft`, `Chrome`).

**Buttons:**
- Primary: bg `#0D0D0D`, text white, full width, height 48px, weight 600, hover `#333333`, radius 8px.
- Secondary: bg white, text `#0D0D0D`, full width, height 48px, weight 600, border 1.5px `#0D0D0D`, radius 8px, hover `#F9F9F9`.

**Inputs:** height 48px, border 1.5px `#E8E8E8`, radius 8px, bg white, 16px horizontal padding, 15px font. Placeholder `#9CA3AF`. Focus border `#0D0D0D` 2px. Error border `#DC2626`.

#### Page 1 — Landing (`/`)
Desktop (≥1024px): two-column, full viewport height.
- **Left (50%):** dark overlay (`#0D0D0D` @ 60% opacity) over a moody Mediterranean-villa photo, 16px rounded corners. Centered: white DOMUS wordmark (~48px) over tagline "YOUR PROPERTIES, IN ORDER" (white, tracking-widest, 13px, weight 500, all caps).
- **Right (50%):** white bg, content vertically centered, max-width 480px, 48px horizontal padding.
  - Headline "Every deadline, every euro, one screen." — 36px/800/`#0D0D0D`, line-height 1.15.
  - Subtitle 16px `#6B7280`, margin-top 16px.
  - Feature list (3 rows, icon + label 14px/600 + caption 13px `#6B7280`, 1px `#E8E8E8` separators between rows only): Check → "Never miss an AADE declaration"; Euro → "Know if the rent actually arrived"; Clock → "Certificate reminders".
  - Buttons: Primary "Create free account" → `/signup`; Secondary "I already have an account" → `/signin`.

Mobile (≤767px): single column, white bg, no hero image, black wordmark centered at top (~32px), then the same content stack at 24px padding. Tablet (768–1023px): same stack at 48px padding.

#### Page 2 — Sign up (`/signup`)
Centered column, max-width 480px (24px padding on mobile), vertically centered.
- "← Back" link (ArrowLeft 16px + 14px `#6B7280` text, hover `#0D0D0D`), flows with content (not fixed).
- Heading "Create your account" 28px/800. Subheading "Free during the pilot. No card required." 15px `#6B7280`.
- Fields (20px gap): Full name ("Your Name"); Email ("you@example.com"); Password (Eye/EyeOff toggle, helper "At least 8 characters."); Repeat password (desktop only).
- Checkbox: "I agree to the Terms of Service and the Privacy Policy." (links in `#2563EB`, underlined).
- Buttons: Primary "Create account"; Secondary "Continue with Google" (Chrome icon or colored G).
- **Error states:** mismatched passwords → red helper under Repeat password, red border. Email already exists → red banner (`#FEF2F2` bg, `#FECACA` border, `#DC2626` text) with a "Sign in instead" link → `/signin`. Checkbox unchecked → red 12px text below it.

#### Page 3 — Sign in (`/signin`)
Same shell. Heading "Welcome back", subheading "Sign in to your portfolio." Fields: Email, Password (Eye/EyeOff, helper "At least 8 characters."). Buttons: Primary "Sign in"; Secondary "Continue with Google". Footer: "No account yet? Create one" → `/signup`.
**Error states:** wrong credentials → red banner "Incorrect email or password. Please try again.", both fields red-bordered. Account not found → red banner with "Create one" → `/signup`.

#### Page 4 — OTP verification (`/verify`)
Same shell. Heading "Verify your email", subheading "Enter the 6-digit code we sent to [user's email]".
- 6 individual boxes, 52×60px, 12px gap, border 1.5px `#E8E8E8`, radius 8px, 24px/700 centered text. Focused: 2px `#0D0D0D` border. Auto-advance forward on entry, backward on Backspace, supports paste of the full code.
- Countdown: "Code expires in 5:00" real timer; at 0:00 shows "Code expired." in `#DC2626`. "Didn't receive a code? Resend" resets the timer.
- Primary button "Verify", disabled (40% opacity) until all 6 digits are filled.
- **Error state:** wrong code → all boxes red-bordered, helper "Incorrect code. Please try again or request a new one.", boxes clear and refocus box 1.

**Routing:** `/` → `/signup` → `/verify` → `/dashboard`; `/` → `/signin` → `/dashboard`. "← Back" = `navigate(-1)` everywhere.

**Build notes that still apply:** no UI component library on these 4 screens (hand-rolled Tailwind, not shadcn) so they match Figma exactly; "Continue with Google" is a styled no-op (`console.log` placeholder, no real OAuth); submit actions simulate a 1s loading state (button text → "...", disabled) before either navigating or randomly (50%) showing an error state, for demo purposes; all UI copy is sentence case except the logo.

### 4.2 Live in-app design system (Dashboard and everything past login)

The app evolved past the original auth-only brief into a full product; the shipped design tokens broadened accordingly. Current source: `src/styles.css` + `src/components/AppShell.tsx`.

```css
--font-sans: "Manrope", ui-sans-serif, system-ui, sans-serif;
--color-brand-black: #0D0D0D;
--color-brand-orange: #FF6B35;
--color-gray-50:  #F9F9F9;
--color-gray-100: #F3F3F3;
--color-gray-200: #E8E8E8;
--color-gray-400: #9CA3AF;
--color-gray-600: #6B7280;
--color-gray-900: #111827;
--color-error: #DC2626;
--color-error-bg: #FEF2F2;
--color-error-border: #FECACA;
--color-link: #2563EB;
```

AppShell-scoped CSS variables (drive the authenticated app's chrome):

```
--canvas:        #fafafa   (page background)
--surface:        #ffffff  (cards/topbar)
--surface-sunken: #f3f4f6
--border:         #e5e7eb
--text:           #111827
--text-subtle:    #374151
--text-muted:     #6b7280
--accent:         #FF6B35  (now used throughout — active nav, badges, alert dot, donut chart — not just the logo)
--accent-hover:   #e5511b
--accent-subtle:  #fff4ee
```

Sidebar (desktop, ≥ `lg`) is dark: `#171717` background, 240px fixed width. Active nav item: `rgba(255,107,53,0.15)` bg pill, white text, `#FF6B35` icon. Hover: `rgba(255,255,255,0.05)`. Bottom nav (mobile, < `lg`) mirrors the same dark bg/orange-active pattern, height 60px, with a red (`#DC2626`) badge for unread high-priority notification counts.

Topbar: 60px, white, bottom border `#e5e7eb`, sticky. Shows page title (derived from path) + the derived compliance/notification alert pill (orange dot + text, `TopbarAlert` component) + a circular avatar-initials menu (Settings / Help Center / Log out).

Main content area: `px-4 sm:px-6 lg:px-8`, so the page H1 lines up horizontally with the topbar page title. Primary list/overview screens (Dashboard, Properties, Notifications) share a `mx-auto w-full max-w-[1200px]` container so their headings start at the same x-coordinate. Narrower containers are reserved for form/read screens: Property detail 1000px, Add/Edit property 840px, Help 760px, Settings 720px.

Cards: white, 1px `#e5e7eb` border, 16px radius (`rounded-2xl`), 20px padding.
Skeleton loading: `.skeleton` class, shimmer animation, `#e5e7eb`→`#f3f4f6` gradient sweep, 1.6s linear infinite.

Dashboard donut chart (Earnings card): hand-rolled SVG, 140px, 22px stroke, orange (`#FF6B35`) = short-term, navy (`#1E3A8A`) = long-term.

Severity color coding used across dashboard/notifications:
- High priority: bg `#fee2e2`, text `#b91c1c` (badge/pill); icon tile bg `#7f1d1d` when solid.
- Medium priority: bg `#fef3c7`, text `#b45309`.

### 4.3 Logo component

`src/components/Logo.tsx` — an SVG wordmark (`viewBox="0 0 226 47"`), spelling **DOMUS** where the letter that sits in the "M" position is replaced with a stylized orange house/roof glyph (`fill="#FF6B35"`, never variant-dependent). The surrounding letters (D, O, U, S) take `letterFill`:
- `variant="dark"` (default, used on light backgrounds): letters `#0D0D0D`.
- `variant="light"` (used on dark backgrounds, e.g. landing hero): letters `#FFFFFF`.

There are two exported logo assets used directly as `<img>` in places that don't need the live variant-swap (`src/assets/domus-logo.svg`, `src/assets/domus-sidebar-logo.svg` — the latter used in the dark sidebar).

> Note: the original build brief described the wordmark differently ("the letter A replaced by a house icon") — the shipped component instead replaces the letter in the **M position**. Treat the shipped `Logo.tsx` SVG as authoritative; the brief's letter-position description is superseded.

### 4.4 Accessibility baseline (non-negotiable, applied inline, not a separate pass)

- Every interactive element has a visible focus state — never `outline-none` without a replacement.
- Icon-only buttons carry `aria-label` (e.g. avatar menu button, mobile nav badges).
- Status is never color-only — always paired with a text label or icon (severity pills say "High"/"Medium", not just colored).
- One `h1` per page, headings in logical order.
- Table headers use `scope="col"`.

---

## 5. Screens

### 5.1 Screen inventory

**Built and shipped:**
Landing, Sign up (+ error state), Sign in (+ error state), OTP verification (+ error state), Onboarding (`welcome.tsx`), Dashboard, Properties list, Add property, Property detail (Overview + Payments tabs), Record payment, Delete-property confirmation, Property edit (incl. certificate management), Settings, Help, Ledger (Declarations tab + Rent tab, each with a record modal), Notifications (derived, priority-sorted feed).

**Explicitly still missing / stubbed** (per project knowledge, latest known state):
1. Property detail → **Calendar tab** (Airbnb-connect empty state + connected state).
2. Certificate **detail/renewal deep-link panel** (a per-certificate focused view beyond the existing upload dialog).
3. Add-property "discard changes" guard on **browser Back** only. (The properties list skeleton and zero state, the OTP error state, and the guard's Cancel-button and page-refresh paths were all verified as built on 2026-08-10. See §11 item 4.)

> Chat history shows a message titled *"Remove the Ledger and move recording into each property"* proposing to delete `ledger.tsx` in favor of per-property recording (because the old Ledger hardcoded demo rows for properties the user didn't own, and mis-keyed storage by name-slug instead of id). The **current file tree still contains `src/routes/ledger.tsx`**, and the project knowledge base still lists Ledger as a shipped two-tab screen — so this change was either superseded or implemented as a fix-in-place rather than a removal. Confirm current behavior directly in the Lovable preview before assuming either version is final.

### 5.2 Dashboard (`/dashboard`) — fully documented as the reference screen

Redirects to `/welcome` if `localStorage["domus.onboarded"]` is unset (onboarding gate).

**Header:** eyebrow "PORTFOLIO OVERVIEW" (12px/700, letter-spacing 0.12em, `#9ca3af`). H1 greeting, time-of-day aware — `Kalimera` before noon, `Good afternoon` before 6pm, else `Good evening` — combined with an action count: *"{greeting}. {n} things need you today."* or *"{greeting}. You're all caught up."* or, with zero properties, *"{greeting}. Let's set up your portfolio."* Subhead (with properties): *"Short-term compliance and long-term rent collection, one screen."* The red/amber/green legend that used to follow it was removed — severity is communicated by the pills themselves, not explained in copy. Empty state shows a prominent "Add property" CTA.

**Two-card grid** (`lg:grid-cols-2`):

1. **Earnings card** — month/year toggle (pill switch, dark-active). Big total (`€{n}`, 34px/700) sourced from confirmed rent + non-zero declared amounts for the selected range. Donut chart split short-term (orange) vs long-term (navy) with percentage + euro legend rows. "Top earning properties" (top 3 by amount, horizontal bar visualization, tagged SHORT TERM/LONG TERM). Empty state: "No earnings yet."
2. **Action queue card** — up to 7 combined action items (rent unconfirmed for long-term properties whose due date has passed with no record; every outstanding compliance item from `getCompliance()`), sorted High-severity first. Each row: colored icon tile, title, subtitle (property name + context), severity pill, CTA button linking into the relevant property. "See all →" to `/notifications` when there are more than 7. Empty state: "You're all caught up" with a green check icon.

Topbar-right CTA (desktop): "+ Add property" → `/properties/new`, shown only once the user has at least one property.

Loading state: skeleton placeholders for eyebrow/heading + two empty skeleton cards, shown for a flat 400ms on mount (not tied to a real async fetch — this is client-only data).

---

## 6. Core business logic — "derived, never stored"

This is the single most important architectural rule in the codebase, and it exists because of **a real, previously-shipped bug**: `Property.compliance` used to be a stored static field, and the "Action needed" banner was a hardcoded sentence naming two specific certificates. Once a reminder was resolved, the alert never cleared — it stayed on the property card and the property page forever, because nothing recomputed it.

**The fix, and the rule going forward, applies to every alert/compliance/notification-style feature added to Domus:**
- Status is **computed at render time** from current source data. It is **never** a stored field.
- Alert copy is **generated from the actual offending items**, listed by name — never a hardcoded sentence naming specific certificates or months.
- Resolving something clears it from **every surface it appears on, in the same interaction, with no reload**: the property card badge, the "Action needed" banner on the property page, the topbar alert pill in `AppShell`, the Notifications badge count (sidebar + mobile nav), and the Notifications list itself.
- The reverse holds too: undoing a resolution brings the alert back everywhere.

Three `lib/*.ts` modules implement this pattern; each fires a `window` `CustomEvent` on write so every subscribed component (badges, pills, lists) re-syncs live without a page reload.

### 6.1 `src/lib/compliance.ts` — certificates & compliance status

```ts
CERTIFICATES = [
  "Fire Safety Certificate",
  "Electrical Installation Report",
  "Gas Safety Certificate",
  "Energy Performance Certificate (EPC)",
  "Structural Integrity Report",
  "Noise Level Compliance Certificate",
]
```

`Property` type (fields relevant to compliance):
```ts
type CertRecord = { file?: string; expiry?: string /* ISO yyyy-mm-dd */ };
type Property = {
  id: string; name: string; address: string; type: "short" | "long";
  compliance?: "compliant" | "renew" | "action"; // @deprecated — ignored, always recomputed
  price: string; area: string; photo?: string | null;
  rent?: string; tenant?: string; payday?: string;
  nightly?: string; minStay?: string; ama?: string; city?: string; size?: string;
  certs?: Record<string, string>;               // legacy: name -> filename
  certDetails?: Record<string, CertRecord>;      // current: name -> {file, expiry}
};
```

`CertStatus`: `"valid" | "renew" | "expired" | "missing"`.
- `RENEW_WINDOW_DAYS = 60` — a certificate becomes "Due soon" when its expiry is within 60 days.
- No file uploaded → `missing`. Expiry in the past → `expired`. Expiry ≤ 60 days out → `renew`. Otherwise → `valid`.

`getCompliance(property, now?)` returns:
```ts
{
  status: "compliant" | "renew" | "action",   // action if any blocking (expired/missing) cert exists, else renew if any due-soon, else compliant
  blocking: [{name, status}],                  // expired + missing
  expiring: [{name, status}],                  // due soon
  outstanding: [...blocking, ...expiring],
  byName: { [certName]: { rec, status } },
}
```

`complianceMessage(result)` builds a sentence purely from `result.outstanding`, e.g. *"Noise Level Compliance Certificate has expired; Structural Integrity Report is not uploaded."* — never hardcode certificate names into UI copy. **Updated 2026-08-10:** the trailing "Resolve to stay compliant under Law 5170/2025." was removed; the function no longer names any statute.

Persistence: `PROPERTIES_KEY = "domus.properties"`, event `PROPERTIES_EVENT = "domus:properties-changed"`. `loadProperties()`, `saveProperties()`, `upsertProperty()`.

Date formatting: ISO `2026-10-22` → `"22 Oct 2026"` (`formatDate`). `certExpiryLabel(rec, status)` → "Not uploaded yet" / "No expiry date set" / "Expired {date}" / "Valid until {date}".

### 6.2 `src/lib/ledger.ts` — declarations & rent records

Records are keyed **`${propertyId}:${YYYY-MM}`** — always by property id, never by a name-slug (names change, ids don't; this was a migration fix — see below).

```ts
type DeclRecord = { zero: boolean; amount?: string; recordedAt: string };
type RentRecord = { amount: string; date: string; note?: string; recordedAt: string };
```

Storage keys: `DECL_KEY = "domus.ledger.declarations"`, `RENT_KEY = "domus.ledger.rent"`. Event: `LEDGER_EVENT = "domus:ledger-changed"`.

- `completedMonths(now?)` → the last 12 **completed** months, oldest first (current month excluded — you can't record a month that hasn't ended, this closed a real bug where future months could be reported).
- `declarationDeadline(month)` → the 20th of the month **after** the recorded month. `deadlineLabel()` formats it (`"20 Oct 2026"`).
- A one-time `migrate()` step rewrites any legacy record keyed `${nameSlug}:${monthIndex 0-11 over Jan–Jun 2026}` into the new `id:YYYY-MM` shape when the slug still matches an existing property; anything that can't be matched (a property the landlord no longer/never owned) is dropped. Runs automatically on every load.

### 6.3 `src/lib/notifications.ts` — derived notification feed

Notifications are **never** a stored list — `getNotifications(properties, now?)` recomputes the full feed every call from `compliance.ts` + `ledger.ts`. The only thing actually persisted is which notification **ids** the user dismissed:

```ts
DISMISSED_KEY = "domus.notifications.dismissed"
NOTIFICATIONS_EVENT = "domus:notifications-changed"
```

Generation rules per property:
- **Certificates:** one item per outstanding cert (reuses `getCompliance()` directly — never re-derives compliance independently). Priority `high` if expired/missing, `medium` if due-soon. Action label "Upload" (missing) or "Update".
- **Short-term properties → obligations:** **updated 2026-08-10.** The feed now loops over BOTH obligation types, not just the stay declaration. For each of the last 12 completed months missing a record, if that obligation's deadline is within 14 days (including already overdue), emit a `high`-priority item: *"{Month} stay declaration due in {n} days"* / *"{Month} ΤΑΚΚ is overdue"*. Subtitle is `{property} · due {date}` — **the €5,000 fine is no longer mentioned**. Deadlines differ per type: stay is the 20th of the following month, ΤΑΚΚ the last working day of it. **Cap:** more than 3 months outstanding shows the oldest plus a rollup, per obligation type.
- **Long-term properties → rent:** for each completed month past its `payday` (a number 1–31 parsed from `Property.payday`, default 1, clamped to the month's last day) with no rent record, emit a `medium`-priority item: *"{Month} rent not confirmed"*. Same 3-item cap + rollup pattern as declarations.

Sort order: high priority first, then alphabetically by property name, then by id. `getNotificationCount()` counts only high-priority, non-dismissed items — that's the number shown in the sidebar/bottom-nav red badge and used to build the topbar alert pill text (first item's title, `+{n} more` if multiple).

---

## 7. Reusable component patterns (do not duplicate — reuse these)

### 7.1 `src/components/ui-primitives.tsx` (auth-flow primitives)
- `Btn` — `variant: "primary" | "secondary"`, `loading` prop swaps children for `"..."` and disables; full-width, 48px (`h-12`), 8px radius, matches §4.1 button spec exactly.
- `TextInput` — `invalid` prop swaps border to error red; `rightSlot` for icon-toggle inputs (password eye).
- `FieldLabel`, `HelperText` (`error` prop for red variant), `ErrorBanner` (the red inline-banner pattern), `GoogleGlyph` (inline multi-color G SVG for the Google button).

### 7.2 App-screen patterns (referenced from `src/routes/properties.$id.tsx` — the canonical property-detail implementation)
Per project knowledge, these patterns are established there and **must be reused, not reinvented**, elsewhere in the app: `SectionCard`, `SectionTitle`, `MetricCard`, `StatusPill`, `ReadOnly`, `Field`. Also reuse the shared `AppShell` (layout/nav/topbar) and `ConfirmDialog` (destructive-action modal) everywhere a screen needs them.

### 7.3 Dashboard-local patterns (`src/routes/dashboard.tsx`)
`Card` (white, 16px radius, `#e5e7eb` border, 20px padding), `EmptyBlock` (centered icon + title + body for empty states), `SkeletonDashboard` (shimmer loading layout). The severity-pill and colored-icon-tile pattern used in the Action queue is a de facto standard for any "list of things needing action" surface — matched in Notifications.

---

## 8. Non-negotiable build rules (from Lovable project knowledge)

These are standing instructions the Lovable agent operates under for every change to this project, and should govern any continuation of this work in Claude too:

1. **This is an existing project.** Never scaffold a new app, never restructure routing, never touch `src/components/ui/*` (the shadcn primitives).
2. **No new npm dependencies.** Build with what's installed: React, **React Router 6** (not TanStack Router), Tailwind, `lucide-react`, `sonner`, `@supabase/supabase-js`.
3. **Reuse existing patterns** (§7) — `SectionCard`, `SectionTitle`, `MetricCard`, `StatusPill`, `ReadOnly`, `Field`, `AppShell`, `ConfirmDialog`. Don't invent parallel component systems.
4. ~~**All state persists to `localStorage`.** No backend, no Supabase.~~ **Superseded.** The app has a dual-backend data layer in `src/lib/db.ts`: Supabase Postgres with row-level security when `.env` is configured, `localStorage` under the `domus.*` namespace otherwise. Certificate documents live in a private Supabase Storage bucket. Both paths are behind one API and nothing above `db.ts` knows which is active.
5. **Every screen must work at the Figma breakpoints: desktop 1600px and mobile 393px.**
6. Alerts/compliance/notifications must always be **derived, never stored** (§6).
7. Accessibility baseline applied inline on every change (§4.4).

---

## 9. Demo / seed data (must match exactly if reproducing)

**Properties:**

| Name | Location | Type | Details |
|---|---|---|---|
| Koukaki Loft | Piraeus 185 32, Athens | Short-term | 82 m² · base nightly €120 · min stay 2 nights · AMA 00254871 · currently derives to **action needed** |
| Plaka Studio | — | Short-term | — |
| Glyfada Sea View | — | Short-term | — |
| Pagkrati 2BR | — | Long-term | tenant Maria K. · €750/month |
| Kypseli Apartment | — | Long-term | tenant Nikos P. · €580/month |

**Certificates on Koukaki Loft** (drives its "action needed" state):

| Certificate | Detail | Status |
|---|---|---|
| Fire Safety Certificate | Valid until 31 Dec 2026 | Valid |
| Electrical Installation Report | Valid until 15 Mar 2027 | Valid |
| Gas Safety Certificate | Renew by 22 Oct 2026 | Due soon |
| Energy Performance Certificate (EPC) | Valid until 8 Aug 2026 | Valid |
| Structural Integrity Report | Not uploaded yet | Missing |
| Noise Level Compliance Certificate | Expired 15 Jun 2026 | Expired |

---

## 10. Build/iteration history (from recent Lovable chat)

Most recent instructions to the Lovable agent, newest first, in case any are still in flight or partially applied — verify current state in the live preview rather than assuming these all landed cleanly:

1. **"Five contained changes" — Part A: one source for every alert surface.** Fixed `ComplianceTopbarAlert` in `AppShell.tsx`, which was running its own inline `getCompliance()` loop instead of the shared notifications feed, causing the topbar pill to drift out of sync with certificate data. (Additional parts B–E of this message weren't fully captured in this analysis — re-check the full message in Lovable if continuing this thread.)
2. **"Remove the Ledger and move recording into each property"** — proposed deleting `ledger.tsx` (which had hardcoded demo rows for properties the landlord didn't own, and mis-keyed storage by name-slug). Current codebase still has `ledger.tsx` and project knowledge still documents it as shipped — treat as unresolved/superseded, confirm live state.
3. **"Build a derived notification system"** — the instruction that produced `src/lib/notifications.ts` as documented in §6.3.
4. **"Two things" — fix the property edit route** — `/properties/$id/edit` fields weren't actually editable and had no save path; fixed to be a real editable form.
5. **"Add property editing, including certificate management"** — closed the gap where certificates could only be set at property creation, meaning a non-compliant property could never be brought back into compliance.
6. **"Build out `src/routes/ledger.tsx`"** — from a 30-line empty-state stub to the full two-tab (declarations/rent) screen, reusing `AppShell` and the `SectionCard`/`MetricCard`/`StatusPill` patterns.
7. **Dashboard/ledger fixes** — recorded prices became editable after the fact; future months were blocked from being recorded (you can't report May's rent while still in April); the dashboard Earnings section was changed to aggregate across all owned properties into a pie/donut chart (this produced the current `EarningsCard`/`DonutChart` in `dashboard.tsx`).

All of these instructions share a consistent operating pattern worth preserving if you continue this build in Claude: **state the "why" (often a specific live bug), constrain to no-new-dependencies and no-ui-primitive-changes, require reuse of named existing components, and require a single-pass edit with no clarifying questions.**

---

## 11. Open gaps to close next

> **Verified against the codebase on 2026-08-10.** Items 1 and 5 are closed, item 4 is nearly closed. Corrected below.

1. ~~Notifications screen — confirm it matches §6.3.~~ **Closed.** `src/pages/Notifications.tsx` is fully built: derived feed, priority sort, source filters, snooze and unsnooze.
2. Property detail → Calendar tab (Airbnb connect / connected states) — **still not built.**
3. Certificate detail & renewal deep-link panel — **still not built** as a standalone view (currently handled via `CertificateDialog`).
4. Loading/zero-state polish — **mostly closed.** Properties list skeleton (`SkeletonGrid`), properties zero state (`EmptyBlock` + CTA) and the OTP error state (`ErrorBanner` + inline field error) all exist. The add-property discard guard is **partial**: `PropertyForm.tsx` covers the Cancel button and `beforeunload`, but a router `POP` (browser Back) still discards unsaved edits silently. That is the only remaining gap.
5. ~~Reconcile the Ledger question.~~ **Closed.** There is no central Ledger screen. Recording lives per-property in the Payments tab of `/properties/:id`, keyed by property id.
6. Pull the actual Figma **"High Fidelity UI"** page (open it in Figma desktop and re-run `get_design_context`/`get_screenshot` against its frames) to verify the live app pixel-matches Figma for every built screen — this analysis could only reach the Cover/mockup page.
