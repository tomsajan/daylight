/**
 * Where on Earth a solar eclipse falls: the central line (where the shadow
 * axis meets the ground), the northern and southern limits of the umbral path
 * (totality or annularity) and of the penumbra (any partial eclipse), and the
 * point of greatest eclipse.
 *
 * A point on the fundamental plane is carried to the ground by intersecting
 * the line through it, parallel to the shadow axis, with the WGS 84 ellipsoid.
 */

import {
  DEG,
  EARTH_B_A,
  elementTimeToMs,
  elementsAt,
  eclipseDeltaT,
  longitudeForHourAngle,
  msToElementTime,
  type ElementsAt,
  type SolarEclipse,
} from './elements';
import { localCircumstances, observerConstants, relative, sunAltAz } from './local';

export interface GroundPoint {
  lat: number;
  lon: number;
}

export interface PathPoint extends GroundPoint {
  /** Unix milliseconds, UT. */
  time: number;
}

/**
 * The ground point under (ξ, η) on the fundamental plane, on the side facing the
 * Moon, or null when the line misses the Earth.
 */
export function toGround(el: ElementsAt, xi: number, eta: number, dT: number): (GroundPoint & { zeta: number }) | null {
  const sd = Math.sin(el.d);
  const cd = Math.cos(el.d);
  const c2 = EARTH_B_A * EARTH_B_A;
  // With Y = η cos d + ζ sin d and Z = ζ cos d − η sin d: ξ² + Z² + Y²/c² = 1.
  const A = cd * cd + (sd * sd) / c2;
  const B = 2 * eta * sd * cd * (1 / c2 - 1);
  const C = xi * xi + eta * eta * (sd * sd + (cd * cd) / c2) - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const zeta = (-B + Math.sqrt(disc)) / (2 * A);
  const Y = eta * cd + zeta * sd;
  const Z = zeta * cd - eta * sd;
  const lat = Math.atan2(Y, c2 * Math.hypot(xi, Z)) * DEG;
  const lon = longitudeForHourAngle(el, Math.atan2(xi, Z), dT);
  return { lat, lon, zeta };
}

/** The point on the Earth's limb (as seen from the Moon) in the direction of (ξ, η). */
function limbPoint(el: ElementsAt, xi: number, eta: number, dT: number) {
  const r = Math.hypot(xi, eta) || 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const s = (lo + hi) / 2;
    if (toGround(el, (xi / r) * s, (eta / r) * s, dT)) lo = s;
    else hi = s;
  }
  return toGround(el, (xi / r) * lo, (eta / r) * lo, dT)!;
}

/** Element times (hours from t0) across the validity of the polynomials. */
function sampleTimes(e: SolarEclipse, stepMinutes: number): number[] {
  const [t0, t1] = e.range;
  const n = Math.ceil(((t1 - t0) * 60) / stepMinutes);
  return Array.from({ length: n + 1 }, (_, i) => t0 + ((t1 - t0) * i) / n);
}

export interface PathOptions {
  /** ΔT in seconds; measured or extrapolated by default. */
  deltaT?: number;
  /** Sampling interval, minutes. */
  stepMinutes?: number;
}

export interface CentralPoint extends PathPoint {
  /** Length of totality or annularity here, seconds. */
  duration?: number;
  /** Width of the path here, km. */
  width?: number;
  /** Total or annular here (a hybrid eclipse changes along its path). */
  kind: 'total' | 'annular';
}

/** Points where the shadow axis meets the ground, from where it first touches the Earth to where it leaves. */
export function centralLine(e: SolarEclipse, opts: PathOptions = {}): CentralPoint[] {
  const dT = opts.deltaT ?? eclipseDeltaT(e);
  const hits = (t: number) => {
    const el = elementsAt(e, t);
    return toGround(el, el.x, el.y, dT);
  };
  const times = sampleTimes(e, opts.stepMinutes ?? 1);
  const edge = (inside: number, outside: number) => {
    for (let i = 0; i < 40; i++) {
      const mid = (inside + outside) / 2;
      if (hits(mid)) inside = mid;
      else outside = mid;
    }
    return inside;
  };
  const ts: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const on = !!hits(times[i]);
    if (on && i > 0 && !hits(times[i - 1])) ts.push(edge(times[i], times[i - 1]));
    if (on) ts.push(times[i]);
    if (on && i < times.length - 1 && !hits(times[i + 1])) ts.push(edge(times[i], times[i + 1]));
  }
  return ts.map((t) => centralPoint(e, t, dT)!);
}

/** The point under the shadow axis at an instant (Unix ms, UT), or null when the axis misses the Earth. */
export function centralPointAt(e: SolarEclipse, ms: number, opts: Pick<PathOptions, 'deltaT'> = {}): CentralPoint | null {
  const dT = opts.deltaT ?? eclipseDeltaT(e);
  return centralPoint(e, msToElementTime(e, ms, dT), dT);
}

function centralPoint(e: SolarEclipse, t: number, dT: number): CentralPoint | null {
  const el = elementsAt(e, t);
  const g = toGround(el, el.x, el.y, dT);
  if (!g) return null;
  const L2 = el.l2 - g.zeta * e.tanF2;
  return {
    time: elementTimeToMs(e, t, dT),
    lat: g.lat,
    lon: g.lon,
    kind: L2 < 0 ? 'total' : 'annular',
    duration: localCircumstances(e, g, { deltaT: dT }).duration,
    width: pathWidth(e, t, g, dT),
  };
}

/**
 * Northern and southern limit at one instant: the ground points that are
 * at greatest eclipse just as the edge of the umbra (or penumbra) grazes them.
 */
