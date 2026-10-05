import { describe, expect, it } from 'vitest';
import { horizonDip } from '../astro/sun';
import { ElevationTiles, TILE_SIZE, decodeTerrarium, tileAt, tilePosition } from './tiles';
import { destination, reachFor, sightAngle, skyline, skylineAt, skylineTiles, type Elevation } from './horizon';
import { coverOf, seenAltitude, sightAt, terrainVisibility } from './visibility';

const RAD = Math.PI / 180;

/** Great-circle distance in metres, worked out apart from the code under test. */
function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const h =
    Math.sin(((b.lat - a.lat) * RAD) / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(((b.lon - a.lon) * RAD) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** A round hill on a plain at sea level. */
function hill(at: { lat: number; lon: number }, height: number, width: number): Elevation {
  return (lat, lon) => height * Math.exp(-((haversine(at, { lat, lon }) / width) ** 2));
}

describe('terrain tiles', () => {
  it('decodes Terrarium colours to metres, the sea at its surface', () => {
    // 32768 is sea level: (128, 0, 0). Mount Everest, 8848.5 m: 41616.5 = 162 * 256 + 144 + 128/256.
    expect([...decodeTerrarium([128, 0, 0, 255, 162, 144, 128, 255, 127, 0, 0, 255])]).toEqual([0, 8848.5, 0]);
  });

  it('places points in the tile grid', () => {
    // Prague, as any slippy map tile calculator has it.
    expect(tileAt(50.0875, 14.4213, 13)).toBe('13/4424/2775');
    expect(tileAt(0, 0, 1)).toBe('1/1/1');
    expect(tileAt(-33.8688, 151.2093, 9)).toBe('9/471/307');
    expect(tilePosition(0, -180, 3)).toEqual({ x: 0, y: 4 });
    // Past the date line the grid wraps.
    expect(tileAt(10, 190, 4)).toBe(tileAt(10, -170, 4));
  });

  it('reads the ground between pixels and keeps the tiles asked for last', async () => {
    let loads = 0;
    // A tile sloping up eastwards, a metre per pixel.
    const tiles = new ElevationTiles(async () => {
      loads++;
      return Float32Array.from({ length: TILE_SIZE * TILE_SIZE }, (_, i) => i % TILE_SIZE);
    }, 2);
    expect(tiles.elevation(0, 0, 1)).toBeNaN();
    await tiles.ensure(['1/1/1']);
    // A quarter of the way across tile 1/1/1: pixel 63.5.
    expect(tiles.elevation(-10, 45, 1)).toBeCloseTo(63.5, 6);
    expect(tiles.elevation(-10, 0, 1)).toBe(0);
    await tiles.ensure(['1/1/1', '1/0/1']);
    await tiles.ensure(['1/0/0', '1/1/1']);
    expect(loads).toBe(3);
    expect(tiles.elevation(-10, -45, 1)).toBeNaN();
    expect(tiles.elevation(-10, 45, 1)).toBeCloseTo(63.5, 6);
  });
});

describe('skyline', () => {
  const here = { lat: 47, lon: 11 };

  it('goes the distance in the direction asked', () => {
    const east = destination(here.lat, here.lon, 90, 50_000);
    expect(haversine(here, east)).toBeCloseTo(50_000, 0);
    expect(east.lon).toBeGreaterThan(here.lon);
    expect(Math.abs(east.lat - here.lat)).toBeLessThan(0.01);
    const north = destination(here.lat, here.lon, 0, 111_195);
    expect(north.lat).toBeCloseTo(48, 3);
    expect(north.lon).toBeCloseTo(11, 9);
    expect(destination(here.lat, here.lon, 180, 10_000).lat).toBeLessThan(here.lat);
    expect(destination(here.lat, here.lon, 270, 10_000).lon).toBeLessThan(here.lon);
  });

  it('sees ground lower with distance, by the curve of the Earth less refraction', () => {
    // Ground level with the eye sinks by d² / 2R, with R a seventh larger for refraction.
    const drop = 50_000 ** 2 / (2 * (6_371_000 / 0.87));
    expect(sightAngle(0, 0, 50_000)).toBeCloseTo((-Math.atan(drop / 50_000) / RAD) * 1, 2);
    expect(sightAngle(0, 2000, 50_000)).toBeCloseTo(Math.atan((2000 - drop) / 50_000) / RAD, 2);
    // Close by the Earth is flat.
    expect(sightAngle(100, 200, 100)).toBeCloseTo(45, 2);
  });

  it('finds a peak where it stands and as high as it should look', () => {
    // 2000 m, 50 km away towards 70°.
    const peak = destination(here.lat, here.lon, 70, 50_000);
    const s = skyline({ ...here, from: 40, to: 100, step: 0.25, eye: 0 }, hill(peak, 2000, 3000));
    let best = 0;
    for (let i = 1; i < s.angle.length; i++) if (s.angle[i] > s.angle[best]) best = i;
    expect(s.from + best * s.step).toBeCloseTo(70, 5);
    expect(s.angle[best]).toBeCloseTo(sightAngle(0, 2000, 50_000), 2);
    expect(s.angle[best]).toBeCloseTo(2.096, 2);
    expect(s.distance[best]).toBeGreaterThan(49_000);
    expect(s.distance[best]).toBeLessThan(50_250);
    expect(s.height[best]).toBeGreaterThan(1990);
    // Away from it the plain's horizon is all there is.
    expect(Math.abs(s.angle[0])).toBeLessThan(0.02);
    expect(skylineAt(s, 70)!.angle).toBeCloseTo(s.angle[best], 5);
    expect(skylineAt(s, 70 + 360)!.distance).toBe(s.distance[best]);
    expect(skylineAt(s, 39.95)!.angle).toBe(s.angle[0]);
    expect(skylineAt(s, 30)).toBeNull();
    expect(skylineAt(s, 101)).toBeNull();
  });

  it('keeps the nearer, lower hill when it stands higher in the sky', () => {
    const near = destination(here.lat, here.lon, 200, 2_000);
    const far = destination(here.lat, here.lon, 200, 60_000);
    const both: Elevation = (lat, lon, z) => Math.max(hill(near, 300, 100)(lat, lon, z), hill(far, 3000, 5000)(lat, lon, z));
    const s = skyline({ ...here, from: 190, to: 210, eye: 2 }, both);
    const p = skylineAt(s, 200)!;
    expect(p.distance).toBeGreaterThan(1_800);
    expect(p.distance).toBeLessThan(2_050);
    expect(p.angle).toBeCloseTo(Math.atan(298 / 2000) / RAD, 1);
    // Looking past its side, the far one shows.
    const side = skylineAt(s, 205)!;
    expect(side.distance).toBeGreaterThan(50_000);
  });

  it('dips to the sea horizon from a height', () => {
    // A 400 m island under the observer, sea all around.
    const island: Elevation = (lat, lon) => (haversine(here, { lat, lon }) < 30 ? 400 : 0);
    const s = skyline({ ...here, from: 0, to: 10, step: 1, eye: 0 }, island);
    expect(s.ground).toBe(400);
    // The same dip as the daylight side uses for sunrise from a height.
    for (const a of s.angle) expect(a).toBeCloseTo(-horizonDip(400), 1);
    expect(s.distance[0]).toBeGreaterThan(70_000);
    expect(s.distance[0]).toBeLessThan(80_000);
  });

  it('asks for the tiles its rays cross, finer close by', () => {
    const tiles = skylineTiles({ ...here, from: 80, to: 100, reach: 200_000 });
    const zooms = (z: number) => tiles.filter((t) => t.startsWith(`${z}/`));
    expect(tiles).toContain(tileAt(here.lat, here.lon, 13));
    const far = destination(here.lat, here.lon, 90, 150_000);
    expect(tiles).toContain(tileAt(far.lat, far.lon, 9));
    expect(tiles).not.toContain(tileAt(far.lat, far.lon, 13));
    const west = destination(here.lat, here.lon, 270, 20_000);
    expect(tiles).not.toContain(tileAt(west.lat, west.lon, 11));
    expect(zooms(13).length).toBeGreaterThan(0);
    expect(zooms(11).length).toBeGreaterThan(0);
    expect(zooms(9).length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThan(30);
    expect(skylineTiles({ ...here, from: 80, to: 100, reach: 20_000 }).some((t) => t.startsWith('9/'))).toBe(false);
  });

  it('looks far for a low Sun and not for a high one', () => {
    expect(reachFor(1)).toBe(200_000);
    expect(reachFor(10)).toBeCloseTo(8000 / Math.tan(10 * RAD), 0);
    expect(reachFor(50)).toBe(30_000);
  });
});

describe('a body against the skyline', () => {
  const here = { lat: 47, lon: 11 };
  // A wall 5° high to the west, flat elsewhere.
  const wall: Elevation = (lat, lon) => {
    const d = haversine(here, { lat, lon });
    return lon < here.lon && d > 9_900 && d < 10_100 ? 10_000 * Math.tan(5 * RAD) : 0;
  };
  const s = skyline({ ...here, from: 240, to: 300, step: 0.5, eye: 0 }, wall);
  const RADIUS = 0.267;
  const HOUR = 3_600_000;
  // Setting due west: 10° up at the start, 10° down two hours later.
  const setting = (ms: number) => ({ altitude: 10 - (20 * ms) / (2 * HOUR), azimuth: 270 });

  it('has the wall where it was put', () => {
    expect(skylineAt(s, 270)!.angle).toBeCloseTo(5, 1);
  });

  it('lifts the body by refraction before comparing', () => {
    expect(seenAltitude(0)).toBeCloseTo(0.48, 1);
    const sight = sightAt(s, 0, { altitude: 5, azimuth: 270 })!;
    expect(sight.altitude).toBeCloseTo(5.16, 1);
    expect(sight.clearance).toBeCloseTo(sight.altitude - sight.skyline, 9);
    expect(coverOf(sight, RADIUS)).toBe('cut');
    expect(coverOf(sightAt(s, 0, { altitude: 6, azimuth: 270 }), RADIUS)).toBe('clear');
    expect(coverOf(sightAt(s, 0, { altitude: 4, azimuth: 270 }), RADIUS)).toBe('hidden');
    expect(coverOf(sightAt(s, 0, { altitude: 4, azimuth: 100 }), RADIUS)).toBe('hidden');
  });

  it('finds when the body goes behind the wall, well before it would set', () => {
    const v = terrainVisibility(s, setting, 0, 2 * HOUR, RADIUS);
    expect(v.crossings.length).toBe(1);
    const c = v.crossings[0];
    expect(c.rising).toBe(false);
    // The upper limb on the skyline.
    expect(c.clearance).toBeCloseTo(-RADIUS, 3);
    expect(setting(c.time).altitude).toBeCloseTo(skylineAt(s, 270)!.angle - RADIUS - 0.16, 1);
    expect(c.distance).toBeGreaterThan(9_800);
    expect(c.distance).toBeLessThan(10_200);
    expect(v.spans).toEqual([{ start: 0, end: c.time }]);
    // On a plain it sets later, at the horizon.
    const flat = skyline({ ...here, from: 240, to: 300, step: 0.5, eye: 0 }, () => 0);
    const open = terrainVisibility(flat, setting, 0, 2 * HOUR, RADIUS);
    expect(open.crossings[0].time - c.time).toBeGreaterThan(0.5 * HOUR);
    // Upper limb on the horizon: the centre a radius and the refraction below it.
    expect(setting(open.crossings[0].time).altitude).toBeGreaterThan(-0.95);
    expect(setting(open.crossings[0].time).altitude).toBeLessThan(-0.8);
  });

  it('finds the rising too, and how close a pass was', () => {
    const rising = (ms: number) => setting(2 * HOUR - ms);
    const v = terrainVisibility(s, rising, 0, 2 * HOUR, RADIUS);
    expect(v.crossings.map((c) => c.rising)).toEqual([true]);
    expect(v.spans).toEqual([{ start: v.crossings[0].time, end: 2 * HOUR }]);
    // Passing over the wall and never touching it: clear by a degree at the lowest.
    const high = terrainVisibility(s, (ms) => ({ altitude: 6.1 + RADIUS + Math.abs(ms - HOUR) / HOUR, azimuth: 270 }), 0, 2 * HOUR, RADIUS);
    expect(high.crossings).toEqual([]);
    expect(high.spans).toEqual([{ start: 0, end: 2 * HOUR }]);
    expect(high.tightest!.time).toBeCloseTo(HOUR, -4);
    expect(high.tightest!.clearance).toBeCloseTo(6.1 + 0.14 - skylineAt(s, 270)!.angle, 1);
    // Behind the wall throughout.
    const low = terrainVisibility(s, () => ({ altitude: 2, azimuth: 270 }), 0, 2 * HOUR, RADIUS);
    expect(low.spans).toEqual([]);
    expect(low.tightest).toBeUndefined();
  });
});
