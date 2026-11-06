"""Makes the globe's day and night images in src/core/globe/textures/, at 4096 and 8192 wide.

- Day: NASA Blue Marble, shaded relief and bathymetry, from NASA GIBS (500 m per pixel),
  fetched in four quarters as one request would be too large.
- Night: NASA Black Marble 2016 (13500 x 6750, about 3 km per pixel), scaled down.

Needs Pillow: run `python3 scripts/make-earth-textures.py`. Downloads about 50 MB.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

OUT = Path(__file__).resolve().parent.parent / 'src' / 'core' / 'globe' / 'textures'
DAY_WMS = (
    'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap'
    '&VERSION=1.3.0&CRS=EPSG:4326&FORMAT=image/png&LAYERS=BlueMarble_ShadedRelief_Bathymetry'
)
NIGHT = (
    'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/'
    '144000/144898/BlackMarble_2016_3km.jpg'
)
QUALITY = 85


def fetch(url: str) -> Image.Image:
    with urllib.request.urlopen(url, timeout=300) as res:
        return Image.open(io.BytesIO(res.read())).convert('RGB')


def save(image: Image.Image, name: str) -> None:
    image.save(OUT / name, quality=QUALITY, optimize=True, progressive=True)
    print(name, f'{(OUT / name).stat().st_size / 1e6:.2f} MB')


def both(image: Image.Image, stem: str) -> None:
    """The 8192 wide image and the 4096 wide one, both scaled from the same source."""
    big = image if image.width == 8192 else image.resize((8192, 4096), Image.LANCZOS)
    save(big, f'{stem}-8k.jpg')
    save(big.resize((4096, 2048), Image.LANCZOS), f'{stem}.jpg')


def day() -> Image.Image:
    # BBOX in EPSG:4326 with WMS 1.3.0 is south, west, north, east.
    full = Image.new('RGB', (8192, 4096))
    for south, west, x, y in [(0, -180, 0, 0), (0, 0, 4096, 0), (-90, -180, 0, 2048), (-90, 0, 4096, 2048)]:
        box = f'{south},{west},{south + 90},{west + 180}'
        full.paste(fetch(f'{DAY_WMS}&BBOX={box}&WIDTH=4096&HEIGHT=2048'), (x, y))
    return full


if __name__ == '__main__':
    both(day(), 'earth-blue-marble')
    both(fetch(NIGHT), 'earth-night')
