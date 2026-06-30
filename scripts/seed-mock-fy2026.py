#!/usr/bin/env python3
"""
Seed mock calendar year 2026 — time-based billing, ~92% collected, bank–GL parity.
Draft for owner/CPA review — uses Supabase service role from app/.env.local.

Usage:
  python3 scripts/seed-mock-fy2026.py --reset
  python3 scripts/seed-mock-quarter.py --reset   # delegates here
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from seed_mock_lib import (  # noqa: E402
    CNESST_RATE,
    GST_RATE,
    HSF_RATE,
    QST_RATE,
    Supabase,
    biweekly_pay_dates,
    build_bank_from_operations,
    calc_payroll,
    calculate_employer_levies,
    load_env,
    month_end,
    pay_period_range,
    payroll_net_with_reimb,
    purchase_tax_from_total,
    reset_user_data,
    round2,
    sales_tax,
)

TAG = "[MOCK-FY2026]"
OPENING_CASH = 35_000.0
YEARLY_SALARY = 75_000.0
TARGET_REVENUE_HT = 150_000.0
FIXED_PROJECT_HT = 20_000.0
HOURLY_RATE = 175.0
AUDIT_HOURLY_RATE = 195.0
AUDIT_HOURS = 42.0
COLLECTION_RATE = 0.92
DIVIDEND_INTERIM = 5_000.0
DIVIDEND_YEAR_END = 10_000.0
EMPLOYER_BENEFITS_PER_PERIOD = 95.0

RETAINER_HOURS_YEAR = round2(
    (TARGET_REVENUE_HT - FIXED_PROJECT_HT - AUDIT_HOURS * AUDIT_HOURLY_RATE) / HOURLY_RATE
)


def month_start(year: int, month: int) -> str:
    return f"{year}-{month:02d}-01"


def add_days(iso: str, days: int) -> str:
    return (date.fromisoformat(iso) + timedelta(days=days)).isoformat()


def monthly_time_entries(
    project_id: str,
    year: int,
    hours_target: float,
    desc: str,
) -> list[tuple[str, str, float, str]]:
    specs: list[tuple[str, str, float, str]] = []
    per_month = round2(hours_target / 12)
    h1 = round2(per_month * 0.35)
    h2 = round2(per_month * 0.35)
    h3 = round2(per_month - h1 - h2)
    for m in range(1, 13):
        base = month_start(year, m)
        specs.append((project_id, add_days(base, 7), h1, f"{desc} — début de mois"))
        specs.append((project_id, add_days(base, 14), h2, f"{desc} — mi-mois"))
        specs.append((project_id, add_days(base, 21), h3, f"{desc} — fin de mois"))
    return specs


def existing_mock(sb: Supabase, user_id: str) -> bool:
    rows = sb.select("partners", "id,notes", user_id=f"eq.{user_id}")
    return any(TAG in (r.get("notes") or "") for r in rows)


def invoice_lines_for_entries(entries: list[dict], rate: float) -> list[dict]:
    lines = []
    for i, e in enumerate(entries):
        sub = round2(e["hours"] * rate)
        tax = sales_tax(sub)
        lines.append({
            "project_id": e["project_id"], "time_entry_id": e["id"],
            "line_date": e["entry_date"], "description": e["description"],
            "quantity": e["hours"], "unit_label": "h", "unit_price": rate,
            "sort_order": i, **tax,
        })
    return lines


def sum_tax_fields(lines: list[dict]) -> dict[str, float]:
    return {k: round2(sum(l[k] for l in lines)) for k in ("subtotal", "gst", "qst", "total")}


def assign_collection(invoice_plans: list[dict], rate: float = COLLECTION_RATE) -> None:
    """Oldest invoices paid first until rate × total TTC is collected."""
    invoice_plans.sort(key=lambda p: p["invoice_date"])
    total_ttc = round2(sum(p["total"] for p in invoice_plans))
    budget = round2(total_ttc * rate)
    consumed = 0.0
    for i, plan in enumerate(invoice_plans):
        inv_total = plan["total"]
        if consumed >= budget - 0.01:
            plan["paid_amount"] = 0.0
            plan["status"] = "sent"
            plan["payment_date"] = None
            continue
        room = round2(budget - consumed)
        if inv_total <= room + 0.01:
            plan["paid_amount"] = inv_total
            plan["status"] = "paid"
            consumed = round2(consumed + inv_total)
        else:
            plan["paid_amount"] = room
            plan["status"] = "partial"
            consumed = budget
        if plan["paid_amount"] > 0:
            plan["payment_date"] = add_days(plan["invoice_date"], 15 + (i % 4) * 5)


def sales_tax_period(
    start: str, end: str, due: str, filed: str,
    invoices: list[dict], expenses: list[dict], employee_expenses: list[dict],
) -> dict:
    gst_col = round2(sum(float(i["gst"]) for i in invoices if start <= i["invoice_date"] <= end))
    qst_col = round2(sum(float(i["qst"]) for i in invoices if start <= i["invoice_date"] <= end))
    all_exp = expenses + employee_expenses
    gst_itc = round2(sum(float(e["gst"]) for e in all_exp if start <= e["expense_date"] <= end))
    qst_itr = round2(sum(float(e["qst"]) for e in all_exp if start <= e["expense_date"] <= end))
    return {
        "period_start": start, "period_end": end, "filing_due_date": due,
        "gst_collected": gst_col, "qst_collected": qst_col,
        "gst_itc": gst_itc, "qst_itr": qst_itr,
        "gst_net": round2(gst_col - gst_itc), "qst_net": round2(qst_col - qst_itr),
        "status": "paid", "filed_date": filed, "notes": TAG,
    }


def seed(user_id: str, sb: Supabase, dry_run: bool = False) -> dict[str, int]:
    counts: dict[str, int] = {}

    def ins(table: str, rows: list[dict]) -> list[dict]:
        counts[table] = counts.get(table, 0) + len(rows)
        if dry_run:
            return [{**r, "id": f"dry-{table}-{i}"} for i, r in enumerate(rows)]
        out: list[dict] = []
        for r in rows:
            out.extend(sb.insert(table, {**r, "user_id": user_id}))
        return out

    if not dry_run:
        sb._req(
            "PATCH",
            "/rest/v1/organization_settings",
            body={
                "company_legal_name": "Yuzu Demo Inc.",
                "company_operating_name": "Yuzu Demo",
                "city": "Montréal",
                "province": "QC",
                "charge_gst": True,
                "charge_qst": True,
                "gst_rate": GST_RATE,
                "qst_rate": QST_RATE,
                "opening_cash_balance": OPENING_CASH,
                "opening_retained_earnings": 22000,
                "opening_balance_date": "2026-01-01",
                "share_capital": 100,
                "hsf_rate": HSF_RATE,
                "cnesst_rate": CNESST_RATE,
                "wip_accrual_enabled": True,
                "fiscal_year_end_month": 12,
                "fiscal_year_end_day": 31,
            },
            params={"user_id": f"eq.{user_id}"},
        )
    print("Updated organization_settings")

    partners = ins("partners", [
        {"legal_name": "Acme Consulting Ltée", "kind": "customer", "contact_name": "Marie Tremblay",
         "email": "marie@acme-demo.ca", "city": "Montréal", "province": "QC", "language": "fr",
         "payment_terms_days": 30, "notes": f"{TAG} client A"},
        {"legal_name": "Northwind Solutions Inc.", "kind": "customer", "contact_name": "James Lee",
         "email": "billing@northwind-demo.ca", "city": "Toronto", "province": "ON", "language": "en",
         "payment_terms_days": 15, "notes": f"{TAG} client B"},
        {"legal_name": "CloudHost Pro", "kind": "provider", "contact_name": "Support",
         "email": "invoices@cloudhost-demo.ca", "city": "Montréal", "province": "QC", "language": "fr",
         "payment_terms_days": 30, "notes": f"{TAG} supplier"},
    ])
    acme, northwind, cloudhost = partners

    employees = ins("employees", [{
        "first_name": "Alex", "last_name": "Demo", "email": "alex@yuzu-demo.ca",
        "yearly_salary": YEARLY_SALARY, "pay_frequency": "biweekly", "active": True,
        "hire_date": "2026-01-02", "notes": f"{TAG} owner-employee",
    }])
    emp = employees[0]

    shareholders = ins("shareholders", [{
        "legal_name": "Alex Demo", "email": "alex@yuzu-demo.ca", "employee_id": emp["id"],
        "shares_held": 100, "active": True, "notes": TAG,
    }])

    projects = ins("projects", [
        {"partner_id": acme["id"], "name": "Support ERP & intégrations", "status": "active",
         "default_hourly_rate": HOURLY_RATE, "billing_type": "hourly", "notes": TAG},
        {"partner_id": acme["id"], "name": "Audit de sécurité annuel", "status": "completed",
         "default_hourly_rate": AUDIT_HOURLY_RATE, "billing_type": "hourly", "notes": TAG},
        {"partner_id": northwind["id"], "name": "API Integration (forfait)", "status": "completed",
         "default_hourly_rate": 0, "billing_type": "fixed", "fixed_price": FIXED_PROJECT_HT, "notes": TAG},
    ])
    proj_retainer, proj_audit, proj_fixed = projects

    time_specs = monthly_time_entries(proj_retainer["id"], 2026, RETAINER_HOURS_YEAR, "Services professionnels")
    time_specs += [
        (proj_audit["id"], "2026-01-14", 16, "Revue architecture & menaces"),
        (proj_audit["id"], "2026-01-21", 14, "Tests d'intrusion & rapport"),
        (proj_audit["id"], "2026-02-04", 12, "Suivi remédiation"),
        (proj_fixed["id"], "2026-02-10", 6, "Spécification API (interne)"),
        (proj_fixed["id"], "2026-03-05", 8, "Implémentation webhooks"),
        (proj_fixed["id"], "2026-04-08", 5, "Tests d'intégration"),
    ]
    time_entries = ins("time_entries", [
        {"project_id": pid, "employee_id": emp["id"], "entry_date": d, "hours": h,
         "description": desc, "billable": True}
        for pid, d, h, desc in time_specs
    ])

    def entries_for(proj_id: str, start: str, end: str) -> list[dict]:
        return [e for e in time_entries if e["project_id"] == proj_id and start <= e["entry_date"] <= end]

    # --- Invoices: every hour worked is billed ---
    invoice_plans: list[dict] = []

    for m in range(1, 13):
        start = month_start(2026, m)
        end = month_end(2026, m)
        month_entries = entries_for(proj_retainer["id"], start, end)
        lines = invoice_lines_for_entries(month_entries, HOURLY_RATE)
        tot = sum_tax_fields(lines)
        invoice_plans.append({
            "number": f"YUZU-2026-{m:04d}",
            "partner_id": acme["id"],
            "invoice_date": end,
            "due_date": add_days(end, 30),
            "lines": lines,
            "line_kind": "time",
            "fixed_project_id": None,
            **tot,
        })

    audit_entries = entries_for(proj_audit["id"], "2026-01-01", "2026-02-28")
    audit_lines = invoice_lines_for_entries(audit_entries, AUDIT_HOURLY_RATE)
    invoice_plans.append({
        "number": "YUZU-2026-0013",
        "partner_id": acme["id"],
        "invoice_date": "2026-02-28",
        "due_date": "2026-03-30",
        "lines": audit_lines,
        "line_kind": "time",
        "fixed_project_id": None,
        **sum_tax_fields(audit_lines),
    })

    fixed_tax = sales_tax(FIXED_PROJECT_HT)
    invoice_plans.append({
        "number": "YUZU-2026-0014",
        "partner_id": northwind["id"],
        "invoice_date": "2026-04-15",
        "due_date": "2026-05-15",
        "lines": None,
        "line_kind": "fixed",
        "fixed_project_id": proj_fixed["id"],
        "fixed_tax": fixed_tax,
        **fixed_tax,
    })

    assign_collection(invoice_plans)

    invoices = ins("invoices", [
        {
            "partner_id": p["partner_id"],
            "invoice_number": p["number"],
            "invoice_date": p["invoice_date"],
            "due_date": p["due_date"],
            "include_sales_tax": True,
            "status": p["status"],
            "notes": TAG,
            "subtotal": p["subtotal"],
            "gst": p["gst"],
            "qst": p["qst"],
            "total": p["total"],
        }
        for p in invoice_plans
    ])
    inv_by_num = {i["invoice_number"]: i for i in invoices}

    line_payloads: list[dict] = []
    for plan in invoice_plans:
        inv = inv_by_num[plan["number"]]
        if plan["line_kind"] == "fixed":
            tax = plan["fixed_tax"]
            proj_id = plan["fixed_project_id"]
            line_payloads.append({
                "invoice_id": inv["id"], "project_id": proj_id, "time_entry_id": None,
                "line_date": plan["invoice_date"],
                "description": "Intégration API — forfait (livraison complète)",
                "quantity": 1, "unit_label": "forfait", "unit_price": tax["subtotal"],
                "sort_order": 0, **tax,
            })
            if not dry_run:
                sb.update("projects", "id", proj_id, {"invoice_id": inv["id"]})
                for e in time_entries:
                    if e["project_id"] == proj_id:
                        sb.update("time_entries", "id", e["id"], {"invoice_id": inv["id"]})
        else:
            for ln in plan["lines"]:
                line_payloads.append({**ln, "invoice_id": inv["id"]})
            if not dry_run:
                for e in time_entries:
                    if any(ln.get("time_entry_id") == e["id"] for ln in plan["lines"]):
                        sb.update("time_entries", "id", e["id"], {"invoice_id": inv["id"]})

    ins("invoice_line_items", line_payloads)

    payment_rows: list[dict] = []
    for plan in invoice_plans:
        if plan.get("paid_amount", 0) <= 0:
            continue
        inv = inv_by_num[plan["number"]]
        payment_rows.append({
            "invoice_id": inv["id"],
            "payment_date": plan["payment_date"],
            "amount": plan["paid_amount"],
            "method": "virement",
            "reference": f"EFT-{plan['number'][-4:]}",
            "notes": TAG if plan["status"] == "paid" else f"{TAG} partiel",
        })
    payments = ins("payments", payment_rows)

    ee_specs = [
        ("2026-01-18", "Uber", "travel", "Client site visit", 28.50, False),
        ("2026-02-04", "Staples", "office", "Printer supplies", 67.89, False),
        ("2026-02-20", "Restaurant Biz", "travel", "Client lunch (taxable)", 85.00, True),
        ("2026-03-10", "Amazon", "software", "USB-C hub", 45.99, False),
        ("2026-05-08", "Uber", "travel", "Client site Q2", 32.00, False),
        ("2026-08-14", "Staples", "office", "Supplies Q3", 54.25, False),
        ("2026-11-22", "Restaurant Biz", "travel", "Team lunch (taxable)", 92.00, True),
    ]
    employee_expenses = ins("employee_expenses", [
        {
            "employee_id": emp["id"], "expense_date": d, "vendor": vendor, "category": cat,
            "description": desc,
            "amount": (t := purchase_tax_from_total(amt))["subtotal"],
            "gst": t["gst"], "qst": t["qst"], "total": t["total"],
            "taxable": taxable, "notes": TAG,
        }
        for d, vendor, cat, desc, amt, taxable in ee_specs
    ])

    reimb_schedule = {
        "2026-01-24": [0], "2026-02-21": [1, 2], "2026-03-21": [3],
        "2026-05-16": [4], "2026-08-22": [5], "2026-11-28": [6],
    }

    payroll_runs: list[dict] = []
    for i, pd in enumerate(biweekly_pay_dates(2026)):
        start, end = pay_period_range(pd)
        reimb_idxs = reimb_schedule.get(pd, [])
        taxable_reimb = sum(
            float(employee_expenses[j]["amount"]) for j in reimb_idxs if employee_expenses[j]["taxable"]
        )
        non_tax_reimb = sum(
            float(employee_expenses[j]["total"]) for j in reimb_idxs if not employee_expenses[j]["taxable"]
        )
        calc = calc_payroll(YEARLY_SALARY, 26, taxable_reimb * 26 if taxable_reimb else 0.0)
        gross = round2(calc["gross_pay"] + taxable_reimb)
        net = payroll_net_with_reimb(gross, calc, non_tax_reimb)
        levies = calculate_employer_levies(gross)
        remitted = i < 25
        rows = ins("payroll_runs", [{
            "employee_id": emp["id"], "pay_period_start": start, "pay_period_end": end,
            "payment_date": pd, "gross_pay": gross, "net_pay": net,
            "reimbursement_total": round2(taxable_reimb + non_tax_reimb),
            "remittance_status": "remitted" if remitted else "pending",
            "remittance_date": (date.fromisoformat(pd) + timedelta(days=3)).isoformat() if remitted else None,
            "remittance_reference": f"RP-{pd}" if remitted else None,
            "employer_benefits": EMPLOYER_BENEFITS_PER_PERIOD,
            "notes": TAG,
            **{k: calc[k] for k in calc if k not in ("gross_pay", "net_pay", "hsf_employer", "cnesst_employer")},
            **levies,
        }])
        pr = rows[0]
        payroll_runs.append(pr)
        if not dry_run:
            for j in reimb_idxs:
                sb.update("employee_expenses", "id", employee_expenses[j]["id"], {"payroll_run_id": pr["id"]})

    exp_specs = [
        ("2026-01-05", cloudhost["legal_name"], "software", "Hosting Q1", 299.00, True),
        ("2026-01-12", "WeWork", "office", "Coworking pass", 450.00, True),
        ("2026-01-28", "Air Canada", "travel", "YYZ client trip", 612.45, True),
        ("2026-02-08", "CPA Demo & Associés", "professional", "Tax advisory", 850.00, True),
        ("2026-02-15", "LinkedIn", "marketing", "Recruiting ad", 199.00, True),
        ("2026-03-12", "Misc Supplies", "other", "General office", 78.25, True),
        ("2026-04-03", cloudhost["legal_name"], "software", "Hosting Q2", 299.00, True),
        ("2026-05-20", "WeWork", "office", "Coworking Q2", 450.00, True),
        ("2026-07-02", cloudhost["legal_name"], "software", "Hosting Q3", 299.00, True),
        ("2026-09-10", "CPA Demo & Associés", "professional", "Year-end planning", 1200.00, True),
        ("2026-10-05", cloudhost["legal_name"], "software", "Hosting Q4", 299.00, True),
        ("2026-11-18", "LinkedIn", "marketing", "Campaign Q4", 249.00, True),
        ("2026-12-02", "Assureur Demo", "professional", "Assurance annuelle (payée)", 2400.00, True),
    ]
    expenses = ins("expenses", [
        {"expense_date": d, "vendor": v, "category": c, "description": desc,
         "amount": (t := purchase_tax_from_total(amt))["subtotal"],
         "gst": t["gst"], "qst": t["qst"], "total": t["total"],
         "paid": paid, "notes": TAG}
        for d, v, c, desc, amt, paid in exp_specs
    ])

    dividends = ins("dividends", [
        {
            "declared_date": "2026-06-25", "payment_date": "2026-06-28", "status": "paid",
            "total_amount": DIVIDEND_INTERIM, "paid_amount": DIVIDEND_INTERIM,
            "employee_count": 1, "amount_per_employee": DIVIDEND_INTERIM,
            "description": "Dividende intérimaire", "notes": TAG,
        },
        {
            "declared_date": "2026-12-20", "payment_date": "2026-12-23", "status": "paid",
            "total_amount": DIVIDEND_YEAR_END, "paid_amount": DIVIDEND_YEAR_END,
            "employee_count": 1, "amount_per_employee": DIVIDEND_YEAR_END,
            "description": "Dividende de fin d'année", "notes": TAG,
        },
    ])
    for div in dividends:
        ins("dividend_allocations", [{
            "dividend_id": div["id"], "shareholder_id": shareholders[0]["id"],
            "employee_id": emp["id"], "amount": float(div["total_amount"]),
        }])

    sales_tax_periods = ins("sales_tax_periods", [
        sales_tax_period("2026-01-01", "2026-03-31", "2026-04-30", "2026-04-16",
                         invoices, expenses, employee_expenses),
        sales_tax_period("2026-04-01", "2026-06-30", "2026-07-31", "2026-07-18",
                         invoices, expenses, employee_expenses),
        sales_tax_period("2026-07-01", "2026-09-30", "2026-10-31", "2026-10-20",
                         invoices, expenses, employee_expenses),
        sales_tax_period("2026-10-01", "2026-12-31", "2027-01-31", "2027-01-15",
                         invoices, expenses, employee_expenses),
    ])

    corp_tax = ins("corporate_tax_records", [
        {
            "fiscal_year": "FY2026", "label": "Acompte provisionnel T2 (juin)", "tax_authority": "CRA",
            "due_date": "2026-06-30", "amount": 4500, "paid_amount": 4500,
            "paid_date": "2026-06-28", "status": "paid", "notes": TAG,
        },
        {
            "fiscal_year": "FY2026", "label": "Acompte provisionnel T2 (déc)", "tax_authority": "CRA",
            "due_date": "2026-12-31", "amount": 5500, "paid_amount": 5500,
            "paid_date": "2026-12-28", "status": "paid", "notes": TAG,
        },
    ])

    adjustments = ins("accounting_adjustments", [
        {
            "adjustment_type": "manual", "description": "Assurance responsabilité — paiement annuel prépayé",
            "start_date": "2026-01-01", "total_amount": 2400,
            "debit_account": "1400", "credit_account": "1010", "notes": TAG,
        },
        {
            "adjustment_type": "prepaid", "description": "Assurance responsabilité — amortissement mensuel",
            "start_date": "2026-01-01", "end_date": "2026-12-31", "total_amount": 2400,
            "monthly_amount": 200, "debit_account": "5040", "credit_account": "1400", "notes": TAG,
        },
        {
            "adjustment_type": "accrual", "description": "Bonus annuel provisionné",
            "start_date": "2026-01-01", "end_date": "2026-12-31", "total_amount": 3000,
            "debit_account": "5100", "credit_account": "2050", "notes": TAG,
        },
        {
            "adjustment_type": "depreciation", "description": "Matériel informatique — 3 ans",
            "start_date": "2026-01-01", "end_date": "2028-12-31", "total_amount": 3600,
            "monthly_amount": 100, "debit_account": "5200", "credit_account": "1500", "notes": TAG,
        },
    ])

    ins("fiscal_period_closes", [
        {"period_end": month_end(2026, m), "notes": f"{TAG} month close"} for m in range(1, 13)
    ])

    ins("bank_transactions", build_bank_from_operations(
        TAG, OPENING_CASH, payments, expenses, payroll_runs,
        sales_tax_periods, dividends, corp_tax, adjustments,
    ))

    total_ht = round2(sum(p["subtotal"] for p in invoice_plans))
    total_ttc = round2(sum(p["total"] for p in invoice_plans))
    total_paid = round2(sum(p.get("paid_amount", 0) for p in invoice_plans))
    open_ar = round2(total_ttc - total_paid)
    print(
        f"Revenu facturé: {total_ht:,.2f} $ HT · salaire {YEARLY_SALARY:,.0f} $ · "
        f"dividendes {DIVIDEND_INTERIM + DIVIDEND_YEAR_END:,.0f} $"
    )
    print(
        f"Encaissements: {total_paid:,.2f} $ / {total_ttc:,.2f} $ TTC "
        f"({round2(total_paid / total_ttc * 100) if total_ttc else 0}% · CC ouvert {open_ar:,.2f} $)"
    )
    invoiced_count = len(time_entries)
    print(f"Toutes les {invoiced_count} entrées de temps sont facturées (0 $ WIP non facturé)")

    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed mock calendar year 2026")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env(ROOT / "app" / ".env.local")
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Missing Supabase credentials in app/.env.local", file=sys.stderr)
        return 1

    sb = Supabase(url, key)
    users = sb.list_users()
    if not users:
        print("No auth users — sign in via the app once.", file=sys.stderr)
        return 1
    user_id = users[0]["id"]
    print(f"User: {user_id[:8]}…")

    if existing_mock(sb, user_id) and not args.reset and not args.dry_run:
        print(f"Mock data exists ({TAG}). Use --reset.")
        return 0

    if args.reset and not args.dry_run:
        reset_user_data(sb, user_id)

    print(f"\n=== Seeding mock FY 2026 (calendar) {TAG} ===\n")
    counts = seed(user_id, sb, dry_run=args.dry_run)
    for table, n in sorted(counts.items()):
        print(f"  {table}: {n}")
    print(f"\nTotal rows: {sum(counts.values())}")
    if not args.dry_run:
        print("\nRun: python3 scripts/fiscal-validation.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
