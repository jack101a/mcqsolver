"""Queue a retrain job from CLI."""

from __future__ import annotations

import argparse

from app.core.config import get_settings
from app.core.database import Database


def main() -> None:
    parser = argparse.ArgumentParser(description="Schedule a retrain job.")
    parser.add_argument("--min-samples", type=int, default=20, help="Minimum labeled samples required.")
    parser.add_argument("--notes", type=str, default="", help="Optional notes for this retrain job.")
    parser.add_argument("--requested-by", type=int, default=0, help="API key id / operator id.")
    args = parser.parse_args()

    settings = get_settings()
    db = Database(settings)
    db.init()
    job_id = db.create_retrain_job(
        requested_by=(args.requested_by or None),
        min_samples=max(1, args.min_samples),
        notes=(args.notes.strip() or None),
    )
    print(f"Queued retrain job #{job_id}")


if __name__ == "__main__":
    main()
