from PIL import Image, ImageDraw, ImageFont
import os

def create_test_image(text, filename):
    # Create a white image
    img = Image.new('RGB', (400, 100), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    # Draw black text
    d.text((10, 10), text, fill=(0, 0, 0))
    img.save(filename)
    print(f"Created {filename}")

if __name__ == "__main__":
    create_test_image("Hello Tesseract 123", "backend/test.jpg")
    create_test_image("यह एक परीक्षण है", "backend/test2.jpg")
