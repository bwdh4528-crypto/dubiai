from pathlib import Path
from PIL import Image, ImageDraw

out = Path("client/public")
out.mkdir(parents=True, exist_ok=True)

def create(size: int, path: Path) -> None:
    image = Image.new("RGBA", (size, size), "#0b0d12")
    draw = ImageDraw.Draw(image)
    radius = size // 5
    draw.rounded_rectangle((size * .115, size * .115, size * .885, size * .885), radius=radius, fill="#4c3a83")
    draw.rounded_rectangle((size * .18, size * .18, size * .82, size * .82), radius=radius, fill="#2b205d")
    cx = cy = size / 2
    points = []
    for i in range(8):
        import math
        angle = math.pi / 4 * i - math.pi / 2
        r = size * (.29 if i % 2 == 0 else .075)
        points.append((cx + math.cos(angle) * r, cy + math.sin(angle) * r))
    draw.polygon(points, fill="#f8f6ff")
    draw.ellipse((size * .69, size * .19, size * .77, size * .27), fill="#d9cdff")
    image.save(path, "PNG", optimize=True)

create(192, out / "icon-192.png")
create(512, out / "icon-512.png")
create(180, out / "apple-touch-icon.png")
