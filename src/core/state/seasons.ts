/**
 * Solstices, equinoxes and clock changes: the landmarks of a year, as dates at
 * a place, plus ready-made marks for the year chart (`annotations` prop).
 */
import { app } from './app.svelte';
import { solarCoordinates } from '../astro/sun';
import type { Place } from '../geo/place';
import type { YearAnnotation } from '../charts/YearChart.svelte';
import { civilDateOf, dayOfYear, type CivilDate } from '../time/timescale';

// --- Solstices and equinoxes ---------------------------------------------------

export type SeasonKind = 'march-equinox' | 'june-solstice' | 'september-equinox' | 'december-solstice';

export const SEASON_NAMES: Record<SeasonKind, string> = {
  'march-equinox': 'March equinox',
  'june-solstice': 'June solstice',
  'september-equinox': 'September equinox',
  'december-solstice': 'December solstice',
};

const DAY_MS = 86_400_000;
const seasonCache = new Map<number, { kind: SeasonKind; utc: number }[]>();

function bisect(f: (t: number) => number, a: number, b: number): number {
  let fa = f(a);
  for (let k = 0; k < 40 && b - a > 1000; k++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (Math.sign(fm) === Math.sign(fa)) (a = m), (fa = fm);
    else b = m;
  }
  return (a + b) / 2;
}

/**
 * Instants of the equinoxes (declination crossing 0°) and solstices
 * (declination at its extreme) of a calendar year, UTC.
 */
export function seasons(year: number): { kind: SeasonKind; utc: number }[] {
  let out = seasonCache.get(year);
  if (out) return out;
  out = [];
  const decl = (t: number) => solarCoordinates(t).declination;
  const slope = (t: number) => decl(t + 3_600_000) - decl(t - 3_600_000);
  // Start a few days early so events near 1 January in UTC are not missed in other zones.
  for (let t = Date.UTC(year, 0, 1) - 3 * DAY_MS; t < Date.UTC(year + 1, 0, 1) + 3 * DAY_MS; t += DAY_MS) {
    const a = decl(t);
    const b = decl(t + DAY_MS);
    if (a < 0 && b >= 0) out.push({ kind: 'march-equinox', utc: bisect(decl, t, t + DAY_MS) });
    if (a >= 0 && b < 0) out.push({ kind: 'september-equinox', utc: bisect(decl, t, t + DAY_MS) });
    const sa = slope(t);
    const sb = slope(t + DAY_MS);
    if (sa > 0 && sb <= 0) out.push({ kind: 'june-solstice', utc: bisect(slope, t, t + DAY_MS) });
    if (sa < 0 && sb >= 0) out.push({ kind: 'december-solstice', utc: bisect(slope, t, t + DAY_MS) });
  }
  seasonCache.set(year, out);
  return out;
}

/** This year's solstices and equinoxes as dates in the place's clock. */
export function seasonDates(place: Place, year = app.date.year): { kind: SeasonKind; utc: number; date: CivilDate; index: number }[] {
  const scale = app.scaleFor(place);
  return seasons(year)
    .map((s) => {
      const date = civilDateOf(s.utc, scale);
      return { ...s, date, index: dayOfYear(date) - 1 };
    })
    .filter((s) => s.date.year === year);
}

// --- Clock changes ---------------------------------------------------------------

/** Days on which the clocks change (23- or 25-hour days), with the shift in minutes (+ = forward). */
export function clockChanges(place: Place, year = app.date.year): { index: number; date: CivilDate; shift: number }[] {
  const out: { index: number; date: CivilDate; shift: number }[] = [];
  app.yearFor(place, year).forEach((d, index) => {
    // Apparent solar time drifts by seconds a day; only real clock changes count.
    if (Math.abs(d.lengthMin - 1440) >= 15) out.push({ index, date: d.date, shift: Math.round(1440 - d.lengthMin) });
  });
  return out;
}

export function shiftLabel(shift: number): string {
  const a = Math.abs(shift);
  return a % 60 === 0 ? `${a / 60} h` : `${a} min`;
}

/** Marks for the year chart: solstices, equinoxes and clock changes. */
export function yearAnnotations(place: Place): YearAnnotation[] {
  const marks: YearAnnotation[] = seasonDates(place).map((s) => ({
    index: s.index,
    label: SEASON_NAMES[s.kind],
    short: s.kind.endsWith('equinox') ? 'Equinox' : 'Solstice',
    kind: 'season',
  }));
  for (const c of clockChanges(place)) {
    marks.push({
      index: c.index,
      label: `Clocks ${c.shift > 0 ? 'forward' : 'back'} ${shiftLabel(c.shift)}`,
      short: `${c.shift > 0 ? '+' : '−'}${shiftLabel(c.shift)}`,
      kind: 'clock',
    });
  }
  return marks;
}
