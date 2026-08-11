# Domus — Property Hub

**Every deadline, every euro, one screen.**

Property management for small Greek landlords. Tracks AADE declarations, rent collection and compliance certificates for both short-term (Airbnb-style) and long-term rentals.

Rebuilt from scratch against `DOMUS_SOURCE_OF_TRUTH.md`.

---

## Start here: two ways to run it

### The easy way (no terminal)

Double-click **`start.command`** in this folder.

The first run takes about a minute while it installs itself, then Domus opens in your browser at `http://localhost:5173`. Leave the black Terminal window open while you use the app; close it to stop.

> **If macOS blocks it:** right-click `start.command` → Open → Open. You only have to do that once.
>
> **If it says Node.js is missing:** go to [nodejs.org](https://nodejs.org), download the big green **LTS** button, install it, then double-click `start.command` again.

### The terminal way

```bash
npm install
npm run dev
```

---

## Demo mode vs. real database

Domus runs in one of two modes, and it tells you which one in the sidebar and on Settings.

|  | **Demo mode** (default) | **Connected** |
|---|---|---|
| Setup needed | None | ~10 minutes, once |
| Accounts | Fake, this browser only | Real, with password hashing |
| Email codes | Always `123456` | Real 6-digit codes by email |
| Data lives | In this browser | In your own Postgres database |
| Works on another device | No | Yes |

Everything else — every screen, every rule, every alert — is identical. Demo mode exists so you can click through the whole product before deciding to set up a database.

---

## Connecting a real database (Supabase)

This gives you working sign-up, email verification, password sign-in and a proper database. It's free.

### 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign up.
2. Click **New project**. Pick any name, set a database password (save it somewhere), choose the region closest to you — Frankfurt is a good pick for Greece.
3. Wait ~2 minutes for it to finish setting up.

### 2. Create the tables

1. In the left sidebar click **SQL Editor** → **New query**.
2. Open `supabase/migrations/0001_init.sql` from this folder, copy everything in it, paste it into the editor.
3. Click **Run**. You should see "Success. No rows returned."

That created your tables, the security rules that stop anyone reading anyone else's portfolio, and a trigger that makes a profile whenever someone signs up.

### 3. Turn on 6-digit email codes

By default Supabase emails a magic link instead of a code, and Domus's verification screen wants a code.

1. Go to **Authentication** → **Emails** (or **Email Templates**).
2. Open the **Confirm signup** template.
3. Make sure the body includes `{{ .Token }}` somewhere. For example:

   ```html
   <h2>Confirm your Domus account</h2>
   <p>Your verification code is:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   ```

4. Save.

### 4. Paste your keys into Domus

1. In Supabase go to **Settings** (gear icon) → **API**.
2. Copy the **Project URL** and the **anon public** key.
3. In this folder, duplicate `.env.example` and rename the copy to exactly `.env`.
4. Fill it in:

   ```
   VITE_SUPABASE_URL=https://abcdefgh.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

5. Stop Domus (close the Terminal window) and start it again.

The sidebar will now say "Connected to your database" instead of "Demo data".

> The anon key is safe to keep in this file — it's designed to be public. Row-level security is what actually protects your data. Never put the `service_role` key here.

### 5. Optional: Google sign-in

In Supabase go to **Authentication** → **Providers** → **Google**, enable it and follow their instructions. The "Continue with Google" buttons start working immediately after.

---

## Putting it online

The app builds to plain static files, so it deploys free on Netlify or Vercel. Config files for both are already included, including the routing rewrite these apps need.

```bash
npm run build      # produces the dist/ folder
```

Drag the `dist` folder onto [app.netlify.com/drop](https://app.netlify.com/drop) for an instant deploy. For a proper setup, connect this folder as a Git repo to Netlify or Vercel and add the two `VITE_SUPABASE_*` values in their environment variables settings.

---

## What's inside

```
src/
  lib/
    compliance.ts      Certificate status + compliance derivation. Pure logic.
    ledger.ts          Month maths, filing deadlines. Pure logic.
    notifications.ts   The alert feed, derived from the two above. Pure logic.
    db.ts              Data access. Supabase or localStorage, one API.
    auth.tsx           Sign up, sign in, OTP, sessions.
    store.tsx          The single in-memory store every screen reads from.
    supabase.ts        Client setup + the "are we connected?" flag.
  components/
    AppShell.tsx       Sidebar, topbar, mobile nav, alert pill.
    AuthShell.tsx      Layout for the sign-up / sign-in / verify screens.
    Logo.tsx           DOMUS wordmark.
    ui-primitives.tsx  Buttons, inputs, labels, banners.
    patterns.tsx       Cards, status pills, metrics, modal, empty states.
    PropertyForm.tsx   Shared by Add and Edit, including certificates.
    CertificateDialog.tsx / LedgerDialogs.tsx / ConfirmDialog.tsx
  pages/
    Landing, SignUp, SignIn, Verify, Welcome, Dashboard,
    PropertiesList, PropertyNew, PropertyDetail, PropertyEdit,
    Notifications, Settings, Help, NotFound
supabase/migrations/0001_init.sql
```

**Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, React Router v6, Supabase, lucide-react, sonner. No component library — every element is built to match the Figma design directly.

---

## The one rule that matters

**Compliance status, alerts and notifications are derived at read time. They are never stored.**

This is not a style preference. The original build stored `property.compliance` as a field and hardcoded certificate names into the alert text, so once a landlord fixed something the warning never went away — it sat on the property card forever.

Here, `getCompliance()` recalculates from the actual certificate dates every render, alert sentences are assembled from the certificates that are genuinely offending, and one store feeds every surface. Upload a missing certificate and it vanishes from the property card, the banner, the topbar pill, both nav badges and the notifications list at the same instant, with no reload.

If you add a feature that raises an alert, derive it. Don't store it. There is no `compliance` column in the database and no notifications table, deliberately.

---

## The rules Domus encodes

- Short-term declarations are due to **AADE** by the **20th of the following month**. First fine: **€5,000**.
- **Zero-income months still have to be declared.**
- Six certificates apply under **Law 5170/2025**. A certificate goes "Due soon" **60 days** before expiry.
- Only **completed** months can be recorded — you can never report a month that hasn't ended.
- Records are keyed by property **id**, never by a slug of the property name.
- Domus **never moves money and never edits listings.** It records and reminds.

---

## Known gaps

Carried over from the source of truth, deliberately not built yet:

1. Property → **Calendar tab** (Airbnb connect + connected states).
2. Per-certificate **renewal history** (the upload dialog covers the practical case).
3. **File storage** — certificates record a file name, not the actual document. Wiring this to Supabase Storage changes only what goes in the `file` field; the compliance logic is untouched.
