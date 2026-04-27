import os
import asyncio
from pathlib import Path
from PIL import Image
import pytesseract

# Explicitly set tesseract path as we did in exam_service.py
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def _resolve_project_root():
    # Correctly resolve to platform/backend
    return Path(__file__).resolve().parent

async def main():
    root = _resolve_project_root()
    tess_dir = (root / "tessdata").resolve()
    
    print(f"Project Root: {root}")
    print(f"Tessdata Dir: {tess_dir}")
    
    # Set TESSDATA_PREFIX for the process
    os.environ["TESSDATA_PREFIX"] = str(tess_dir)
    
    images = ["test.jpg", "test2.jpg"]
    
    for img_name in images:
        img_path = root / img_name
        if not img_path.exists():
            print(f"\n[!] File not found: {img_path}")
            continue
            
        print(f"\n{'='*60}")
        print(f"Testing Tesseract on: {img_name}")
        print(f"{'='*60}")
        
        try:
            img = Image.open(img_path)
            # Use Hindi + English
            text = pytesseract.image_to_string(img, lang="hin+eng", config="--psm 6")
            
            print("Extracted Text:")
            print("-" * 30)
            print(text.strip())
            print("-" * 30)
            
        except Exception as e:
            print(f"Error processing {img_name}: {e}")

if __name__ == "__main__":
    asyncio.run(main())
