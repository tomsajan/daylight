/**
 * Daily light: sunrise/sunset, twilights and how a day splits into light
 * levels. Works at any latitude, including polar day and polar night, and on
 * days that are 23 or 25 hours long because of DST.
 *
 * Rather than a closed-form hour-angle formula (which breaks down near the
 * poles), the sun's altitude is sampled across the day and every crossing of
 * each threshold is refined by bisection.
 */
import { horizonDip, normalizeLongitude, solarCoordinates, sunAltitude, sunPositionFrom } from './sun';
import {
  addDays,
  civilDateOf,
  dayBounds,
  daysInYear,
  minutesOfDay,
  type CivilDate,
  type TimeScale,
} from '../time/timescale';

export enum Light {
  Night = 0,
  Astronomical = 1,
  Nautical = 2,
  Civil = 3,
  Day = 4,
}

export const LIGHT_NAMES: Record<Light, string> = {
  [Light.Night]: 'Night',
  [Light.Astronomical]: 'Astronomical twilight',
  [Light.Nautical]: 'Nautical twilight',
  [Light.Civil]: 'Civil twilight',
  [Light.Day]: 'Daylight',
};

/** Sun altitude of the boundary *below* each light level. */
export const TWILIGHT_ALTITUDES = {
  civil: -6,
  nautical: -12,
  astronomical: -18,
} as const;

export type SunriseDefinition = 'standard' | 'geometric';

export interface DaylightOptions {
  /**
   * standard:  upper limb touches the horizon, refraction included (-0.833°),
   *            matching published sunrise/sunset tables
   * geometric: centre of the sun on the mathematical horizon (0°)
   */
  sunrise: SunriseDefinition;
  /** Observer eye height above the surrounding terrain, metres. */
  observerHeight: number;
}

export const DEFAULT_DAYLIGHT_OPTIONS: DaylightOptions = { sunrise: 'standard', observerHeight: 0 };

export function horizonAltitude(opts: DaylightOptions): number {
  return (opts.sunrise === 'standard' ? -0.833 : 0) - horizonDip(opts.observerHeight);
}

/** Thresholds from brightest to darkest; index i separates Light 4-i from 3-i. */
function thresholds(opts: DaylightOptions): number[] {
  return [horizonAltitude(opts), TWILIGHT_ALTITUDES.civil, TWILIGHT_ALTITUDES.nautical, TWILIGHT_ALTITUDES.astronomical];
}

export function lightLevel(altitude: number, opts: DaylightOptions = DEFAULT_DAYLIGHT_OPTIONS): Light {
  const th = thresholds(opts);
  if (altitude >= th[0]) return Light.Day;
  if (altitude >= th[1]) return Light.Civil;
  if (altitude >= th[2]) return Light.Nautical;
  if (altitude >= th[3]) return Light.Astronomical;
  return Light.Night;
}

export interface LightSegment {
  /** UTC ms */
  start: number;
  end: number;
  /** Minutes since wall midnight in the day's time scale (for charts). */
  startMin: number;
  endMin: number;
  light: Light;
}

export type EventBoundary = 'horizon' | 'civil' | 'nautical' | 'astronomical';

export interface SunEvent {
  /** UTC ms */
  time: number;
  minutes: number;
  /** rising: getting brighter across the boundary */
  rising: boolean;
  boundary: EventBoundary;
}

export interface DayLight {
  date: CivilDate;
  /** UTC ms bounds of the day in its time scale; end is exclusive. */
  start: number;
  end: number;
  /** Length of the calendar day in minutes (1380/1440/1500 around DST). */
  lengthMin: number;
  segments: LightSegment[];
  events: SunEvent[];
  /** First sunrise / last sunset of the day, if any. */
  sunrise: SunEvent | null;
  sunset: SunEvent | null;
  /** Solar noon (upper transit) closest to the middle of the day. */
  solarNoon: { time: number; minutes: number; altitude: number };
  /** Lowest altitude (lower transit, "solar midnight"). */
  minAltitude: number;
  /** Total minutes spent at each light level within the day. */
  durations: Record<Light, number>;
  /** Convenience: durations[Light.Day]. */
  daylightMin: number;
  /** Sun stays above the horizon all day (polar day). */
  polarDay: boolean;
  /** Sun stays below the horizon all day (polar night). */
  polarNight: boolean;
}

const MINUTE = 60_000;
const SAMPLE_STEP = 10 * MINUTE;
const BOUNDARY_NAMES: EventBoundary[] = ['horizon', 'civil', 'nautical', 'astronomical'];

