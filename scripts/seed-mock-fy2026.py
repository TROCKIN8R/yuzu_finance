#!/usr/bin/env python3
"""
Seed mock calendar year 2026 (Q1–Q4) with bank–GL parity for CPA-style validation.
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
    bank_row,
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
OPENING_CASH = 25000.0


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
                "opening_retained_earnings": 15000,
                "opening_balance_date": "2025-12-31",
                "share_capital": 100,
                "hsf_rate": HSF_RATE,
                "cnesst_rate": CNESST_RATE,
                "wip_accrual_enabled": True,
                "fiscal_year_end_month": 6,
                "fiscal_year_end_day": 30,
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
        "yearly_salary": 95000, "pay_frequency": "biweekly", "active": True,
        "hire_date": "2025-01-15", "notes": f"{TAG} owner-employee",
    }])
    emp = employees[0]

    shareholders = ins("shareholders", [{
        "legal_name": "Alex Demo", "email": "alex@yuzu-demo.ca", "employee_id": emp["id"],
        "shares_held": 100, "active": True, "notes": TAG,
    }])

    projects = ins("projects", [
        {"partner_id": acme["id"], "name": "ERP Migration Phase 1", "status": "active",
         "default_hourly_rate": 145, "billing_type": "hourly", "notes": TAG},
        {"partner_id": acme["id"], "name": "Security Audit", "status": "completed",
         "default_hourly_rate": 160, "billing_type": "hourly", "notes": TAG},
        {"partner_id": northwind["id"], "name": "API Integration (fixed)", "status": "active",
         "default_hourly_rate": 0, "billing_type": "fixed", "fixed_price": 12000, "notes": TAG},
        {"partner_id": acme["id"], "name": "ERP Migration Phase 2", "status": "active",
         "default_hourly_rate": 150, "billing_type": "hourly", "notes": TAG},
    ])
    proj_erp, proj_audit, proj_fixed, proj_erp2 = projects

    time_specs = [
        # Q1
        (proj_erp["id"], "2026-01-06", 6, "Sprint planning & architecture review"),
        (proj_erp["id"], "2026-01-08", 7.5, "Data migration scripts"),
        (proj_erp["id"], "2026-01-13", 8, "Legacy ETL mapping"),
        (proj_erp["id"], "2026-01-15", 6, "Stakeholder workshop"),
        (proj_erp["id"], "2026-01-20", 7, "UAT support"),
        (proj_erp["id"], "2026-01-22", 5.5, "Bug fixes post-UAT"),
        (proj_erp["id"], "2026-02-03", 8, "Phase 1 go-live support"),
        (proj_erp["id"], "2026-02-10", 6.5, "Performance tuning"),
        (proj_erp["id"], "2026-02-17", 7, "Documentation & handoff"),
        (proj_erp["id"], "2026-03-02", 5, "Phase 2 discovery"),
        (proj_erp["id"], "2026-03-09", 6, "Requirements gathering"),
        (proj_erp["id"], "2026-03-16", 4, "Client sync"),
        (proj_audit["id"], "2026-01-27", 8, "Penetration test review"),
        (proj_audit["id"], "2026-01-29", 6, "Remediation report"),
        (proj_audit["id"], "2026-02-24", 4, "Follow-up verification"),
        (proj_fixed["id"], "2026-02-05", 3, "API spec review (internal)"),
        (proj_fixed["id"], "2026-02-12", 4, "Webhook implementation"),
        (proj_fixed["id"], "2026-03-05", 5, "Integration testing"),
        # Q2
        (proj_erp2["id"], "2026-04-07", 7, "Phase 2 sprint 1"),
        (proj_erp2["id"], "2026-04-14", 8, "Core module build"),
        (proj_erp2["id"], "2026-04-21", 6, "Integration tests"),
        (proj_erp2["id"], "2026-05-05", 7.5, "UAT cycle 2"),
        (proj_erp2["id"], "2026-05-19", 5, "Client training"),
        (proj_erp2["id"], "2026-06-02", 6, "Go-live support"),
        (proj_fixed["id"], "2026-05-12", 4, "API maintenance"),
        (proj_fixed["id"], "2026-06-18", 3, "Monitoring setup"),
        # Q3
        (proj_erp2["id"], "2026-07-08", 6, "Hypercare week 1"),
        (proj_erp2["id"], "2026-07-22", 7, "Performance fixes"),
        (proj_erp2["id"], "2026-08-05", 5.5, "Change requests"),
        (proj_erp2["id"], "2026-08-19", 6, "Security patch review"),
        (proj_erp2["id"], "2026-09-09", 8, "Quarterly review"),
        (proj_audit["id"], "2026-09-23", 4, "Annual audit follow-up"),
        # Q4
        (proj_erp2["id"], "2026-10-06", 6, "Year-end enhancements"),
        (proj_erp2["id"], "2026-10-20", 7, "Reporting module"),
        (proj_erp2["id"], "2026-11-03", 5, "Data cleanup"),
        (proj_erp2["id"], "2026-11-17", 6.5, "Client workshops"),
        (proj_erp2["id"], "2026-12-01", 4, "Handoff documentation"),
        (proj_fixed["id"], "2026-12-15", 3, "SLA review"),
    ]
    time_entries = ins("time_entries", [
        {"project_id": pid, "employee_id": emp["id"], "entry_date": d, "hours": h,
         "description": desc, "billable": True}
        for pid, d, h, desc in time_specs
    ])

    def entries_for(proj_id: str, start: str, end: str) -> list[dict]:
        return [e for e in time_entries if e["project_id"] == proj_id and start <= e["entry_date"] <= end]

    # --- Invoices ---
    inv_specs: list[tuple] = []
    q1_erp_jan = entries_for(proj_erp["id"], "2026-01-01", "2026-01-31")
    q1_erp_feb = entries_for(proj_erp["id"], "2026-02-01", "2026-02-28")
    q1_audit = entries_for(proj_audit["id"], "2026-01-01", "2026-03-31")
    inv_specs.append(("YUZU-2026-0001", acme["id"], "2026-01-31", "2026-03-02", "paid", invoice_lines_for_entries(q1_erp_jan, 145)))
    inv_specs.append(("YUZU-2026-0002", acme["id"], "2026-02-28", "2026-03-30", "paid", invoice_lines_for_entries(q1_erp_feb, 145)))
    inv_specs.append(("YUZU-2026-0003", acme["id"], "2026-02-05", "2026-03-07", "paid", invoice_lines_for_entries(q1_audit, 160)))
    inv4_tax = sales_tax(12000)
    inv_specs.append(("YUZU-2026-0004", northwind["id"], "2026-03-15", "2026-03-30", "paid", "fixed", inv4_tax, proj_fixed["id"]))
    q2_lines = invoice_lines_for_entries(entries_for(proj_erp2["id"], "2026-04-01", "2026-06-30"), 150)
    inv_specs.append(("YUZU-2026-0005", acme["id"], "2026-06-30", "2026-07-30", "paid", q2_lines))
    q3_lines = invoice_lines_for_entries(entries_for(proj_erp2["id"], "2026-07-01", "2026-09-30"), 150)
    inv_specs.append(("YUZU-2026-0006", acme["id"], "2026-09-30", "2026-10-30", "paid", q3_lines))
    q4_lines = invoice_lines_for_entries(entries_for(proj_erp2["id"], "2026-10-01", "2026-12-31"), 150)
    inv_specs.append(("YUZU-2026-0007", acme["id"], "2026-12-15", "2026-01-14", "sent", q4_lines))

    invoice_payloads = []
    line_payloads = []
    for spec in inv_specs:
        num, partner, inv_date, due, status = spec[:5]
        if spec[5] == "fixed":
            tot = spec[6]
        else:
            tot = sum_tax_fields(spec[5])
        invoice_payloads.append({
            "partner_id": partner, "invoice_number": num, "invoice_date": inv_date,
            "due_date": due, "include_sales_tax": True, "status": status, "notes": TAG, **tot,
        })

    invoices = ins("invoices", invoice_payloads)
    inv_by_num = {i["invoice_number"]: i for i in invoices}

    for spec in inv_specs:
        num = spec[0]
        inv = inv_by_num[num]
        if spec[5] == "fixed":
            tax, proj_id = spec[6], spec[7]
            line_payloads.append({
                "invoice_id": inv["id"], "project_id": proj_id, "time_entry_id": None,
                "line_date": inv["invoice_date"], "description": "API Integration — forfait",
                "quantity": 1, "unit_label": "forfait", "unit_price": tax["subtotal"],
                "sort_order": 0, **tax,
            })
        else:
            lines = spec[5]
            for ln in lines:
                line_payloads.append({**ln, "invoice_id": inv["id"]})
            for e in time_entries:
                if any(ln.get("time_entry_id") == e["id"] for ln in lines):
                    if not dry_run:
                        sb.update("time_entries", "id", e["id"], {"invoice_id": inv["id"]})

    ins("invoice_line_items", line_payloads)

    inv1 = inv_by_num["YUZU-2026-0001"]
    inv2 = inv_by_num["YUZU-2026-0002"]
    inv3 = inv_by_num["YUZU-2026-0003"]
    inv4 = inv_by_num["YUZU-2026-0004"]
    inv5 = inv_by_num["YUZU-2026-0005"]
    inv6 = inv_by_num["YUZU-2026-0006"]
    inv7 = inv_by_num["YUZU-2026-0007"]

    payments = ins("payments", [
        {"invoice_id": inv1["id"], "payment_date": "2026-02-14", "amount": float(inv1["total"]),
         "method": "virement", "reference": "EFT-ACME-001", "notes": TAG},
        {"invoice_id": inv2["id"], "payment_date": "2026-03-18", "amount": float(inv2["total"]),
         "method": "virement", "reference": "EFT-ACME-002", "notes": TAG},
        {"invoice_id": inv3["id"], "payment_date": "2026-02-20", "amount": float(inv3["total"]),
         "method": "chèque", "reference": "CHQ-8842", "notes": TAG},
        {"invoice_id": inv4["id"], "payment_date": "2026-03-20", "amount": round2(float(inv4["total"]) * 0.5),
         "method": "virement", "reference": "EFT-NW-001", "notes": f"{TAG} partial"},
        {"invoice_id": inv4["id"], "payment_date": "2026-04-25", "amount": round2(float(inv4["total"]) * 0.5),
         "method": "virement", "reference": "EFT-NW-002", "notes": f"{TAG} balance"},
        {"invoice_id": inv5["id"], "payment_date": "2026-07-22", "amount": float(inv5["total"]),
         "method": "virement", "reference": "EFT-ACME-003", "notes": TAG},
        {"invoice_id": inv6["id"], "payment_date": "2026-10-28", "amount": float(inv6["total"]),
         "method": "virement", "reference": "EFT-ACME-004", "notes": TAG},
    ])

    # --- Employee expenses ---
    ee_specs = [
        ("2026-01-18", "Uber", "travel", "Client site visit", 28.50, False),
        ("2026-02-04", "Staples", "office", "Printer supplies", 67.89, False),
        ("2026-02-20", "Restaurant Biz", "travel", "Client lunch (taxable)", 85.00, True),
        ("2026-03-10", "Amazon", "software", "USB-C hub", 45.99, False),
        ("2026-05-08", "Uber", "travel", "Client site Q2", 32.00, False),
        ("2026-08-14", "Staples", "office", "Supplies Q3", 54.25, False),
        ("2026-11-22", "Restaurant Biz", "travel", "Team lunch (taxable)", 92.00, True),
    ]
    ee_rows = []
    for d, vendor, cat, desc, total_incl, taxable in ee_specs:
        tax = purchase_tax_from_total(total_incl)
        ee_rows.append({
            "employee_id": emp["id"], "expense_date": d, "vendor": vendor, "category": cat,
            "description": desc, "amount": tax["subtotal"], "gst": tax["gst"], "qst": tax["qst"],
            "total": tax["total"], "taxable": taxable, "notes": TAG,
        })
    employee_expenses = ins("employee_expenses", ee_rows)

    reimb_schedule = {
        "2026-01-24": [0],
        "2026-02-21": [1, 2],
        "2026-03-21": [3],
        "2026-05-16": [4],
        "2026-08-22": [5],
        "2026-11-28": [6],
    }

    pay_dates = biweekly_pay_dates(2026)
    payroll_runs: list[dict] = []
    for i, pd in enumerate(pay_dates):
        start, end = pay_period_range(pd)
        reimb_idxs = reimb_schedule.get(pd, [])
        reimb_ids = [employee_expenses[j]["id"] for j in reimb_idxs]
        taxable_reimb = sum(float(employee_expenses[j]["amount"]) for j in reimb_idxs if employee_expenses[j]["taxable"])
        non_tax_reimb = sum(float(employee_expenses[j]["total"]) for j in reimb_idxs if not employee_expenses[j]["taxable"])
        calc = calc_payroll(95000, 26, taxable_reimb * 26 if taxable_reimb else 0.0)
        gross = round2(calc["gross_pay"] + taxable_reimb)
        net = payroll_net_with_reimb(gross, calc, non_tax_reimb)
        levies = calculate_employer_levies(gross)
        remitted = i < len(pay_dates) - 1  # last run pending remittance
        rows = ins("payroll_runs", [{
            "employee_id": emp["id"], "pay_period_start": start, "pay_period_end": end,
            "payment_date": pd, "gross_pay": gross, "net_pay": net,
            "reimbursement_total": round2(taxable_reimb + non_tax_reimb),
            "remittance_status": "remitted" if remitted else "pending",
            "remittance_date": (date.fromisoformat(pd) + timedelta(days=3)).isoformat() if remitted else None,
            "remittance_reference": f"RP-{pd}" if remitted else None,
            "employer_benefits": 125.00,
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
         "amount": purchase_tax_from_total(amt)["subtotal"],
         "gst": purchase_tax_from_total(amt)["gst"],
         "qst": purchase_tax_from_total(amt)["qst"],
         "total": purchase_tax_from_total(amt)["total"],
         "paid": paid, "notes": TAG}
        for d, v, c, desc, amt, paid in exp_specs
    ])

    dividends = ins("dividends", [
        {
            "declared_date": "2026-03-25", "payment_date": "2026-03-28", "status": "paid",
            "total_amount": 5000, "paid_amount": 5000, "employee_count": 1, "amount_per_employee": 5000,
            "description": "Interim dividend Q1", "notes": TAG,
        },
        {
            "declared_date": "2026-12-20", "payment_date": "2026-12-23", "status": "paid",
            "total_amount": 8000, "paid_amount": 8000, "employee_count": 1, "amount_per_employee": 8000,
            "description": "Year-end dividend", "notes": TAG,
        },
    ])
    for i, div in enumerate(dividends):
        ins("dividend_allocations", [{
            "dividend_id": div["id"], "shareholder_id": shareholders[0]["id"],
            "employee_id": emp["id"], "amount": float(div["total_amount"]),
        }])

    all_invoices = list(invoices)
    sales_tax_periods = ins("sales_tax_periods", [
        sales_tax_period("2026-01-01", "2026-03-31", "2026-04-30", "2026-04-16",
                         all_invoices, expenses, employee_expenses),
        sales_tax_period("2026-04-01", "2026-06-30", "2026-07-31", "2026-07-18",
                         all_invoices, expenses, employee_expenses),
        sales_tax_period("2026-07-01", "2026-09-30", "2026-10-31", "2026-10-20",
                         all_invoices, expenses, employee_expenses),
        sales_tax_period("2026-10-01", "2026-12-31", "2027-01-31", "2027-01-15",
                         all_invoices, expenses, employee_expenses),
    ])

    corp_tax = ins("corporate_tax_records", [
        {
            "fiscal_year": "FY2026", "label": "Acompte provisionnel T2 (mars)", "tax_authority": "CRA",
            "due_date": "2026-03-31", "amount": 3500, "paid_amount": 3500,
            "paid_date": "2026-03-28", "status": "paid", "notes": TAG,
        },
        {
            "fiscal_year": "FY2026", "label": "Acompte provisionnel T2 (déc)", "tax_authority": "CRA",
            "due_date": "2026-12-31", "amount": 4200, "paid_amount": 4200,
            "paid_date": "2026-12-28", "status": "paid", "notes": TAG,
        },
    ])

    ins("accounting_adjustments", [
        {
            "adjustment_type": "prepaid", "description": "Assurance responsabilité annuelle",
            "start_date": "2026-01-01", "end_date": "2026-12-31", "total_amount": 2400,
            "monthly_amount": 200, "debit_account": "5040", "credit_account": "1400", "notes": TAG,
        },
        {
            "adjustment_type": "accrual", "description": "Bonus annuel provisionné",
            "start_date": "2026-01-01", "end_date": "2026-12-31", "total_amount": 5000,
            "debit_account": "5100", "credit_account": "2050", "notes": TAG,
        },
        {
            "adjustment_type": "depreciation", "description": "Matériel informatique — 3 ans",
            "start_date": "2026-01-01", "end_date": "2028-12-31", "total_amount": 3600,
            "monthly_amount": 100, "debit_account": "5200", "credit_account": "1500", "notes": TAG,
        },
    ])

    # Fiscal period closes — all months of 2026
    closes = [{"period_end": month_end(2026, m), "notes": f"{TAG} month close"} for m in range(1, 13)]
    ins("fiscal_period_closes", closes)

    bank_rows = build_bank_from_operations(
        TAG, OPENING_CASH, payments, expenses, payroll_runs,
        sales_tax_periods, dividends, corp_tax,
    )
    ins("bank_transactions", bank_rows)

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
