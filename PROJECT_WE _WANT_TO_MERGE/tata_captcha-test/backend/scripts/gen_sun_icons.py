import sys
from PIL import Image, ImageDraw
import math

sizes = [16, 48, 128]
out_dir = "e:/codex/extension/extension/"

for size in sizes:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Sun core
    center = size / 2.0
    core_radius = size * 0.25
    draw.ellipse(
        [center - core_radius, center - core_radius, center + core_radius, center + core_radius],
        fill=(252, 211, 77) # Tailwind amber-300
    )
    
    # Sun rays
    ray_length = size * 0.15
    ray_width = max(1, int(size * 0.04))
    num_rays = 8
    
    for i in range(num_rays):
        angle = i * (360.0 / num_rays)
        rad = math.radians(angle)
        
        start_x = center + math.cos(rad) * (core_radius * 1.3)
        start_y = center + math.sin(rad) * (core_radius * 1.3)
        
        end_x = center + math.cos(rad) * (core_radius * 1.3 + ray_length)
        end_y = center + math.sin(rad) * (core_radius * 1.3 + ray_length)
        
        draw.line([(start_x, start_y), (end_x, end_y)], fill=(251, 191, 36), width=ray_width)
        
    img.save(f"{out_dir}icon{size}.png")

print("Generated sun icons successfully.")
