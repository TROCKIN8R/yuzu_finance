#!/usr/bin/env python3
"""Generate an invoice from unbilled time entries."""

from __future__ import annotations

import argparse
import sys
import uuid
from datetime import date, timedelta
from decimal import Decimal

from pathlib import Path

from invoice_lib import (
    CLIENTS_PATH,
    INVOICE_REGISTRY_PATH,
    INVOICE_TEMPLATE_PATH,
    ISSUED_DIR,
    PROJECTS_PATH,
    ROOT,
    TIME_ENTRIES_PATH,
    client_address_block,
    company_address_block,
    effective_rate,
    format_cad,
    format_cad_simple,
    index_by,
    is_billable,
    is_unbilled,
    load_config,
    money,
    next_invoice_number,
    parse_date,
    read_csv,
    tax_registration_lines,
    today_iso,
    write_csv,
)

TIME_FIELDS = [
    "entry_id",
    "project_id",
    "date",
    "hours",
    "description",
    "billable",
    "rate_override",
    "invoiced",
    "invoice_id",
]

REGISTRY_FIELDS = [
    "invoice_id",
    "invoice_number",
    "date",
    "due_date",
    "client_id",
    "project_ids",
    "subtotal",
    "gst",
    "qst",
    "total",
    "status",
    "source_file",
]


def select_entries(
    entries: list[dict[str, str]],
    project_id: str | None,
    client_id: str | None,
    projects_by_id: dict[str, dict[str, str]],
    through_date: str | None,
) -> list[dict[str, str]]:
    selected: list[dict[str, str]] = []
    cutoff = parse_date(through_date) if through_date else None

    for entry in entries:
        if not is_unbilled(entry) or not is_billable(entry):
            continue
        pid = entry.get("project_id", "")
        project = projects_by_id.get(pid)
        if not project:
            continue
        if project_id and pid != project_id:
            continue
        if client_id and project.get("client_id") != client_id:
            continue
        if cutoff and parse_date(entry["date"]) > cutoff:
            continue
        selected.append(entry)

    selected.sort(key=lambda e: (e["date"], e["entry_id"]))
    return selected


def build_line_items(
    entries: list[dict[str, str]],
    projects_by_id: dict[str, dict[str, str]],
) -> tuple[list[str], Decimal]:
    lines: list[str] = []
    subtotal = Decimal("0")

    for entry in entries:
        project = projects_by_id[entry["project_id"]]
        hours = money(entry["hours"])
        rate = effective_rate(entry, project)
        amount = money(hours * rate)
        subtotal += amount
        desc = entry["description"].replace("|", "\\|")
        lines.append(
            f"| {entry['date']} | {desc} | {hours:.2f} | {format_cad(rate)} | {format_cad(amount)} |"
        )

    return lines, money(subtotal)


