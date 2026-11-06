/**
 * Sun against the clock: how far the place's clock is from solar time.
 *
 * The sun is due south (or north) at solar noon, 12:00 on a sundial. A clock
 * shows that moment later or earlier, for three reasons:
 *
 * - equation of time: the sun runs up to 16 minutes ahead of and 14 behind its
 *   mean pace over the year (Earth's tilted axis and elliptical orbit); it is
 *   zero on four days a year, around April 15, June 13, September 1 and
 *   December 25;
 * - longitude: a time zone keeps one clock for a band of longitudes; 4 minutes
 *   for every degree west of the zone's own meridian;
 * - summer time: an hour more while it is on.
 *
 * Only the first changes through the year on its own, so the clock and the sun
 * agree exactly where the other two happen to cancel it, which for most places
 * is never.
 *
 * The clock is the place's local time unless another time scale is given: on
 * UTC the longitude counts from Greenwich, on mean solar time only the equation
 * of time is left, and sundial time follows the sun exactly.
 *
 * Conventions: minutes, positive when the sun is behind the clock (solar noon
 * after 12:00 on the clock).
 */
import { solarCoordinates } from './sun';
import { tzOffsetMinutes, wallMidnight, addDays, makeTimeScale, type CivilDate, type TimeScale, type TimeScaleKind } from '../time/timescale';

const MINUTE = 60_000;

export interface SunClock {
  /** Which clock: the time scale's kind. */
  kind: TimeScaleKind;
  /** Solar noon on the clock, minus 12:00. */
  total: number;
  /** The equation of time's part: minus the equation of time (0 on sundial time). */
  equation: number;
  /** The clock's standard offset against the place's longitude (the time zone's, or UTC's). */
  longitude: number;
  /** Summer time: the offset beyond the zone's standard one (local time only). */
  summer: number;
  /** What the total would be on standard time all year: without summer time. */
  standard: number;
  /** Solar noon, UTC ms. */
  noon: number;
}

/** The zone's standard offset in a year: the smaller of its January and July offsets, minutes. */
export function standardOffset(tz: string, year: number): number {
  return Math.min(tzOffsetMinutes(tz, Date.UTC(year, 0, 1, 12)), tzOffsetMinutes(tz, Date.UTC(year, 6, 1, 12)));
}

/** The sun against a clock (the place's local time by default) on a date of that clock's calendar. */
export function sunClock(place: { lon: number; tz: string }, date: CivilDate, scale: TimeScale = makeTimeScale('local', place)): SunClock {
  // Solar noon in UTC: 12:00 less the longitude and the equation of time, which is
  // looked up at noon itself (it changes by under a second an hour).
  let noon = wallMidnight(date) + (720 - place.lon * 4) * MINUTE;
  for (let i = 0; i < 2; i++) noon = wallMidnight(date) + (720 - place.lon * 4 - solarCoordinates(noon).equationOfTime) * MINUTE;
  const kind = scale.kind;
  if (kind === 'solar-apparent') return { kind, total: 0, equation: 0, longitude: 0, summer: 0, standard: 0, noon };
  const equation = -solarCoordinates(noon).equationOfTime;
  // Mean solar time is UTC moved by the longitude exactly, so that part is nil.
  if (kind === 'solar-mean') return { kind, total: equation, equation, longitude: 0, summer: 0, standard: equation, noon };
  const offset = kind === 'local' ? tzOffsetMinutes(place.tz, noon) : 0;
  const base = kind === 'local' ? standardOffset(place.tz, date.year) : 0;
  const longitude = base - place.lon * 4;
  const summer = offset - base;
  return { kind, total: equation + longitude + summer, equation, longitude, summer, standard: equation + longitude, noon };
}

/** Every day of a calendar year. */
export function sunClockYear(place: { lon: number; tz: string }, year: number, scale: TimeScale = makeTimeScale('local', place)): SunClock[] {
  const out: SunClock[] = [];
  let date: CivilDate = { year, month: 1, day: 1 };
  while (date.year === year) {
    out.push(sunClock(place, date, scale));
    date = addDays(date, 1);
  }
  return out;
}

/**
 * Where a daily series crosses zero: the day index plus the fraction of the day
 * after it, from straight lines between days. Jumps (summer time starting or
 * ending) are not crossings.
 */
export function zeroCrossings(values: number[], maxStep = 30): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < values.length; i++) {
    const a = values[i];
    const b = values[i + 1];
    if (Math.abs(b - a) > maxStep) continue;
    if (a === 0) out.push(i);
    else if ((a < 0 && b > 0) || (a > 0 && b < 0)) out.push(i + a / (a - b));
  }
  if (values.length && values[values.length - 1] === 0) out.push(values.length - 1);
  return out;
}
