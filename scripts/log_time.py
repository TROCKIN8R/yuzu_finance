#!/usr/bin/env python3
"""Log billable hours to a project."""

from __future__ import annotations

import argparse
import sys
from datetime import date
from decimal import Decimal

from invoice_lib import (
    PROJECTS_PATH,
    TIME_ENTRIES_PATH,
    index_by,
    is_billable,
    new_entry_id,
    read_csv,
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Log time against a project.")
    parser.add_argument("--project", required=True, help="project_id from projects/projects.csv")
    parser.add_argument("--hours", required=True, type=float, help="Hours worked (e.g. 2.5)")
    parser.add_argument("--desc", required=True, help="Work description")
    parser.add_argument("--date", default=today_iso(), help="YYYY-MM-DD (default: today)")
    parser.add_argument("--rate", help="Override hourly rate for this entry")
    parser.add_argument("--non-billable", action="store_true", help="Mark as non-billable")
    args = parser.parse_args()

    if args.hours <= 0:
        print("error: hours must be positive", file=sys.stderr)
        return 1

    projects = index_by(read_csv(PROJECTS_PATH), "project_id")
    if args.project not in projects:
        print(f"error: unknown project_id '{args.project}'", file=sys.stderr)
        print("Add the project to projects/projects.csv first.", file=sys.stderr)
        return 1

    project = projects[args.project]
    if project.get("status", "active").lower() in {"archived", "completed"}:
        print(f"warning: project '{args.project}' status is {project.get('status')}", file=sys.stderr)

    entries = read_csv(TIME_ENTRIES_PATH)
    entry = {
        "entry_id": new_entry_id(),
        "project_id": args.project,
        "date": args.date,
        "hours": str(Decimal(str(args.hours)).normalize()),
        "description": args.desc,
        "billable": "no" if args.non_billable else "yes",
        "rate_override": args.rate or "",
        "invoiced": "no",
        "invoice_id": "",
    }
    entries.append(entry)
    write_csv(TIME_ENTRIES_PATH, entries, TIME_FIELDS)

    billable = is_billable(entry)
    print(f"Logged {entry['hours']}h on {entry['date']} → {args.project}")
    print(f"  entry_id: {entry['entry_id']}")
    print(f"  billable: {'yes' if billable else 'no'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
