#!/usr/bin/env python3
"""Delegate to full-year mock seeder (includes Q1)."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FY = ROOT / "scripts" / "seed-mock-fy2026.py"

if __name__ == "__main__":
    raise SystemExit(subprocess.call([sys.executable, str(FY)] + sys.argv[1:]))
