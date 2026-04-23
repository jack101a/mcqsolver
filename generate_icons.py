import os
from PIL import Image

def create_icon(size, color, output_path):
    """Creates a square PNG icon with a solid color."""
    img = Image.new('RGB', (size, size), color=color)
    img.save(output_path)
    print(f"Created {size}x{size} icon at {output_path}")

def main():
    icons_dir = os.path.join('extension', 'icons')
    color = '#10b981'
    
    # Ensure directory exists
    if not os.path.exists(icons_dir):
        os.makedirs(icons_dir)
        print(f"Created directory: {icons_dir}")

    # Create 48x48 icon
    create_icon(48, color, os.path.join(icons_dir, 'icon48.png'))
    
    # Create 128x128 icon
    create_icon(128, color, os.path.join(icons_dir, 'icon128.png'))

if __name__ == '__main__':
    main()
