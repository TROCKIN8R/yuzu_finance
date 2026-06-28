# Yuzu Finance — Agent Instructions

This folder is the **single source of truth** for company finances and accounting. Every Cursor agent working here must follow these instructions and the rules in `.cursor/rules/`.

## Mission

Help the owner manage bookkeeping, payroll, tax prep, and financial reporting for a **Quebec-incorporated corporation** with **one shareholder/director who is also a paid employee**. Agents organize data, draft schedules, reconcile accounts, and prepare materials for filing — they do **not** replace a CPA, payroll provider, or lawyer.

## Company profile

Before doing substantive work, read `company/profile.local.md` (if present) or Supabase `organization_settings`. Use `company/profile.example.md` only as a blank template. **Never commit private company data to this public repo.**

Legal PDFs live outside the repo (e.g. local `yuzu_legal/`). See `company/legal-index.local.md` if present.

## Folder map

| Path | Purpose |
|------|---------|
| `app/` | Web UI (React + Supabase) — clients, projects, time, invoices, payments, payroll, dividends, taxes |
| `supabase/` | Database schema (`setup.sql`), archived migrations, setup docs |
| `company/` | Legal identity pointers, decision log, share structure (no private facts in git) |
| `.cursor/rules/` | Quebec compliance, security, payroll, and app conventions |

All operational data (clients, projects, time, invoices, expenses, payroll, etc.) lives in **Supabase** with RLS — not in repo files.

## Core workflows

### Web app (primary)

1. Setup: `supabase/README.md` — run `supabase/setup.sql`, configure auth, set `app/.env.local`.
2. Run: `cd app && npm install && npm run dev`.
3. Tables (all RLS `user_id = auth.uid()`): `clients`, `projects`, `time_entries`, `invoices`, `payments`, `expenses`, `employees`, `payroll_runs`, `dividends`, `sales_tax_periods`, `corporate_tax_records`, `organization_settings`.
4. Time entries link to invoices via `time_entries.invoice_id` — filter `invoice_id IS NULL` for unbilled.
5. **Bulk/agent access**: use Supabase service role in gitignored local env for scripts only; never in the browser app.

### Bookkeeping (in app)

- Use **accrual accounting** unless the owner states otherwise.
- Dashboard (`app/src/pages/DashboardPage.tsx`) summarizes cash flow, balance sheet, and P&L from Supabase data.
- Reconcile invoices ↔ payments in the app; match expenses and payroll runs to bank statements monthly.

### Owner-employee payroll

- Treat the owner as a **regular employee** for payroll: gross pay, statutory deductions, remittances, T4, and RL-1.
- Record employer portions (CPP/QPP, EI, QPIP, employer taxes) separately from employee withholdings in `payroll_runs`.
- Do not recommend aggressive salary/dividend mixes; present facts and suggest the owner confirm with their CPA.

### Sales and purchase taxes (GST/QST)

- Track GST and QST separately on invoices and expenses in the app.
- Use the Sales Tax module for open periods and remittance tracking.

### Period close (monthly)

1. Import and categorize bank transactions (external).
2. Match invoices ↔ payments in the app.
3. Post adjusting entries for prepaids/accruals (expenses module).
4. Review dashboard trial figures; investigate material variances.
5. Save external report snapshots locally if needed (not in this repo).

### Year-end prep

- Compile accountant package: trial balance, GL detail, bank recs, AR/AP aging, payroll summaries, GST/QST reconciliation — export from Supabase or external tools.
- Do not file T2, CO-17, or annual returns without explicit owner approval.

## Decision log

When making non-obvious accounting choices (account mapping, capitalization vs expense, period allocation), add a row to `company/decision-log.md` with date, issue, decision, and rationale.

## What agents must do

- Read `company/profile.local.md` or Supabase before editing; never commit private profile data.
- Show calculations and cite source data when summarizing.
- Use **CAD** and **Quebec timezone (America/Montreal)** for dates unless stated otherwise.
- Round money to 2 decimal places; use banker's rounding only if the owner requests it.

## What agents must not do

- Provide legal or tax advice; use language like "draft for CPA review."
- Invent transactions, balances, or registration numbers.
- Commit files that contain secrets (bank passwords, full SIN, API keys, **Supabase service_role**). Use `.env` locally and keep it gitignored.
- Commit **`company/profile.local.md`** or other private business data.
- Delete source documents outside the repo; archive superseded files locally instead.
- File returns or remit payments without explicit owner confirmation.

## Public GitHub Pages deployment

The UI is published publicly; **all financial data stays in Supabase** protected by RLS + login. Read `SECURITY.md` before deploying.

## Escalation

Pause and ask the owner when:

- A transaction mixes personal and corporate use.
- Payroll, tax, or statutory amounts look unusual vs prior periods.
- A filing deadline is within 5 business days and work is incomplete.
- Required company settings are missing in Supabase or `profile.local.md`.

## Related rules

Cursor rules in `.cursor/rules/` expand on security, Quebec compliance, bookkeeping standards, and payroll. They apply automatically in this workspace.
