"""Run retraining worker loop as a standalone process (bare-metal friendly)."""

from __future__ import annotations

import asyncio
from pathlib import Path

from app.core.config import get_settings
from app.core.database import Database
from app.services.retrain_service import RetrainService


async def main() -> None:
    settings = get_settings()
    db = Database(settings)
    db.init()
    service = RetrainService(db=db, models_dir=Path("models").resolve(), poll_seconds=20)
    await service.start()
    print("Retrain worker started. Press Ctrl+C to stop.")
    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await service.stop()


if __name__ == "__main__":
    asyncio.run(main())