export function limitsAt(
  e: SolarEclipse,
  t: number,
  dT: number,
  umbra: boolean,
): { north: GroundPoint | null; south: GroundPoint | null } {
  const el = elementsAt(e, t);
  const start = toGround(el, el.x, el.y, dT) ?? limbPoint(el, el.x, el.y, dT);
  const solve = (side: 1 | -1): GroundPoint | null => {
    let p: GroundPoint = start;
    let onEarth = true;
    for (let i = 0; i < 20; i++) {
      const r = relative(e, observerConstants(p), t, dT);
      const L = umbra ? Math.abs(r.L2) : r.L1;
      const n = Math.hypot(r.a, r.b);
      // At greatest eclipse the observer's offset from the axis is square to its motion.
      const xi = el.x - (side * L * r.b) / n;
      const eta = el.y + (side * L * r.a) / n;
      const ground = toGround(el, xi, eta, dT);
      onEarth = !!ground;
      // Off the Earth's edge: carry on from the edge, as the next step may come back on.
      const next = ground ?? limbPoint(el, xi, eta, dT);
      const moved = Math.abs(next.lat - p.lat) + Math.abs(next.lon - p.lon);
      p = next;
      if (moved < 1e-7) break;
    }
    return onEarth ? { lat: p.lat, lon: p.lon } : null;
  };
  // side +1 puts the observer at larger η, i.e. north of the axis.
  return { north: solve(1), south: solve(-1) };
}

export interface Limits {
  north: PathPoint[];
  south: PathPoint[];
}

function limits(e: SolarEclipse, umbra: boolean, opts: PathOptions): Limits {
  const dT = opts.deltaT ?? eclipseDeltaT(e);
  const out: Limits = { north: [], south: [] };
  for (const t of sampleTimes(e, opts.stepMinutes ?? 1)) {
    const { north, south } = limitsAt(e, t, dT, umbra);
    const time = elementTimeToMs(e, t, dT);
    if (north) out.north.push({ time, ...north });
    if (south) out.south.push({ time, ...south });
  }
  return out;
}

/** Limits of totality or annularity. */
export function umbralLimits(e: SolarEclipse, opts: PathOptions = {}): Limits {
  return limits(e, true, opts);
}

/** Limits of the partial eclipse, where they fall on the Earth. */
export function penumbralLimits(e: SolarEclipse, opts: PathOptions = {}): Limits {
  return limits(e, false, opts);
}

export interface GreatestEclipse extends PathPoint {
  /** Least distance of the shadow axis from the Earth's centre, Earth radii; positive north. */
  gamma: number;
  /** Sun's altitude there, degrees. */
  sunAlt: number;
  /** Totality or annularity there, seconds (central eclipses only). */
  duration?: number;
  /** Width of the umbral path there, km (central eclipses only). */
  pathWidth?: number;
}

/**
 * The instant the shadow axis passes closest to the Earth's centre, and the
 * ground point nearest to the axis then.
 */
export function greatestEclipse(e: SolarEclipse, opts: Pick<PathOptions, 'deltaT'> = {}): GreatestEclipse {
  const dT = opts.deltaT ?? eclipseDeltaT(e);
  let t = (e.jdGreatest - e.jd0) * 24;
  for (let i = 0; i < 20; i++) {
    const el = elementsAt(e, t);
    // d/dt (x² + y²) = 0, by Newton's method on x·x′ + y·y′.
    const f = el.x * el.dx + el.y * el.dy;
    const h = 1e-4;
    const el2 = elementsAt(e, t + h);
    const df = (el2.x * el2.dx + el2.y * el2.dy - f) / h;
    const step = f / df;
    t -= step;
    if (Math.abs(step) < 1e-8) break;
  }
  const el = elementsAt(e, t);
  const gamma = Math.sign(el.y) * Math.hypot(el.x, el.y);
  const axis = toGround(el, el.x, el.y, dT);
  const g = axis ?? limbPoint(el, el.x, el.y, dT);
  const o = observerConstants(g);
  const r = relative(e, o, t, dT);
  const sunAlt = sunAltAz(r, o).altitude;
  const result: GreatestEclipse = { time: elementTimeToMs(e, t, dT), lat: g.lat, lon: g.lon, gamma, sunAlt };
  if (axis) {
    result.duration = localCircumstances(e, g, { deltaT: dT }).duration;
    result.pathWidth = pathWidth(e, t, g, dT);
  }
  return result;
}

/**
 * Width of the umbral path at a central-line point, km: its shortest distance
 * to the northern limit plus that to the southern one. The limit points of the
 * same instant are not square across the path, so each limit line is searched.
 */
function pathWidth(e: SolarEclipse, t: number, centre: GroundPoint, dT: number): number | undefined {
  let width = 0;
  for (const side of ['north', 'south'] as const) {
    const dist = (u: number) => {
      const p = limitsAt(e, u, dT, true)[side];
      return p ? distanceKm(centre, p) : Infinity;
    };
    // Golden-section search over ±20 minutes.
    let lo = t - 1 / 3;
    let hi = t + 1 / 3;
    const g = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 40; i++) {
      const a = hi - g * (hi - lo);
      const b = lo + g * (hi - lo);
      if (dist(a) < dist(b)) hi = b;
      else lo = a;
    }
    const d = dist((lo + hi) / 2);
    if (!Number.isFinite(d)) return undefined;
    width += d;
  }
  return width;
}

const MEAN_RADIUS_KM = 6371.0088;

/** Great-circle distance, km. */
export function distanceKm(p: GroundPoint, q: GroundPoint): number {
  const RAD = Math.PI / 180;
  const dLat = (q.lat - p.lat) * RAD;
  const dLon = (q.lon - p.lon) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * RAD) * Math.cos(q.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * MEAN_RADIUS_KM * Math.asin(Math.sqrt(s));
}
