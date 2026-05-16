"""Import a portable SA Helper backup bundle on container startup.

The importer is conservative by default: it restores only when the target
setup/user tables are empty. Mount a package at SEED_BUNDLE_PATH and set
SEED_IMPORT_MODE=always only when intentionally replacing existing setup data.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from sqlalchemy import inspect, text

from app.core.config import get_settings
from app.core.container import build_container
from app.core.db import get_engine
from app.services.backup_service import USER_TABLES


SETUP_TABLES = (
    "allowed_domains",
    "autofill_rule_proposals",
    "model_routes",
    "model_registry",
    "field_mappings",
    "locators",
)


def _row_count(table_name: str) -> int:
    engine = get_engine()
    if not inspect(engine).has_table(table_name):
        return 0
    with engine.connect() as conn:
        return int(conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar() or 0)


def _counts() -> dict[str, int]:
    tables = tuple(dict.fromkeys((*SETUP_TABLES, *USER_TABLES)))
    return {table: _row_count(table) for table in tables}


def _should_import(mode: str, counts: dict[str, int]) -> bool:
    if mode == "skip":
        return False
    if mode == "always":
        return True
    if mode != "if-empty":
        raise ValueError("SEED_IMPORT_MODE must be one of: if-empty, always, skip")
    return sum(counts.values()) == 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bundle",
        default=os.getenv("SEED_BUNDLE_PATH", "/app/import/sa-helper-seed.zip"),
        help="Mounted .zip or .upbak package to restore.",
    )
    parser.add_argument(
        "--mode",
        default=os.getenv("SEED_IMPORT_MODE", "if-empty"),
        choices=("if-empty", "always", "skip"),
        help="Import policy. Default: if-empty.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without restoring.")
    args = parser.parse_args()

    bundle = Path(args.bundle)
    if not bundle.exists():
        print(f"seed_bundle=missing path={bundle}")
        return 0

    settings = get_settings()
    container = build_container(settings)
    before = _counts()
    print(
        "seed_bundle=checked "
        f"mode={args.mode} db_type={settings.storage.db_type} "
        f"path={bundle} counts={json.dumps(before, sort_keys=True)}"
    )

    if not _should_import(args.mode, before):
        print("seed_bundle=skipped")
        return 0

    validation = container.backup_service.validate_package(bundle)
    if not validation.get("ok"):
        print(f"seed_bundle=invalid error={validation.get('error')}")
        return 1

    manifest = validation.get("manifest") or {}
    print(
        "seed_bundle=valid "
        f"backup_id={manifest.get('backup_id')} "
        f"file_count={manifest.get('file_count', 0)}"
    )
    if args.dry_run:
        print("seed_bundle=dry_run")
        return 0

    result = container.backup_service.restore_package(bundle)
    if result.get("status") != "completed":
        print(f"seed_bundle=failed error={result.get('error')}")
        return 1

    after = _counts()
    print(f"seed_bundle=imported counts={json.dumps(after, sort_keys=True)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