def render_invoice(template: str, values: dict[str, str]) -> str:
    result = template
    for key, value in values.items():
        result = result.replace(f"{{{{{key}}}}}", value)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate invoice from unbilled hours.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--project", help="Bill unbilled hours for one project_id")
    group.add_argument("--client", help="Bill unbilled hours for all projects of client_id")
    parser.add_argument("--through-date", help="Include entries on or before YYYY-MM-DD")
    parser.add_argument("--invoice-date", default=today_iso(), help="Invoice date YYYY-MM-DD")
    parser.add_argument("--dry-run", action="store_true", help="Preview without saving")
    args = parser.parse_args()

    config = load_config()
    projects = read_csv(PROJECTS_PATH)
    projects_by_id = index_by(projects, "project_id")
    clients_by_id = index_by(read_csv(CLIENTS_PATH), "client_id")
    entries = read_csv(TIME_ENTRIES_PATH)

    selected = select_entries(
        entries,
        args.project,
        args.client,
        projects_by_id,
        args.through_date,
    )
    if not selected:
        print("No unbilled billable time entries found for that scope.", file=sys.stderr)
        return 1

    project_ids = sorted({e["project_id"] for e in selected})
    first_project = projects_by_id[project_ids[0]]
    client_id = first_project["client_id"]

    if args.client and args.client != client_id:
        # --client mode: verify all entries belong to that client
        for pid in project_ids:
            if projects_by_id[pid]["client_id"] != args.client:
                print("error: entries span multiple clients; use --project instead", file=sys.stderr)
                return 1
        client_id = args.client

    if not args.client:
        for pid in project_ids:
            if projects_by_id[pid]["client_id"] != client_id:
                print("error: selected entries span multiple clients; use --client or one --project", file=sys.stderr)
                return 1

    client = clients_by_id.get(client_id)
    if not client:
        print(f"error: client_id '{client_id}' not found in clients/clients.csv", file=sys.stderr)
        return 1

    line_rows, subtotal = build_line_items(selected, projects_by_id)

    tax_cfg = config["tax"]
    gst = money(0)
    qst = money(0)
    if tax_cfg.get("charge_gst"):
        gst = money(subtotal * Decimal(str(tax_cfg["gst_rate"])))
    if tax_cfg.get("charge_qst"):
        qst = money(subtotal * Decimal(str(tax_cfg["qst_rate"])))
    total = money(subtotal + gst + qst)

    inv_cfg = config["invoicing"]
    registry = read_csv(INVOICE_REGISTRY_PATH)
    invoice_number = next_invoice_number(registry, inv_cfg["prefix"])
    invoice_date = parse_date(args.invoice_date)
    terms_days = int(client.get("payment_terms_days") or inv_cfg["payment_terms_days"])
    due_date = invoice_date + timedelta(days=terms_days)

    project_names = ", ".join(projects_by_id[pid]["name"] for pid in project_ids)
    contact_bits = [b for b in [client.get("contact_name"), client.get("email")] if b]
    contact_line = " · ".join(contact_bits)

    gst_rate_pct = Decimal(str(tax_cfg["gst_rate"])) * 100
    qst_rate_pct = Decimal(str(tax_cfg["qst_rate"])) * 100

    values = {
        "company_legal_name": config["company"]["legal_name"],
        "company_address": company_address_block(config),
        "neq": config["company"]["neq"],
        "tax_registration_lines": tax_registration_lines(config),
        "invoice_number": invoice_number,
        "invoice_date": invoice_date.isoformat(),
        "due_date": due_date.isoformat(),
        "project_name": project_names,
        "client_legal_name": client["legal_name"],
        "client_address": client_address_block(client),
        "client_contact_line": contact_line,
        "hours_label": inv_cfg.get("hourly_unit_label_fr", "Heures"),
        "line_items": "\n".join(line_rows),
        "subtotal": format_cad(subtotal),
        "gst": format_cad(gst) if tax_cfg.get("charge_gst") else "—",
        "qst": format_cad(qst) if tax_cfg.get("charge_qst") else "—",
        "total": format_cad(total),
        "gst_rate_display": f"{gst_rate_pct:.2f} %".replace(".", ","),
        "qst_rate_display": f"{qst_rate_pct:.3f} %".replace(".", ","),
        "payment_terms_days": str(terms_days),
        "payment_instructions": inv_cfg.get("payment_instructions", ""),
    }

    template = INVOICE_TEMPLATE_PATH.read_text(encoding="utf-8")
    rendered = render_invoice(template, values)

    print(f"Invoice {invoice_number}")
    print(f"  Client: {client['legal_name']}")
    print(f"  Entries: {len(selected)} · Subtotal: {format_cad(subtotal)} · Total: {format_cad(total)}")
    if args.dry_run:
        print("\n--- dry run (not saved) ---\n")
        print(rendered)
        return 0

    invoice_id = f"inv-{uuid.uuid4().hex[:8]}"
    filename = f"{invoice_date.isoformat()}_{invoice_number}_{client_id}.md"
    out_path = ISSUED_DIR / filename
    ISSUED_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text(rendered, encoding="utf-8")

    selected_ids = {e["entry_id"] for e in selected}

    for entry in entries:
        if entry["entry_id"] in selected_ids:
            entry["invoiced"] = "yes"
            entry["invoice_id"] = invoice_id
    write_csv(TIME_ENTRIES_PATH, entries, TIME_FIELDS)

    registry.append(
        {
            "invoice_id": invoice_id,
            "invoice_number": invoice_number,
            "date": invoice_date.isoformat(),
            "due_date": due_date.isoformat(),
            "client_id": client_id,
            "project_ids": ";".join(project_ids),
            "subtotal": format_cad_simple(subtotal),
            "gst": format_cad_simple(gst),
            "qst": format_cad_simple(qst),
            "total": format_cad_simple(total),
            "status": "draft",
            "source_file": str(out_path.relative_to(ROOT)),
        }
    )
    write_csv(INVOICE_REGISTRY_PATH, registry, REGISTRY_FIELDS)

    print(f"Saved: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
