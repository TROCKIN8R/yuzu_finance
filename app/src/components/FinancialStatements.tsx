import { formatCad } from '../lib/format'
import type { FinancialSnapshot } from '../lib/financials'

export function StmtRow({
  label,
  value,
  bold,
  indent,
  negative,
}: {
  label: string
  value: string
  bold?: boolean
  indent?: boolean
  negative?: boolean
}) {
  return (
    <div
      className={`flex justify-between gap-4 py-2 border-b border-border text-sm ${bold ? 'font-semibold' : ''} ${indent ? 'pl-4' : ''}`}
    >
      <span className={bold ? 'text-ink' : 'text-muted'}>{label}</span>
      <span className={`shrink-0 ${negative ? 'text-red-700' : ''}`}>{value}</span>
    </div>
  )
}

export function StmtSection({ title }: { title: string }) {
  return <p className="text-xs text-muted mb-2 mt-4 first:mt-0 uppercase tracking-wide font-medium">{title}</p>
}

export function CashFlowStatement({ fin, periodLabel }: { fin: FinancialSnapshot; periodLabel: string }) {
  const cf = fin.cashFlow

  return (
    <div>
      <h2 className="font-semibold mb-1">Flux de trésorerie</h2>
      <p className="text-xs text-muted mb-4">{periodLabel}</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-stone-50 border border-border rounded-lg p-4">
          <div className="text-xs text-muted mb-1">Encaissements</div>
          <div className="text-lg font-semibold">{formatCad(fin.cashIn)}</div>
        </div>
        <div className="bg-stone-50 border border-border rounded-lg p-4">
          <div className="text-xs text-muted mb-1">Décaissements</div>
          <div className="text-lg font-semibold">{formatCad(fin.cashOut)}</div>
        </div>
        <div className="bg-stone-50 border border-border rounded-lg p-4">
          <div className="text-xs text-muted mb-1">Trésorerie comptable (GL)</div>
          <div className="text-lg font-semibold">{formatCad(fin.netCash)}</div>
          <div className="text-[10px] text-muted mt-1">Solde cumulatif — pas le flux net de la période</div>
        </div>
      </div>

      <StmtSection title="Encaissements" />
      <StmtRow label="Paiements clients reçus" value={formatCad(cf.clientPayments)} />

      <StmtSection title="Décaissements" />
      <StmtRow label="Dépenses payées (TTC)" value={formatCad(cf.expensesPaid)} indent negative />
      <StmtRow label="Salaire net versé aux employés" value={formatCad(cf.payrollNetToEmployee)} indent negative />
      <StmtRow label="Remises paie (retenues + cotisations employeur)" value={formatCad(cf.payrollRemittancesPaid)} indent negative />
      <StmtRow label="Remises TPS/TVQ" value={formatCad(cf.salesTaxRemitted)} indent negative />
      <StmtRow label="Impôts société payés" value={formatCad(cf.corporateTaxPaid)} indent negative />
      <StmtRow label="Dividendes payés" value={formatCad(cf.dividendsPaid)} indent negative />
      <StmtRow label="Total décaissements" value={formatCad(fin.cashOut)} bold negative />
    </div>
  )
}

