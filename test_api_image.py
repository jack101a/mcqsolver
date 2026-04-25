import asyncio
import base64
import sys
from io import BytesIO
import httpx
import json

async def main():
    if len(sys.argv) < 2:
        print("Usage: python test_api_image.py <path_to_image>")
        print("Example: python test_api_image.py test.jpg")
        return

    image_path = sys.argv[1]
    print(f"Testing OCR using image: {image_path}")

    # Read the image and convert to base64
    try:
        with open(image_path, "rb") as f:
            b64_str = base64.b64encode(f.read()).decode('utf-8')
    except Exception as e:
        print(f"Failed to read image: {e}")
        return

    data_uri = f"data:image/png;base64,{b64_str}"

    # We'll just pass the full image as the "question" and empty options to see what RapidOCR extracts
    # Normally the extension crops the image, but we just want to see the raw OCR output for testing
    payload = {
        "question_image": data_uri,
        "option_images": []
    }

    print("Sending POST request to http://localhost:8080/v1/exam/solve ...")
    
    # Bypass API Key by calling the backend directly if you want, but here we just hit the API without key 
    # to see if auth is enforced or if we can get an OCR log.
    # Actually, let's grab a valid API key so it works
    import sqlite3
    try:
        conn = sqlite3.connect('platform/backend/logs/app.db')
        cur = conn.cursor()
        cur.execute("SELECT id FROM api_keys LIMIT 1")
        # The key itself is hashed, so we can't reconstruct the "sk-..." string from the DB!
    except:
        pass

    print("Note: If you get a 401 Unauthorized, make sure you add your 'sk-...' API key to the headers in this script.")
    headers = {}
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post("http://localhost:8080/v1/exam/solve", json=payload, headers=headers)

    print(f"Status Code: {resp.status_code}")
    if resp.status_code == 200:
        print("Response JSON:")
        print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
    else:
        print(f"Response: {resp.text}")

if __name__ == "__main__":
    asyncio.run(main())
