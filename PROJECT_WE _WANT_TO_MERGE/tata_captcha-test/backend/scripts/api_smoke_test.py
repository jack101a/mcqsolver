"""API smoke test for auth and solve flow."""

from __future__ import annotations

import argparse
import base64
import json
from typing import Any

import requests
from PIL import Image
import io


def as_json(response: requests.Response) -> dict[str, Any]:
    """Decode JSON response."""

    return response.json()


def make_test_image_base64() -> str:
    """Create synthetic PNG and return base64."""

    img = Image.new("RGB", (250, 54), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def main() -> None:
    """Run smoke checks."""

    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--admin-token", required=True)
    args = parser.parse_args()

    health = requests.get(f"{args.base_url}/health", timeout=10)
    print("health", health.status_code, as_json(health))

    create = requests.post(
        f"{args.base_url}/v1/key/create",
        headers={"x-admin-token": args.admin_token},
        json={"name": "smoke-user", "expiry_days": 1},
        timeout=10,
    )
    create_json = as_json(create)
    print("create", create.status_code, create_json)
    api_key = create_json["api_key"]

    verify = requests.get(
        f"{args.base_url}/v1/auth/verify",
        headers={"x-api-key": api_key},
        timeout=10,
    )
    print("verify", verify.status_code, as_json(verify))

    solve = requests.post(
        f"{args.base_url}/v1/solve",
        headers={"x-api-key": api_key},
        json={"type": "image", "payload_base64": make_test_image_base64(), "mode": "fast"},
        timeout=20,
    )
    print("solve", solve.status_code, as_json(solve))

    usage = requests.get(
        f"{args.base_url}/v1/usage",
        headers={"x-api-key": api_key},
        timeout=10,
    )
    print("usage", usage.status_code, json.dumps(as_json(usage), indent=2))


if __name__ == "__main__":
    main()

