/** Small helpers shared by the Instrument panels: compact formats, date stepping, phase codes. */
import { Light } from '$core/astro/daylight';
import { app } from '$core/state/app.svelte';
import { addDays, type CivilDate } from '$core/time/timescale';
import { formatSpeed } from '$core/time/format';

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

/** Signed simulation rate for compact readouts: "+4.6 h/s", "−2 days/s". */
export function rateLabel(): string {
  return `${app.speed < 0 ? '−' : '+'}${formatSpeed(Math.abs(app.speed))}`;
}

export type SimState = 'live' | 'run' | 'hold';

export function simState(): SimState {
  if (app.live && app.playing) return 'live';
  return app.playing ? 'run' : 'hold';
}
