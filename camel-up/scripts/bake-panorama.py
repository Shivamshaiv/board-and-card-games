"""Bake the cylindrical source artwork into a lat-long sky and its reflection map."""
from math import cos, pi, tan
from pathlib import Path

from PIL import Image, ImageDraw


ART = Path(__file__).resolve().parents[1] / "public" / "art"
SOURCES = Path(__file__).resolve().parents[1] / "art-sources"
WIDTH, HEIGHT = 4096, 2048
stops = [(0, (95, 156, 172)), (.29, (155, 193, 194)), (.435, (234, 214, 175)),
         (.52, (240, 202, 151)), (.68, (195, 153, 114)), (1, (141, 116, 89))]
sky = Image.new("RGB", (WIDTH, HEIGHT))
brush = ImageDraw.Draw(sky)
for y in range(HEIGHT):
    t = y / HEIGHT
    for (a, rgb), (b, other) in zip(stops, stops[1:]):
        if a <= t <= b:
            color = tuple(round(m + (n - m) * (t - a) / (b - a)) for m, n in zip(rgb, other))
            brush.line((0, y, WIDTH, y), fill=color)
            break

clouds = Image.open(SOURCES / "oasis-sky.webp").convert("RGB")
clouds = clouds.crop((0, 0, clouds.width, round(clouds.height * .78)))
clouds = clouds.resize((WIDTH, round(HEIGHT * .56)), Image.Resampling.LANCZOS)
top = Image.blend(sky.crop((0, 0, WIDTH, clouds.height)), clouds, .32)
sky.paste(top)

source = Image.open(SOURCES / "terrace-panorama.webp").convert("RGB")
source = source.crop((round(source.width * .04), 0, round(source.width * .96), source.height))
sector = round(WIDTH * .358)  # A 129-degree field, aligned with the modelled river.
left = round(.188 * WIDTH - sector / 2)
source = source.resize((sector, source.height), Image.Resampling.LANCZOS)
edge = [round(255 * min(1, x / (sector * .15), (sector - 1 - x) / (sector * .15))) for x in range(sector)]
for y in range(HEIGHT):
    angle = (.5 - y / HEIGHT) * pi
    if abs(angle) > .72:
        continue
    sy = (.33 - tan(angle) * 2.20) * source.height
    if not 0 <= sy < source.height - 1:
        continue
    dy = max(1, source.height * 2.20 * pi / HEIGHT / cos(angle) ** 2)
    strip = source.transform((sector, 1), Image.Transform.AFFINE, (1, 0, 0, 0, dy, sy), Image.Resampling.BICUBIC)
    opacity = min(1, sy / (source.height * .18), (source.height - sy) / (source.height * .12))
    mask = Image.frombytes("L", (sector, 1), bytes(round(a * opacity) for a in edge))
    sky.paste(strip, (left, y), mask)

sky.save(ART / "oasis-environment.webp", quality=88, method=6)
sky.resize((512, 256), Image.Resampling.LANCZOS).save(ART / "oasis-reflection.webp", quality=83, method=6)
