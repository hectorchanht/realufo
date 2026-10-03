"""Render the PWA icons from web/public/favicon.svg (pixel-art <rect>s only).

One-off; re-run only if the favicon changes:  python3 scripts/pwa_icons.py
Writes web/public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png.
"""
import re
from pathlib import Path

from PIL import Image, ImageDraw

PUB = Path(__file__).resolve().parent.parent / "web" / "public"
BG = "#07080c"  # index.html theme-color

svg = (PUB / "favicon.svg").read_text()
vx, vy, vw, vh = map(float, re.search(r'viewBox="([^"]+)"', svg).group(1).split())
rects = [
    (fill, *map(float, r))
    for fill, body in re.findall(r'<g fill="(#[0-9a-fA-F]{6})">(.*?)</g>', svg, re.S)
    for r in re.findall(r'<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"', body)
]
assert rects, "no <rect>s found in favicon.svg"


def render(size: int, art: float) -> Image.Image:
    """art = share of the canvas the viewBox fills (maskable keeps the saucer in the 80% safe circle)."""
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    s = size * art / max(vw, vh)
    ox = (size - vw * s) / 2 - vx * s
    oy = (size - vh * s) / 2 - vy * s
    for fill, x, y, w, h in rects:
        d.rectangle(
            [round(ox + x * s), round(oy + y * s), round(ox + (x + w) * s) - 1, round(oy + (y + h) * s) - 1],
            fill=fill,
        )
    return img


for name, size, art in [
    ("icon-192.png", 192, 0.8),
    ("icon-512.png", 512, 0.8),
    ("icon-maskable-512.png", 512, 0.6),
    ("apple-touch-icon.png", 180, 0.75),
]:
    render(size, art).save(PUB / name, optimize=True)
    print(name)
