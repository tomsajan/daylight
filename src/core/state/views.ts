/**
 * Ready-made inputs for the shared components, derived from app state and
 * settings. Each function reads reactive state, so call it inside `$derived`:
 *
 *   const series = $derived(yearSeries());
 */
import { daylightChange, Light, type DayLight } from '../astro/daylight';
import { sunPosition } from '../astro/sun';
import { DARK_PALETTE, LIGHT_PALETTE, type ChartPalette } from '../charts/palette';
import type { YearSeries } from '../charts/YearChart.svelte';
import type { DaySeries } from '../charts/DayChart.svelte';
import type { GlobeMarker, GlobeOptions } from '../globe/GlobeRenderer';
import type { Place } from '../geo/place';
import { addDays, dayOfYear, minutesOfDay } from '../time/timescale';
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
