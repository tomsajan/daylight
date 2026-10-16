"""Draws the app icons in public/: a sun rising over a dark horizon.

Full-bleed squares, so they also serve as maskable icons (the sun stays inside
the safe circle). Plain Python, no image libraries: run `python3 scripts/make-icons.py`.
"""
import math
import struct
import zlib
from pathlib import Path

SKY = (13, 20, 40)
GROUND = (3, 5, 12)
SUN = (242, 165, 22)
GLOW = (242, 196, 109)
SS = 4  # supersampling per axis


def color(x: float, y: float) -> tuple:
    horizon = 0.62
    if y > horizon:
        return GROUND
    d = math.hypot(x - 0.5, y - horizon)
    if d < 0.2:
        return SUN
    # A soft glow around the sun, fading into the sky.
    t = max(0.0, 1 - (d - 0.2) / 0.3) ** 2 * 0.35
    return tuple(round(s + (g - s) * t) for s, g in zip(SKY, GLOW))


def png(size: int) -> bytes:
    rows = []
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            acc = [0, 0, 0]
            for sj in range(SS):
                for si in range(SS):
                    c = color((i + (si + 0.5) / SS) / size, (j + (sj + 0.5) / SS) / size)
                    for k in range(3):
                        acc[k] += c[k]
            row += bytes(round(a / SS / SS) for a in acc)
        rows.append(bytes(row))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(b''.join(rows), 9))
        + chunk(b'IEND', b'')
    )


out = Path(__file__).resolve().parent.parent / 'public'
out.mkdir(exist_ok=True)
for size, name in [(192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')]:
    (out / name).write_bytes(png(size))
    print(name)
