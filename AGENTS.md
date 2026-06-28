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
| `company/` | Legal identity, registrations, ownership, fiscal calendar |
| `banking/` | Statements, transaction exports, reconciliations |
| `bookkeeping/` | Journal entries, GL, chart of accounts, year-end workpapers |
| `invoices/issued/` | Sales invoices (AR) |
| `invoices/received/` | Vendor bills (AP) |
| `receipts/` | Proof of payment / expense support |
| `payroll/` | Pay runs, remittances, slip drafts |
| `taxes/federal/` | CRA-related prep (T2 support, GST/HST) |
| `taxes/quebec/` | Revenu Québec prep (CO-17, RL slips, source deductions) |
| `taxes/gst-qst/` | GST/QST returns and ITCs/ITRs |
| `app/` | Web UI (React + Supabase) — clients, projects, time, invoices, payments |
| `supabase/` | Database schema, RLS migrations, setup docs |
| `projects/` | Legacy CSV time tracking (CLI scripts); **Supabase is primary for UI** |
| `clients/` | Legacy CSV clients (CLI); mirrored in Supabase `clients` table |
| `config/` | Invoice company details and tax settings |
| `scripts/` | `log_time.py`, `generate_invoice.py`, `add_project.py` |
| `reports/` | P&L, balance sheet, cash flow, management reports |
| `templates/` | Reusable CSV/Markdown/Excel templates |

## Core workflows

### 1. Ingest documents

- Save originals unchanged; add normalized copies or extracts alongside when useful.
- Name files: `YYYY-MM-DD_vendor-or-client_short-description.ext`
- One logical transaction per row in ledgers; link to source file in a `source_file` or `notes` column.

### 2. Bookkeeping

- Use **accrual accounting** unless `company/profile.md` states otherwise.
- Every entry needs: date, account, amount, description, and supporting document reference.
- Keep **personal and corporate** transactions strictly separated. Flag ambiguous items for owner review.
- Reconcile bank accounts monthly before closing the period.

### 3. Owner-employee payroll

- Treat the owner as a **regular employee** for payroll: gross pay, statutory deductions, remittances, T4, and RL-1.
- Record employer portions (CPP/QPP, EI, QPIP if applicable, employer taxes) as payroll expense.
- Do not recommend aggressive salary/dividend mixes; present facts and suggest the owner confirm with their CPA.

### 4. Sales and purchase taxes (GST/QST)

- Track GST and QST separately on invoices and expenses.
- Maintain running ITC/ITR support in `taxes/gst-qst/`.
- Note registration numbers and filing frequency from `company/profile.md`.

### 5. Period close (monthly)

1. Import and categorize bank transactions.
2. Match invoices ↔ payments.
3. Post adjusting entries (prepaids, accruals).
4. Run trial balance; investigate variances > $1 or material % change.
5. Save report snapshot in `reports/YYYY-MM/`.

### 7. Projects & time billing

1. Register client in `clients/clients.csv` (or `scripts/add_project.py client`).
2. Create project in `projects/projects.csv` with `default_hourly_rate`.
3. Log hours: `python scripts/log_time.py --project PROJECT_ID --hours H --desc "..."`.
4. Preview invoice: `python scripts/generate_invoice.py --project PROJECT_ID --dry-run`.
5. Generate: `python scripts/generate_invoice.py --project PROJECT_ID` → saves to `invoices/issued/`.
6. Mark registry `status` as `sent` / `paid` manually in `invoices/invoice-registry.csv`.

Use `--client CLIENT_ID` to bill all unbilled hours across that client's projects on one invoice.

### 7b. Web app (Supabase)

Primary UI for clients, projects, time, invoices, and payment reconciliation.

1. Setup: `supabase/README.md` — run migrations, configure auth, set `app/.env.local`.
2. Run: `cd app && npm install && npm run dev`.
3. Tables (all RLS `user_id = auth.uid()`): `clients`, `projects`, `time_entries`, `invoices`, `payments`, `organization_settings`.
4. Time entries link to invoices via `time_entries.invoice_id` — filter `invoice_id IS NULL` for unbilled.
5. **Bulk/agent access**: use Supabase service role in gitignored local env for scripts only; never in the browser app.

### 8. Year-end prep

- Compile accountant package: trial balance, GL detail, bank recs, AR/AP aging, fixed asset schedule, payroll summaries, GST/QST reconciliation.
- Do not file T2, CO-17, or annual returns without explicit owner approval.

## Decision log

When making non-obvious accounting choices (account mapping, capitalization vs expense, period allocation), add a row to `company/decision-log.md` with date, issue, decision, and rationale.

## What agents must do

- Read `company/profile.local.md` or Supabase before editing; never commit private profile data.
- Prefer **CSV or Markdown ledgers** that diff cleanly in git; avoid opaque binary-only workflows.
- Show calculations and cite source files when summarizing.
- Use **CAD** and **Quebec timezone (America/Montreal)** for dates unless stated otherwise.
- Round money to 2 decimal places; use banker's rounding only if the owner requests it.

## What agents must not do

- Provide legal or tax advice; use language like "draft for CPA review."
- Invent transactions, balances, or registration numbers.
- Commit files that contain secrets (bank passwords, full SIN, API keys, **Supabase service_role**). Use `.env` locally and keep it gitignored.
- Commit populated business CSVs, `invoices/issued/`, or **`company/profile.local.md`** — data belongs in Supabase / gitignored local files only.
- Delete source documents; archive superseded files under `archive/YYYY/` instead.
- File returns or remit payments without explicit owner confirmation.

## Public GitHub Pages deployment

The UI is published publicly; **all financial data stays in Supabase** protected by RLS + login. Read `SECURITY.md` before deploying.

## Escalation

Pause and ask the owner when:

- A transaction mixes personal and corporate use.
- Payroll, tax, or statutory amounts look unusual vs prior periods.
- A filing deadline is within 5 business days and work is incomplete.
- Required data in `company/profile.md` is missing.

## Related rules

Cursor rules in `.cursor/rules/` expand on security, Quebec compliance, bookkeeping standards, and payroll. They apply automatically in this workspace.
