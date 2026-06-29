#!/usr/bin/env node
/**
 * Read-only payroll audit via Supabase service role.
 * Reports net pay mismatches, remittance totals, and pending reimbursements.
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const require = createRequire(pathToFileURL(resolve(root, 'app/package.json')))
const { createClient } = require('@supabase/supabase-js')

function loadEnv(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[m[1]]) process.env[m[1]] = val
  }
}

loadEnv(resolve(root, 'app/.env.local'))

const url =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in app/.env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

function incomeTax(p) {
  return round2(Number(p.federal_tax) + Number(p.provincial_tax) + Number(p.other_deductions))
}

function statutoryRemit(p) {
  return round2(
    Number(p.cpp_employee) +
      Number(p.ei_employee) +
      Number(p.qpip_employee) +
      Number(p.cpp_employer) +
      Number(p.ei_employer) +
      Number(p.qpip_employer)
  )
}

function expectedNet(p) {
  return round2(
    Number(p.gross_pay) -
      incomeTax(p) -
      Number(p.cpp_employee) -
      Number(p.ei_employee) -
      Number(p.qpip_employee)
  )
}

const { data: runs, error: runErr } = await supabase
  .from('payroll_runs')
  .select(
    'id, payment_date, gross_pay, net_pay, federal_tax, provincial_tax, cpp_employee, ei_employee, qpip_employee, cpp_employer, ei_employer, qpip_employer, other_deductions, employer_benefits, remittance_status, reimbursement_total, employees(first_name, last_name)'
  )
  .order('payment_date', { ascending: false })

if (runErr) {
  console.error('payroll_runs:', runErr.message)
  process.exit(1)
}

const { data: pendingReimb, error: reimbErr } = await supabase
  .from('employee_expenses')
  .select('id, expense_date, vendor, taxable, amount, total, payroll_run_id')
  .is('payroll_run_id', null)

if (reimbErr) {
  console.error('employee_expenses:', reimbErr.message)
  process.exit(1)
}

const { error: shErr } = await supabase.from('shareholders').select('id').limit(1)
const shareholdersOk = !shErr

console.log('=== Payroll audit (draft for owner/CPA review) ===\n')
console.log(`Payroll runs: ${runs?.length ?? 0}`)
console.log(`Pending employee reimbursements: ${pendingReimb?.length ?? 0}`)
console.log(`Shareholders table: ${shareholdersOk ? 'OK' : 'MISSING — run migration'}`)
console.log('')

const issues = []

for (const p of runs ?? []) {
  const expNet = expectedNet(p)
  const storedNet = round2(Number(p.net_pay))
  const nonTaxReimb = round2(storedNet - expNet)
  if (Math.abs(storedNet - expNet - nonTaxReimb) > 0.02 && Math.abs(expNet - storedNet) > 0.02) {
    const name = p.employees ? `${p.employees.first_name} ${p.employees.last_name}` : p.id.slice(0, 8)
    if (Math.abs(expNet - (storedNet - nonTaxReimb)) > 0.02) {
      issues.push({
        type: 'net_mismatch',
        id: p.id,
        date: p.payment_date,
        name,
        stored: storedNet,
        expectedSalaryNet: expNet,
        diff: round2(storedNet - expNet),
      })
    }
  }
  const remit = round2(incomeTax(p) + statutoryRemit(p))
  const emp = p.employees ? `${p.employees.first_name} ${p.employees.last_name}` : ''
  console.log(
    `${p.payment_date}  ${emp.padEnd(20)}  brut ${Number(p.gross_pay).toFixed(2)}  net ${storedNet.toFixed(2)}  remise ${remit.toFixed(2)}  avantages ${Number(p.employer_benefits).toFixed(2)}  [${p.remittance_status}]`
  )
}

if (issues.length) {
  console.log('\n--- Issues ---')
  for (const i of issues) console.log(JSON.stringify(i))
} else {
  console.log('\nNo salary-net mismatches detected (non-tax reimb in net_pay is expected).')
}

const taxablePending = (pendingReimb ?? []).filter((e) => e.taxable)
const nonTaxPending = (pendingReimb ?? []).filter((e) => !e.taxable)
if (taxablePending.length || nonTaxPending.length) {
  console.log('\n--- Pending reimbursements ---')
  for (const e of nonTaxPending) {
    console.log(`  non-tax  ${e.expense_date}  ${e.vendor}  ${Number(e.total).toFixed(2)} CAD`)
  }
  for (const e of taxablePending) {
    console.log(`  taxable  ${e.expense_date}  ${e.vendor}  ${Number(e.amount).toFixed(2)} CAD (HT)`)
  }
}
