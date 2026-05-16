"""Create a portable SA Helper seed bundle from the current instance."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from app.core.config import get_settings
from app.core.container import build_container


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup-id", default="sa-helper-seed", help="Bundle identifier.")
    parser.add_argument(
        "--output",
        default="",
        help="Optional output path. Use .zip for unencrypted packages or .upbak when backup encryption is enabled.",
    )
    args = parser.parse_args()

    settings = get_settings()
    container = build_container(settings)
    package = container.backup_service.create_package(backup_id=args.backup_id)
    package_path = Path(package["path"])

    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(package_path, output)
        package["path"] = output

    print(
        "seed_bundle_created "
        f"path={package['path']} size_bytes={package['size_bytes']} "
        f"checksum={package['checksum']} encrypted={package['encrypted']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
