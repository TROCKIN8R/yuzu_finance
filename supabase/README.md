# Security (required reading)

See [SECURITY.md](../SECURITY.md) for the public GitHub Pages + private Supabase model.

## Database setup

### New project (recommended)

Run **`supabase/setup.sql`** once in the Supabase **SQL Editor** on an empty project. It creates all tables, RLS policies, grants, triggers, and functions in one shot.

### Existing project (already ran older migrations)

Do **not** run `setup.sql` — tables already exist. If you are missing a module, run only the relevant file from `supabase/migrations/` in filename order:

| File | Purpose |
|------|---------|
| `20260629000000_partners.sql` | clients → partners |
| `20260629100000_bank_import.sql` | **`bank_transactions` table** + Wealthsimple CSV import (creates table if missing) |
| `20260630120000_dividend_declared_paid.sql` | Dividends: `declared_date`, `status` (declared/paid), nullable `payment_date` |
| `20260630120100_dividend_declared_date_default.sql` | Default + trigger so `declared_date` is set if missing (older app builds) |
| `20260630130000_partner_invoice_language.sql` | Partner `language` constraint (`fr` / `en`) for invoice PDFs |
| `20260630140000_billing_payment_settings.sql` | Payment coordinates + bilingual `payment_instructions_fr` / `_en` |
| `20260630150000_opening_balance_date.sql` | `opening_balance_date` for grand-livre opening entries |
| `20260630150100_accounting_adjustments.sql` | **`accounting_adjustments` table** (manual journal entries) |
| `20260722180000_document_attachments.sql` | **`document_attachments` table** + private Storage bucket `documents` |
| `20260628140000_shareholders.sql` | **`shareholders` table** + dividend allocations by shareholder |
| `20260724220000_project_po_number.sql` | Optional `projects.po_number` (PO / BC) for invoices |
| `20260724230000_project_week_plans.sql` | **`project_week_plans`** — planned hours per project/week (pipeline) |

If Banque import fails with `relation "bank_transactions" does not exist`, run **`20260629100000_bank_import.sql`** — it now creates the table, RLS, and import columns in one step.

## Auth lockdown

1. Create your account once.
2. **Authentication → Settings** → disable **Enable new user sign-ups**.
3. Strong password; enable MFA if available.

## Keys

| Key | Where | Safe in public JS? |
|-----|-------|-------------------|
| anon (public) | GitHub Secret → build | Yes — RLS + login protect data |
| service_role | Never in git / never in browser | **No** — full DB access |
| `GEMINI_API_KEY` | Supabase Edge Function secret only | **No** — never `VITE_*` / browser |
| `SUPABASE_ACCESS_TOKEN` | `supabase/.env.local` (gitignored) for CLI deploys | **No** |

## CLI deploy (same project, agent-friendly)

Store a [personal access token](https://supabase.com/dashboard/account/tokens) in **`supabase/.env.local`** (gitignored; see `.env.local.example`):

```bash
SUPABASE_ACCESS_TOKEN=sbp_…
SUPABASE_PROJECT_REF=gqpafbmlherrwuigsjxy
```

Then deploy Edge Functions without pasting secrets into chat:

```bash
chmod +x scripts/deploy-edge-functions.sh
./scripts/deploy-edge-functions.sh              # default: extract-receipt
./scripts/deploy-edge-functions.sh extract-receipt
```

`GEMINI_API_KEY` is set once on the project (`supabase secrets set`) and is not stored in this repo.

## Receipt OCR (Gemini)

Supplier invoices / receipts can pre-fill expense forms (Banque assign + Frais employé) via Edge Function `extract-receipt`.

1. Create a **Free Tier** API key in [Google AI Studio](https://aistudio.google.com/) (do not link billing if you want to stay free).
2. Put your Supabase access token in `supabase/.env.local` (see above). Set the Gemini secret once, then deploy:

```bash
# From repo root — token loaded from supabase/.env.local
export $(grep -v '^#' supabase/.env.local | xargs)
npx supabase secrets set GEMINI_API_KEY=your_gemini_key --project-ref "$SUPABASE_PROJECT_REF"
./scripts/deploy-edge-functions.sh extract-receipt
```

Optional override: `npx supabase secrets set GEMINI_MODEL=gemini-3.1-flash-lite --project-ref "$SUPABASE_PROJECT_REF"` (default is `gemini-2.5-flash`; avoid `gemini-2.5-flash-lite` — blocked for new keys).

3. In the app: choose a PDF/image → **Scanner (Gemini)** → review pre-filled vendor / date / TPS / TVQ / total → save.

Files are uploaded briefly to `{user_id}/ocr-inbox/` then deleted after extraction. The model receives the document bytes (privacy: leaves your project to Google). Extraction never auto-saves — owner review required (draft for CPA).

If the function is missing or quota is exhausted, the UI shows an error and you enter amounts manually.

## Schema overview

| Module | Tables |
|--------|--------|
| Core | `organization_settings`, `partners`, `projects`, `project_week_plans`, `time_entries`, `invoices`, `invoice_line_items`, `payments` |
| Finance v2 | `expenses`, `payroll_runs`, `sales_tax_periods`, `corporate_tax_records` |
| Accounting v3 | `bank_transactions`, `accounting_adjustments` (+ extended `organization_settings`, `payroll_runs`) |
| HR | `employees`, `employee_expenses`, `dividends`, `dividend_allocations` |
| Documents | `document_attachments` + Storage bucket `documents` |
