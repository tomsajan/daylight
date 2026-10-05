/**
 * The skyline from a point: how high the ground stands against the sky in each
 * direction. Rays are walked outwards over the elevation data, and for each the
 * steepest line of sight to the ground along it is kept.
 *
 * The Earth is a sphere here, and light along the ground bends as in a standard
 * atmosphere (a refraction coefficient of 0.13, which amounts to an Earth a
 * seventh larger). Close by the data is read finely, farther out coarsely; on
 * request all of it more finely, which only tells more where the survey behind
 * the tiles is itself finer than 30 m.
 *
 * Bare ground only: no trees and no buildings. The data is about 30 m across, so
 * what stands within a few hundred metres is rough.
 */

import { MAX_LATITUDE, tileKey, tilePosition } from './tiles';

const RAD = Math.PI / 180;
const EARTH_RADIUS = 6_371_000;
/** How much of the Earth's curvature the bending of light along the ground takes away. */
export const TERRESTRIAL_REFRACTION = 0.13;
const EFFECTIVE_RADIUS = EARTH_RADIUS / (1 - TERRESTRIAL_REFRACTION);

/** Out to `to` metres the ground is read at this zoom level, every `step` metres. */
interface Tier {
  zoom: number;
  to: number;
  step: number;
}
const TIERS: Tier[] = [
  { zoom: 13, to: 6_000, step: 20 },
  { zoom: 11, to: 30_000, step: 60 },
  { zoom: 9, to: 200_000, step: 250 },
];
/** The finest the tiles have near the observer, and two levels finer than usual beyond. */
const PRECISE_TIERS: Tier[] = [
  { zoom: 15, to: 3_000, step: 6 },
  { zoom: 14, to: 10_000, step: 12 },
  { zoom: 12, to: 40_000, step: 30 },
  { zoom: 10, to: 200_000, step: 120 },
];
/** Nearer than this the data says little about what is in the way. */
const NEAREST = 40;
const NEAREST_PRECISE = 20;
export const MAX_REACH = TIERS.at(-1)!.to;
const tiersOf = (req: SkylineRequest) => (req.precise ? PRECISE_TIERS : TIERS);

export interface SkylineRequest {
  lat: number;
  lon: number;
  /** The directions wanted, degrees clockwise from north; to is from plus up to 360. */
  from: number;
  to: number;
  /** Between rays, degrees. */
  step?: number;
  /** How far out to look, metres. */
  reach?: number;
  /** Eye height above the ground, metres. */
  eye?: number;
  /** The ground under the observer, metres above sea level, when known better than the data has it. */
  ground?: number;
  /** Read the ground more finely: several times the tiles and the work. */
  precise?: boolean;
}

export interface Skyline {
  lat: number;
  lon: number;
  /** Ground under the observer and the eye above it, metres above sea level. */
  ground: number;
  eye: number;
  /** Direction of the first ray and the angle between rays, degrees. */
  from: number;
  step: number;
  reach: number;
  precise: boolean;
  /** Per ray: the skyline's angle above the horizontal as seen, degrees. */
  angle: Float32Array;
  /** Per ray: how far the ground making the skyline is, and how high above sea level, metres. */
  distance: Float32Array;
  height: Float32Array;
}

/** Ground elevation in metres at a point, read at a zoom level; NaN where unknown. */
export type Elevation = (lat: number, lon: number, zoom: number) => number;

/**
 * How far terrain can matter to something no lower in the sky than `altitude`
 * degrees: ground 8 km above the observer would have to be nearer than this to
 * reach that high.
 */
export function reachFor(altitude: number): number {
  const a = Math.max(0.5, altitude);
  return Math.min(MAX_REACH, Math.max(TIERS[1].to, 8000 / Math.tan(a * RAD)));
}

/** The point `distance` metres from a start in a direction, along a great circle. */
export function destination(lat: number, lon: number, azimuth: number, distance: number): { lat: number; lon: number } {
  const phi = lat * RAD;
  const delta = distance / EARTH_RADIUS;
  const sinLat = Math.sin(phi) * Math.cos(delta) + Math.cos(phi) * Math.sin(delta) * Math.cos(azimuth * RAD);
  const dLon = Math.atan2(Math.sin(azimuth * RAD) * Math.sin(delta) * Math.cos(phi), Math.cos(delta) - Math.sin(phi) * sinLat);
  return { lat: Math.asin(sinLat) / RAD, lon: ((((lon + dLon / RAD + 180) % 360) + 360) % 360) - 180 };
}

/**
 * The angle above the horizontal at which ground `height` metres above sea level
 * and `distance` metres away is seen from `eye` metres above sea level, degrees.
 */
export function sightAngle(eye: number, height: number, distance: number): number {
  const theta = distance / EFFECTIVE_RADIUS;
  const r = EFFECTIVE_RADIUS + height;
  return Math.atan2(r * Math.cos(theta) - (EFFECTIVE_RADIUS + eye), r * Math.sin(theta)) / RAD;
}

function rayCount(req: SkylineRequest): { n: number; step: number } {
  const step = req.step ?? 0.2;
  return { n: Math.max(2, Math.round((req.to - req.from) / step) + 1), step };
}

