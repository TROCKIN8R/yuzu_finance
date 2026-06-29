# Accounting decision log

| Date | Issue | Decision | Rationale | Agent / user |
|------|-------|----------|-----------|--------------|
| 2026-06-28 | Dividend creation vs payment | New dividends are `declared` with `declared_date`; `payment_date` and `status=paid` set only via bank reconciliation | Matches accrual of dividend liability (BNR ↓, dividendes à payer ↑) before cash outflow; draft for CPA review | Agent |
| 2026-06-28 | WIP accrual policy | When `wip_accrual_enabled`, revenue recognized at month-end on unbilled time (Dr 1300 Cr 4000); invoices credit 1300 not 4000 for service amount | Aligns P&L with work performed vs billing date; optional in Settings | Agent |
| 2026-06-28 | Period close scope | Closed month blocks writes on payroll, bank, invoices, time, employee expenses, dividends, sales/corp tax, adjustments | Master data (partners, employees, settings) stays editable; reopen via Clôture de période | Agent |
