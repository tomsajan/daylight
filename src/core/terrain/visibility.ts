/**
 * The Sun or the Moon against a skyline: whether the ground hides it at a given
 * moment, and when it comes over the skyline or goes behind it.
 *
 * The body is put where it is seen, lifted by refraction in the air, and
 * compared with the skyline in its direction.
 */

import { refraction } from '../astro/sun';
import { skylineAt, type Skyline } from './horizon';

/** Where a body is, without refraction: degrees above the horizon and clockwise from north. */
export interface SkyPosition {
  altitude: number;
  azimuth: number;
}

export interface Sight {
  time: number;
  /** The body's centre as seen, refraction included, degrees. */
  altitude: number;
  azimuth: number;
  /** The skyline below or above it, degrees; the ground making it, metres away and above sea level. */
  skyline: number;
  distance: number;
  height: number;
  /** The centre above the skyline (below it when negative), degrees. */
  clearance: number;
}

/** Altitude as seen; refraction is held steady below the horizon, where it only matters for drawing. */
export function seenAltitude(geometric: number): number {
  return geometric + refraction(Math.max(geometric, -1.9));
}

/** The body against the skyline at one moment; null where the skyline does not cover its direction. */
export function sightAt(s: Skyline, time: number, p: SkyPosition): Sight | null {
  const sky = skylineAt(s, p.azimuth);
  if (!sky) return null;
  const altitude = seenAltitude(p.altitude);
  return { time, altitude, azimuth: p.azimuth, skyline: sky.angle, distance: sky.distance, height: sky.height, clearance: altitude - sky.angle };
}

export interface Crossing extends Sight {
  /** Coming over the skyline, as opposed to going behind it. */
  rising: boolean;
}

export interface TerrainVisibility {
  /** When some of the disc is above the skyline. */
  spans: { start: number; end: number }[];
  /** The upper limb crossing the skyline. */
  crossings: Crossing[];
  /** While in view, the moment the disc's lower limb is closest to the skyline; its clearance is that of the limb. */
  tightest?: Sight;
}

/**
 * A body of angular radius `radius` degrees against the skyline from start to
 * end (Unix ms); position gives where it is at a moment.
 */
export function terrainVisibility(
  s: Skyline,
  position: (ms: number) => SkyPosition,
  start: number,
  end: number,
  radius: number,
  steps = 360,
): TerrainVisibility {
  // Above zero while some of the disc shows; a direction the skyline does not cover counts as hidden.
  const showing = (ms: number) => (sightAt(s, ms, position(ms))?.clearance ?? -90) + radius;
  const result: TerrainVisibility = { spans: [], crossings: [] };
  let prevT = start;
  let prev = showing(start);
  let from = prev > 0 ? start : null;
  const note = (t: number) => {
    const sight = sightAt(s, t, position(t))!;
    const limb = sight.clearance - radius;
    if (!result.tightest || limb < result.tightest.clearance) result.tightest = { ...sight, clearance: limb };
  };
  if (prev > 0) note(start);
  for (let i = 1; i <= steps; i++) {
    const t = start + ((end - start) * i) / steps;
    const now = showing(t);
    if (now > 0 !== prev > 0) {
      let lo = prevT;
      let hi = t;
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2;
        if (showing(mid) > 0 === prev > 0) lo = mid;
        else hi = mid;
      }
      // Taken on the side where the body shows, so its direction is covered.
      const tc = now > 0 ? hi : lo;
      const sight = sightAt(s, tc, position(tc));
      if (sight) result.crossings.push({ ...sight, rising: now > 0 });
      if (now > 0) from = tc;
      else if (from !== null) {
        result.spans.push({ start: from, end: tc });
        from = null;
      }
    }
    if (now > 0) note(t);
    prevT = t;
    prev = now;
  }
  if (from !== null) result.spans.push({ start: from, end });
  return result;
}

export type Cover = 'clear' | 'cut' | 'hidden';

/** Whether the skyline leaves the disc clear, cuts across it or hides it. */
export function coverOf(sight: Sight | null, radius: number): Cover {
  if (!sight || sight.clearance < -radius) return 'hidden';
  return sight.clearance > radius ? 'clear' : 'cut';
}

/**
 * The skyline around a direction, for drawing beside a body there: degrees to
 * the right of it on the sky, and degrees above the horizontal. Null where the
 * skyline does not cover all of it, or too near the zenith for left and right
 * to mean much.
 */
export function skylineAround(s: Skyline, p: SkyPosition, halfWidth: number, n = 16): { right: number; angle: number }[] | null {
  const across = Math.cos((seenAltitude(p.altitude) * Math.PI) / 180);
  if (across < 0.2) return null;
  const out: { right: number; angle: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const right = -halfWidth + (2 * halfWidth * i) / n;
    const at = skylineAt(s, p.azimuth + right / across);
    if (!at) return null;
    out.push({ right, angle: at.angle });
  }
  return out;
}
