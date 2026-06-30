# Accounting decision log

| Date | Issue | Decision | Rationale | Agent / user |
|------|-------|----------|-----------|--------------|
| 2026-06-28 | Dividend creation vs payment | New dividends are `declared` with `declared_date`; `payment_date` and `status=paid` set only via bank reconciliation | Matches accrual of dividend liability (BNR ↓, dividendes à payer ↑) before cash outflow; draft for CPA review | Agent |
| 2026-06-28 | WIP accrual policy | When `wip_accrual_enabled`, revenue recognized at month-end on unbilled time (Dr 1300 Cr 4000); invoices credit 1300 not 4000 for service amount | Aligns P&L with work performed vs billing date; optional in Settings | Agent |
| 2026-06-29 | Executive KPI « Revenus facturés » | Dashboard shows invoice subtotals (HT) by invoice date; separate line for GL/WIP recognized revenue | WIP accrual posts invoices to 1300 — invoiced ≠ P&L until WIP runs; draft for CPA review | Agent |
| 2026-06-29 | Taxable employee reimbursements in GL | Payroll entry credits 5100 and debits expense category for taxable linked expenses; net pay uses gross including taxable | Matches payroll form calcNet on gross_with_taxable; keeps JE balanced | Agent |
| 2026-06-29 | Mock FY2026 seed | `scripts/seed-mock-fy2026.py` seeds calendar 2026 with bank rows generated from all cash events for GL parity | CPA validation script requires bank net = cash 1010 | Agent |
