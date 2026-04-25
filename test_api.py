import asyncio
import base64
import json
import time
from io import BytesIO

import httpx
from PIL import Image, ImageDraw, ImageFont

def create_text_image(text: str, width=600, height=100) -> str:
    """Create a dummy image with text and return it as a base64 string."""
    img = Image.new('RGB', (width, height), color='white')
    d = ImageDraw.Draw(img)
    # Using a default font; PIL will try its best, but might just draw squares for Hindi.
    # However, since the user wants to test OCR, we need a font that supports Hindi if we want to test OCR.
    # On Windows, Nirmala UI or Mangal are standard Hindi fonts.
    try:
        font = ImageFont.truetype("Nirmala.ttf", 32)
    except IOError:
        font = ImageFont.load_default()
        
    d.text((10, 30), text, fill='black', font=font)
    
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    b64_str = base64.b64encode(buffered.getvalue()).decode()
    return f"data:image/png;base64,{b64_str}"

async def main():
    # 1. Create dummy images with the exact text from the user's screenshot
    print("Generating test images...")
    q_b64 = create_text_image("यह चिन्ह प्रदर्शित करता है")
    opt1_b64 = create_text_image("बायीं ओर रुकें")
    opt2_b64 = create_text_image("बायीं ओर चलना बाध्यकारी")
    opt3_b64 = create_text_image("बायें मुड़ें")
    opt4_b64 = create_text_image("इनमें से कोई नहीं")

    payload = {
        "question_image": q_b64,
        "option_images": [opt1_b64, opt2_b64, opt3_b64, opt4_b64]
    }

    # 2. Send to API just like the extension does
    print("Sending to API POST /v1/exam/solve...")
    start = time.time()
    
    # We need to pass the API Key from settings. Let's assume there's one, or we can just bypass auth for localhost testing if not required.
    # Wait, the API requires an API Key in the X-API-Key header.
    # Let's get a valid API key from the database.
    import sqlite3
    try:
        conn = sqlite3.connect('platform/backend/logs/app.db')
        cur = conn.cursor()
        cur.execute("SELECT key FROM api_keys LIMIT 1")
        row = cur.fetchone()
        api_key = row[0] if row else ""
        conn.close()
    except:
        api_key = ""

    headers = {}
    if api_key:
        headers["X-API-Key"] = api_key

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post("http://localhost:8080/v1/exam/solve", json=payload, headers=headers)
        
    print(f"Time taken: {time.time() - start:.2f} seconds")
    print(f"Status Code: {resp.status_code}")
    
    if resp.status_code == 200:
        print("Response JSON:")
        print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
    else:
        print(resp.text)

if __name__ == "__main__":
    asyncio.run(main())
