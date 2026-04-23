import os
import json
import argparse
from PIL import Image

def calculate_js_hash(image_path):
    """
    Replicates the exact JavaScript hashing logic used in the Chrome Extension:
    
    let hash = 0;
    for (let i = 0; i < data.length; i += 4) {
        hash = (hash << 5) - hash + data[i] + data[i+1] + data[i+2];
        hash |= 0;
    }
    return Math.abs(hash).toString(16);
    """
    try:
        with Image.open(image_path) as img:
            # Convert to RGBA to match canvas.getImageData format
            img = img.convert('RGBA')
            
            # Use Bilinear interpolation as browsers do natively for canvas resizing
            # Handles backward compatibility for older Pillow versions
            resample_filter = getattr(Image, 'Resampling', Image).BILINEAR
            img = img.resize((32, 32), resample_filter)
            
            # Extract list of (R, G, B, A) tuples
            pixels = list(img.getdata())
    except Exception as e:
        print(f"Error processing {image_path}: {e}")
        return None

    hash_val = 0
    for rgba in pixels:
        r, g, b = rgba[0], rgba[1], rgba[2]
        
        # 1. Simulate JS bitwise shift: (hash << 5)
        # In JS, bitwise operators operate on 32-bit signed integers.
        shifted = (hash_val * 32) & 0xFFFFFFFF
        if shifted >= 0x80000000:
            shifted -= 0x100000000
            
        # 2. Simulate: - hash + data[i] + data[i+1] + data[i+2]
        hash_val = shifted - hash_val + r + g + b
        
        # 3. Simulate JS: hash |= 0
        # This forces the value back into a 32-bit signed integer space
        hash_val = hash_val & 0xFFFFFFFF
        if hash_val >= 0x80000000:
            hash_val -= 0x100000000
            
    # Simulate JS: Math.abs(hash).toString(16)
    return hex(abs(hash_val))[2:]

def main():
    parser = argparse.ArgumentParser(description="Pre-calculate DJB2-style perceptual hashes for sign images.")
    parser.add_argument('--dir', type=str, default='./sign/', help="Directory containing sign images")
    parser.add_argument('--out', type=str, default='./extension/sign_hashes.json', help="Output JSON file path")
    args = parser.parse_args()

    target_dir = args.dir
    out_file = args.out

    if not os.path.exists(target_dir):
        print(f"Error: Directory '{target_dir}' does not exist.")
        return

    print(f"Processing images in '{target_dir}'...")
    
    hash_dict = {}
    valid_exts = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
    
    count = 0
    for filename in sorted(os.listdir(target_dir)):
        ext = os.path.splitext(filename)[1].lower()
        if ext in valid_exts:
            filepath = os.path.join(target_dir, filename)
            img_hash = calculate_js_hash(filepath)
            
            if img_hash is not None:
                # Key is hash, value is filename without extension (acting as the sign label)
                label = os.path.splitext(filename)[0]
                hash_dict[img_hash] = label
                count += 1
                print(f"[{count}] {label} -> {img_hash}")

    if count > 0:
        # Ensure output directory exists (if a directory was specified)
        out_dir = os.path.dirname(out_file)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        
        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(hash_dict, f, indent=4)
            
        print(f"\nSuccessfully generated hashes for {count} images.")
        print(f"Saved to: {out_file}")
        print("\nTo use these in the extension, copy the contents of this JSON into SIGN_HASH_DICT in 'database.js'.")
    else:
        print(f"No valid images found in {target_dir}")

if __name__ == '__main__':
    main()
