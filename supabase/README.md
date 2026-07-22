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

## Schema overview

| Module | Tables |
|--------|--------|
| Core | `organization_settings`, `partners`, `projects`, `time_entries`, `invoices`, `invoice_line_items`, `payments` |
| Finance v2 | `expenses`, `payroll_runs`, `sales_tax_periods`, `corporate_tax_records` |
| Accounting v3 | `bank_transactions`, `accounting_adjustments` (+ extended `organization_settings`, `payroll_runs`) |
| HR | `employees`, `employee_expenses`, `dividends`, `dividend_allocations` |
| Documents | `document_attachments` + Storage bucket `documents` |
