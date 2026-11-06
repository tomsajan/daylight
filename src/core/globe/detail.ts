/**
 * Sharper imagery for the part of the globe in view, from NASA GIBS: the same
 * Blue Marble and Black Marble as the globe's own images, as tiles down to 500 m
 * per pixel. When zoomed in past what the globe's images show, the tiles under
 * the view are drawn into one picture (a patch), which the globe lays over its
 * own images there.
 *
 * GIBS tiles are in plain latitude and longitude (EPSG:4326): 512 pixels square,
 * counted from the top left corner at 90° N, 180° W, each 288° / 2^level across.
 */

export type DetailLayer = 'day' | 'night';

export const DETAIL_URLS: Record<DetailLayer, string> = {
  day: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/{z}/{y}/{x}.jpeg',
  night: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_Black_Marble/default/2016-01-01/500m/{z}/{y}/{x}.png',
};
export const DETAIL_CREDIT = 'NASA GIBS: Blue Marble, Black Marble 2016';

export const DETAIL_TILE = 512;
/** 500 m per pixel; the data has nothing finer. */
export const DETAIL_MAX_LEVEL = 7;

/** Degrees a tile spans at a level. */
export const tileDegrees = (level: number) => 288 / 2 ** level;
/** Tiles around the world at a level. */
export const tileColumns = (level: number) => Math.ceil(360 / tileDegrees(level));
export const tileRows = (level: number) => Math.ceil(180 / tileDegrees(level));

/** What is in view: latitudes and longitudes (west may run past 180 into east, i.e. east > west always). */
export interface ViewBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

/** A block of tiles at one level: columns from col (wrapping round the world), rows from row. */
export interface Patch {
  level: number;
  col: number;
  row: number;
  cols: number;
  rows: number;
}

export const patchKey = (p: Patch) => `${p.level}/${p.col}/${p.row}/${p.cols}x${p.rows}`;

/**
 * The patch to show for a view, or null where the globe's own images are sharp
 * enough. resolution: degrees of latitude per screen pixel at the centre of the
 * view; base: degrees per pixel of the globe's own images. At most maxCols by
 * maxRows tiles, so the level is lowered until the view fits.
 */
export function choosePatch(view: ViewBounds, resolution: number, base: number, maxCols: number, maxRows: number): Patch | null {
  const pixel = (level: number) => tileDegrees(level) / DETAIL_TILE;
  // The coarsest level whose pixels are no larger than a screen pixel (or a little over).
  let level = Math.ceil(Math.log2(tileDegrees(0) / DETAIL_TILE / (resolution * 1.25)));
  level = Math.min(DETAIL_MAX_LEVEL, Math.max(0, level));
  for (; level >= 0; level--) {
    // Not worth it unless clearly sharper than what the globe has anyway.
    if (pixel(level) > base / 1.6) return null;
    const span = tileDegrees(level);
    const col = Math.floor((view.west + 180) / span);
    const cols = Math.floor((view.east + 180) / span) - col + 1;
    const row = Math.max(0, Math.floor((90 - Math.min(90, view.north)) / span));
    const rows = Math.min(tileRows(level) - 1, Math.floor((90 - Math.max(-90, view.south)) / span)) - row + 1;
    if (cols <= maxCols && rows <= maxRows) {
      const n = tileColumns(level);
      return { level, col: ((col % n) + n) % n, row, cols, rows };
    }
  }
  return null;
}

/** Where a patch lies in the globe's texture coordinates: u from west (0 at 180° W), v from south (0 at 90° S); spans. */
export function patchBox(p: Patch): [u0: number, v0: number, uSpan: number, vSpan: number] {
  const span = tileDegrees(p.level);
  const west = -180 + p.col * span;
  const south = 90 - (p.row + p.rows) * span;
  return [(west + 180) / 360, (south + 90) / 180, (p.cols * span) / 360, (p.rows * span) / 180];
}

/** The tiles of a patch, with where each goes in the patch's picture, in tiles from its top left. */
export function patchTiles(p: Patch): { x: number; y: number; dx: number; dy: number }[] {
  const n = tileColumns(p.level);
  const out: { x: number; y: number; dx: number; dy: number }[] = [];
  for (let dy = 0; dy < p.rows; dy++) for (let dx = 0; dx < p.cols; dx++) out.push({ x: (p.col + dx) % n, y: p.row + dy, dx, dy });
  return out;
}

export const tileUrl = (layer: DetailLayer, level: number, x: number, y: number) =>
  DETAIL_URLS[layer].replace('{z}', String(level)).replace('{y}', String(y)).replace('{x}', String(x));

/** Downloads tiles and draws patches; the tiles last used are kept in memory. In a browser only. */
export class DetailTiles {
  private tiles = new Map<string, ImageBitmap>();

  constructor(private capacity = 96) {}

  /** The patch's picture, north up; null when aborted or a tile could not be had (offline, say). */
  async draw(layer: DetailLayer, p: Patch, signal: AbortSignal): Promise<HTMLCanvasElement | null> {
    const tiles = patchTiles(p);
    try {
      const images = await Promise.all(tiles.map((t) => this.tile(tileUrl(layer, p.level, t.x, t.y), signal)));
      if (signal.aborted) return null;
      const canvas = document.createElement('canvas');
      canvas.width = p.cols * DETAIL_TILE;
      canvas.height = p.rows * DETAIL_TILE;
      const ctx = canvas.getContext('2d')!;
      tiles.forEach((t, i) => ctx.drawImage(images[i], t.dx * DETAIL_TILE, t.dy * DETAIL_TILE));
      return canvas;
    } catch {
      return null;
    }
  }

  private async tile(url: string, signal: AbortSignal): Promise<ImageBitmap> {
    const have = this.tiles.get(url);
    if (have) {
      // Moved to the fresh end.
      this.tiles.delete(url);
      this.tiles.set(url, have);
      return have;
    }
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Detail tile: HTTP ${res.status}`);
    const image = await createImageBitmap(await res.blob());
    this.tiles.set(url, image);
    // Not closed when dropped: a patch still being drawn may hold it; the browser frees it after.
    for (const key of this.tiles.keys()) {
      if (this.tiles.size <= this.capacity) break;
      this.tiles.delete(key);
    }
    return image;
  }

  dispose(): void {
    for (const image of this.tiles.values()) image.close();
    this.tiles.clear();
  }
}
