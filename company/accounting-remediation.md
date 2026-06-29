# Accounting remediation — issues & acceptance criteria

> Draft tracking document for owner/CPA review.

## P0 — Accounting integrity

| ID | Issue | Acceptance criteria | Status |
|----|-------|---------------------|--------|
| P0-1 | Two engines: GL vs `buildFinancialSnapshot` diverge | Financial reports and dashboard derive P&L, balance sheet, and cash flow from `buildGeneralLedger` + balance helpers; adjustments included | done |
| P0-2 | Balance sheet not as-of period end | AR/AP/tax/cash/equity use cumulative GL balances at `period.end` | done |
| P0-3 | Cash flow double-counts employer payroll | `cashOut` excludes duplicate employer contributions; matches GL cash on 1010 | done |
| P0-4 | Corporate tax paid not period-scoped | Cash flow from GL entries filtered by period | done |
| P0-5 | Void invoices leave orphan payments in GL | Payments linked to `void` invoices excluded | done |
| P0-6 | Opening retained earnings missing from GL | Opening entry journals `opening_retained_earnings` to 3100 | done |

## P1 — Tax & GL completeness

| ID | Issue | Acceptance criteria | Status |
|----|-------|---------------------|--------|
| P1-1 | Sales tax ITC excludes employee expenses | `calculateSalesTaxPeriod` includes `employee_expenses` | done |
| P1-2 | Sales tax refunds ignored in GL | Negative nets post Dr 1010 / Cr 1200/1210 | done |
| P1-3 | Corporate tax accrual vs cash only | Estimated/due → Dr 5900 Cr 2310; payments → Dr 2310 Cr 1010 | done |
| P1-4 | Trial balance on date filter misleading | Trial = cumulative through `dateTo`; journal = period activity | done |

## P2 — Québec entity model

| ID | Issue | Acceptance criteria | Status |
|----|-------|---------------------|--------|
| P2-1 | Dividends split among employees not shareholders | `shareholders` table; allocations by shares held | done |
| P2-2 | Payroll uses CPP not QPP labels/rates | QPP labels/rates; planning disclaimer retained | done |
| P2-3 | Taxable reimbursement withholdings stale | Recalculate withholdings when taxable reimbursements change gross (save + live toggle) | done |
| P2-4 | Employer benefits in statutory remittance GL | `2210` excludes `employer_benefits`; benefits accrue to `2050` | done |
| P2-5 | Taxable reimb gross uses TTC not HT | Taxable reimb added to gross at `amount` (pre-tax); non-tax at `total` | done |

## P3 — Presentation & charts

| ID | Issue | Acceptance criteria | Status |
|----|-------|---------------------|--------|
| P3-1 | Income statement dividend label wrong | Shows dividends **declared** in period | done |
| P3-2 | Chart series payroll cash double-count | Monthly cash out matches GL (no duplicate employer contrib) | done |
| P3-3 | Contra-asset 1500 typed as asset | Account 1500 uses `contra` type | done |

## P4 — Advanced modules

| ID | Issue | Acceptance criteria | Status |
|----|-------|---------------------|--------|
| P4-1 | WIP accrual for unbilled time | Optional `wip_accrual_enabled`; monthly Dr 1300 Cr 4000; invoices Cr 1300 | done |
| P4-2 | T4/RL-1 / T5 / CO-17 form generation | `/tax-exports` CSV schedules from payroll, dividends, GL | done |
| P4-3 | HSF / CNESST payroll | Configurable rates; `hsf_employer` / `cnesst_employer` on payroll; GL 2215 | done |
| P4-4 | Period close / lock | `fiscal_period_closes` table; `/period-close` UI; blocks all financial writes in closed month | done |

## Supabase migration

Run migrations in order in SQL Editor, or with `DATABASE_URL`:

```bash
node scripts/apply-supabase-migration.mjs supabase/migrations/20260703150000_p4_accounting_features.sql
```
