/**
 * Ground elevation from the Terrarium tiles (Mapzen's terrain tiles, hosted on
 * AWS open data): PNG tiles in the web Mercator scheme whose colour encodes
 * metres above sea level, about 30 m across at best. They need no key.
 *
 * The sea floor is in the data as well; the sea is taken as its surface, at zero.
 * Land below sea level comes out at zero too.
 */

export const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const TERRAIN_CREDIT = 'Terrain: Mapzen terrain tiles (SRTM, GMTED, ETOPO1 and others), AWS open data';

export const TILE_SIZE = 256;
/** Web Mercator ends here. */
export const MAX_LATITUDE = 85.0511;

/** Where a point falls in the tile grid of a zoom level, in tiles from the top left corner. */
export function tilePosition(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const phi = (Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)) * Math.PI) / 180;
  const x = ((((lon + 180) / 360) % 1) + 1) % 1;
  const y = (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2;
  return { x: x * n, y: Math.min(n - 1e-9, Math.max(0, y * n)) };
}

export const tileKey = (zoom: number, x: number, y: number) => `${zoom}/${x}/${y}`;

/** The tile a point is in, as "z/x/y". */
export function tileAt(lat: number, lon: number, zoom: number): string {
  const p = tilePosition(lat, lon, zoom);
  return tileKey(zoom, Math.floor(p.x), Math.floor(p.y));
}

/** Metres above sea level from a tile's RGBA pixels. */
export function decodeTerrarium(rgba: ArrayLike<number>): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) {
    const h = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768;
    out[i] = h > 0 ? h : 0;
  }
  return out;
}

export type TileLoader = (key: string, signal?: AbortSignal) => Promise<Float32Array>;

/** Downloads a tile and reads its pixels; in a browser only. */
export const fetchTerrarium: TileLoader = async (key, signal) => {
  const [z, x, y] = key.split('/');
  const res = await fetch(TERRARIUM_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y), { signal });
  if (!res.ok) throw new Error(`Terrain tile ${key}: HTTP ${res.status}`);
  // The colours are numbers: no colour management, no premultiplied alpha.
  const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return decodeTerrarium(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data);
};

/** Tiles kept in memory, the least recently used dropped first. */
export class ElevationTiles {
  private tiles = new Map<string, Float32Array>();
  /** The tile read last, as rays mostly stay in one for a while. */
  private last: { zoom: number; x: number; y: number; data: Float32Array } | null = null;

  constructor(
    private load: TileLoader = fetchTerrarium,
    private capacity = 96,
  ) {}

  /** Loads the tiles not yet in memory. */
  async ensure(keys: Iterable<string>, signal?: AbortSignal): Promise<void> {
    const wanted = [...new Set(keys)];
    for (const key of wanted) {
      const have = this.tiles.get(key);
      if (!have) continue;
      // Moved to the fresh end.
      this.tiles.delete(key);
      this.tiles.set(key, have);
    }
    await Promise.all(
      wanted
        .filter((key) => !this.tiles.has(key))
        .map(async (key) => {
          this.tiles.set(key, await this.load(key, signal));
        }),
    );
    const spare = this.tiles.size - Math.max(this.capacity, wanted.length);
    for (const key of [...this.tiles.keys()].slice(0, Math.max(0, spare))) {
      if (!wanted.includes(key)) this.tiles.delete(key);
    }
    this.last = null;
  }

  /** Elevation in metres at a point, between the four pixels around it; NaN where the tile is not loaded. */
  elevation = (lat: number, lon: number, zoom: number): number => {
    const p = tilePosition(lat, lon, zoom);
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    let last = this.last;
    if (!last || last.x !== tx || last.y !== ty || last.zoom !== zoom) {
      const data = this.tiles.get(tileKey(zoom, tx, ty));
      if (!data) return NaN;
      last = this.last = { zoom, x: tx, y: ty, data };
    }
    const data = last.data;
    // Pixel centres are half a pixel in; at the tile's edge the last pixel is used as it is.
    const px = Math.min(TILE_SIZE - 1, Math.max(0, (p.x - tx) * TILE_SIZE - 0.5));
    const py = Math.min(TILE_SIZE - 1, Math.max(0, (p.y - ty) * TILE_SIZE - 0.5));
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const x1 = Math.min(TILE_SIZE - 1, x0 + 1);
    const y1 = Math.min(TILE_SIZE - 1, y0 + 1);
    const fx = px - x0;
    const fy = py - y0;
    const top = data[y0 * TILE_SIZE + x0] * (1 - fx) + data[y0 * TILE_SIZE + x1] * fx;
    const bottom = data[y1 * TILE_SIZE + x0] * (1 - fx) + data[y1 * TILE_SIZE + x1] * fx;
    return top * (1 - fy) + bottom * fy;
  };
}
