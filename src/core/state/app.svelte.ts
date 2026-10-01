/**
 * Application state shared by every design: places being compared, the
 * selected place, the current instant and the time simulation.
 *
 * Usage from a component:
 *   import { app } from '$core/state/app.svelte';
 *   app.selected?.name, app.time, app.play(), app.addPlace(place) ...
 */
import { computeDay, computeYear, type DayLight, type DaylightOptions } from '../astro/daylight';
import { makePlace, type Place } from '../geo/place';
import { guessHomePlace } from '../geo/locate';
import { reverseGeocode } from '../geo/geocode';
import {
  civilDateOf,
  makeTimeScale,
  withDate,
  withMinutesOfDay,
  type CivilDate,
  type TimeScale,
} from '../time/timescale';
import { settings } from './settings.svelte';

/** Seconds of simulated time per real second. */
export const SPEEDS: { value: number; label: string }[] = [
  { value: 1, label: '1×' },
  { value: 10, label: '10×' },
  { value: 60, label: '1 min/s' },
  { value: 600, label: '10 min/s' },
  { value: 3600, label: '1 h/s' },
  { value: 6 * 3600, label: '6 h/s' },
  { value: 86400, label: '1 day/s' },
  { value: 7 * 86400, label: '1 week/s' },
  { value: 30 * 86400, label: '1 month/s' },
];

export const MAX_PLACES = 6;

/** Distinct colours for compared places (work on light and dark backgrounds). */
export const PLACE_COLORS = ['#f2a516', '#3d8bfd', '#e5484d', '#30a46c', '#8e4ec6', '#12a594'];

class AppState {
  places = $state<Place[]>([]);
  selectedId = $state<string | null>(null);
  /** Current instant, UTC ms. */
  time = $state(Date.now());
  playing = $state(false);
  /** Simulation speed (signed: negative runs backwards). */
  speed = $state(1);
  /** True while time follows the real clock. */
  live = $state(true);
  ready = $state(false);

  selected = $derived(this.places.find((p) => p.id === this.selectedId) ?? this.places[0] ?? null);

  /** Time scale for a place under the current settings. */
  scaleFor(place: Place): TimeScale {
    return makeTimeScale(settings.timeScale, place);
  }

  /** The selected place's time scale. */
  scale = $derived(this.selected ? makeTimeScale(settings.timeScale, this.selected) : makeTimeScale('utc', { lon: 0, tz: 'UTC' }));

  /** Calendar date at the selected place (in the chosen time scale). */
  date: CivilDate = $derived(civilDateOf(this.time, this.scale));

  daylightOptions: DaylightOptions = $derived({ sunrise: settings.sunrise, observerHeight: settings.observerHeight });

  colorOf(place: Place): string {
    const i = this.places.findIndex((p) => p.id === place.id);
    return PLACE_COLORS[(i < 0 ? 0 : i) % PLACE_COLORS.length];
  }

  // --- Places --------------------------------------------------------------

  addPlace(place: Place, select = true): void {
    const existing = this.places.find((p) => Math.abs(p.lat - place.lat) < 1e-4 && Math.abs(p.lon - place.lon) < 1e-4);
    if (existing) {
      if (select) this.selectedId = existing.id;
      return;
    }
    if (this.places.length >= MAX_PLACES) {
      // Replace the selected place rather than refusing.
      const i = this.places.findIndex((p) => p.id === this.selected?.id);
      this.places[i < 0 ? this.places.length - 1 : i] = place;
    } else {
      this.places.push(place);
    }
    if (select) this.selectedId = place.id;
  }

  /** Replace the selected place (the default action when picking on the map). */
  replaceSelected(place: Place): void {
    const i = this.places.findIndex((p) => p.id === this.selected?.id);
    if (i < 0) return this.addPlace(place);
    this.places[i] = place;
    this.selectedId = place.id;
  }

  /**
   * A point tapped on the map: use it immediately (named by its coordinates),
   * then fill in a proper name once reverse geocoding answers.
   * `add` compares it with existing places instead of replacing the selected one.
   */
  async pickPoint(lat: number, lon: number, add = false): Promise<void> {
    const place = makePlace(lat, lon);
    if (add) this.addPlace(place);
    else this.replaceSelected(place);
    const named = await reverseGeocode(lat, lon);
    this.updatePlace(place.id, named);
  }

  updatePlace(id: string, patch: Partial<Omit<Place, 'id'>>): void {
    const i = this.places.findIndex((p) => p.id === id);
    if (i >= 0) this.places[i] = { ...this.places[i], ...patch };
  }

  removePlace(id: string): void {
    if (this.places.length <= 1) return;
    const i = this.places.findIndex((p) => p.id === id);
    if (i < 0) return;
    this.places.splice(i, 1);
    if (this.selectedId === id) this.selectedId = this.places[Math.max(0, i - 1)].id;
  }

  select(id: string): void {
    this.selectedId = id;
  }

  // --- Time ----------------------------------------------------------------

  setTime(utcMs: number): void {
    this.time = utcMs;
    this.live = false;
  }

