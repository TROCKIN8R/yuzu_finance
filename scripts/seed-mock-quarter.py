#!/usr/bin/env python3
"""
Seed a mock fiscal quarter (Q1 2026: Jan–Mar) across all Yuzu Finance modules.
Draft for owner/CPA review — uses Supabase service role from app/.env.local.

Usage:
  python3 scripts/seed-mock-quarter.py           # seed (skip if tag exists)
  python3 scripts/seed-mock-quarter.py --reset   # delete prior mock data, re-seed
  python3 scripts/seed-mock-quarter.py --dry-run # print plan only
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
TAG = "[MOCK-Q1-2026]"
PERIOD_START = "2026-01-01"
PERIOD_END = "2026-03-31"
GST_RATE = 0.05
QST_RATE = 0.09975
HSF_RATE = 0.0165
CNESST_RATE = 0.01

# Québec payroll estimates — mirrors app/src/lib/payrollCalc.ts
YMPE = 71_300
QPP_BASIC_EXEMPTION = 3_500
QPP_EMPLOYEE_RATE = 0.064
QPP_EMPLOYER_RATE = 0.064
EI_MAX_INSURABLE = 65_700
EI_EMPLOYEE_RATE = 0.0164
EI_EMPLOYER_MULTIPLIER = 1.4
QPIP_MAX_INSURABLE = 98_000
QPIP_EMPLOYEE_RATE = 0.00494
QPIP_EMPLOYER_RATE = 0.00692
FEDERAL_BPA_MAX = 16_129
FEDERAL_BPA_MIN = 14_538
FEDERAL_BPA_PHASE_START = 177_882
FEDERAL_BPA_PHASE_END = 253_414
QUEBEC_BPA = 18_571
FEDERAL_BRACKETS = [(57_375, 0.15), (114_750, 0.205), (177_882, 0.26), (253_414, 0.29), (float("inf"), 0.33)]
QUEBEC_BRACKETS = [(53_255, 0.14), (106_495, 0.19), (129_590, 0.24), (float("inf"), 0.2575)]


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        val = val.strip()
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        os.environ.setdefault(key.strip(), val)


def round2(n: float) -> float:
    return round(n * 100) / 100


def progressive_tax(taxable: float, brackets: list[tuple[float, float]]) -> float:
    if taxable <= 0:
        return 0.0
    tax = 0.0
    prev = 0.0
    for limit, rate in brackets:
        chunk = min(taxable, limit) - prev
        if chunk > 0:
            tax += chunk * rate
        prev = limit
        if taxable <= limit:
            break
    return tax


def federal_bpa(net_income: float) -> float:
    if net_income <= FEDERAL_BPA_PHASE_START:
        return FEDERAL_BPA_MAX
    if net_income >= FEDERAL_BPA_PHASE_END:
        return FEDERAL_BPA_MIN
    additional = FEDERAL_BPA_MAX - FEDERAL_BPA_MIN
    reduction = ((net_income - FEDERAL_BPA_PHASE_START) / (FEDERAL_BPA_PHASE_END - FEDERAL_BPA_PHASE_START)) * additional
    return FEDERAL_BPA_MAX - reduction


def income_tax_with_credit(income: float, brackets: list[tuple[float, float]], basic: float) -> float:
    if income <= 0:
        return 0.0
    lowest = brackets[0][1]
    return max(0.0, progressive_tax(income, brackets) - basic * lowest)


def calc_payroll(yearly_salary: float, periods: int = 26, extra_taxable_annual: float = 0.0) -> dict[str, float]:
    gross = round2(yearly_salary / periods)
    tax_income = yearly_salary + extra_taxable_annual
    qpp_base = yearly_salary + extra_taxable_annual
    pensionable = max(0.0, min(qpp_base, YMPE) - QPP_BASIC_EXEMPTION)
    cpp_employee = round2((pensionable * QPP_EMPLOYEE_RATE) / periods)
    cpp_employer = round2((pensionable * QPP_EMPLOYER_RATE) / periods)
    ei_insurable = min(qpp_base, EI_MAX_INSURABLE)
    ei_employee = round2((ei_insurable * EI_EMPLOYEE_RATE) / periods)
    ei_employer = round2((ei_insurable * EI_EMPLOYEE_RATE * EI_EMPLOYER_MULTIPLIER) / periods)
    qpip_insurable = min(qpp_base, QPIP_MAX_INSURABLE)
    qpip_employee = round2((qpip_insurable * QPIP_EMPLOYEE_RATE) / periods)
    qpip_employer = round2((qpip_insurable * QPIP_EMPLOYER_RATE) / periods)
    federal = round2(income_tax_with_credit(tax_income, FEDERAL_BRACKETS, federal_bpa(tax_income)) / periods)
    provincial = round2(income_tax_with_credit(tax_income, QUEBEC_BRACKETS, QUEBEC_BPA) / periods)
    net = round2(gross - federal - provincial - cpp_employee - ei_employee - qpip_employee)
    return {
        "gross_pay": gross,
        "federal_tax": federal,
        "provincial_tax": provincial,
        "cpp_employee": cpp_employee,
        "ei_employee": ei_employee,
        "qpip_employee": qpip_employee,
        "cpp_employer": cpp_employer,
        "ei_employer": ei_employer,
        "qpip_employer": qpip_employer,
        "net_pay": net,
        "hsf_employer": round2(gross * HSF_RATE),
        "cnesst_employer": round2(gross * CNESST_RATE),
    }


def calculate_employer_levies(gross_pay: float) -> dict[str, float]:
    return {"hsf_employer": round2(gross_pay * HSF_RATE), "cnesst_employer": round2(gross_pay * CNESST_RATE)}


def sales_tax(subtotal: float) -> dict[str, float]:
    base = round2(subtotal)
    gst = round2(base * GST_RATE)
    qst = round2((base + gst) * QST_RATE)
    return {"subtotal": base, "gst": gst, "qst": qst, "total": round2(base + gst + qst)}


def purchase_tax_from_total(total_incl: float) -> dict[str, float]:
    divisor = (1 + GST_RATE) * (1 + QST_RATE)
    subtotal = round2(total_incl / divisor)
    return sales_tax(subtotal)


class Supabase:
    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/")
        self.key = key

    def _req(self, method: str, path: str, body: Any = None, params: dict | None = None) -> Any:
        url = f"{self.base}{path}"
        if params:
            qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
            url = f"{url}?{qs}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("apikey", self.key)
        req.add_header("Authorization", f"Bearer {self.key}")
        req.add_header("Content-Type", "application/json")
        if method in ("POST", "PATCH"):
            req.add_header("Prefer", "return=representation")
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read().decode()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = e.read().decode()
            raise RuntimeError(f"{method} {path}: {e.code} {detail}") from e

    def select(self, table: str, select: str = "*", **filters: str) -> list[dict]:
        params: dict[str, str] = {"select": select}
        for k, v in filters.items():
            params[k] = v
        result = self._req("GET", f"/rest/v1/{table}", params=params)
        return result or []

    def insert(self, table: str, rows: dict | list[dict]) -> list[dict]:
        payload = rows if isinstance(rows, list) else [rows]
        result = self._req("POST", f"/rest/v1/{table}", body=payload)
        return result or []

    def update(self, table: str, match_col: str, match_val: str, patch: dict) -> None:
        self._req("PATCH", f"/rest/v1/{table}", body=patch, params={match_col: f"eq.{match_val}"})

    def delete(self, table: str, **filters: str) -> None:
        self._req("DELETE", f"/rest/v1/{table}", params=filters)

    def count(self, table: str, **filters: str) -> int:
        params = {"select": "id", **filters}
        req = urllib.request.Request(
            f"{self.base}/rest/v1/{table}?" + "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items()),
            method="HEAD",
        )
        req.add_header("apikey", self.key)
        req.add_header("Authorization", f"Bearer {self.key}")
        req.add_header("Prefer", "count=exact")
        with urllib.request.urlopen(req) as resp:
            cr = resp.headers.get("Content-Range", "*/0")
            return int(cr.split("/")[-1])

    def list_users(self) -> list[dict]:
        result = self._req("GET", "/auth/v1/admin/users", params={"per_page": "10"})
        return result.get("users", []) if isinstance(result, dict) else []


import urllib.parse  # noqa: E402


def pay_period_range(payment_date: str) -> tuple[str, str]:
    end = date.fromisoformat(payment_date)
    start = end - timedelta(days=13)
    return start.isoformat(), end.isoformat()


def existing_mock(sb: Supabase, user_id: str) -> bool:
    rows = sb.select("partners", "id,notes", user_id=f"eq.{user_id}")
    return any(TAG in (r.get("notes") or "") for r in rows)


def reset_mock(sb: Supabase, user_id: str) -> None:
    uid = f"eq.{user_id}"
    # Delete in FK-safe order (all rows for this user on --reset)
    for t in [
        "bank_transactions", "dividend_allocations", "payments", "invoice_line_items",
        "fiscal_period_closes", "accounting_adjustments",
    ]:
        try:
            sb.delete(t, user_id=uid)
        except RuntimeError as e:
            print(f"  skip {t}: {e}")

    for te in sb.select("time_entries", "id", user_id=uid):
        sb.update("time_entries", "id", te["id"], {"invoice_id": None})
    for p in sb.select("projects", "id", user_id=uid):
        sb.update("projects", "id", p["id"], {"invoice_id": None})

    for t in [
        "dividends", "payroll_runs", "employee_expenses", "expenses", "time_entries",
        "invoices", "projects", "shareholders", "employees", "partners",
        "sales_tax_periods", "corporate_tax_records",
    ]:
        try:
            sb.delete(t, user_id=uid)
        except RuntimeError as e:
            print(f"  skip {t}: {e}")
    print("Cleared user transactional data for re-seed.")


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

    # --- Settings ---
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
                "opening_cash_balance": 25000,
                "opening_retained_earnings": 15000,
                "opening_balance_date": "2025-12-31",
                "share_capital": 100,
                "hsf_rate": HSF_RATE,
                "cnesst_rate": CNESST_RATE,
                "wip_accrual_enabled": True,
            },
            params={"user_id": f"eq.{user_id}"},
        )
    print("Updated organization_settings")

    # --- Partners ---
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

    # --- Employee + shareholder ---
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

    # --- Projects ---
    projects = ins("projects", [
        {"partner_id": acme["id"], "name": "ERP Migration Phase 1", "status": "active",
         "default_hourly_rate": 145, "billing_type": "hourly", "notes": TAG},
        {"partner_id": acme["id"], "name": "Security Audit", "status": "completed",
         "default_hourly_rate": 160, "billing_type": "hourly", "notes": TAG},
        {"partner_id": northwind["id"], "name": "API Integration (fixed)", "status": "active",
         "default_hourly_rate": 0, "billing_type": "fixed", "fixed_price": 12000, "notes": TAG},
    ])
    proj_erp, proj_audit, proj_fixed = projects

    # --- Time entries (Jan–Mar, weekdays) ---
    time_specs = [
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
    ]
    time_rows = [
        {"project_id": pid, "employee_id": emp["id"], "entry_date": d, "hours": h,
         "description": desc, "billable": True}
        for pid, d, h, desc in time_specs
    ]
    time_entries = ins("time_entries", time_rows)

    # --- Invoices ---
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

    jan_entries = [e for e in time_entries if e["entry_date"] < "2026-02-01" and e["project_id"] == proj_erp["id"]]
    feb_entries = [e for e in time_entries if "2026-02" in e["entry_date"] and e["project_id"] == proj_erp["id"]]
    audit_entries = [e for e in time_entries if e["project_id"] == proj_audit["id"]]

    inv1_lines = invoice_lines_for_entries(jan_entries, 145)
    inv1_tot = {k: round2(sum(l[k] for l in inv1_lines)) for k in ("subtotal", "gst", "qst", "total")}
    inv2_lines = invoice_lines_for_entries(feb_entries, 145)
    inv2_tot = {k: round2(sum(l[k] for l in inv2_lines)) for k in ("subtotal", "gst", "qst", "total")}
    inv3_lines = invoice_lines_for_entries(audit_entries, 160)
    inv3_tot = {k: round2(sum(l[k] for l in inv3_lines)) for k in ("subtotal", "gst", "qst", "total")}
    inv4_sub = 12000
    inv4_tax = sales_tax(inv4_sub)

    invoices = ins("invoices", [
        {"partner_id": acme["id"], "invoice_number": "YUZU-2026-0001", "invoice_date": "2026-01-31",
         "due_date": "2026-03-02", "include_sales_tax": True, "status": "paid", "notes": TAG, **inv1_tot},
        {"partner_id": acme["id"], "invoice_number": "YUZU-2026-0002", "invoice_date": "2026-02-28",
         "due_date": "2026-03-30", "include_sales_tax": True, "status": "paid", "notes": TAG, **inv2_tot},
        {"partner_id": acme["id"], "invoice_number": "YUZU-2026-0003", "invoice_date": "2026-02-05",
         "due_date": "2026-03-07", "include_sales_tax": True, "status": "paid", "notes": TAG, **inv3_tot},
        {"partner_id": northwind["id"], "invoice_number": "YUZU-2026-0004", "invoice_date": "2026-03-15",
         "due_date": "2026-03-30", "include_sales_tax": True, "status": "partial", "notes": TAG, **inv4_tax},
    ])
    inv1, inv2, inv3, inv4 = invoices

    for e in jan_entries:
        if not dry_run:
            sb.update("time_entries", "id", e["id"], {"invoice_id": inv1["id"]})
    for e in feb_entries:
        if not dry_run:
            sb.update("time_entries", "id", e["id"], {"invoice_id": inv2["id"]})
    for e in audit_entries:
        if not dry_run:
            sb.update("time_entries", "id", e["id"], {"invoice_id": inv3["id"]})

    all_line_payloads = []
    for inv, lines in [(inv1, inv1_lines), (inv2, inv2_lines), (inv3, inv3_lines)]:
        for ln in lines:
            all_line_payloads.append({**ln, "invoice_id": inv["id"]})
    all_line_payloads.append({
        "invoice_id": inv4["id"], "project_id": proj_fixed["id"], "time_entry_id": None,
        "line_date": "2026-03-15", "description": "API Integration — forfait", "quantity": 1,
        "unit_label": "forfait", "unit_price": inv4_sub, "sort_order": 0, **inv4_tax,
    })
    ins("invoice_line_items", all_line_payloads)

    payments = ins("payments", [
        {"invoice_id": inv1["id"], "payment_date": "2026-02-14", "amount": inv1_tot["total"],
         "method": "virement", "reference": "EFT-ACME-001", "notes": TAG},
        {"invoice_id": inv2["id"], "payment_date": "2026-03-18", "amount": inv2_tot["total"],
         "method": "virement", "reference": "EFT-ACME-002", "notes": TAG},
        {"invoice_id": inv3["id"], "payment_date": "2026-02-20", "amount": inv3_tot["total"],
         "method": "chèque", "reference": "CHQ-8842", "notes": TAG},
        {"invoice_id": inv4["id"], "payment_date": "2026-03-20", "amount": round2(inv4_tax["total"] * 0.5),
         "method": "virement", "reference": "EFT-NW-001", "notes": f"{TAG} partial"},
    ])
    pay1, pay2, pay3, pay4 = payments

    # --- Employee expenses ---
    ee_specs = [
        ("2026-01-18", "Uber", "travel", "Client site visit", 28.50, False, None),
        ("2026-02-04", "Staples", "office", "Printer supplies", 67.89, False, None),
        ("2026-02-20", "Restaurant Biz", "travel", "Client lunch (taxable)", 85.00, True, None),
        ("2026-03-10", "Amazon", "software", "USB-C hub", 45.99, False, None),
    ]
    ee_rows = []
    for d, vendor, cat, desc, total_incl, taxable, payroll_id in ee_specs:
        tax = purchase_tax_from_total(total_incl)
        ee_rows.append({
            "employee_id": emp["id"], "expense_date": d, "vendor": vendor, "category": cat,
            "description": desc, "amount": tax["subtotal"], "gst": tax["gst"], "qst": tax["qst"],
            "total": tax["total"], "taxable": taxable, "payroll_run_id": payroll_id, "notes": TAG,
        })
    employee_expenses = ins("employee_expenses", ee_rows)
    ee_uber, ee_staples, ee_lunch, ee_amazon = employee_expenses

    # --- Payroll (6 biweekly runs) ---
    pay_dates = ["2026-01-10", "2026-01-24", "2026-02-07", "2026-02-21", "2026-03-07", "2026-03-21"]
    payroll_runs = []
    reimb_map: dict[str, list[str]] = {
        "2026-01-24": [ee_uber["id"]],
        "2026-02-21": [ee_staples["id"], ee_lunch["id"]],
    }
    for i, pd in enumerate(pay_dates):
        start, end = pay_period_range(pd)
        reimb_ids = reimb_map.get(pd, [])
        taxable_reimb = sum(
            float(e["amount"]) for rid in reimb_ids
            for e in employee_expenses if e["id"] == rid and e["taxable"]
        )
        non_tax_reimb = sum(
            float(e["total"]) for rid in reimb_ids
            for e in employee_expenses if e["id"] == rid and not e["taxable"]
        )
        calc = calc_payroll(95000, 26, taxable_reimb * 26 if taxable_reimb else 0.0)
        gross = round2(calc["gross_pay"] + taxable_reimb)
        net = round2(calc["net_pay"] + non_tax_reimb)
        levies = calculate_employer_levies(gross)
        remitted = i < 4  # first 4 remitted
        rows = ins("payroll_runs", [{
            "employee_id": emp["id"], "pay_period_start": start, "pay_period_end": end,
            "payment_date": pd, "gross_pay": gross, "net_pay": net,
            "reimbursement_total": round2(taxable_reimb + non_tax_reimb),
            "remittance_status": "remitted" if remitted else "pending",
            "remittance_date": pd if remitted else None,
            "remittance_reference": f"RP-{pd}" if remitted else None,
            "employer_benefits": 125.00,
            "notes": TAG,
            **{k: calc[k] for k in calc if k not in ("gross_pay", "net_pay", "hsf_employer", "cnesst_employer")},
            **levies,
        }])
        pr = rows[0]
        payroll_runs.append(pr)
        if not dry_run:
            for rid in reimb_ids:
                sb.update("employee_expenses", "id", rid, {"payroll_run_id": pr["id"]})

    # --- Company expenses (all categories) ---
    exp_specs = [
        ("2026-01-05", cloudhost["legal_name"], "software", "Hosting Jan–Mar", 299.00),
        ("2026-01-12", "WeWork", "office", "Coworking pass", 450.00),
        ("2026-01-28", "Air Canada", "travel", "YYZ client trip", 612.45),
        ("2026-02-08", "CPA Demo & Associés", "professional", "Tax advisory", 850.00),
        ("2026-02-15", "LinkedIn", "marketing", "Recruiting ad", 199.00),
        ("2026-03-01", "Revenu Québec", "payroll", "RP remittance (manual)", 4200.00),
        ("2026-03-12", "Misc Supplies", "other", "General office", 78.25),
    ]
    expenses = ins("expenses", [
        {"expense_date": d, "vendor": v, "category": c, "description": desc,
         "amount": purchase_tax_from_total(amt)["subtotal"],
         "gst": purchase_tax_from_total(amt)["gst"],
         "qst": purchase_tax_from_total(amt)["qst"],
         "total": purchase_tax_from_total(amt)["total"],
         "paid": True, "notes": TAG}
        for d, v, c, desc, amt in exp_specs
    ])

    # --- Dividend ---
    div_amount = 5000.00
    dividends = ins("dividends", [{
        "declared_date": "2026-03-25", "payment_date": "2026-03-28", "status": "paid",
        "total_amount": div_amount, "paid_amount": div_amount,
        "employee_count": 1, "amount_per_employee": div_amount,
        "description": "Q1 interim dividend", "notes": TAG,
    }])
    div = dividends[0]
    ins("dividend_allocations", [{
        "dividend_id": div["id"], "shareholder_id": shareholders[0]["id"],
        "employee_id": emp["id"], "amount": div_amount,
    }])

    # --- Sales tax period Q1 ---
    # Compute from seeded data
    rev_invoices = [inv1, inv2, inv3, inv4]
    gst_col = round2(sum(float(i["gst"]) for i in rev_invoices))
    qst_col = round2(sum(float(i["qst"]) for i in rev_invoices))
    all_exp = expenses + [e for e in employee_expenses]
    gst_itc = round2(sum(float(e["gst"]) for e in all_exp))
    qst_itr = round2(sum(float(e["qst"]) for e in all_exp))
    sales_tax_periods = ins("sales_tax_periods", [{
        "period_start": PERIOD_START, "period_end": PERIOD_END, "filing_due_date": "2026-04-30",
        "gst_collected": gst_col, "qst_collected": qst_col,
        "gst_itc": gst_itc, "qst_itr": qst_itr,
        "gst_net": round2(gst_col - gst_itc), "qst_net": round2(qst_col - qst_itr),
        "status": "filed", "filed_date": "2026-04-15", "notes": TAG,
    }])
    stp = sales_tax_periods[0]

    # --- Corporate tax ---
    corp_tax = ins("corporate_tax_records", [{
        "fiscal_year": "FY2026", "label": "Acompte provisionnel T2", "tax_authority": "CRA",
        "due_date": "2026-03-31", "amount": 3500, "paid_amount": 3500,
        "paid_date": "2026-03-28", "status": "paid", "notes": TAG,
    }])[0]

    # --- Accounting adjustments ---
    ins("accounting_adjustments", [
        {"adjustment_type": "prepaid", "description": "Assurance responsabilité annuelle",
         "start_date": "2026-01-01", "end_date": "2026-12-31", "total_amount": 2400,
         "monthly_amount": 200, "debit_account": "1300", "credit_account": "5100", "notes": TAG},
        {"adjustment_type": "accrual", "description": "Bonus annuel provisionné",
         "start_date": "2026-03-31", "total_amount": 5000,
         "debit_account": "5100", "credit_account": "2050", "notes": TAG},
        {"adjustment_type": "depreciation", "description": "Matériel informatique — 3 ans",
         "start_date": "2026-01-01", "end_date": "2028-12-31", "total_amount": 3600,
         "monthly_amount": 100, "debit_account": "5200", "credit_account": "1500", "notes": TAG},
    ])

    # --- Bank transactions (matched to all categories) ---
    def bank_row(d: str, desc: str, amount: float, source: str, match_id: str | None, fmt: str = "chequing"):
        return {
            "transaction_date": d, "description": desc, "amount": amount,
            "reconciled": match_id is not None, "match_source": source if match_id else None,
            "match_id": match_id, "source_format": fmt, "import_key": f"mock-{d}-{abs(amount)}-{desc[:12]}",
            "notes": TAG,
        }

    pr0 = payroll_runs[0]
    pr_remittance = payroll_runs[3]
    bank_rows = [
        bank_row("2026-02-14", "Virement Acme Consulting", inv1_tot["total"], "payment", pay1["id"]),
        bank_row("2026-03-18", "Virement Acme Consulting", inv2_tot["total"], "payment", pay2["id"]),
        bank_row("2026-02-20", "Dépôt chèque Acme", inv3_tot["total"], "payment", pay3["id"]),
        bank_row("2026-03-20", "Virement Northwind (partiel)", round2(inv4_tax["total"] * 0.5), "payment", pay4["id"]),
        bank_row("2026-01-05", "CloudHost Pro", -299.00, "expense", expenses[0]["id"]),
        bank_row("2026-01-10", "Paie Alex Demo", -float(pr0["net_pay"]), "payroll", pr0["id"]),
        bank_row("2026-02-07", "Remise RP Revenu Québec", -4200.00, "payroll", pr_remittance["id"]),
        bank_row("2026-03-28", "Dividende Alex Demo", -div_amount, "dividend", div["id"]),
        bank_row("2026-04-16", "TPS/TVQ remise Q1", -(float(stp["gst_net"]) + float(stp["qst_net"])), "sales_tax", stp["id"]),
        bank_row("2026-03-28", "Acompte T2 CRA", -3500, "corporate_tax", corp_tax["id"]),
        bank_row("2026-01-12", "WeWork coworking", -450.00, "expense", expenses[1]["id"]),
        bank_row("2026-02-15", "LinkedIn Ads", -199.00, "expense", expenses[4]["id"], "credit_card"),
        bank_row("2026-01-02", "Solde d'ouverture mock", 25000, "manual", None),
    ]
    ins("bank_transactions", bank_rows)

    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed mock Q1 2026 data")
    parser.add_argument("--reset", action="store_true", help="Delete prior mock data first")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without writing")
    args = parser.parse_args()

    load_env(ROOT / "app" / ".env.local")
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in app/.env.local", file=sys.stderr)
        return 1

    sb = Supabase(url, key)
    users = sb.list_users()
    if not users:
        print("No auth users found — sign in via the app once to create your account.", file=sys.stderr)
        return 1
    user_id = users[0]["id"]
    print(f"User: {user_id[:8]}…")

    if existing_mock(sb, user_id) and not args.reset and not args.dry_run:
        print(f"Mock data already exists ({TAG}). Use --reset to replace.")
        return 0

    if args.reset and not args.dry_run:
        reset_mock(sb, user_id)

    print(f"\n=== Seeding mock quarter {PERIOD_START} → {PERIOD_END} {TAG} ===\n")
    counts = seed(user_id, sb, dry_run=args.dry_run)

    print("\n--- Records created ---")
    for table, n in sorted(counts.items()):
        print(f"  {table}: {n}")
    total = sum(counts.values())
    print(f"\nTotal rows: {total}")
    if args.dry_run:
        print("\n(dry-run — nothing written)")
    else:
        print("\nDone. Open the app and filter by Q1 2026 to review.")
        print("Draft for owner/CPA review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
