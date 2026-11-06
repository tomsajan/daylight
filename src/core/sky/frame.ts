/**
 * From the catalogue's J2000 positions to the sky as seen from a place at an instant.
 *
 * astronomy-engine gives the rotation from J2000 equatorial to horizontal coordinates
 * (precession, nutation and the Earth's turning included) once per instant; each star then
 * costs one small matrix product. The Sun, the Moon and the planets come from astronomy-engine
 * as topocentric J2000 directions and go through the same rotation.
 *
 * Horizontal vectors: x north, y west, z up. Azimuth clockwise from north, degrees.
 */
import { Body, Equator, Illumination, MakeTime, Observer, Rotation_EQJ_HOR, type AstroTime } from 'astronomy-engine';
import { refraction } from '../astro/sun';
import { unitVector } from './catalog';

const DEG = 180 / Math.PI;

export type Vec3 = [number, number, number];

export interface Site {
  lat: number;
  lon: number;
  /** Metres above sea level. */
  height?: number;
}

/** A 3×3 rotation, row-major: horizontal = M · equatorial. */
export type Frame = Float64Array;

const observers = new Map<string, Observer>();
export function observerOf(site: Site): Observer {
  const key = `${site.lat},${site.lon},${site.height ?? 0}`;
  let o = observers.get(key);
  if (!o) {
    if (observers.size > 50) observers.clear();
    o = new Observer(site.lat, site.lon, site.height ?? 0);
    observers.set(key, o);
  }
  return o;
}

export function astroTime(ms: number): AstroTime {
  return MakeTime(new Date(ms));
}

/** The rotation from J2000 equatorial to horizontal coordinates at a place and instant. */
export function skyFrame(ms: number, site: Site): Frame {
  const r = Rotation_EQJ_HOR(astroTime(ms), observerOf(site)).rot;
  // astronomy-engine stores the rotation column by column.
  return new Float64Array([r[0][0], r[1][0], r[2][0], r[0][1], r[1][1], r[2][1], r[0][2], r[1][2], r[2][2]]);
}

/** A J2000 unit vector turned into the horizontal frame. */
export function toHorizontal(f: Frame, x: number, y: number, z: number): Vec3 {
  return [f[0] * x + f[1] * y + f[2] * z, f[3] * x + f[4] * y + f[5] * z, f[6] * x + f[7] * y + f[8] * z];
}

/** Just the height of a J2000 unit vector, as sin(altitude): the hot path for altitude curves. */
export function sinAltitude(f: Frame, x: number, y: number, z: number): number {
  return f[6] * x + f[7] * y + f[8] * z;
}

export interface AltAz {
  /** Geometric altitude, degrees. */
  alt: number;
  az: number;
}

export function altAz(h: Vec3): AltAz {
  return { alt: Math.asin(Math.max(-1, Math.min(1, h[2]))) * DEG, az: ((Math.atan2(-h[1], h[0]) * DEG) % 360 + 360) % 360 };
}

/** Altitude and azimuth of a J2000 position, refraction left out. */
export function altAzOf(f: Frame, ra: number, dec: number): AltAz {
  const [x, y, z] = unitVector(ra, dec);
  return altAz(toHorizontal(f, x, y, z));
}

/** Where a geometric altitude appears, lifted by the air (standard conditions). */
export function apparent(alt: number): number {
  return alt + refraction(alt);
}

// --- Sun, Moon and planets ---------------------------------------------------

export type Planet = 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune';
export const PLANETS: Planet[] = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
export type SolarSystemBody = 'Sun' | 'Moon' | Planet;

/** A body's direction from the place as a J2000 unit vector, with its distance in AU. */
export function bodyVector(body: SolarSystemBody, ms: number, site: Site): { v: Vec3; dist: number } {
  const e = Equator(Body[body], astroTime(ms), observerOf(site), false, true);
  return { v: unitVector(e.ra * 15, e.dec), dist: e.dist };
}

export interface BodyLight {
  /** Visual magnitude. */
  mag: number;
  /** Lit fraction of the disc, 0-1. */
  fraction: number;
  /** Angle Sun-body-Earth, degrees (0 full, 180 new). */
  phaseAngle: number;
}

export function bodyLight(body: Exclude<SolarSystemBody, 'Sun'>, ms: number): BodyLight {
  const i = Illumination(Body[body], astroTime(ms));
  return { mag: i.mag, fraction: i.phase_fraction, phaseAngle: i.phase_angle };
}

/** Apparent diameters, km, for the size of a disc in the sky. */
export const BODY_DIAMETER_KM: Record<SolarSystemBody, number> = {
  Sun: 1_392_700,
  Moon: 3474.8,
  Mercury: 4879,
  Venus: 12_104,
  Mars: 6779,
  Jupiter: 139_820,
  Saturn: 116_460,
  Uranus: 50_724,
  Neptune: 49_244,
};

const AU_KM = 149_597_870.7;

/** Angular diameter in degrees at a distance in AU. */
export function angularDiameter(body: SolarSystemBody, distAu: number): number {
  return 2 * Math.atan(BODY_DIAMETER_KM[body] / 2 / (distAu * AU_KM)) * DEG;
}
