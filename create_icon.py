#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import os

def create_sync_icon(size, output_path):
    """Create a sync icon with circular arrows"""
    # Create a new image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Define colors
    primary_color = (66, 133, 244, 255)  # Google Blue
    secondary_color = (52, 168, 83, 255)  # Google Green

    # Calculate dimensions
    margin = size // 8
    center_x = size // 2
    center_y = size // 2
    radius = (size - 2 * margin) // 2

    # Draw bookmark shape (simplified book icon)
    book_width = size // 3
    book_height = size // 2.5
    book_x = center_x - book_width // 2
    book_y = center_y - book_height // 2

    # Draw book shape
    draw.rounded_rectangle(
        [book_x, book_y, book_x + book_width, book_y + book_height],
        radius=3,
        fill=primary_color
    )

    # Draw sync arrows around the book
    arrow_thickness = max(2, size // 32)

    # Top-right arrow (clockwise)
    arrow_start_x = book_x + book_width + 5
    arrow_start_y = book_y
    arrow_end_x = arrow_start_x + size // 8
    arrow_end_y = book_y + size // 8

    # Draw curved arrow using arc
    arc_box = [book_x - 10, book_y - 10, book_x + book_width + 10, book_y + book_height + 10]
    draw.arc(arc_box, start=270, end=90, fill=secondary_color, width=arrow_thickness)

    # Draw arrow heads
    # Top arrow head
    arrow_size = max(4, size // 16)
    draw.polygon([
        (book_x + book_width + 8, book_y),
        (book_x + book_width + 8 + arrow_size, book_y - arrow_size // 2),
        (book_x + book_width + 8 + arrow_size, book_y + arrow_size // 2)
    ], fill=secondary_color)

    # Bottom arrow head
    draw.polygon([
        (book_x - 8, book_y + book_height),
        (book_x - 8 - arrow_size, book_y + book_height - arrow_size // 2),
        (book_x - 8 - arrow_size, book_y + book_height + arrow_size // 2)
    ], fill=secondary_color)

    # Save the image
    img.save(output_path, 'PNG')
    print(f"Created {output_path}")

# Create icons in different sizes
sizes = {
    'icon-16.png': 16,
    'icon-32.png': 32,
    'icon-48.png': 48,
    'icon-96.png': 96,
    'icon-128.png': 128,
}

os.makedirs('public', exist_ok=True)

for filename, size in sizes.items():
    output_path = os.path.join('public', filename)
    create_sync_icon(size, output_path)

print("All icons created successfully!")