export function computeDay(
  place: { lat: number; lon: number },
  date: CivilDate,
  scale: TimeScale,
  opts: DaylightOptions = DEFAULT_DAYLIGHT_OPTIONS,
): DayLight {
  const { lat, lon } = place;
  const { start, end } = dayBounds(date, scale);
  const alt = (t: number) => sunAltitude(t, lat, lon);
  const th = thresholds(opts);

  // Sample the altitude across the day.
  const n = Math.max(1, Math.ceil((end - start) / SAMPLE_STEP));
  const times = new Array<number>(n + 1);
  const alts = new Array<number>(n + 1);
  for (let i = 0; i <= n; i++) {
    times[i] = i === n ? end : start + i * SAMPLE_STEP;
    alts[i] = alt(times[i]);
  }

  // Find and refine every threshold crossing.
  const events: SunEvent[] = [];
  for (let k = 0; k < th.length; k++) {
    const h = th[k];
    for (let i = 0; i < n; i++) {
      const a0 = alts[i] - h;
      const a1 = alts[i + 1] - h;
      if ((a0 < 0 && a1 >= 0) || (a0 >= 0 && a1 < 0)) {
        const t = findCrossing(alt, h, times[i], a0, times[i + 1], a1);
        events.push({ time: t, minutes: minutesOfDay(t, date, scale), rising: a0 < 0, boundary: BOUNDARY_NAMES[k] });
      }
    }
  }
  events.sort((a, b) => a.time - b.time);

  // Split the day into segments of constant light.
  const cuts = [start, ...events.map((e) => e.time), end];
  // Clock minutes of each cut; the day always spans 00:00-24:00 on the clock.
  // Inside a repeated DST hour the clock runs backwards, so keep it monotonic.
  const cutMin = cuts.map((t, i) => (i === 0 ? 0 : i === cuts.length - 1 ? 1440 : minutesOfDay(t, date, scale)));
  for (let i = 1; i < cutMin.length; i++) cutMin[i] = Math.min(1440, Math.max(cutMin[i], cutMin[i - 1]));

  const segments: LightSegment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const s = cuts[i];
    const e = cuts[i + 1];
    if (e <= s) continue;
    const light = lightLevel(alt((s + e) / 2), opts);
    const last = segments[segments.length - 1];
    if (last && last.light === light) {
      last.end = e;
      last.endMin = cutMin[i + 1];
    } else {
      segments.push({ start: s, end: e, startMin: cutMin[i], endMin: cutMin[i + 1], light });
    }
  }

  const durations: Record<Light, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const seg of segments) durations[seg.light] += (seg.end - seg.start) / MINUTE;

  // Solar noon: where the hour angle is zero, closest to the day's middle.
  const solarNoon = transit(start + (end - start) / 2, lat, lon, 0);
  const lower = transit(start + (end - start) / 2, lat, lon, 180);

  const horizonEvents = events.filter((e) => e.boundary === 'horizon');
  const sunrise = horizonEvents.find((e) => e.rising) ?? null;
  const sunset = [...horizonEvents].reverse().find((e) => !e.rising) ?? null;

  const daylightMin = durations[Light.Day];
  const lengthMin = (end - start) / MINUTE;

  return {
    date,
    start,
    end,
    lengthMin,
    segments,
    events,
    sunrise,
    sunset,
    solarNoon: { time: solarNoon.time, minutes: minutesOfDay(solarNoon.time, date, scale), altitude: solarNoon.altitude },
    minAltitude: lower.altitude,
    durations,
    daylightMin,
    polarDay: horizonEvents.length === 0 && segments.every((s) => s.light === Light.Day),
    polarNight: horizonEvents.length === 0 && segments.every((s) => s.light !== Light.Day),
  };
}

/**
 * Time in [t0, t1] where alt(t) = h, given f0 = alt(t0)-h and f1 = alt(t1)-h
 * of opposite sign. Illinois-variant regula falsi: altitude is close to
 * linear over a 10-minute bracket, so this converges in a few evaluations.
 */
function findCrossing(alt: (t: number) => number, h: number, t0: number, f0: number, t1: number, f1: number): number {
  let side = 0;
  for (let iter = 0; iter < 30 && t1 - t0 > 1000; iter++) {
    const t = (t0 * f1 - t1 * f0) / (f1 - f0);
    const f = alt(t) - h;
    if (Math.abs(f) < 1e-6) return Math.round(t);
    if ((f < 0) === (f1 < 0)) {
      t1 = t;
      f1 = f;
      if (side === -1) f0 /= 2;
      side = -1;
    } else {
      t0 = t;
      f0 = f;
      if (side === 1) f1 /= 2;
      side = 1;
    }
  }
  return Math.round((t0 * f1 - t1 * f0) / (f1 - f0));
}

/** Instant near `around` where the local hour angle equals `hourAngle`. */
function transit(around: number, lat: number, lon: number, hourAngle: number) {
  let t = around;
  for (let i = 0; i < 3; i++) {
    const c = solarCoordinates(t);
    const H = normalizeLongitude(lon - c.subsolarLongitude - hourAngle);
    // The sun moves 15° of hour angle per hour, i.e. 4 minutes per degree.
    t -= H * 4 * MINUTE;
  }
  return { time: Math.round(t), altitude: sunPositionFrom(solarCoordinates(t), lat, lon).altitude };
}

/** Every day of a calendar year (in the given time scale). */
export function computeYear(
  place: { lat: number; lon: number },
  year: number,
  scale: TimeScale,
  opts: DaylightOptions = DEFAULT_DAYLIGHT_OPTIONS,
): DayLight[] {
  const days: DayLight[] = [];
  let date: CivilDate = { year, month: 1, day: 1 };
  const count = daysInYear(year);
  for (let i = 0; i < count; i++) {
    days.push(computeDay(place, date, scale, opts));
    date = addDays(date, 1);
  }
  return days;
}

/** Altitude curve over an interval, for day charts. */
export function altitudeCurve(
  place: { lat: number; lon: number },
  start: number,
  end: number,
  stepMs = 5 * MINUTE,
): { time: number; altitude: number; azimuth: number }[] {
  const out = [];
  for (let t = start; t <= end; t += stepMs) {
    const p = sunPositionFrom(solarCoordinates(t), place.lat, place.lon);
    out.push({ time: t, altitude: p.altitude, azimuth: p.azimuth });
  }
  return out;
}

/** Next sun events after an instant (searches up to `days` days ahead). */
export function nextEvents(
  place: { lat: number; lon: number },
  utcMs: number,
  scale: TimeScale,
  opts: DaylightOptions = DEFAULT_DAYLIGHT_OPTIONS,
  days = 2,
): SunEvent[] {
  const out: SunEvent[] = [];
  let date = civilDateOf(utcMs, scale);
  for (let i = 0; i <= days; i++) {
    for (const e of computeDay(place, date, scale, opts).events) if (e.time > utcMs) out.push(e);
    date = addDays(date, 1);
  }
  return out;
}
