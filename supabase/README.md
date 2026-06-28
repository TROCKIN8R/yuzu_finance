# Security (required reading)

See [SECURITY.md](../SECURITY.md) for the public GitHub Pages + private Supabase model.

## Database setup

### New project (recommended)

Run **`supabase/setup.sql`** once in the Supabase **SQL Editor** on an empty project. It creates all tables, RLS policies, grants, triggers, and functions in one shot.

### Existing project (already ran older migrations)

Do **not** run `setup.sql` — tables already exist. If you are missing a module, run only the relevant file from `supabase/migrations/` in filename order. Latest: `20260629000000_partners.sql` (clients → partners with customer/provider/both roles).

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
