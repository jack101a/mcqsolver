"""End-to-end local test: boot app, create key, solve image, print result."""

from __future__ import annotations

import base64
import io
import threading
import time

import requests
import uvicorn
from PIL import Image

from app.main import app


def make_image_payload() -> str:
    """Create a synthetic test image as base64."""

    image = Image.new("RGB", (250, 54), color=(255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def main() -> None:
    """Run local E2E verification."""

    config = uvicorn.Config(app, host="127.0.0.1", port=8090, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    time.sleep(1.2)

    base_url = "http://127.0.0.1:8090"
    health = requests.get(f"{base_url}/health", timeout=10)
    print("health", health.status_code, health.json())

    created = requests.post(
        f"{base_url}/v1/key/create",
        headers={"x-admin-token": "local-admin-token"},
        json={"name": "e2e-user", "expiry_days": 1},
        timeout=10,
    )
    print("create", created.status_code, created.json())
    api_key = created.json()["api_key"]

    solved = requests.post(
        f"{base_url}/v1/solve",
        headers={"x-api-key": api_key},
        json={"type": "image", "payload_base64": make_image_payload(), "mode": "fast"},
        timeout=20,
    )
    print("solve", solved.status_code, solved.json())

    server.should_exit = True
    thread.join(timeout=3)


if __name__ == "__main__":
    main()

