import { describe, expect, it } from 'vitest';
import { choosePatch, patchBox, patchTiles, tileColumns, tileDegrees, tileRows, tileUrl } from './detail';

const BASE_8K = 360 / 8192;

describe('detail tiles', () => {
  it('has the GIBS 500 m grid', () => {
    expect([0, 1, 2, 3, 7].map(tileColumns)).toEqual([2, 3, 5, 10, 160]);
    expect([0, 3, 7].map(tileRows)).toEqual([1, 5, 80]);
    expect(tileDegrees(7)).toBe(2.25);
    expect(tileUrl('night', 7, 86, 17)).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_Black_Marble/default/2016-01-01/500m/7/17/86.png',
    );
  });

  it('keeps to the globe’s own images when they are sharp enough', () => {
    const view = { south: 30, north: 70, west: -10, east: 40 };
    expect(choosePatch(view, 0.05, BASE_8K, 8, 4)).toBeNull();
  });

  it('takes the finest level the screen can show, over the view', () => {
    // Around Prague, half a kilometre a screen pixel.
    const view = { south: 48.5, north: 51.5, west: 11, east: 18 };
    const p = choosePatch(view, 0.0045, BASE_8K, 8, 4)!;
    expect(p.level).toBe(7);
    expect(p).toMatchObject({ col: 84, row: 17, cols: 5, rows: 2 });
    const [u0, v0, uSpan, vSpan] = patchBox(p);
    expect(u0 * 360 - 180).toBeCloseTo(9);
    expect(u0 * 360 - 180 + uSpan * 360).toBeCloseTo(20.25);
    expect(v0 * 180 - 90).toBeCloseTo(47.25);
    expect(v0 * 180 - 90 + vSpan * 180).toBeCloseTo(51.75);
    expect(patchTiles(p)).toHaveLength(10);
  });

  it('goes a level coarser where the view does not fit', () => {
    const view = { south: 40, north: 52, west: 0, east: 30 };
    const p = choosePatch(view, 0.0045, BASE_8K, 8, 4)!;
    expect(p.level).toBeLessThan(7);
    expect(p.cols).toBeLessThanOrEqual(8);
    expect(p.rows).toBeLessThanOrEqual(4);
  });

  it('wraps round the antimeridian', () => {
    // Fiji, the view running from 177° E to 182° E (178° W).
    const p = choosePatch({ south: -19, north: -16, west: 177, east: 182 }, 0.0045, BASE_8K, 8, 4)!;
    expect(p.level).toBe(7);
    expect(p.col).toBe(158);
    const tiles = patchTiles(p);
    expect(tiles.map((t) => t.x)).toContain(0);
    expect(tiles.map((t) => t.x)).toContain(159);
  });
});
