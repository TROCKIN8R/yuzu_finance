# Accounting decision log

| Date | Issue | Decision | Rationale | Agent / user |
|------|-------|----------|-----------|--------------|
| 2026-06-28 | Dividend creation vs payment | New dividends are `declared` with `declared_date`; `payment_date` and `status=paid` set only via bank reconciliation | Matches accrual of dividend liability (BNR ↓, dividendes à payer ↑) before cash outflow; draft for CPA review | Agent |
| 2026-06-28 | WIP accrual policy | When `wip_accrual_enabled`, revenue recognized at month-end on unbilled time (Dr 1300 Cr 4000); invoices credit 1300 not 4000 for service amount | Aligns P&L with work performed vs billing date; optional in Settings | Agent |
| 2026-06-28 | Period close scope | Closed month blocks writes on payroll, bank, invoices, time, employee expenses, dividends, sales/corp tax, adjustments | Master data (partners, employees, settings) stays editable; reopen via Clôture de période | Agent |
| 2026-06-29 | Mock FY2026 billing | Monthly invoices from time entries; fixed forfait at delivery; 92% TTC collected (oldest first); ~150 k$ HT / 75 k$ salary / 15 k$ dividends | Solo consultant — all work invoiced, realistic AR; draft for CPA review | Agent |
| 2026-06-30 | Bilan / equity presentation | Total avoir = capital GL + BNR GL + résultat cumulatif non clôturé (comptes 4xxx/5xxx); actif inclut 1400 et amort. cumulé (1500) | P&L not auto-closed to 3100 — prior rollforward double-counted opening BNR; draft for CPA review | Agent |
| 2026-06-30 | Mock data scope | Calendar 2026 only; FYE 31 déc; opening balance 2026-01-01; prepaid insurance capitalized then amortized | Remove 2025 activity from validation; simplify period presets | Agent |
