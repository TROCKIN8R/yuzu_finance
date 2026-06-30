"""Shared helpers for mock fiscal-year seed scripts."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path
from typing import Any

GST_RATE = 0.05
QST_RATE = 0.09975
HSF_RATE = 0.0165
CNESST_RATE = 0.01

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
        if not line or line.startswith("#") or "=" not in line:
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


def pay_period_range(payment_date: str) -> tuple[str, str]:
    end = date.fromisoformat(payment_date)
    start = end - timedelta(days=13)
    return start.isoformat(), end.isoformat()


def payroll_remit_total(pr: dict) -> float:
    lev = float(pr.get("hsf_employer") or 0) + float(pr.get("cnesst_employer") or 0)
    it = float(pr["federal_tax"]) + float(pr["provincial_tax"]) + float(pr.get("other_deductions") or 0)
    st = sum(float(pr[k]) for k in ("cpp_employee", "ei_employee", "qpip_employee", "cpp_employer", "ei_employer", "qpip_employer"))
    return round2(it + st + lev)


def biweekly_pay_dates(year: int) -> list[str]:
    """First Friday-ish pay of year, then every 14 days (26 periods)."""
    d = date(year, 1, 10)
    out: list[str] = []
    while d.year == year:
        out.append(d.isoformat())
        d += timedelta(days=14)
    return out[:26]


def month_end(year: int, month: int) -> str:
    if month == 12:
        nxt = date(year + 1, 1, 1)
    else:
        nxt = date(year, month + 1, 1)
    return (nxt - timedelta(days=1)).isoformat()


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

    def list_users(self) -> list[dict]:
        result = self._req("GET", "/auth/v1/admin/users", params={"per_page": "10"})
        return result.get("users", []) if isinstance(result, dict) else []


def reset_user_data(sb: Supabase, user_id: str) -> None:
    uid = f"eq.{user_id}"
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


def bank_row(
    tag: str,
    d: str,
    desc: str,
    amount: float,
    source: str,
    match_id: str | None,
    fmt: str = "chequing",
) -> dict:
    return {
        "transaction_date": d,
        "description": desc,
        "amount": amount,
        "reconciled": match_id is not None,
        "match_source": source if match_id else None,
        "match_id": match_id,
        "source_format": fmt,
        "import_key": f"mock-{d}-{abs(amount):.2f}-{desc[:20]}",
        "notes": tag,
    }


def payroll_net_with_reimb(gross: float, calc: dict[str, float], non_tax_reimb: float) -> float:
    """Mirrors PayrollPage calcNet + netPayWithReimbursement."""
    salary_net = round2(
        gross
        - calc["federal_tax"]
        - calc["provincial_tax"]
        - calc["cpp_employee"]
        - calc["ei_employee"]
        - calc["qpip_employee"]
    )
    return round2(salary_net + non_tax_reimb)


def build_bank_from_operations(
    tag: str,
    opening: float,
    payments: list[dict],
    expenses: list[dict],
    payroll_runs: list[dict],
    sales_tax_periods: list[dict],
    dividends: list[dict],
    corp_tax: list[dict],
    adjustments: list[dict] | None = None,
) -> list[dict]:
    rows = [bank_row(tag, "2026-01-02", "Solde d'ouverture mock", opening, "manual", None)]
    for pay in payments:
        rows.append(bank_row(tag, pay["payment_date"], "Paiement client", float(pay["amount"]), "payment", pay["id"]))
    for exp in expenses:
        if exp.get("category") == "payroll":
            continue
        if not exp.get("paid"):
            continue
        rows.append(
            bank_row(tag, exp["expense_date"], exp["vendor"], -float(exp["total"]), "expense", exp["id"])
        )
    for pr in payroll_runs:
        rows.append(bank_row(tag, pr["payment_date"], "Paie nette", -float(pr["net_pay"]), "payroll", pr["id"]))
        if pr.get("remittance_status") == "remitted" and pr.get("remittance_date"):
            rem = payroll_remit_total(pr)
            if rem > 0:
                rows.append(
                    bank_row(tag, pr["remittance_date"], "Remise RP Revenu Québec", -rem, "payroll", pr["id"])
                )
    for st in sales_tax_periods:
        if st.get("status") != "paid":
            continue
        amt = round2(float(st["gst_net"]) + float(st["qst_net"]))
        if abs(amt) < 0.01:
            continue
        rem_date = st.get("filed_date") or st["period_end"]
        rows.append(bank_row(tag, rem_date, f"TPS/TVQ {st['period_start']}", -amt, "sales_tax", st["id"]))
    for div in dividends:
        pa = float(div.get("paid_amount") or 0)
        if pa > 0 and div.get("payment_date"):
            rows.append(bank_row(tag, div["payment_date"], "Dividende", -pa, "dividend", div["id"]))
    for ct in corp_tax:
        pa = float(ct.get("paid_amount") or 0)
        if pa > 0 and ct.get("paid_date"):
            rows.append(bank_row(tag, ct["paid_date"], ct["label"], -pa, "corporate_tax", ct["id"]))
    for adj in adjustments or []:
        if adj.get("adjustment_type") != "manual":
            continue
        amt = float(adj.get("total_amount") or adj.get("monthly_amount") or 0)
        if amt <= 0:
            continue
        if adj.get("credit_account") == "1010":
            rows.append(
                bank_row(tag, adj["start_date"], adj["description"], -amt, "manual", adj.get("id"))
            )
        elif adj.get("debit_account") == "1010":
            rows.append(
                bank_row(tag, adj["start_date"], adj["description"], amt, "manual", adj.get("id"))
            )
    return rows
