/**
 * Ready-made inputs for the shared components, derived from app state and
 * settings. Each function reads reactive state, so call it inside `$derived`:
 *
 *   const series = $derived(yearSeries());
 */
import { daylightChange, Light, type DayLight } from '../astro/daylight';
import { sunPosition } from '../astro/sun';
import { zeroCrossings, type SunClock } from '../astro/clock';
import { formatSigned } from '../time/format';
import { DARK_PALETTE, LIGHT_PALETTE, type ChartPalette } from '../charts/palette';
import type { YearSeries } from '../charts/YearChart.svelte';
import type { DaySeries } from '../charts/DayChart.svelte';
import type { GlobeMarker, GlobeOptions } from '../globe/GlobeRenderer';
import type { Place } from '../geo/place';
import { addDays, dayOfYear, minutesOfDay, type CivilDate } from '../time/timescale';
import { app } from './app.svelte';
import { resolvedTheme, settings } from './settings.svelte';

/** Selected place first, then the others being compared. */
export function orderedPlaces(): Place[] {
  const sel = app.selected;
  if (!sel) return [];
  return [sel, ...app.places.filter((p) => p.id !== sel.id)];
}

export function yearSeries(): YearSeries[] {
  const lastYear = addDays({ year: app.date.year, month: 1, day: 1 }, -1);
  return orderedPlaces().map((p) => ({
    id: p.id,
    name: p.name,
    color: app.colorOf(p),
    days: app.yearFor(p),
    previous: app.dayFor(p, lastYear),
    clock: app.clockYearFor(p),
  }));
}

export function daySeries(): DaySeries[] {
  return orderedPlaces().map((p) => ({
    id: p.id,
    name: p.name,
    color: app.colorOf(p),
    lat: p.lat,
    lon: p.lon,
    day: app.dayFor(p),
    scale: app.scaleFor(p),
  }));
}

/** Index of the selected date within the year arrays. */
export function selectedDayIndex(): number {
  return dayOfYear(app.date) - 1;
}

/** Time of day of the current instant at the selected place, minutes. */
export function currentMinutes(): number {
  return minutesOfDay(app.time, app.date, app.scale);
}

export function globeMarkers(): GlobeMarker[] {
  return app.places.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, label: p.name, color: app.colorOf(p) }));
}

export function globeOptions(): Partial<GlobeOptions> {
  return { ...settings.globe, dayBrightness: settings.globeBrightness.day, nightBrightness: settings.globeBrightness.night };
}

export function chartPalette(): ChartPalette {
  return resolvedTheme() === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
}

/** Sun altitude/azimuth at a place right now (simulated time). */
export function sunNow(place: Place | null = app.selected): { altitude: number; azimuth: number } | null {
  return place ? sunPosition(app.time, place.lat, place.lon) : null;
}

export interface DaySummary {
  place: Place;
  day: DayLight;
  /** Daylight change from the previous day, minutes. */
  change: number;
  /**
   * Where that change happened, minutes: gained in the morning (sunrise earlier)
   * and in the evening (sunset later); negative = lost. Null in polar day/night.
   */
  morningChange: number | null;
  eveningChange: number | null;
  /** Longest and shortest days of the year (by daylight). */
  longest: DayLight;
  shortest: DayLight;
  /** Current light level at the simulated instant. */
  lightNow: Light;
}

/** Key facts for a place on the selected date, for info panels. */
export function daySummary(place: Place | null = app.selected): DaySummary | null {
  if (!place) return null;
  const year = app.yearFor(place);
  const i = selectedDayIndex();
  const day = year[i] ?? app.dayFor(place);
  const prev = i > 0 ? year[i - 1] : app.dayFor(place, addDays(app.date, -1));
  let longest = year[0];
  let shortest = year[0];
  for (const d of year) {
    if (d.daylightMin > longest.daylightMin) longest = d;
    if (d.daylightMin < shortest.daylightMin) shortest = d;
  }
  const seg = day.segments.find((s) => app.time >= s.start && app.time < s.end);
  const c = daylightChange(prev, day);
  return { place, day, change: c.total, morningChange: c.morning, eveningChange: c.evening, longest, shortest, lightNow: seg?.light ?? Light.Night };
}

export interface ClockSummary {
  place: Place;
  /** The sun against the place's clock on the selected date. */
  day: SunClock;
  /** Days of the year when the clock and the sun agree (to the nearest day). */
  zeros: CivilDate[];
  /** On sundial time the clock follows the sun: they agree every day. */
  always: boolean;
  /** Where the place has summer time: the days they would agree on standard time all year; else null. */
  standardZeros: CivilDate[] | null;
}

/** The sun against the clock for a place on the selected date, for info panels. */
export function clockSummary(place: Place | null = app.selected): ClockSummary | null {
  if (!place) return null;
  const year = app.clockYearFor(place);
  const jan1 = { year: app.date.year, month: 1, day: 1 };
  const days = (values: number[]) => zeroCrossings(values).map((i) => addDays(jan1, Math.round(i)));
  const always = year[0]?.kind === 'solar-apparent';
  return {
    place,
    day: year[selectedDayIndex()] ?? year[year.length - 1],
    zeros: always ? [] : days(year.map((c) => c.total)),
    always,
    standardZeros: year.some((c) => c.summer) ? days(year.map((c) => c.standard)) : null,
  };
}

/** The days the clock and the sun agree as a list in words ("15 Apr and 22 Dec"), "never this year" or "every day". */
export function clockZerosText(zeros: CivilDate[], format: (d: CivilDate) => string, always = false): string {
  if (always) return 'every day';
  if (!zeros.length) return 'never this year';
  const dates = zeros.map((d) => format(d));
  return dates.length === 1 ? dates[0] : `${dates.slice(0, -1).join(', ')} and ${dates[dates.length - 1]}`;
}

/**
 * The parts of the gap in words: "equation of time +3 min, longitude against the time zone +2 min,
 * summer time +1 h 00 min"; on mean solar time the equation of time alone.
 */
export function clockParts(c: SunClock): string {
  if (c.kind === 'solar-apparent') return 'sundial time follows the sun';
  const parts = [`equation of time ${formatSigned(c.equation)}`];
  if (c.kind !== 'solar-mean') parts.push(`longitude against ${c.kind === 'utc' ? 'Greenwich' : 'the time zone'} ${formatSigned(c.longitude)}`);
  if (c.summer) parts.push(`summer time ${formatSigned(c.summer)}`);
  return parts.join(', ');
}

/**
 * One or two sentences on when the clock and the sun agree, for captions: "Clock and sun agree on 20 Dec. On
 * standard time all year they would agree on 26 Apr, 31 May, 8 Sep and 20 Dec."
 */
export function clockAgreement(c: ClockSummary, format: (d: CivilDate) => string): string {
  if (c.always) return 'On sundial time the clock follows the sun, so the line stays at zero: they agree every day.';
  const main = c.zeros.length ? `Clock and sun agree on ${clockZerosText(c.zeros, format)}.` : 'Clock and sun never agree this year.';
  if (!c.standardZeros) return main;
  const std = c.standardZeros.length
    ? `would agree on ${clockZerosText(c.standardZeros, format)}`
    : 'would still never agree';
  return `${main} On standard time all year, without summer time (the dotted line), they ${std}.`;
}
