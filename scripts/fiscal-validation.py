#!/usr/bin/env python3
"""
Full fiscal validation — compare subledgers vs GL logic (mirrors app/src/lib).
Draft for owner/CPA review. Read-only via Supabase service role.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
Q1 = ("2026-01-01", "2026-03-31")
FY2026 = ("2025-07-01", "2026-06-30")  # default FYE Jun 30


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


def round2(n: float) -> float:
    return round(float(n) * 100) / 100


class Supabase:
    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/")
        self.key = key

    def select(self, table: str, select: str = "*") -> list[dict]:
        req = urllib.request.Request(
            f"{self.base}/rest/v1/{table}?select={urllib.parse.quote(select)}",
            headers={"apikey": self.key, "Authorization": f"Bearer {self.key}"},
        )
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read()) or []


EXPENSE_ACCT = {
    "software": "5010", "office": "5020", "travel": "5030", "professional": "5040",
    "marketing": "5050", "payroll": "5060", "other": "5090",
}


@dataclass
class Issue:
    severity: str  # error, warn, info
    area: str
    message: str


@dataclass
class ValidationReport:
    issues: list[Issue] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)

    def add(self, severity: str, area: str, message: str) -> None:
        self.issues.append(Issue(severity, area, message))


def is_revenue_invoice(status: str) -> bool:
    return status not in ("void", "draft")

def in_period(d: str, start: str, end: str) -> bool:
    return start <= d <= end


def payroll_income_tax(p: dict) -> float:
    return sum(float(p[k]) for k in ("federal_tax", "provincial_tax", "other_deductions"))


def payroll_statutory(p: dict) -> float:
    return sum(float(p[k]) for k in (
        "cpp_employee", "ei_employee", "qpip_employee", "cpp_employer", "ei_employer", "qpip_employer"
    ))


def payroll_levies(p: dict) -> float:
    return float(p.get("hsf_employer") or 0) + float(p.get("cnesst_employer") or 0)


def employer_contrib(p: dict) -> float:
    return (
        float(p["cpp_employer"]) + float(p["ei_employer"]) + float(p["qpip_employer"])
        + float(p["employer_benefits"]) + payroll_levies(p)
    )


def entry_balance(lines: list[tuple[str, float, float]]) -> float:
    return round2(sum(d for _, d, _ in lines) - sum(c for _, _, c in lines))


def build_gl_entries(data: dict) -> tuple[list[dict], dict[str, float]]:
    """Simplified GL mirror of app/src/lib/generalLedger.ts"""
    settings = data["settings"][0] if data["settings"] else {}
    wip = bool(settings.get("wip_accrual_enabled"))
    entries: list[dict] = []
    acct_bal: dict[str, float] = {}

    def post(eid: str, date: str, stype: str, lines: list[tuple[str, float, float]], desc: str = "") -> None:
        diff = entry_balance(lines)
        if abs(diff) > 0.02:
            raise ValueError(f"Unbalanced entry {eid} ({desc}): {diff}")
        entries.append({"id": eid, "date": date, "sourceType": stype, "lines": lines, "desc": desc})
        for code, d, c in lines:
            acct_bal[code] = round2(acct_bal.get(code, 0) + d - c)

    # Opening
    oc = float(settings.get("opening_cash_balance") or 0)
    sc = float(settings.get("share_capital") or 0)
    re = float(settings.get("opening_retained_earnings") or 0)
    od = settings.get("opening_balance_date") or "2000-01-01"
    if oc or sc or re:
        lines = []
        if oc: lines.append(("1010", oc, 0))
        if sc: lines.append(("3000", 0, sc))
        if re: lines.append(("3100", 0, re))
        deb = sum(d for _, d, _ in lines)
        cred = sum(c for _, _, c in lines)
        if deb > cred:
            lines.append(("3100", 0, round2(deb - cred)))
        elif cred > deb:
            lines.append(("3100", round2(cred - deb), 0))
        post("opening", od, "opening", lines, "Opening balances")

    inv_by_id = {i["id"]: i for i in data["invoices"]}

    for inv in data["invoices"]:
        if not is_revenue_invoice(inv["status"]):
            continue
        rev = "1300" if wip else "4000"
        post(
            f"inv-{inv['id'][:8]}",
            inv["invoice_date"],
            "invoice",
            [
                ("1100", float(inv["total"]), 0),
                (rev, 0, float(inv["subtotal"])),
                ("2100", 0, float(inv["gst"])),
                ("2110", 0, float(inv["qst"])),
            ],
            inv["invoice_number"],
        )

    for pay in data["payments"]:
        inv = inv_by_id.get(pay["invoice_id"], {})
        if inv.get("status") == "void":
            continue
        post(
            f"pay-{pay['id'][:8]}",
            pay["payment_date"],
            "payment",
            [("1010", float(pay["amount"]), 0), ("1100", 0, float(pay["amount"]))],
            "payment",
        )

    for e in data["expenses"]:
        if e.get("category") == "payroll" or e.get("payroll_run_id"):
            continue
        acct = EXPENSE_ACCT.get(e["category"], "5090")
        credit = "1010" if e.get("paid") else "2000"
        post(
            f"exp-{e['id'][:8]}",
            e["expense_date"],
            "expense",
            [
                (acct, float(e["amount"]), 0),
                ("1200", float(e["gst"]), 0),
                ("1210", float(e["qst"]), 0),
                (credit, 0, float(e["total"])),
            ],
            e["vendor"],
        )

    ee_by_payroll: dict[str, list[dict]] = {}
    for ee in data["employee_expenses"]:
        pid = ee.get("payroll_run_id")
        if pid:
            ee_by_payroll.setdefault(pid, []).append(ee)
        elif not ee.get("taxable"):
            acct = EXPENSE_ACCT.get(ee["category"], "5090")
            post(
                f"ee-{ee['id'][:8]}",
                ee["expense_date"],
                "employee_expense",
                [
                    (acct, float(ee["amount"]), 0),
                    ("1200", float(ee["gst"]), 0),
                    ("1210", float(ee["qst"]), 0),
                    ("2060", 0, float(ee["total"])),
                ],
                ee["vendor"],
            )

    for pr in data["payroll"]:
        linked = ee_by_payroll.get(pr["id"], [])
        non_tax = sum(float(e["total"]) for e in linked if not e.get("taxable"))
        taxable = sum(float(e["amount"]) for e in linked if e.get("taxable"))
        lines = [
            ("5100", float(pr["gross_pay"]), 0),
            ("5110", employer_contrib(pr), 0),
            ("1010", 0, float(pr["net_pay"])),
            ("2200", 0, payroll_income_tax(pr)),
            ("2210", 0, payroll_statutory(pr)),
        ]
        lev = payroll_levies(pr)
        ben = float(pr["employer_benefits"])
        if lev > 0:
            lines.append(("2215", 0, lev))
        if ben > 0:
            lines.append(("2050", 0, ben))
        if non_tax > 0:
            lines.append(("2060", non_tax, 0))
        if taxable > 0:
            lines.append(("5100", 0, taxable))
            for e in linked:
                if e.get("taxable"):
                    acct = EXPENSE_ACCT.get(e["category"], "5090")
                    lines.append((acct, float(e["amount"]), 0))
        post(f"payroll-{pr['id'][:8]}", pr["payment_date"], "payroll", lines, pr["payment_date"])

        if pr.get("remittance_status") == "remitted" and pr.get("remittance_date"):
            rem = round2(payroll_income_tax(pr) + payroll_statutory(pr) + lev)
            if rem > 0:
                rlines = []
                it = payroll_income_tax(pr)
                st = payroll_statutory(pr)
                if it > 0:
                    rlines.append(("2200", it, 0))
                if st > 0:
                    rlines.append(("2210", st, 0))
                if lev > 0:
                    rlines.append(("2215", lev, 0))
                rlines.append(("1010", 0, rem))
                post(f"payroll-remit-{pr['id'][:8]}", pr["remittance_date"], "payroll_remittance", rlines, "remittance")

    for d in data["dividends"]:
        post(
            f"div-decl-{d['id'][:8]}",
            d["declared_date"],
            "dividend_declared",
            [("3100", float(d["total_amount"]), 0), ("2125", 0, float(d["total_amount"]))],
            "dividend declared",
        )
        if float(d.get("paid_amount") or 0) > 0 and d.get("payment_date"):
            pa = float(d["paid_amount"])
            post(
                f"div-pay-{d['id'][:8]}",
                d["payment_date"],
                "dividend",
                [("2125", pa, 0), ("1010", 0, pa)],
                "dividend paid",
            )

    for ct in data["corp_tax"]:
        owed = round2(float(ct["amount"]) - float(ct.get("paid_amount") or 0))
        accrual_date = ct.get("due_date") or ct.get("paid_date")
        if owed > 0 and accrual_date and ct["status"] in ("estimated", "due"):
            post(
                f"corp-accrual-{ct['id'][:8]}",
                accrual_date,
                "corporate_tax_accrual",
                [("5900", owed, 0), ("2310", 0, owed)],
                ct["label"],
            )
        if float(ct.get("paid_amount") or 0) > 0 and ct.get("paid_date"):
            pa = float(ct["paid_amount"])
            owed_ct = round2(float(ct["amount"]) - pa)
            use_expense = ct["status"] == "paid" and owed_ct <= 0
            if use_expense:
                post(
                    f"corp-pay-{ct['id'][:8]}",
                    ct["paid_date"],
                    "corporate_tax",
                    [("5900", pa, 0), ("1010", 0, pa)],
                    ct["label"],
                )
            else:
                post(
                    f"corp-pay-{ct['id'][:8]}",
                    ct["paid_date"],
                    "corporate_tax",
                    [("2300", pa, 0), ("1010", 0, pa)],
                    ct["label"],
                )

    # Sales tax remittances — app only posts when status === 'paid'
    for st in data["sales_tax"]:
        if st.get("status") != "paid":
            continue
        rem_date = st.get("filed_date") or st["period_end"]
        gst = float(st["gst_net"])
        qst = float(st["qst_net"])
        total = round2(gst + qst)
        if abs(total) < 0.01:
            continue
        lines = []
        if gst > 0:
            lines.append(("2100", gst, 0))
        elif gst < 0:
            lines.append(("1200", 0, abs(gst)))
        if qst > 0:
            lines.append(("2110", qst, 0))
        elif qst < 0:
            lines.append(("1210", 0, abs(qst)))
        if total > 0:
            lines.append(("1010", 0, total))
        else:
            lines.append(("1010", abs(total), 0))
        post(f"stax-{st['id'][:8]}", rem_date, "sales_tax", lines, "sales tax remittance")

    # Adjustments
    for adj in data["adjustments"]:
        if not adj.get("active", True):
            continue
        if adj["adjustment_type"] == "manual":
            amt = float(adj.get("total_amount") or adj.get("monthly_amount") or 0)
            if amt > 0:
                post(
                    f"adj-{adj['id'][:8]}",
                    adj["start_date"],
                    "adjustment",
                    [(adj["debit_account"], amt, 0), (adj["credit_account"], 0, amt)],
                    adj["description"],
                )
            continue
        if adj["adjustment_type"] == "accrual":
            amt = float(adj.get("total_amount") or adj.get("monthly_amount") or 0)
            post_date = adj.get("end_date") or adj["start_date"]
            if amt > 0:
                post(
                    f"adj-{adj['id'][:8]}",
                    post_date,
                    "adjustment",
                    [(adj["debit_account"], amt, 0), (adj["credit_account"], 0, amt)],
                    adj["description"],
                )
            continue
        monthly = float(adj.get("monthly_amount") or 0)
        if monthly <= 0:
            continue
        post(
            f"adj-{adj['id'][:8]}",
            adj["start_date"],
            "adjustment",
            [(adj["debit_account"], monthly, 0), (adj["credit_account"], 0, monthly)],
            adj["description"],
        )

    return entries, acct_bal


def validate(data: dict) -> ValidationReport:
    r = ValidationReport()
    settings = data["settings"][0] if data["settings"] else {}

    try:
        entries, acct = build_gl_entries(data)
    except ValueError as e:
        r.add("error", "GL", str(e))
        return r

    r.metrics["gl_entry_count"] = len(entries)

    # Trial balance
    total_debit = total_credit = 0.0
    for e in entries:
        for code, d, c in e["lines"]:
            total_debit += d
            total_credit += c
    r.metrics["gl_total_debit"] = round2(total_debit)
    r.metrics["gl_total_credit"] = round2(total_credit)
    if abs(total_debit - total_credit) > 0.05:
        r.add("error", "GL", f"Trial balance out of balance: DR {total_debit:.2f} vs CR {total_credit:.2f}")

    # Balance sheet equation (normal balances)
    assets = acct.get("1010", 0) + acct.get("1100", 0) + acct.get("1200", 0) + acct.get("1210", 0) + acct.get("1300", 0)
    liabilities = sum(acct.get(c, 0) for c in ("2000", "2050", "2060", "2100", "2110", "2125", "2200", "2210", "2215", "2300", "2310"))
    # liability accounts stored as credit-normal in our naive acct_bal (debit-credit) — flip sign
    liab_codes = ("2000", "2050", "2060", "2100", "2110", "2125", "2200", "2210", "2215", "2300", "2310")
    liabilities = sum(-acct.get(c, 0) for c in liab_codes)
    equity = -(acct.get("3000", 0) + acct.get("3100", 0))
    r.metrics["cash_gl"] = round2(acct.get("1010", 0))
    r.metrics["ar_gl"] = round2(acct.get("1100", 0))
    r.metrics["wip_gl"] = round2(acct.get("1300", 0))
    r.metrics["revenue_gl"] = round2(-acct.get("4000", 0))
    r.metrics["gst_payable"] = round2(-acct.get("2100", 0))
    r.metrics["qst_payable"] = round2(-acct.get("2110", 0))

    # --- AR subledger ---
    inv_total = sum(float(i["total"]) for i in data["invoices"] if is_revenue_invoice(i["status"]))
    pay_total = sum(float(p["amount"]) for p in data["payments"])
    ar_expected = round2(inv_total - pay_total)
    if abs(ar_expected - acct.get("1100", 0)) > 0.05:
        r.add(
            "error", "AR",
            f"AR mismatch: invoices−payments = {ar_expected:.2f}, GL 1100 = {acct.get('1100', 0):.2f}",
        )
    r.metrics["collection_rate_pct"] = round2(pay_total / inv_total * 100) if inv_total else 0
    r.metrics["ar_expected"] = ar_expected
    r.add(
        "info", "AR",
        f"Collection rate {r.metrics['collection_rate_pct']:.1f}% — AR {ar_expected:.2f} $ "
        f"(~{round2(100 - r.metrics['collection_rate_pct'])}% ouvert).",
    )

    unbilled = [e for e in data.get("time_entries", []) if not e.get("invoice_id")]
    r.metrics["unbilled_time_entries"] = len(unbilled)
    if unbilled:
        r.add("warn", "WIP", f"{len(unbilled)} time entr(ies) without invoice — bill all work for a closed mock year.")

    # --- Cash: bank import vs GL ---
    bank_sum = round2(sum(float(b["amount"]) for b in data["bank"]))
    r.metrics["bank_import_net"] = bank_sum
    if data["bank"] and abs(bank_sum - acct.get("1010", 0)) > 0.05:
        r.add(
            "error", "Cash",
            f"Bank import net ({bank_sum:.2f}) ≠ GL cash 1010 ({acct.get('1010', 0):.2f}). "
            "Every cash movement should have a matching bank transaction.",
        )

    # --- Sales tax by quarter ---
    quarters = [
        ("Q1", "2026-01-01", "2026-03-31"),
        ("Q2", "2026-04-01", "2026-06-30"),
        ("Q3", "2026-07-01", "2026-09-30"),
        ("Q4", "2026-10-01", "2026-12-31"),
    ]
    for qlabel, qs, qe in quarters:
        calc_gst_col = sum(float(i["gst"]) for i in data["invoices"] if is_revenue_invoice(i["status"]) and in_period(i["invoice_date"], qs, qe))
        calc_qst_col = sum(float(i["qst"]) for i in data["invoices"] if is_revenue_invoice(i["status"]) and in_period(i["invoice_date"], qs, qe))
        all_exp = data["expenses"] + data["employee_expenses"]
        calc_gst_itc = sum(float(e["gst"]) for e in all_exp if in_period(e["expense_date"], qs, qe))
        calc_qst_itr = sum(float(e["qst"]) for e in all_exp if in_period(e["expense_date"], qs, qe))
        for st in data["sales_tax"]:
            if st["period_start"] == qs and st["period_end"] == qe:
                for field, calc in (
                    ("gst_collected", calc_gst_col), ("qst_collected", calc_qst_col),
                    ("gst_itc", calc_gst_itc), ("qst_itr", calc_qst_itr),
                ):
                    if abs(float(st[field]) - round2(calc)) > 0.05:
                        r.add("error", "Sales tax", f"{qlabel} {field}: stored {st[field]} vs calculated {calc:.2f}")
                if st.get("status") not in ("paid", "filed"):
                    r.add("warn", "Sales tax", f"{qlabel} status is '{st.get('status')}' — expected paid for closed mock year")
                elif st.get("status") == "filed":
                    r.add(
                        "warn", "Sales tax",
                        f"{qlabel} status is 'filed' but GL remits only when status is 'paid'.",
                    )

    # --- Payroll category expense excluded ---
    payroll_exp = [e for e in data["expenses"] if e.get("category") == "payroll"]
    if payroll_exp:
        r.add(
            "warn", "Expenses",
            f"{len(payroll_exp)} expense(s) with category 'payroll' ({sum(float(e['total']) for e in payroll_exp):.2f} TTC) "
            "are excluded from GL — use payroll_runs remittance instead to avoid double-counting.",
        )

    # --- Pending employee expense ---
    pending_ee = [e for e in data["employee_expenses"] if not e.get("payroll_run_id")]
    pending_total = sum(float(e["total"]) for e in pending_ee)
    r.metrics["pending_employee_reimb"] = round2(pending_total)
    if pending_ee:
        r.add("info", "Employee expenses", f"{len(pending_ee)} unreimbursed employee expense(s): {pending_total:.2f} CAD")

    # --- Taxable employee expenses via payroll ---
    taxable_ee = [e for e in data["employee_expenses"] if e.get("taxable") and e.get("payroll_run_id")]
    if taxable_ee:
        r.add(
            "info", "Employee expenses",
            f"{len(taxable_ee)} taxable reimbursement(s) reclassed from 5100 to expense categories via payroll JE.",
        )

    # --- WIP vs invoiced revenue ---
    if settings.get("wip_accrual_enabled"):
        cy_rev = sum(
            float(i["subtotal"]) for i in data["invoices"]
            if is_revenue_invoice(i["status"]) and in_period(i["invoice_date"], "2026-01-01", "2026-12-31")
        )
        r.metrics["cy2026_invoiced_subtotal"] = round2(cy_rev)
        r.add(
            "info", "WIP / Reports",
            "WIP accrual enabled: invoices post to 1300 until WIP accrual at period end. "
            "Compare 'Revenus facturés' vs 'Revenus comptabilisés' on reports.",
        )

    # --- Fiscal period closes ---
    closes = sorted(data.get("fiscal_closes", []), key=lambda c: c["period_end"])
    r.metrics["fiscal_period_closes"] = len(closes)
    if len(closes) < 12:
        r.add("warn", "Period close", f"Only {len(closes)} month-end closes — expected 12 for full calendar year mock")

    # --- Corp tax paid vs accrual ---
    for ct in data["corp_tax"]:
        owed_ct = round2(float(ct["amount"]) - float(ct.get("paid_amount") or 0))
        if ct.get("paid_date") and float(ct.get("paid_amount") or 0) > 0:
            if ct["status"] == "paid" and owed_ct <= 0:
                pass  # direct expense entry (5900) — correct for installments paid without provision
            elif ct["status"] in ("estimated", "due") and owed_ct > 0:
                r.add(
                    "info", "Corporate tax",
                    f"{ct['label']}: provision {owed_ct:.2f} still open with partial payment.",
                )

    # --- Bank reconciliation gaps ---
    unmatched = [b for b in data["bank"] if not b.get("reconciled")]
    if unmatched:
        r.add("info", "Bank", f"{len(unmatched)} unreconciled bank transaction(s)")

    # --- Invoice partial ---
    for inv in data["invoices"]:
        if inv["status"] == "partial":
            paid = sum(float(p["amount"]) for p in data["payments"] if p["invoice_id"] == inv["id"])
            bal = round2(float(inv["total"]) - paid)
            r.metrics["partial_invoice_balance"] = bal
            r.add("info", "Invoices", f"{inv['invoice_number']} partial: {paid:.2f} paid, {bal:.2f} outstanding")

    # --- Q1 cash in vs payments ---
    q1s, q1e = Q1
    q1_pay = sum(float(p["amount"]) for p in data["payments"] if in_period(p["payment_date"], q1s, q1e))
    r.metrics["q1_payments"] = round2(q1_pay)

    # Payroll remittance pending
    pending_rem = [p for p in data["payroll"] if p.get("remittance_status") != "remitted"]
    if pending_rem:
        r.add("info", "Payroll", f"{len(pending_rem)} payroll run(s) with remittance still pending")

    return r


def main() -> int:
    load_env(ROOT / "app" / ".env.local")
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Missing Supabase credentials", file=sys.stderr)
        return 1

    sb = Supabase(url, key)
    data = {
        "settings": sb.select("organization_settings"),
        "invoices": sb.select("invoices"),
        "payments": sb.select("payments"),
        "expenses": sb.select("expenses"),
        "employee_expenses": sb.select("employee_expenses"),
        "payroll": sb.select("payroll_runs"),
        "dividends": sb.select("dividends"),
        "corp_tax": sb.select("corporate_tax_records"),
        "sales_tax": sb.select("sales_tax_periods"),
        "adjustments": sb.select("accounting_adjustments"),
        "bank": sb.select("bank_transactions"),
        "fiscal_closes": sb.select("fiscal_period_closes"),
        "time_entries": sb.select("time_entries", "id,invoice_id"),
    }

    report = validate(data)

    print("=" * 60)
    print("FISCAL VALIDATION — draft for owner/CPA review")
    print("=" * 60)
    print("\nKey GL balances (naive debit−credit, assets positive):")
    for k, v in sorted(report.metrics.items()):
        print(f"  {k}: {v}")

    by_sev = {"error": [], "warn": [], "info": []}
    for i in report.issues:
        by_sev[i.severity].append(i)

    for sev, label in (("error", "ERRORS"), ("warn", "WARNINGS"), ("info", "NOTES")):
        if not by_sev[sev]:
            continue
        print(f"\n{label}:")
        for i in by_sev[sev]:
            print(f"  [{i.area}] {i.message}")

    print(f"\nSummary: {len(by_sev['error'])} error(s), {len(by_sev['warn'])} warning(s), {len(by_sev['info'])} note(s)")
    return 1 if by_sev["error"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
