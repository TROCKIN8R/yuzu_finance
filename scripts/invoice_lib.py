#!/usr/bin/env python3
"""Shared helpers for Yuzu Finance invoicing scripts."""

from __future__ import annotations

import csv
import json
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CONFIG_PATH = next(
    (p for p in (ROOT / "config" / "invoicing.local.json", ROOT / "config" / "invoicing.json") if p.exists()),
    ROOT / "config" / "invoicing.example.json",
)
CLIENTS_PATH = ROOT / "clients" / "clients.csv"
PROJECTS_PATH = ROOT / "projects" / "projects.csv"
TIME_ENTRIES_PATH = ROOT / "projects" / "time-entries.csv"
INVOICE_REGISTRY_PATH = ROOT / "invoices" / "invoice-registry.csv"
INVOICE_TEMPLATE_PATH = ROOT / "templates" / "invoice.md"
ISSUED_DIR = ROOT / "invoices" / "issued"


def money(value: Decimal | float | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def format_cad(amount: Decimal) -> str:
    return f"{amount:,.2f} $"


def format_cad_simple(amount: Decimal) -> str:
    return f"{amount:.2f}"


def load_config() -> dict:
    with CONFIG_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists() or path.stat().st_size == 0:
        return []
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return [dict(row) for row in reader]


def write_csv(path: Path, rows: list[dict[str, str]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def today_iso() -> str:
    return date.today().isoformat()


def new_entry_id() -> str:
    return f"te-{uuid.uuid4().hex[:8]}"


def index_by(rows: list[dict[str, str]], key: str) -> dict[str, dict[str, str]]:
    return {row[key]: row for row in rows if row.get(key)}


def company_address_block(config: dict) -> str:
    c = config["company"]
    return f"{c['address_line1']}\n{c['city']}, {c['province']} {c['postal_code']}\n{c['country']}"


def client_address_block(client: dict) -> str:
    parts = [
        client.get("address_line1", ""),
        f"{client.get('city', '')}, {client.get('province', '')} {client.get('postal_code', '')}".strip(", "),
        client.get("country", ""),
    ]
    return "\n".join(p for p in parts if p)


def effective_rate(entry: dict, project: dict) -> Decimal:
    override = entry.get("rate_override", "").strip()
    if override:
        return money(override)
    return money(project.get("default_hourly_rate") or "0")


def is_billable(entry: dict) -> bool:
    return entry.get("billable", "yes").strip().lower() in {"yes", "y", "true", "1"}


def is_unbilled(entry: dict) -> bool:
    return entry.get("invoiced", "no").strip().lower() in {"", "no", "n", "false", "0"}


def next_invoice_number(registry: list[dict[str, str]], prefix: str) -> str:
    year = date.today().year
    pattern = f"{prefix}-{year}-"
    seq = 0
    for row in registry:
        num = row.get("invoice_number", "")
        if num.startswith(pattern):
            try:
                seq = max(seq, int(num.split("-")[-1]))
            except ValueError:
                continue
    return f"{pattern}{seq + 1:04d}"


def tax_registration_lines(config: dict) -> str:
    c = config["company"]
    gst = c.get("gst_number", "").strip()
    qst = c.get("qst_number", "").strip()
    parts = []
    if gst:
        parts.append(f"TPS/TVH : {gst}")
    if qst:
        parts.append(f"TVQ : {qst}")
    if not parts:
        return "_Numéros TPS/TVQ à ajouter lors de l'inscription / GST-QST numbers pending registration_"
    return " | ".join(parts)
