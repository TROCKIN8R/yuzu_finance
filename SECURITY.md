# Security model — public site, private data

## What is public (GitHub)

- React UI source code and compiled JavaScript
- The Supabase **project URL** and **anon key** (embedded at build time via GitHub Secrets)

This is normal for client-side apps. The anon key is **not** a secret in the traditional sense — it is a public identifier for your Supabase project.

## What stays private (never on GitHub)

| Asset | Where it lives |
|-------|----------------|
| Clients, projects, time, invoices, payments | Supabase Postgres (your project) |
| Login session | Browser + Supabase Auth |
| Service role key | Supabase dashboard only / local `.env` (gitignored) |
| Bank details, payroll, receipts | Local folders or future secure storage — **not** in this repo |

## How access is blocked

1. **Row Level Security (RLS)** on every table — policies require `auth.uid() = user_id`.
2. **Login required** — the app has no public data routes; unauthenticated users see only the login screen.
3. **No service role in the browser** — full database bypass is impossible from the published site.
4. **Sign-ups disabled** in production (`VITE_ALLOW_SIGNUP=false` + Supabase dashboard).

Without your email + password, a visitor cannot list, read, or modify your financial rows — even with the anon key from the JS bundle.

## What you must do

### Supabase (one-time)

1. Run all migrations in `supabase/migrations/`.
2. **Authentication → Settings** → disable **Enable new user sign-ups**.
3. Create your account once (before or right after disabling sign-ups).
4. Use a strong unique password; enable MFA in Supabase if available on your plan.

### GitHub (one-time)

1. **Settings → Secrets and variables → Actions** — add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (the **anon** key from Supabase → Settings → API)
2. **Settings → Pages** → Source: **GitHub Actions**.
3. **Never** add `SUPABASE_SERVICE_ROLE_KEY` to GitHub Secrets used by this workflow.

### Local development

- Copy `app/.env.example` → `app/.env.local` (gitignored).
- Optional: `VITE_ALLOW_SIGNUP=true` locally only while bootstrapping.

### Do not commit to this public repo

- NEQ, BN, addresses, salaries, owner/shareholder names
- Client, project, time, invoice, or payment rows (Supabase only)
- Legal PDFs or minute book
- `company/profile.local.md`, `config/invoicing.local.json`, `.env.local`

Templates (`*.example.*`) may be committed empty only.

## If the anon key is exposed

Rotating the anon key in Supabase invalidates old builds. Update the GitHub Secret and redeploy. Your **data** is still protected by RLS unless RLS was misconfigured.

## If you need bulk agent access later

Use a **local script** with the service role key in a gitignored `.env` on your machine only — never in the GitHub Pages build or public repo.
