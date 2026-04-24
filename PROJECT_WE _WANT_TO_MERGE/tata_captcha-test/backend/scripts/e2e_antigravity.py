import os
import sys
import asyncio
import base64
from pathlib import Path
from fastapi.testclient import TestClient

# Add backend to path so we can import app
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

os.environ["STORAGE_SQLITE_PATH"] = ":memory:"
os.environ["KEY_GLOBAL_SALT"] = "test-salt"

from app.main import app

client = TestClient(app)

def run_tests():
    print("Testing Anti-Gravity Backend Features...")

    # 1. Provide an API key
    res = client.post("/v1/key/create", json={"name": "test-key"})
    api_key = res.json()["api_key"]
    print(f"[OK] Created API Key: {api_key}")

    # 2. Check Admin UI
    res = client.get("/admin/")
    assert res.status_code == 200
    assert b"Anti-Gravity Dashboard" in res.content
    print("[OK] Admin Dashboard renders correctly.")

    # 3. Create Model Route
    res = client.post(
        "/admin/routes",
        data={"domain": "test.com", "ai_model_filename": "fake.onnx"},
        follow_redirects=True
    )
    assert res.status_code == 200
    print("[OK] Created Domain Route.")

    # 4. Access Control config
    res = client.post(
        "/admin/access",
        data={"global_access": "", "new_domain": "test.com"},
        follow_redirects=True
    )
    assert res.status_code == 200
    print("[OK] Disabled global access, enabled test.com whitelist.")

    # 5. Try to solve from disallowed domain
    fake_img = base64.b64encode(b"fake_image_data").decode()
    res = client.post(
        "/v1/solve",
        headers={"x-api-key": api_key},
        json={"type": "image", "payload_base64": fake_img, "domain": "evil.com"}
    )
    assert res.status_code == 403
    print("[OK] Access Control blocked unauthorized domain.")

    # 6. Report Active Learning Failure from allowed domain
    res = client.post(
        "/v1/report",
        headers={"x-api-key": api_key},
        json={"domain": "test.com", "payload_base64": fake_img}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "reported"
    print("[OK] Active Learning reported captcha successfully.")

    # 7. Check if report shows in Admin UI
    res = client.get("/admin/")
    assert b"fake.onnx" in res.content
    assert b"test.com" in res.content
    print("[OK] Admin Dashboard reflects telemetry and datasets.")

if __name__ == "__main__":
    run_tests()
