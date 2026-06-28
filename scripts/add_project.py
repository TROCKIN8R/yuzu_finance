#!/usr/bin/env python3
"""Add a client and/or project to the tracking CSVs."""

from __future__ import annotations

import argparse
import sys
import uuid

from invoice_lib import CLIENTS_PATH, PROJECTS_PATH, index_by, read_csv, write_csv

CLIENT_FIELDS = [
    "client_id",
    "legal_name",
    "contact_name",
    "email",
    "address_line1",
    "city",
    "province",
    "postal_code",
    "country",
    "language",
    "payment_terms_days",
    "notes",
]

PROJECT_FIELDS = [
    "project_id",
    "client_id",
    "name",
    "status",
    "default_hourly_rate",
    "currency",
    "billing_type",
    "fixed_amount",
    "notes",
]


def slug_id(prefix: str, name: str) -> str:
    base = "".join(ch if ch.isalnum() else "-" for ch in name.lower()).strip("-")
    while "--" in base:
        base = base.replace("--", "-")
    return f"{prefix}-{base[:24]}-{uuid.uuid4().hex[:4]}"


def cmd_client(args: argparse.Namespace) -> int:
    rows = read_csv(CLIENTS_PATH)
    client_id = args.id or slug_id("cli", args.name)
    if client_id in index_by(rows, "client_id"):
        print(f"error: client_id '{client_id}' already exists", file=sys.stderr)
        return 1
    row = {
        "client_id": client_id,
        "legal_name": args.name,
        "contact_name": args.contact or "",
        "email": args.email or "",
        "address_line1": args.address or "",
        "city": args.city or "",
        "province": args.province or "QC",
        "postal_code": args.postal or "",
        "country": args.country or "Canada",
        "language": args.language or "fr",
        "payment_terms_days": str(args.terms or 30),
        "notes": args.notes or "",
    }
    rows.append(row)
    write_csv(CLIENTS_PATH, rows, CLIENT_FIELDS)
    print(f"Created client {client_id}: {args.name}")
    return 0


def cmd_project(args: argparse.Namespace) -> int:
    clients = index_by(read_csv(CLIENTS_PATH), "client_id")
    if args.client not in clients:
        print(f"error: client_id '{args.client}' not found", file=sys.stderr)
        return 1
    rows = read_csv(PROJECTS_PATH)
    project_id = args.id or slug_id("prj", args.name)
    if project_id in index_by(rows, "project_id"):
        print(f"error: project_id '{project_id}' already exists", file=sys.stderr)
        return 1
    row = {
        "project_id": project_id,
        "client_id": args.client,
        "name": args.name,
        "status": args.status or "active",
        "default_hourly_rate": str(args.rate),
        "currency": "CAD",
        "billing_type": args.billing or "hourly",
        "fixed_amount": str(args.fixed or ""),
        "notes": args.notes or "",
    }
    rows.append(row)
    write_csv(PROJECTS_PATH, rows, PROJECT_FIELDS)
    print(f"Created project {project_id}: {args.name} @ {args.rate} $/h")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Create clients and projects.")
    sub = parser.add_subparsers(dest="command", required=True)

    p_client = sub.add_parser("client", help="Add a client")
    p_client.add_argument("--name", required=True, help="Client legal name")
    p_client.add_argument("--id", help="client_id (auto-generated if omitted)")
    p_client.add_argument("--contact")
    p_client.add_argument("--email")
    p_client.add_argument("--address")
    p_client.add_argument("--city")
    p_client.add_argument("--province", default="QC")
    p_client.add_argument("--postal")
    p_client.add_argument("--country", default="Canada")
    p_client.add_argument("--language", default="fr")
    p_client.add_argument("--terms", type=int, default=30)
    p_client.add_argument("--notes")
    p_client.set_defaults(func=cmd_client)

    p_project = sub.add_parser("project", help="Add a project")
    p_project.add_argument("--client", required=True, help="client_id")
    p_project.add_argument("--name", required=True, help="Project name")
    p_project.add_argument("--id", help="project_id (auto-generated if omitted)")
    p_project.add_argument("--rate", required=True, type=float, help="Default hourly rate CAD")
    p_project.add_argument("--status", default="active", choices=["active", "on_hold", "completed", "archived"])
    p_project.add_argument("--billing", default="hourly", choices=["hourly", "fixed", "mixed"])
    p_project.add_argument("--fixed", type=float, help="Fixed amount if billing=fixed")
    p_project.add_argument("--notes")
    p_project.set_defaults(func=cmd_project)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