  /** Jump to a date, keeping the time of day (in the selected place's clock). */
  setDate(date: CivilDate): void {
    this.setTime(withDate(this.time, date, this.scale));
  }

  /** Set time of day as minutes since midnight (in the selected place's clock). */
  setMinutesOfDay(minutes: number): void {
    this.setTime(withMinutesOfDay(this.time, minutes, this.scale));
  }

  goLive(): void {
    this.time = Date.now();
    this.speed = 1;
    this.playing = true;
    this.live = true;
  }

  play(): void {
    this.playing = true;
    if (this.speed !== 1) this.live = false;
  }

  pause(): void {
    this.playing = false;
    this.live = false;
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    if (speed !== 1) this.live = false;
  }

  // --- Data ----------------------------------------------------------------

  /** All days of a year for a place, cached. Defaults to the current year. */
  yearFor(place: Place, year = this.date.year): DayLight[] {
    return cachedYear(place, year, this.scaleFor(place), this.daylightOptions);
  }

  /** One day for a place; defaults to the selected date. */
  dayFor(place: Place, date: CivilDate = this.date): DayLight {
    return computeDay(place, date, this.scaleFor(place), this.daylightOptions);
  }
}

export const app = new AppState();

// --- Year cache --------------------------------------------------------------

const yearCache = new Map<string, DayLight[]>();

function cachedYear(place: Place, year: number, scale: TimeScale, opts: DaylightOptions): DayLight[] {
  const key = `${place.lat},${place.lon},${place.tz}|${year}|${scale.kind}|${opts.sunrise}|${opts.observerHeight}`;
  let data = yearCache.get(key);
  if (!data) {
    if (yearCache.size > 40) yearCache.delete(yearCache.keys().next().value!);
    data = computeYear(place, year, scale, opts);
    yearCache.set(key, data);
  } else {
    // Refresh LRU position.
    yearCache.delete(key);
    yearCache.set(key, data);
  }
  return data;
}

// --- Simulation clock -------------------------------------------------------

let lastFrame = 0;
function frame(now: number) {
  if (app.playing) {
    const dt = lastFrame ? now - lastFrame : 0;
    if (app.live) app.time = Date.now();
    else if (dt > 0 && dt < 1000) app.time = app.time + dt * app.speed;
  }
  lastFrame = now;
  requestAnimationFrame(frame);
}

// --- URL state ----------------------------------------------------------------
// ?p=Prague~Czechia~50.0755~14.4378&p=...&s=1&t=2026-06-21T12:00:00Z
// Time is only written when not live, so a shared link shows the same moment.

function readUrl(): { places: Place[]; selected: number; time: number | null } {
  const q = new URLSearchParams(location.search);
  const places: Place[] = [];
  for (const raw of q.getAll('p')) {
    const [name, detail, lat, lon] = raw.split('~');
    const la = parseFloat(lat);
    const lo = parseFloat(lon);
    if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90) places.push(makePlace(la, lo, name, detail));
  }
  const t = q.get('t') ? Date.parse(q.get('t')!) : NaN;
  return { places, selected: Number(q.get('s') ?? 0) || 0, time: Number.isFinite(t) ? t : null };
}

function writeUrl() {
  const q = new URLSearchParams();
  for (const p of app.places) q.append('p', [p.name, p.detail, p.lat.toFixed(4), p.lon.toFixed(4)].join('~'));
  const sel = app.places.findIndex((p) => p.id === app.selected?.id);
  if (sel > 0) q.set('s', String(sel));
  if (!app.live) q.set('t', new Date(Math.round(app.time / 60000) * 60000).toISOString().replace(':00.000Z', 'Z'));
  const url = `${location.pathname}?${q.toString().replace(/%7E/g, '~').replace(/%2C/g, ',').replace(/%3A/g, ':')}${location.hash}`;
  if (url !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(null, '', url);
}

let started = false;

/** Load state from the URL (or guess the user's home), start the clock. Call once. */
export async function initApp(): Promise<void> {
  if (started) return;
  started = true;

  const fromUrl = readUrl();
  if (fromUrl.time !== null) {
    app.time = fromUrl.time;
    app.live = false;
    app.playing = false;
  } else {
    app.playing = true;
  }
  requestAnimationFrame(frame);

  if (fromUrl.places.length) {
    for (const p of fromUrl.places) app.addPlace(p, false);
    app.selectedId = app.places[Math.min(fromUrl.selected, app.places.length - 1)].id;
  } else {
    app.addPlace(await guessHomePlace());
  }
  app.ready = true;

  // Keep the URL shareable. Throttled: time changes every frame while playing.
  let timer: ReturnType<typeof setTimeout> | null = null;
  $effect.root(() => {
    $effect(() => {
      // Track the pieces of state that belong in the URL.
      void app.places.map((p) => p.name + p.lat + p.lon);
      void app.selected;
      void app.live;
      void app.time;
      if (!timer) timer = setTimeout(() => ((timer = null), writeUrl()), 1000);
    });
  });
}
