/** Small helpers shared by the Instrument panels: compact formats, date stepping, phase codes. */
import { Light } from '$core/astro/daylight';
import { app, SPEEDS } from '$core/state/app.svelte';
import { addDays, type CivilDate } from '$core/time/timescale';
import { timeZoneName } from '$core/time/format';

/** Short codes for light phases, for tight table cells. */
export const PHASE_CODE: Record<Light, string> = {
  [Light.Night]: 'NIGHT',
  [Light.Astronomical]: 'ASTRO',
  [Light.Nautical]: 'NAUT',
  [Light.Civil]: 'CIVIL',
  [Light.Day]: 'DAY',
};

/** "11h43m" — compact duration for dense cells. */
export function dur(minutes: number): string {
  const t = Math.round(minutes);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${h}h${String(m).padStart(2, '0')}m`;
}

/** "+2m13s", "−45s", "±0s" — day-to-day change. */
export function delta(minutes: number): string {
  const sign = minutes > 0.004 ? '+' : minutes < -0.004 ? '−' : '±';
  const s = Math.round(Math.abs(minutes) * 60);
  const m = Math.floor(s / 60);
  return m ? `${sign}${m}m${String(s % 60).padStart(2, '0')}s` : `${sign}${s}s`;
}

/** "+1h12m", "−0h05m" — difference between two durations. */
export function durDelta(minutes: number): string {
  const sign = minutes >= 0.5 ? '+' : minutes <= -0.5 ? '−' : '±';
  return sign + dur(Math.abs(minutes));
}

export function deg(v: number, digits = 1): string {
  return `${v.toFixed(digits).replace('-', '−')}°`;
}

export function addMonths(date: CivilDate, months: number): CivilDate {
  const total = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Math.min(date.day, last) };
}

export function stepDays(days: number): void {
  app.setDate(addDays(app.date, days));
}

export function stepMonths(months: number): void {
  app.setDate(addMonths(app.date, months));
}

/** Move the time of day, rolling over into neighbouring days. */
export function stepMinutes(minutes: number): void {
  app.setTime(app.time + minutes * 60_000);
}

/** Index into SPEEDS of the current speed (ignoring direction). */
export function speedIndex(): number {
  return Math.max(0, SPEEDS.findIndex((s) => s.value === Math.abs(app.speed)));
}

export function setSpeedIndex(i: number): void {
  const k = Math.max(0, Math.min(SPEEDS.length - 1, i));
  app.setSpeed(SPEEDS[k].value * (app.speed < 0 ? -1 : 1));
  if (!app.playing) app.play();
}

/** Short speed labels for the segmented speed selector. */
export const SPEED_SHORT = ['1×', '10×', '1m', '10m', '1h', '6h', '1d', '1w', '1mo'];

export type SimState = 'live' | 'run' | 'hold';

export function simState(): SimState {
  if (app.live && app.playing) return 'live';
  return app.playing ? 'run' : 'hold';
}

const zoneCache = new Map<string, string>();

/** timeZoneName() cached per zone and hour; abbreviations only change at DST transitions. */
export function zoneAbbr(utcMs: number, tz: string): string {
  const key = `${tz}|${Math.floor(utcMs / 3_600_000)}`;
  let v = zoneCache.get(key);
  if (v === undefined) {
    if (zoneCache.size > 500) zoneCache.clear();
    v = timeZoneName(utcMs, tz);
    zoneCache.set(key, v);
  }
  return v;
}
