import type { ReactNode } from 'react'
import { formatCad } from '../lib/format'
import { areAmountsHidden, MASKED_CAD } from '../lib/amountPrivacy'
import type { EquityBreakdown, MonthlySeriesPoint } from '../lib/dashboardSeries'

const PAD = { top: 16, right: 12, bottom: 36, left: 48 }
const CHART_H = 200

function compactCad(n: number) {
  if (areAmountsHidden()) return MASKED_CAD
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M $`
  if (abs >= 10_000) return `${(n / 1_000).toFixed(0)}k $`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k $`
  return `${Math.round(n)} $`
}

function ChartShell({
  title,
  subtitle,
  children,
  legend,
  compact = false,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  legend?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={`bg-white border border-border rounded-xl h-full flex flex-col ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>
      <div className={compact ? 'mb-2' : 'mb-3'}>
        <h3 className="font-semibold text-sm">{title}</h3>
        {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className={`flex-1 ${compact ? 'min-h-[160px]' : 'min-h-[200px]'}`}>{children}</div>
      {legend && <div className={`flex flex-wrap gap-3 text-xs text-muted ${compact ? 'mt-1.5' : 'mt-2'}`}>{legend}</div>}
    </div>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-sm text-muted border border-dashed border-border rounded-lg">
      {message}
    </div>
  )
}

function scaleLinear(values: number[], minPadding = 0.08) {
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const pad = span * minPadding
  return { min: min - pad, max: max + pad, span: span + pad * 2 || 1 }
}

function xPos(i: number, n: number, width: number) {
  if (n <= 1) return width / 2
  return (i / (n - 1)) * width
}

function yPos(v: number, min: number, span: number, height: number) {
  return height - ((v - min) / span) * height
}

function gridLines(min: number, max: number, height: number, width: number) {
  const ticks = 4
  const lines = []
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks
    const y = yPos(v, min, max - min || 1, height)
    lines.push(
      <g key={i}>
        <line x1={0} y1={y} x2={width} y2={y} stroke="#e7e5e4" strokeWidth={1} />
        <text x={-6} y={y + 4} textAnchor="end" className="fill-stone-400" fontSize={9}>
          {compactCad(v)}
        </text>
      </g>
    )
  }
  return lines
}

export function RevenueTrendChart({
  points,
  cumulative = false,
  compact = false,
}: {
  points: MonthlySeriesPoint[]
  cumulative?: boolean
  compact?: boolean
}) {
  if (points.length === 0) return <EmptyChart message="Pas assez de données" />
  const invoiced = points.map((p) => p.invoicedRevenue)
  const worked = points.map((p) => p.workedRevenue)
  const collected = points.map((p) => p.cashIn)
  if (invoiced.every((v) => v === 0) && worked.every((v) => v === 0) && collected.every((v) => v === 0)) {
    return <EmptyChart message="Aucun revenu sur la période" />
  }

  const values = [...invoiced, ...worked, ...collected]
  const width = 560
  const chartH = compact ? 168 : CHART_H
  const pad = compact ? { top: 12, right: 10, bottom: 28, left: 44 } : PAD
  const innerW = width - pad.left - pad.right
  const innerH = chartH - pad.top - pad.bottom
  const { min, max, span } = scaleLinear(values)

  const linePath = (data: number[]) =>
    data
      .map((v, i) => {
        const x = pad.left + xPos(i, points.length, innerW)
        const y = pad.top + yPos(v, min, span, innerH)
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ')

  const invoicedPath = linePath(invoiced)
  const workedPath = linePath(worked)
  const collectedPath = linePath(collected)

  return (
    <ChartShell
      compact={compact}
      title="Prestations vs facturation"
      subtitle={
        cumulative
          ? 'Cumul — réalisé, facturé (HT) et encaissé'
          : 'Réalisé, facturé (HT) et encaissé par mois'
      }
      legend={
        <>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-sky-600" /> Prestations
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-yuzu" /> Facturé
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-emerald-600" /> Encaissé
          </span>
        </>
      }
    >
      <svg viewBox={`0 0 ${width} ${chartH}`} className="w-full h-auto" role="img" aria-label="Prestations vs facturation">
        <g transform={`translate(0, ${pad.top})`}>
          {gridLines(min, max, innerH, innerW).map((g) => (
            <g key={g.key} transform={`translate(${pad.left}, 0)`}>
              {g}
            </g>
          ))}
        </g>
        <path d={workedPath} fill="none" stroke="#0284c7" strokeWidth={2} strokeLinejoin="round" strokeDasharray="5 3" />
        <path d={invoicedPath} fill="none" stroke="#e5a817" strokeWidth={2.5} strokeLinejoin="round" />
        <path d={collectedPath} fill="none" stroke="#059669" strokeWidth={2} strokeLinejoin="round" strokeDasharray="2 2" />
        {points.map((p, i) => {
          const x = pad.left + xPos(i, points.length, innerW)
          const show = points.length <= 6 || i % Math.ceil(points.length / 6) === 0 || i === points.length - 1
          if (!show) return null
          return (
            <text key={p.month} x={x} y={chartH - 6} textAnchor="middle" className="fill-stone-500" fontSize={9}>
              {p.label}
            </text>
          )
        })}
      </svg>
    </ChartShell>
  )
}

export function ProfitabilityChart({ points }: { points: MonthlySeriesPoint[] }) {
  if (points.length === 0) return <EmptyChart message="Pas assez de données" />
  const hasData = points.some((p) => p.invoicedRevenue !== 0 || p.payrollCost !== 0 || p.operatingExpenses !== 0)
  if (!hasData) return <EmptyChart message="Aucune donnée de rentabilité" />

  const maxVal = Math.max(
    ...points.flatMap((p) => [p.invoicedRevenue, p.payrollCost + p.operatingExpenses, Math.abs(p.operatingIncome)]),
    1
  )
  const barGroupW = Math.min(52, 480 / points.length)
  const barW = barGroupW * 0.22
  const width = Math.max(320, points.length * (barGroupW + 8) + PAD.left + PAD.right)
  const innerH = CHART_H - PAD.top - PAD.bottom

  return (
    <ChartShell
      title="Rentabilité d'exploitation"
      subtitle="Revenus facturés (date facture), coûts et résultat GL par mois"
      legend={
        <>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-yuzu" /> Revenus
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-orange-400" /> Coûts
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-violet-500" /> Résultat
          </span>
        </>
      }
    >
      <svg viewBox={`0 0 ${width} ${CHART_H}`} className="w-full h-auto" role="img" aria-label="Rentabilité">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PAD.top + innerH * (1 - t)
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={width - PAD.right} y2={y} stroke="#e7e5e4" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" className="fill-stone-400" fontSize={9}>
                {compactCad(maxVal * t)}
              </text>
            </g>
          )
        })}
        {points.map((p, i) => {
          const gx = PAD.left + i * (barGroupW + 8) + barGroupW / 2
          const baseY = PAD.top + innerH
          const revH = (p.invoicedRevenue / maxVal) * innerH
          const costH = ((p.payrollCost + p.operatingExpenses) / maxVal) * innerH
          const opH = (Math.abs(p.operatingIncome) / maxVal) * innerH
          const opY = p.operatingIncome >= 0 ? baseY - opH : baseY
          return (
            <g key={p.month}>
              <rect x={gx - barW * 1.5 - 2} y={baseY - revH} width={barW} height={revH || 0} rx={2} fill="#e5a817" />
              <rect x={gx - barW / 2} y={baseY - costH} width={barW} height={costH || 0} rx={2} fill="#fb923c" />
              <rect x={gx + barW / 2 + 2} y={opY} width={barW} height={opH || 0} rx={2} fill={p.operatingIncome >= 0 ? '#8b5cf6' : '#f87171'} />
              {(points.length <= 8 || i % Math.ceil(points.length / 8) === 0) && (
                <text x={gx} y={CHART_H - 8} textAnchor="middle" className="fill-stone-500" fontSize={9}>
                  {p.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </ChartShell>
  )
}

export function PayrollTrendChart({ points }: { points: MonthlySeriesPoint[] }) {
  if (points.length === 0) return <EmptyChart message="Pas assez de données" />
  const values = points.map((p) => p.payrollCost)
  if (values.every((v) => v === 0)) return <EmptyChart message="Aucune paie sur la période" />

  const width = 560
  const innerW = width - PAD.left - PAD.right
  const innerH = CHART_H - PAD.top - PAD.bottom
  const { min, max, span } = scaleLinear(values)
  const linePath = points
    .map((p, i) => {
      const x = PAD.left + xPos(i, points.length, innerW)
      const y = PAD.top + yPos(p.payrollCost, min, span, innerH)
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
  const areaPath = `${linePath} L ${PAD.left + xPos(points.length - 1, points.length, innerW)} ${PAD.top + innerH} L ${PAD.left + xPos(0, points.length, innerW)} ${PAD.top + innerH} Z`

  return (
    <ChartShell title="Coût de la paie" subtitle="Salaire brut + charges patronales par mois">
      <svg viewBox={`0 0 ${width} ${CHART_H}`} className="w-full h-auto" role="img" aria-label="Coût de la paie">
        <g transform={`translate(0, ${PAD.top})`}>
          {gridLines(min, max, innerH, innerW).map((g) => (
            <g key={g.key} transform={`translate(${PAD.left}, 0)`}>
              {g}
            </g>
          ))}
        </g>
        <path d={areaPath} fill="#fff7ed" />
        <path d={linePath} fill="none" stroke="#ea580c" strokeWidth={2.5} strokeLinejoin="round" />
        {points.map((p, i) => {
          const x = PAD.left + xPos(i, points.length, innerW)
          const y = PAD.top + yPos(p.payrollCost, min, span, innerH)
          return <circle key={p.month} cx={x} cy={y} r={3.5} fill="#ea580c" />
        })}
        {points.map((p, i) => {
          const x = PAD.left + xPos(i, points.length, innerW)
          const show = points.length <= 6 || i % Math.ceil(points.length / 6) === 0 || i === points.length - 1
          if (!show) return null
          return (
            <text key={`lbl-${p.month}`} x={x} y={CHART_H - 8} textAnchor="middle" className="fill-stone-500" fontSize={9}>
              {p.label}
            </text>
          )
        })}
      </svg>
    </ChartShell>
  )
}

export function CashFlowChart({ points }: { points: MonthlySeriesPoint[] }) {
  if (points.length === 0) return <EmptyChart message="Pas assez de données" />
  const maxVal = Math.max(...points.flatMap((p) => [p.cashIn, p.cashOut]), 1)
  const barGroupW = Math.min(48, 480 / points.length)
  const barW = barGroupW * 0.35
  const width = Math.max(320, points.length * (barGroupW + 8) + PAD.left + PAD.right)
  const innerH = CHART_H - PAD.top - PAD.bottom

  return (
    <ChartShell
      title="Flux de trésorerie"
      subtitle="Encaissements vs décaissements par mois"
      legend={
        <>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-yuzu" /> Encaissements
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Décaissements
          </span>
        </>
      }
    >
      <svg viewBox={`0 0 ${width} ${CHART_H}`} className="w-full h-auto" role="img" aria-label="Flux de trésorerie">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PAD.top + innerH * (1 - t)
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={width - PAD.right} y2={y} stroke="#e7e5e4" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" className="fill-stone-400" fontSize={9}>
                {compactCad(maxVal * t)}
              </text>
            </g>
          )
        })}
        {points.map((p, i) => {
          const gx = PAD.left + i * (barGroupW + 8) + barGroupW / 2
          const inH = (p.cashIn / maxVal) * innerH
          const outH = (p.cashOut / maxVal) * innerH
          const baseY = PAD.top + innerH
          return (
            <g key={p.month}>
              <rect x={gx - barW - 1} y={baseY - inH} width={barW} height={inH || 0} rx={2} fill="#e5a817" />
              <rect x={gx + 1} y={baseY - outH} width={barW} height={outH || 0} rx={2} fill="#f87171" />
              {(points.length <= 8 || i % Math.ceil(points.length / 8) === 0) && (
                <text x={gx} y={CHART_H - 8} textAnchor="middle" className="fill-stone-500" fontSize={9}>
                  {p.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </ChartShell>
  )
}

export function CapitalChart({
  points,
  equity,
  openingCash,
}: {
  points: MonthlySeriesPoint[]
  equity: EquityBreakdown
  openingCash: number
}) {
  const cashSeries = points.reduce<{ label: string; cash: number }[]>((acc, p, i) => {
    const prev = i === 0 ? openingCash : acc[i - 1].cash
    acc.push({ label: p.label, cash: Math.round((prev + p.netCashFlow) * 100) / 100 })
    return acc
  }, [])

  const equityValues = points.map((p) => p.equity)
  const cashValues = cashSeries.map((p) => p.cash)
  const allValues = [...equityValues, ...cashValues]
  if (allValues.every((v) => v === 0)) {
    return <EmptyChart message="Configurez le capital et les soldes d'ouverture dans Paramètres" />
  }

  const width = 560
  const innerW = width - PAD.left - PAD.right
  const innerH = CHART_H - PAD.top - PAD.bottom
  const { min, span } = scaleLinear(allValues, 0.05)

  const line = (values: number[], color: string, key: string) => {
    const path = values
      .map((v, i) => {
        const x = PAD.left + xPos(i, points.length, innerW)
        const y = PAD.top + yPos(v, min, span, innerH)
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ')
    return <path key={key} d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
  }

  const total = equity.totalEquity
  const capPct = total > 0 ? (equity.shareCapital / total) * 100 : 0
  const reTotal = equity.retainedEarningsGl + equity.unclosedNetIncome
  const rePct = total > 0 ? (reTotal / total) * 100 : 100

  return (
    <ChartShell
      title="Capital et trésorerie"
      subtitle="Avoir estimé et trésorerie cumulée"
      legend={
        <>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-violet-600" /> Avoir total
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-emerald-600" /> Trésorerie
          </span>
        </>
      }
    >
      <svg viewBox={`0 0 ${width} ${CHART_H}`} className="w-full h-auto mb-3" role="img" aria-label="Capital et trésorerie">
        <g transform={`translate(0, ${PAD.top})`}>
          {gridLines(min, min + span, innerH, innerW).map((g) => (
            <g key={g.key} transform={`translate(${PAD.left}, 0)`}>
              {g}
            </g>
          ))}
        </g>
        {line(equityValues, '#7c3aed', 'equity')}
        {line(cashValues, '#059669', 'cash')}
        {points.map((p, i) => {
          const x = PAD.left + xPos(i, points.length, innerW)
          const show = points.length <= 6 || i % Math.ceil(points.length / 6) === 0 || i === points.length - 1
          if (!show) return null
          return (
            <text key={p.month} x={x} y={CHART_H - 8} textAnchor="middle" className="fill-stone-500" fontSize={9}>
              {p.label}
            </text>
          )
        })}
      </svg>
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex justify-between text-xs">
          <span className="text-muted">Avoir total (fin de période)</span>
          <span className="font-medium">{formatCad(total)}</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden flex bg-stone-100">
          {capPct > 0 && (
            <div className="bg-violet-500 h-full" style={{ width: `${capPct}%` }} title={`Capital-actions ${formatCad(equity.shareCapital)}`} />
          )}
          <div className="bg-violet-300 h-full" style={{ width: `${rePct}%` }} title={`BNR ${formatCad(reTotal)}`} />
        </div>
        <div className="flex justify-between text-[10px] text-muted">
          <span>Capital-actions {formatCad(equity.shareCapital)}</span>
          <span>BNR {formatCad(reTotal)}</span>
        </div>
      </div>
    </ChartShell>
  )
}