/** The distances at which a ray reads the ground, each with its zoom level. */
function stations(req: SkylineRequest): { d: number; zoom: number }[] {
  const reach = Math.min(MAX_REACH, req.reach ?? MAX_REACH);
  const out: { d: number; zoom: number }[] = [];
  let d = req.precise ? NEAREST_PRECISE : NEAREST;
  for (const tier of tiersOf(req)) {
    const end = Math.min(tier.to, reach);
    for (; d <= end; d += tier.step) out.push({ d, zoom: tier.zoom });
  }
  return out;
}

/** Calls visit for every point every ray reads, or for every stride-th of them along the ray. */
function walk(req: SkylineRequest, visit: (ray: number, d: number, lat: number, lon: number, zoom: number) => void, stride = 1): void {
  const { n, step } = rayCount(req);
  const points = stations(req).filter((_, k) => k % stride === 0);
  const phi = req.lat * RAD;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const deltas = points.map((p) => [Math.sin(p.d / EARTH_RADIUS), Math.cos(p.d / EARTH_RADIUS)]);
  for (let i = 0; i < n; i++) {
    const az = (req.from + i * step) * RAD;
    const sinAz = Math.sin(az);
    const cosAz = Math.cos(az);
    for (let k = 0; k < points.length; k++) {
      const [sinD, cosD] = deltas[k];
      const sinLat = sinPhi * cosD + cosPhi * sinD * cosAz;
      const lat = Math.asin(sinLat) / RAD;
      if (Math.abs(lat) > MAX_LATITUDE) break;
      const lon = req.lon + Math.atan2(sinAz * sinD * cosPhi, cosD - sinPhi * sinLat) / RAD;
      visit(i, points[k].d, lat, lon, points[k].zoom);
    }
  }
}

/** The elevation tiles a skyline needs, as "z/x/y". */
export function skylineTiles(req: SkylineRequest): string[] {
  // Zoom, column and row packed into one number.
  const seen = new Set<number>();
  const add = (lat: number, lon: number, zoom: number) => {
    const p = tilePosition(lat, lon, zoom);
    seen.add((zoom * 65536 + Math.floor(p.x)) * 65536 + Math.floor(p.y));
  };
  add(req.lat, req.lon, tiersOf(req)[0].zoom);
  // Every fourth point is plenty to tell which tiles a ray crosses: they are far smaller than a tile apart.
  walk(req, (_ray, _d, lat, lon, zoom) => add(lat, lon, zoom), 4);
  return [...seen].map((v) => tileKey(Math.floor(v / 65536 / 65536), Math.floor(v / 65536) % 65536, v % 65536));
}

/** The skyline over the directions asked for; its tiles must be at hand. */
export function skyline(req: SkylineRequest, elevation: Elevation): Skyline {
  const { n, step } = rayCount(req);
  const ground = req.ground ?? elevation(req.lat, req.lon, tiersOf(req)[0].zoom);
  if (Number.isNaN(ground)) throw new Error('No elevation data at the observer');
  const eye = ground + (req.eye ?? 2);
  const reach = Math.min(MAX_REACH, req.reach ?? MAX_REACH);
  // With nothing in the way a ray ends level; the sea or a plain soon brings it to the true horizon.
  const tangent = new Float64Array(n).fill(-Infinity);
  const distance = new Float32Array(n);
  const height = new Float32Array(n);
  walk(req, (i, d, lat, lon, zoom) => {
    const h = elevation(lat, lon, zoom);
    if (Number.isNaN(h)) return;
    // Compared by tangent, the angle itself only worked out for the winner.
    const theta = d / EFFECTIVE_RADIUS;
    const r = EFFECTIVE_RADIUS + h;
    const t = (r * Math.cos(theta) - (EFFECTIVE_RADIUS + eye)) / (r * Math.sin(theta));
    if (t > tangent[i]) {
      tangent[i] = t;
      distance[i] = d;
      height[i] = h;
    }
  });
  const angle = new Float32Array(n);
  for (let i = 0; i < n; i++) angle[i] = tangent[i] === -Infinity ? 0 : Math.atan(tangent[i]) / RAD;
  return { lat: req.lat, lon: req.lon, ground, eye, from: req.from, step, reach, precise: !!req.precise, angle, distance, height };
}

export interface SkylinePoint {
  /** The skyline's angle above the horizontal, degrees. */
  angle: number;
  /** The ground making it: metres away and metres above sea level. */
  distance: number;
  height: number;
}

/** The skyline in a direction, between the two rays beside it; null outside the directions it covers. */
export function skylineAt(s: Skyline, azimuth: number): SkylinePoint | null {
  const n = s.angle.length;
  let offset = (((azimuth - s.from) % 360) + 360) % 360;
  // A direction just short of the first ray counts as the first ray.
  if (offset > 360 - s.step / 2) offset = 0;
  const at = offset / s.step;
  if (at > n - 1 + 0.5) return null;
  const i = Math.min(n - 1, Math.floor(at));
  const j = Math.min(n - 1, i + 1);
  const f = Math.min(1, at - i);
  const near = f < 0.5 ? i : j;
  return { angle: s.angle[i] * (1 - f) + s.angle[j] * f, distance: s.distance[near], height: s.height[near] };
}
