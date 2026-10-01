/**
 * Time scales: the different "clocks" times can be shown in.
 *
 * - local:          civil time of the place's time zone, DST included
 * - utc:            Coordinated Universal Time
 * - solar-mean:     local mean solar time (UTC shifted by longitude)
 * - solar-apparent: sundial time, solar noon is always 12:00
 *
 * Every scale reduces to an offset from UTC that may vary with the instant.
 * "Wall" milliseconds are what a clock in that scale reads, encoded as if
 * it were UTC, so the Date UTC getters give the clock's calendar fields.
 */
import { solarCoordinates } from '../astro/sun';

export type TimeScaleKind = 'local' | 'utc' | 'solar-mean' | 'solar-apparent';

export interface TimeScale {
  readonly kind: TimeScaleKind;
  /** Offset of this clock from UTC at the given instant, in minutes. */
  offsetMinutes(utcMs: number): number;
}

export interface CivilDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

const MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

// --- Time zone offsets via Intl -------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, number>();
const OFFSET_BUCKET = 15 * MINUTE;

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function computeTzOffset(timeZone: string, utcMs: number): number {
  const fields: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(utcMs)) {
    if (part.type !== 'literal') fields[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour % 24, fields.minute, fields.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / MINUTE);
}

/**
 * UTC offset of an IANA time zone at an instant, in minutes.
 * Real-world transitions happen on 15-minute UTC boundaries, so the offset
 * is constant within each 15-minute bucket and can be cached per bucket.
 */
export function tzOffsetMinutes(timeZone: string, utcMs: number): number {
  // Fast path: most UTC days have no transition at all.
  const dayKey = `${timeZone}|d${Math.floor(utcMs / MS_PER_DAY)}`;
  let dayOff = offsetCache.get(dayKey);
  if (dayOff === undefined) {
    const dayStart = Math.floor(utcMs / MS_PER_DAY) * MS_PER_DAY;
    const a = computeTzOffset(timeZone, dayStart);
    const b = computeTzOffset(timeZone, dayStart + MS_PER_DAY - 1000);
    dayOff = a === b ? a : NaN;
    offsetCache.set(dayKey, dayOff);
  }
  if (!Number.isNaN(dayOff)) return dayOff;

  const bucket = Math.floor(utcMs / OFFSET_BUCKET);
  const key = `${timeZone}|${bucket}`;
  let off = offsetCache.get(key);
  if (off === undefined) {
    if (offsetCache.size > 100_000) offsetCache.clear();
    off = computeTzOffset(timeZone, bucket * OFFSET_BUCKET);
    offsetCache.set(key, off);
  }
  return off;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

// --- Scales ----------------------------------------------------------------

export function makeTimeScale(kind: TimeScaleKind, place: { lon: number; tz: string }): TimeScale {
  switch (kind) {
    case 'local':
      return { kind, offsetMinutes: (t) => tzOffsetMinutes(place.tz, t) };
    case 'utc':
      return { kind, offsetMinutes: () => 0 };
    case 'solar-mean':
      return { kind, offsetMinutes: () => place.lon * 4 };
    case 'solar-apparent':
      return { kind, offsetMinutes: (t) => place.lon * 4 + solarCoordinates(t).equationOfTime };
  }
}

export const TIME_SCALE_LABELS: Record<TimeScaleKind, string> = {
  local: 'Local time',
  utc: 'UTC',
  'solar-mean': 'Mean solar time',
  'solar-apparent': 'Solar time (sundial)',
};

// --- Conversions -----------------------------------------------------------

export function toWall(utcMs: number, scale: TimeScale): number {
  return utcMs + scale.offsetMinutes(utcMs) * MINUTE;
}

/** Instant at which the scale's clock shows the given wall time. */
export function fromWall(wallMs: number, scale: TimeScale): number {
  let u = wallMs - scale.offsetMinutes(wallMs) * MINUTE;
  for (let i = 0; i < 3; i++) {
    const next = wallMs - scale.offsetMinutes(u) * MINUTE;
    if (next === u) break;
    u = next;
  }
  return u;
}

export function civilDateOf(utcMs: number, scale: TimeScale): CivilDate {
  const d = new Date(toWall(utcMs, scale));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function wallMidnight(date: CivilDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

/** Instants bounding a calendar day in a scale: [start, end). */
export function dayBounds(date: CivilDate, scale: TimeScale): { start: number; end: number } {
  const midnight = wallMidnight(date);
  return { start: fromWall(midnight, scale), end: fromWall(midnight + MS_PER_DAY, scale) };
}

/** Minutes since the wall midnight of `date`, as the scale's clock reads. */
export function minutesOfDay(utcMs: number, date: CivilDate, scale: TimeScale): number {
  return (toWall(utcMs, scale) - wallMidnight(date)) / MINUTE;
}

export function addDays(date: CivilDate, days: number): CivilDate {
  const d = new Date(wallMidnight(date) + days * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function dayOfYear(date: CivilDate): number {
  return Math.round((wallMidnight(date) - Date.UTC(date.year, 0, 1)) / MS_PER_DAY) + 1;
}

export function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

export function sameDate(a: CivilDate, b: CivilDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function dateKey(date: CivilDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

/** Same wall-clock time of day, moved to another date (DST-aware). */
export function withDate(utcMs: number, date: CivilDate, scale: TimeScale): number {
  const current = civilDateOf(utcMs, scale);
  const timeOfDay = toWall(utcMs, scale) - wallMidnight(current);
  return fromWall(wallMidnight(date) + timeOfDay, scale);
}

/** Set the wall-clock time of day (minutes since midnight), keeping the date. */
export function withMinutesOfDay(utcMs: number, minutes: number, scale: TimeScale): number {
  const date = civilDateOf(utcMs, scale);
  return fromWall(wallMidnight(date) + minutes * MINUTE, scale);
}
