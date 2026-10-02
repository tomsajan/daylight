/**
 * Solar eclipses described by their Besselian elements: the Moon's shadow as it
 * crosses the fundamental plane, a plane through the Earth's centre square to
 * the shadow axis. Everything else (local circumstances, the central line, the
 * path limits) is derived from these few polynomials.
 *
 * Conventions as in the rest of the core: angles in degrees, longitudes
 * east-positive, time as Unix milliseconds (UTC). Lengths on the fundamental
 * plane are in Earth equatorial radii; element time t is in hours from t0, in
 * Terrestrial Time (TT).
 *
 * The elements themselves are in ./catalog.
 */

import { deltaT } from './deltaT';

export type EclipseType = 'T' | 'A' | 'H' | 'P';

export interface SolarEclipse {
  /** Date of greatest eclipse, "YYYY-MM-DD" (UT). */
  id: string;
  /** Total, annular, hybrid (total along part of the path) or partial. */
  type: EclipseType;
  /** NASA's type code, e.g. "Tm" or "Pb"; the second letter refines the type. */
  typeCode: string;
  saros: number;
  sarosMember: number;
  /** Least distance of the shadow axis from the Earth's centre, Earth radii; positive north. */
  gamma: number;
  /** Fraction of the Sun's diameter covered at greatest eclipse. */
  magnitude: number;
  /** ΔT NASA used for its own tables, seconds. */
  deltaT: number;
  /** Julian Day (TT) of greatest eclipse. */
  jdGreatest: number;
  /** Julian Day (TT) of t0, the reference time of the polynomials. */
  jd0: number;
  /** Hours from t0 over which the polynomials are valid. */
  range: [number, number];
  x: number[];
  y: number[];
  d: number[];
  l1: number[];
  l2: number[];
  mu: number[];
  tanF1: number;
  tanF2: number;
  /** NASA's figures for greatest eclipse (catalog precision for some eclipses). */
  greatest: { lat: number; lon: number; sunAlt: number; pathWidth?: number; duration?: number };
}

export const RAD = Math.PI / 180;
export const DEG = 180 / Math.PI;
const MS_PER_HOUR = 3_600_000;
const JD_UNIX_EPOCH = 2440587.5;

/** WGS 84 polar to equatorial radius. */
export const EARTH_B_A = 0.99664718933;
export const EARTH_RADIUS_KM = 6378.137;
/** Hour angle, in degrees, that the Earth turns per second of ΔT (1.002738 × 15 / 3600). */
const DEG_PER_DELTA_T_SECOND = 0.00417807;

/** The elements and their rates (per hour) at one instant. */
export interface ElementsAt {
  x: number;
  y: number;
  /** Declination of the shadow axis, radians. */
  d: number;
  /** Greenwich hour angle of the shadow axis (ephemeris), degrees. */
  mu: number;
  l1: number;
  l2: number;
  dx: number;
  dy: number;
  /** Radians per hour. */
  dd: number;
  /** Radians per hour. */
  dmu: number;
}

function poly(c: number[], t: number): number {
  let v = 0;
  for (let i = c.length - 1; i >= 0; i--) v = v * t + c[i];
  return v;
}

function polyRate(c: number[], t: number): number {
  let v = 0;
  for (let i = c.length - 1; i >= 1; i--) v = v * t + i * c[i];
  return v;
}

export function elementsAt(e: SolarEclipse, t: number): ElementsAt {
  return {
    x: poly(e.x, t),
    y: poly(e.y, t),
    d: poly(e.d, t) * RAD,
    mu: poly(e.mu, t),
    l1: poly(e.l1, t),
    l2: poly(e.l2, t),
    dx: polyRate(e.x, t),
    dy: polyRate(e.y, t),
    dd: polyRate(e.d, t) * RAD,
    dmu: polyRate(e.mu, t) * RAD,
  };
}

/** Element time t (hours from t0, TT) to Unix milliseconds (UT), for a given ΔT. */
export function elementTimeToMs(e: Pick<SolarEclipse, 'jd0'>, t: number, dT: number): number {
  return (e.jd0 - JD_UNIX_EPOCH) * 86_400_000 + t * MS_PER_HOUR - dT * 1000;
}

/** Unix milliseconds (UT) to element time t, for a given ΔT. */
export function msToElementTime(e: Pick<SolarEclipse, 'jd0'>, ms: number, dT: number): number {
  return (ms + dT * 1000 - (e.jd0 - JD_UNIX_EPOCH) * 86_400_000) / MS_PER_HOUR;
}

/** Instant of greatest eclipse as Unix milliseconds (UT). */
export function greatestEclipseMs(e: Pick<SolarEclipse, 'jdGreatest'>, dT = eclipseDeltaT(e)): number {
  return (e.jdGreatest - JD_UNIX_EPOCH) * 86_400_000 - dT * 1000;
}

/** ΔT for an eclipse: measured where available, extrapolated otherwise. */
export function eclipseDeltaT(e: Pick<SolarEclipse, 'jdGreatest'>): number {
  return deltaT((e.jdGreatest - JD_UNIX_EPOCH) * 86_400_000);
}

/**
 * Local hour angle of the shadow axis for an observer at east longitude lon,
 * radians. ΔT turns the ephemeris hour angle μ into one measured from Greenwich.
 */
export function hourAngle(el: ElementsAt, lon: number, dT: number): number {
  return (el.mu + lon - DEG_PER_DELTA_T_SECOND * dT) * RAD;
}

/** East longitude at which the shadow axis has local hour angle h (radians). */
export function longitudeForHourAngle(el: ElementsAt, h: number, dT: number): number {
  const lon = h * DEG - el.mu + DEG_PER_DELTA_T_SECOND * dT;
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
