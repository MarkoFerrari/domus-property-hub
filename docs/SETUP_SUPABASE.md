# Domus, Supabase and Google Setup

> ## Status: mostly done already
>
> **Steps 1, 2, 3, 4 and 6 are complete.** The Supabase project exists, the schema is applied, row-level security is verified, the storage bucket is live, both edge functions are deployed, and `.env` is written. The security advisor reports zero issues.
>
> | | |
> |---|---|
> | Project | **Domus** (`cahgonzqkxxkbyoempqw`) |
> | Region | eu-central-1, Frankfurt |
> | URL | `https://cahgonzqkxxkbyoempqw.supabase.co` |
> | Tables | 8, all with RLS enabled |
> | Storage | `certificates` bucket, private, 10MB cap |
> | Functions | `delete-account`, `send-reminders` |
> | Dashboard | [supabase.com/dashboard/project/cahgonzqkxxkbyoempqw](https://supabase.com/dashboard/project/cahgonzqkxxkbyoempqw) |
>
> **What is left for you, and only you:**
>
> - **Step 5, Google sign-in.** Needs Google Cloud credentials and a secret pasted into the Supabase dashboard. No API can do this: creating an OAuth client requires a human in the Google console. Your auth logs show three failed attempts at 14:16, 14:19 and 14:22, all `provider is not enabled`. That is why.
> - **Step 5e, the email template.** Two minutes, and the signup screen does not behave as designed until it is done.
> - **Step 7, reminder emails.** Needs a Resend account and its API key. The function is deployed and waiting for the secret.
> - **Step 8, testing.** Your `ciao@ciao.com` account was stuck unverified because that address cannot receive mail. It has been confirmed manually, so you can sign in with it now.
>
> Skip to step 5.

**What this gets you:** real accounts, Google sign-in, a real database with per-user security, stored certificate documents, password reset, account deletion, and daily reminder emails.

**Time:** about 35 minutes, most of it waiting. You need a credit card for nothing here. Everything below is on free tiers.

**Do it in order.** Step 3 depends on step 2, step 6 depends on step 5.

---

## Before you start

Have these open in tabs:

- [supabase.com](https://supabase.com)
- [console.cloud.google.com](https://console.cloud.google.com) (only for step 5)
- [resend.com](https://resend.com) (only for step 7)

And keep a scratch file open. You will collect five values along the way.

---

## Step 1. Create the Supabase project ✅ DONE

1. Go to [supabase.com](https://supabase.com), **Start your project**, sign in with GitHub or email.
2. **New project**.
3. Fill in:
   - **Name:** `domus`
   - **Database password:** click **Generate a password** and **save it in your password manager now**. You will not be shown it again. You will not need it day to day, but you cannot recover the project without it.
   - **Region:** **Central EU (Frankfurt)**. Closest to Greece, and it keeps EU personal data in the EU, which matters for the privacy policy.
4. **Create new project**, then wait roughly two minutes.

---

## Step 2. Get your two keys ✅ DONE

1. Left sidebar, the gear icon at the bottom, **Project Settings**.
2. **API** (or **API Keys** in newer dashboards).
3. Copy two things into your scratch file:
   - **Project URL**, looks like `https://abcdefgh.supabase.co`
   - **anon public** key, a long string starting `eyJ...`

> **The `anon` key is safe in the browser.** It is designed to be public and it is what the app ships with. The one you must never put in the app or in git is the **`service_role`** key. If you ever see `service_role` in a `.env` file, something has gone wrong.

Now create the app's env file. In the `domus-property-hub` folder, copy `.env.example` to `.env` and fill it in:

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

`.env` is already in `.gitignore`. Do not commit it.

---

## Step 3. Create the database ✅ DONE

Left sidebar, **SQL Editor**, **New query**. You will run four files, **in order**. Paste each one whole, press **Run**, wait for "Success", then move to the next.

From `domus-property-hub/supabase/migrations/`:

| Order | File | What it does |
|---|---|---|
| 1 | `0001_init.sql` | Tables, indexes, row-level security, the new-user trigger |
| 2 | `0002_payday_1_to_31.sql` | Allows a rent day of 29 to 31 |
| 3 | `0003_obligation_type_history_overrides.sql` | Splits a short-term month into its two obligations, adds the edit log |
| 4 | `0004_storage_reminders_account_deletion.sql` | Certificate storage bucket, reminder preferences |

**Check it worked:** left sidebar, **Table Editor**. You should see `profiles`, `properties`, `certificates`, `declarations`, `rent_payments`, `dismissed_notifications`, `ledger_history` and `deadline_overrides`.

Then **Storage** in the sidebar. You should see a **certificates** bucket, marked private. If it is missing, step 4 of file `0004` did not run: re-run just that file.

---

## Step 4. Check security is actually on ✅ DONE, zero advisor warnings

This is the step that stops one landlord reading another's records.

1. Left sidebar, **Authentication**, then **Policies**.
2. Every table listed should say **RLS enabled**.
3. If any table shows **RLS disabled**, `0001_init.sql` did not fully run. Re-run it.

> Why this matters: without RLS, the `anon` key in the browser can read every row in the database. With it, Postgres itself refuses to return another user's rows regardless of what the app asks for.

---

## Step 5. Google sign-in ⬅ YOUR TURN (10 min)

The button already exists in Domus. This makes it work.

### 5a. Get the callback URL from Supabase

Your callback URL is already known:

```
https://cahgonzqkxxkbyoempqw.supabase.co/auth/v1/callback
```

You will paste that into Google in 5b. It must match character for character, which is the single most common cause of `redirect_uri_mismatch`.

### 5b. Create the Google credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Top bar project dropdown, **New Project**, name it `Domus`, **Create**. Wait, then select it.
3. Search **OAuth consent screen**, open it.
   - **External**, **Create**
   - App name `Domus`, your email for both support and developer contact
   - **Save and continue** through Scopes and Test users, then **Back to dashboard**
   - While the app is unverified only test users can sign in. Add your own Google address under **Test users**.
4. Search **Credentials**, open it. **Create credentials**, **OAuth client ID**.
   - **Application type:** Web application
   - **Name:** `Domus web`
   - **Authorised JavaScript origins:** `http://localhost:5173` (add the live URL later)
   - **Authorised redirect URIs:** `https://cahgonzqkxxkbyoempqw.supabase.co/auth/v1/callback`
   - **Create**
5. Copy the **Client ID** and **Client secret**.

### 5c. Paste them back into Supabase

1. Open [Authentication → Sign In / Providers](https://supabase.com/dashboard/project/cahgonzqkxxkbyoempqw/auth/providers).
2. Find **Google**, toggle **Enable Sign in with Google** on.
3. Paste the Client ID and Client secret. **Save**.

Nothing needs to change in the app. `signInWithGoogle` and both buttons are already wired.

### 5d. Set the redirect URLs

Open [Authentication → URL Configuration](https://supabase.com/dashboard/project/cahgonzqkxxkbyoempqw/auth/url-configuration):

- **Site URL:** `http://localhost:5173` while developing, your real URL once live
- **Redirect URLs:** add both
  - `http://localhost:5173/**`
  - `https://your-live-domain/**`

> Miss this and password reset emails will bounce users to the wrong place, or refuse to work at all.

### 5e. Make the 6-digit code actually work (2 min, do not skip)

Domus asks new users for a **6-digit code**. Supabase's default "Confirm signup" email
sends a **link** instead, because the stock template uses `{{ .ConfirmationURL }}`.
Per Supabase's own docs: include `{{ .ConfirmationURL }}` and you get a magic link,
include `{{ .Token }}` and you get a one-time code.

Until you change this, a new landlord receives an email with no code in it and sits
looking at six empty boxes. The app now tells them to click the link instead, so it is
not broken, but it is not what the screen is designed for.

1. Open [Authentication → Email Templates](https://supabase.com/dashboard/project/cahgonzqkxxkbyoempqw/auth/templates).
2. Select **Confirm signup**.
3. Replace the body with something like:

```html
<h2>Confirm your email</h2>
<p>Your Domus verification code is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px;">{{ .Token }}</p>
<p>It expires in an hour. If you did not create a Domus account, ignore this email.</p>
```

4. **Save**. Do the same for **Magic Link** if you ever enable passwordless sign-in.

> Keep `{{ .Token }}` in the template. Swapping it back to `{{ .ConfirmationURL }}`
> silently breaks the verification screen for every new signup.

### 5f. A warning about test emails

Sign up with an address you can actually open. `ciao@ciao.com` and similar look fine to
Supabase, the send is logged as successful, and the email goes nowhere. That is the most
common reason "verification is broken".

Supabase's built-in email service is also rate-limited to a handful of messages per hour
and is for development only. Point Auth at Resend (step 7) before any real pilot.

---

## Step 6. Deploy the two server functions ✅ DONE

Both are already deployed and ACTIVE. You can see them at
[Edge Functions](https://supabase.com/dashboard/project/cahgonzqkxxkbyoempqw/functions).

To redeploy after a code change, you need the Supabase CLI:

```bash
# Install the CLI once
npm install -g supabase

# Sign in (opens a browser)
supabase login

# Link to your project. Already linked if you use the dashboard; this is only needed for CLI work.
supabase link --project-ref cahgonzqkxxkbyoempqw

# Deploy both
supabase functions deploy delete-account
supabase functions deploy send-reminders
```

`delete-account` works immediately. It is what the **Delete account and data** button in Settings calls, and it is the only place with permission to remove an auth user.

`send-reminders` needs step 7.

---

## Step 7. Reminder emails ⬅ YOUR TURN (5 min)

Without this, Domus only reminds a landlord when they open Domus, which is the one moment they do not need reminding.

### 7a. Get a Resend key

1. [resend.com](https://resend.com), sign up free (3,000 emails a month).
2. **API Keys**, **Create API Key**, copy it.
3. For real use, **Domains**, add your domain and follow the DNS records. Until then you can only send to your own address, which is fine for testing.

### 7b. Give the function its secrets

Easiest without the CLI: [Edge Functions → Secrets](https://supabase.com/dashboard/project/cahgonzqkxxkbyoempqw/settings/functions). Add three:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the key from 7a |
| `REMINDER_FROM` | `Domus <onboarding@resend.dev>` to start, your own domain later |
| `APP_URL` | `http://localhost:5173` while testing |

Or by CLI:

```bash
supabase secrets set RESEND_API_KEY=re_your_key_here
supabase secrets set REMINDER_FROM="Domus <onboarding@resend.dev>"
supabase secrets set APP_URL="http://localhost:5173"
```

Until this is set the function returns a clear error rather than failing silently.

### 7c. Run it once a day

Supabase, **SQL Editor**, **New query**. Replace the two placeholders and run:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'domus-daily-reminders',
  '0 7 * * *',                       -- 07:00 UTC, so 10:00 in Greece
  $$
  select net.http_post(
    url     := 'https://cahgonzqkxxkbyoempqw.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    )
  );
  $$
);
```

> This is the **only** place the `service_role` key is ever used, and it stays inside your database. It must never appear in `.env`, in the app, or in git.

**Test it now** rather than waiting until tomorrow:

```bash
supabase functions invoke send-reminders
```

You should get back something like `{"sent":1,"skipped":0}`. If it says `sent: 0`, you probably have nothing due, which is correct behaviour: Domus never sends "you have nothing to do" emails, because that is how digests get muted.

---

## Step 8. Check the whole thing works ⬅ YOUR TURN (5 min)

```bash
cd domus-property-hub
npm install
npm run dev
```

`.env` is already written with the live project URL and anon key, so this connects immediately.

Work through this list. Each one exercises something different:

- [ ] The amber "Demo mode" banner is **gone**. If it is still there, `.env` is not being read: stop and restart `npm run dev`.
- [ ] Open a short-term property, **Payments** tab. Every month has **two rows**, the stay declaration and ΤΑΚΚ, with different due dates. This is the ΤΑΚΚ fix; if you only see one row per month something has gone wrong.
- [ ] Open a record dialog. The amber warning "This does not file anything" is clearly visible.
- [ ] Settings says **Connected to your database**.
- [ ] Sign up with a real email. A 6-digit code arrives (not `123456`).
- [ ] **Continue with Google** signs you in.
- [ ] Add a property. Refresh the page: it is still there.
- [ ] Open it in a different browser while signed in as the same user: it is there too. That proves it is in Postgres and not the browser.
- [ ] Upload a certificate document, then reopen it and click **Open**. The PDF opens.
- [ ] Sign out, **Forgot your password?**, follow the emailed link, set a new password.
- [ ] Settings, **Ledger (CSV)**. It opens in Excel with ΤΑΚΚ readable, not mangled.
- [ ] `supabase functions invoke send-reminders` returns without an error.
- [ ] **Last, on a throwaway account:** Settings, **Delete account and data**. Then check the Table Editor: the rows are gone.

---

## When you go live

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your host's environment variables (Netlify: Site settings, Environment variables. Vercel: Settings, Environment Variables).
2. **Redeploy after setting them.** Vite reads env vars at build time, so a deploy that ran before you set them will still be in demo mode.
3. Update **Site URL** and **Redirect URLs** in Supabase to the live domain.
4. Add the live origin to the Google **Authorised JavaScript origins**.
5. Load the live site and confirm the amber demo banner is absent.

> That banner is the safety net for the most likely deployment mistake: a build that succeeds, looks perfect, and quietly saves every landlord's data to their own browser.

---

## Still to do, and not on this page

Two things are deliberately not automated here because they need a human:

1. **A Greek tax professional** has to confirm the deadline rules in `src/lib/ledger.ts`, in writing. Until then every date in the app is labelled indicative. See `READINESS_AUDIT.md` P1-6.
2. **A lawyer** has to complete `src/pages/Privacy.tsx`. It has bracketed gaps where the entity name, processors and retention period go.

---

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| Amber demo banner will not go away | `.env` missing, misnamed, or the dev server was not restarted | File must be `.env`, in `domus-property-hub/`, vars must start `VITE_`. Restart the server. |
| "Document storage is not set up yet" | Migration `0004` did not create the bucket | Re-run `0004_storage_reminders_account_deletion.sql` |
| Google sign-in returns "redirect_uri_mismatch" | The Google redirect URI does not exactly match Supabase's callback | Re-copy it from Supabase, step 5a. It must match character for character. |
| Password reset link goes to the wrong page | Redirect URLs not configured | Step 5d, and include the `/**` wildcard |
| Reminders return `sent: 0` | Usually correct: nothing is due | Create an overdue record and invoke it again |
| "Could not load your portfolio" banner | Wrong keys, or RLS is misconfigured | Recheck step 2, then step 4 |
| Everything is empty after signing in | RLS enabled with no policies | Re-run `0001_init.sql` in full |