export function BalanceSheetStatement({ fin, periodLabel }: { fin: FinancialSnapshot; periodLabel: string }) {
  const bs = fin.balanceSheet
  const eq = bs.equity

  return (
    <div>
      <h2 className="font-semibold mb-1">Bilan simplifié</h2>
      <p className="text-xs text-muted mb-4">{periodLabel} — soldes cumulatifs au grand livre</p>

      <StmtSection title="Actif" />
      <StmtRow label="Trésorerie comptable" value={formatCad(bs.cash)} />
      {bs.bankStatementBalance != null && (
        <StmtRow label="Solde relevé bancaire (import)" value={formatCad(bs.bankStatementBalance)} indent />
      )}
      {bs.bankReconciliationVariance != null && Math.abs(bs.bankReconciliationVariance) > 0.01 && (
        <StmtRow
          label="Écart banque vs GL (à réconcilier)"
          value={formatCad(bs.bankReconciliationVariance)}
          indent
          negative={Math.abs(bs.bankReconciliationVariance) > 100}
        />
      )}
      <StmtRow label="Comptes clients (CC)" value={formatCad(bs.accountsReceivable)} />
      {fin.billing.collectionRatePct != null && (
        <StmtRow
          label="Taux d'encaissement (factures TTC, cumulatif)"
          value={`${fin.billing.collectionRatePct.toFixed(1)} %`}
          indent
        />
      )}
      <StmtRow label="TPS à recevoir (CTI)" value={formatCad(bs.gstReceivable)} indent />
      <StmtRow label="TVQ à recevoir (RTI)" value={formatCad(bs.qstReceivable)} indent />
      {bs.unbilledRevenue !== 0 && (
        <StmtRow
          label={bs.unbilledRevenue > 0 ? 'Revenus non facturés (WIP)' : 'Ajustement WIP (constaté d\'avance)'}
          value={formatCad(bs.unbilledRevenue)}
          indent
        />
      )}
      {bs.prepaidExpenses > 0 && (
        <StmtRow label="Charges payées d\'avance" value={formatCad(bs.prepaidExpenses)} indent />
      )}
      {bs.accumDepreciation > 0 && (
        <StmtRow label="Amortissement cumulé" value={formatCad(-bs.accumDepreciation)} indent negative />
      )}
      <StmtRow label="Total actif" value={formatCad(bs.totalAssets)} bold />

      <StmtSection title="Passif" />
      <StmtRow label="Comptes fournisseurs" value={formatCad(bs.accountsPayable)} />
      {bs.employeeReimbursementsPending > 0 && (
        <StmtRow label="Remboursements employé dus" value={formatCad(bs.employeeReimbursementsPending)} indent />
      )}
      <StmtRow label="TPS à remettre" value={formatCad(bs.gstPayable)} indent />
      <StmtRow label="TVQ à remettre" value={formatCad(bs.qstPayable)} indent />
      <StmtRow label="Remises paie en attente" value={formatCad(bs.payrollRemittancesPending)} />
      {bs.chargesPayable > 0 && (
        <StmtRow label="Charges à payer (avantages employeur)" value={formatCad(bs.chargesPayable)} indent />
      )}
      {bs.employerLeviesPending > 0 && (
        <StmtRow label="HSF / CNESST à remettre" value={formatCad(bs.employerLeviesPending)} indent />
      )}
      {bs.dividendsPayable > 0 && (
        <StmtRow label="Dividendes à payer" value={formatCad(bs.dividendsPayable)} indent />
      )}
      <StmtRow label="Impôts société dus" value={formatCad(bs.corporateTaxDue)} />
      <StmtRow label="Provision impôt société" value={formatCad(bs.corpTaxProvision)} indent />
      <StmtRow label="Total passif" value={formatCad(bs.totalLiabilities)} bold />

      <StmtSection title="Avoir" />
      <StmtRow label="Capital-actions" value={formatCad(eq.shareCapital)} indent />
      <StmtRow label="BNR — solde GL (ouverture et dividendes)" value={formatCad(eq.retainedEarningsGl)} indent />
      <StmtRow label="Résultat cumulatif non clôturé" value={formatCad(eq.unclosedNetIncome)} indent />
      <StmtRow label="Total avoir" value={formatCad(eq.totalEquity)} bold />
      {Math.abs(bs.equationGap) > 0.05 && (
        <p className="text-xs text-red-700 mt-2">
          Écart bilan (actif − passif − avoir) : {formatCad(bs.equationGap)} — brouillon à réviser.
        </p>
      )}
      <p className="text-xs text-muted mt-3">
        Résultat de la période (état des résultats) : {formatCad(eq.periodOperatingIncome)}
        {eq.periodDividendsDeclared > 0
          ? ` · Dividendes déclarés : ${formatCad(eq.periodDividendsDeclared)}`
          : ''}
      </p>
    </div>
  )
}

export function IncomeStatement({ fin, periodLabel }: { fin: FinancialSnapshot; periodLabel: string }) {
  const inc = fin.income

  return (
    <div>
      <h2 className="font-semibold mb-1">État des résultats</h2>
      <p className="text-xs text-muted mb-4">{periodLabel} — revenus HT, dépenses HT, paie employeur</p>

      <StmtSection title="Revenus" />
      <StmtRow label="Revenus facturés (sous-total HT, date facture)" value={formatCad(inc.invoicedSubtotal)} />
      <StmtRow
        label="Revenus comptabilisés (GL / WIP)"
        value={formatCad(inc.revenueSubtotal)}
        indent
      />

      <StmtSection title="Charges d'exploitation" />
      <StmtRow label="Dépenses d'exploitation (HT)" value={formatCad(inc.operatingExpenses)} indent negative />
      <StmtRow label="Salaires bruts" value={formatCad(inc.payrollGross)} indent negative />
      <StmtRow label="Cotisations employeur" value={formatCad(inc.employerPayrollContributions)} indent negative />
      <StmtRow label="Résultat d'exploitation" value={formatCad(inc.operatingIncome)} bold />

      <StmtSection title="Distributions (avoir)" />
      <StmtRow label="Dividendes déclarés (période, hors P&L)" value={formatCad(inc.dividendsDistributed)} indent />
    </div>
  )
}
