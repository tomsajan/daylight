import { toWall, wallMidnight, type CivilDate, type TimeScale } from './timescale';

export type HourCycle = '24' | '12';

/** "06:42" / "6:42 AM" for minutes since midnight (values ≥ 1440 wrap). */
export function formatMinutes(minutes: number, hourCycle: HourCycle = '24', withSeconds = false): string {
  const totalSec = Math.round(minutes * 60);
  const sec = ((totalSec % 86400) + 86400) % 86400;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = withSeconds ? `:${String(s).padStart(2, '0')}` : '';
  if (hourCycle === '12') {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${mm}${ss} ${h < 12 ? 'AM' : 'PM'}`;
  }
  return `${String(h).padStart(2, '0')}:${mm}${ss}`;
}

/** Clock reading of an instant in a time scale. */
export function formatClock(utcMs: number, scale: TimeScale, hourCycle: HourCycle = '24', withSeconds = false): string {
  const wall = toWall(utcMs, scale);
  const dayStart = Math.floor(wall / 86_400_000) * 86_400_000;
  return formatMinutes((wall - dayStart) / 60_000, hourCycle, withSeconds);
}

/** "14 h 05 min" */
export function formatDuration(minutes: number, compact = false): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (compact) return `${h}:${String(m).padStart(2, '0')}`;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

/** Signed change, e.g. "+2 min 13 s" — for day-to-day differences. */
export function formatDelta(minutes: number): string {
  const sign = minutes > 0 ? '+' : minutes < 0 ? '−' : '±';
  const totalSec = Math.round(Math.abs(minutes) * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m ? `${sign}${m} min ${s} s` : `${sign}${s} s`;
}

/**
 * How far sunrise or sunset moved since the day before, from the daylight it
 * gained (positive) or lost: ("sunrise", 1.8) → "1 min 48 s earlier",
 * ("sunset", 1.8) → "1 min 48 s later".
 */
export function formatShift(event: 'sunrise' | 'sunset', gain: number): string {
  const amount = formatDelta(gain).slice(1);
  if (Math.round(Math.abs(gain) * 60) === 0) return 'no change';
  const earlier = event === 'sunrise' ? gain > 0 : gain < 0;
  return `${amount} ${earlier ? 'earlier' : 'later'}`;
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** Locale-formatted date. style: 'long' → "Sunday, 21 June 2026", 'medium' → "21 Jun 2026", 'short' → "21 Jun". */
export function formatDate(date: CivilDate, style: 'long' | 'medium' | 'short' = 'medium'): string {
  let f = dateFormats.get(style);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions =
      style === 'long'
        ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
        : style === 'medium'
          ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
          : { day: 'numeric', month: 'short', timeZone: 'UTC' };
    f = new Intl.DateTimeFormat(undefined, opts);
    dateFormats.set(style, f);
  }
  return f.format(wallMidnight(date));
}

/** "UTC+2", "UTC−3:30", "UTC" for the offset of a scale at an instant. */
export function formatOffset(utcMs: number, scale: TimeScale): string {
  const off = Math.round(scale.offsetMinutes(utcMs));
  if (off === 0) return 'UTC';
  const sign = off > 0 ? '+' : '−';
  const a = Math.abs(off);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

const zoneNameFormats = new Map<string, Intl.DateTimeFormat>();

/** Short time zone abbreviation where the browser knows one ("CEST"), else the UTC offset. */
export function timeZoneName(utcMs: number, tz: string): string {
  try {
    let f = zoneNameFormats.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' });
      zoneNameFormats.set(tz, f);
    }
    const part = f
      .formatToParts(utcMs)
      .find((p) => p.type === 'timeZoneName');
    return part?.value.replace('GMT', 'UTC') ?? tz;
  } catch {
    return tz;
  }
}

export function formatAngle(deg: number, digits = 1): string {
  return `${deg.toFixed(digits)}°`;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compassPoint(azimuth: number): string {
  return COMPASS[Math.round((((azimuth % 360) + 360) % 360) / 22.5) % 16];
}

/** Simulation rate (simulated seconds per real second) in friendly units: "12×", "2.5 h/s", "3 days/s". */
export function formatSpeed(rate: number): string {
  const units: [number, string, string][] = [
    [30 * 86400, 'month/s', 'months/s'],
    [7 * 86400, 'week/s', 'weeks/s'],
    [86400, 'day/s', 'days/s'],
    [3600, 'h/s', 'h/s'],
    [60, 'min/s', 'min/s'],
  ];
  for (const [size, one, many] of units) {
    if (rate >= size * 0.995) {
      const v = rate / size;
      const text = v < 9.95 ? String(Math.round(v * 10) / 10) : String(Math.round(v));
      return `${text} ${text === '1' ? one : many}`;
    }
  }
  return `${rate < 9.95 ? Math.round(rate * 10) / 10 : Math.round(rate)}×`;
}
