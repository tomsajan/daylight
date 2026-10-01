/**
 * Solar position, after the NOAA solar calculator (Meeus, "Astronomical
 * Algorithms"). Accurate to well under a minute of time for rise/set
 * calculations between 1900 and 2100, which is far below what matters for
 * visualising daylight.
 *
 * Conventions: angles in degrees, longitudes east-positive, azimuth measured
 * clockwise from true north, time as Unix milliseconds (UTC).
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const MS_PER_DAY = 86_400_000;

export interface SolarCoordinates {
  /** Solar declination, i.e. the latitude of the subsolar point. */
  declination: number;
  /** Equation of time in minutes (apparent minus mean solar time). */
  equationOfTime: number;
  /** Longitude of the subsolar point, in [-180, 180). */
  subsolarLongitude: number;
}

export interface SunPosition {
  /** Geometric altitude above the horizon (no refraction). */
  altitude: number;
  /** Clockwise from north, in [0, 360). */
  azimuth: number;
}

export function julianDay(utcMs: number): number {
  return utcMs / MS_PER_DAY + 2440587.5;
}

export function normalizeLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Declination, equation of time and subsolar longitude at an instant. */
export function solarCoordinates(utcMs: number): SolarCoordinates {
  const T = (julianDay(utcMs) - 2451545) / 36525;

  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;

  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;

  const trueLongitude = L0 + C;
  const omega = (125.04 - 1934.136 * T) * RAD;
  const apparentLongitude = (trueLongitude - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;

  const meanObliquity = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliquity = (meanObliquity + 0.00256 * Math.cos(omega)) * RAD;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude)) * DEG;

  const y = Math.tan(obliquity / 2) ** 2;
  const L0r = L0 * RAD;
  const equationOfTime =
    4 *
    DEG *
    (y * Math.sin(2 * L0r) -
      2 * e * Math.sin(Mr) +
      4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) -
      1.25 * e * e * Math.sin(2 * Mr));

  // The sun is overhead where apparent solar time is 12:00.
  const utcMinutes = (((utcMs % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / 60_000;
  const subsolarLongitude = normalizeLongitude(-(utcMinutes - 720 + equationOfTime) / 4);

  return { declination, equationOfTime, subsolarLongitude };
}

/** Altitude/azimuth for an observer, given precomputed solar coordinates. */
export function sunPositionFrom(coords: SolarCoordinates, lat: number, lon: number): SunPosition {
  const phi = lat * RAD;
  const delta = coords.declination * RAD;
  const H = (lon - coords.subsolarLongitude) * RAD;

  const sinAlt = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(H);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;

  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi)) * DEG + 180;
  return { altitude, azimuth: az % 360 };
}

export function sunPosition(utcMs: number, lat: number, lon: number): SunPosition {
  return sunPositionFrom(solarCoordinates(utcMs), lat, lon);
}

/** Geometric altitude only; the hot path for event searches. */
export function sunAltitude(utcMs: number, lat: number, lon: number): number {
  return sunPositionFrom(solarCoordinates(utcMs), lat, lon).altitude;
}

/**
 * Atmospheric refraction in degrees for a geometric altitude
 * (Sæmundsson's formula, standard pressure and temperature).
 */
export function refraction(altitude: number): number {
  if (altitude < -2) return 0;
  const h = Math.max(altitude, -1.9);
  return 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * RAD) / 60;
}

/** Altitude as an observer would see it, refraction included. */
export function apparentAltitude(geometricAltitude: number): number {
  return geometricAltitude + refraction(geometricAltitude);
}

/** Dip of the horizon in degrees for an eye height in metres. */
export function horizonDip(heightMeters: number): number {
  return heightMeters > 0 ? 0.0293 * Math.sqrt(heightMeters) : 0;
}

/** The point on Earth where the sun is directly overhead. */
export function subsolarPoint(utcMs: number): { lat: number; lon: number } {
  const c = solarCoordinates(utcMs);
  return { lat: c.declination, lon: c.subsolarLongitude };
}
