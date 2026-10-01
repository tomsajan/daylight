/**
 * Almanac design helpers: ink colours for places, chart palettes for the
 * paper and night editions, and the plain-English sentences and notes that
 * explain the selected day. Everything reads reactive state, so call these
 * inside `$derived`.
 */
import { app } from '$core/state/app.svelte';
import { resolvedTheme } from '$core/state/settings.svelte';
import { orderedPlaces, selectedDayIndex, sunNow } from '$core/state/views';
import { Light, LIGHT_NAMES, type DayLight } from '$core/astro/daylight';
import { solarCoordinates } from '$core/astro/sun';
import type { ChartPalette } from '$core/charts/palette';
import type { YearSeries } from '$core/charts/YearChart.svelte';
import type { DaySeries } from '$core/charts/DayChart.svelte';
import type { GlobeMarker } from '$core/globe/GlobeRenderer';
import type { Place } from '$core/geo/place';
import { civilDateOf, dayOfYear, sameDate, wallMidnight, type CivilDate } from '$core/time/timescale';
import { compassPoint, formatDuration, timeZoneName } from '$core/time/format';

// --- Colours -----------------------------------------------------------------

/**
 * Place colours as printing inks. The core's bright place colours wash out on
 * paper, so this design uses its own, one set per edition.
 */
const INKS = {
  light: ['#1f4e8c', '#a8326e', '#3d7a2c', '#9c6d08', '#5f3d99', '#147a74'],
  dark: ['#8fb4ef', '#f08cb8', '#8fd16f', '#f0c05a', '#c3a2f2', '#5fd0c6'],
};

export function inkOf(place: Place): string {
  const i = app.places.findIndex((p) => p.id === place.id);
  return INKS[resolvedTheme()][Math.max(0, i) % INKS.light.length];
}

const CHART_FONT = '500 11px "Libre Franklin", "Helvetica Neue", Arial, sans-serif';

/** Paper edition: night in dense ink, twilight in washes of blue, day as sunlit paper. */
const PAPER: ChartPalette = {
  light: {
    [Light.Night]: '#1c2740',
    [Light.Astronomical]: '#2f3d5f',
    [Light.Nautical]: '#506288',
    [Light.Civil]: '#95a4c2',
    [Light.Day]: '#f7e4a6',
  },
  background: '#efe9da',
  grid: 'rgba(40, 34, 20, 0.11)',
  axis: 'rgba(40, 34, 20, 0.42)',
  text: '#5d5647',
  marker: '#d0441c',
  font: CHART_FONT,
};

const NIGHT: ChartPalette = {
  light: {
    [Light.Night]: '#090c15',
    [Light.Astronomical]: '#141c31',
    [Light.Nautical]: '#24345c',
    [Light.Civil]: '#41588b',
    [Light.Day]: '#d9b862',
  },
  background: '#151a24',
  grid: 'rgba(233, 226, 208, 0.09)',
  axis: 'rgba(233, 226, 208, 0.34)',
  text: '#ada48f',
  marker: '#ff8159',
  font: CHART_FONT,
};

// Canvas text only picks up a web font once it has loaded; a new palette object redraws the charts.
let fontsReady = $state(false);
if (typeof document !== 'undefined') document.fonts?.ready.then(() => (fontsReady = true));

export function almanacPalette(): ChartPalette {
  const base = resolvedTheme() === 'dark' ? NIGHT : PAPER;
  return fontsReady ? { ...base } : base;
}

// --- Series for the shared charts and globe -------------------------------------

export function almanacYearSeries(): YearSeries[] {
  return orderedPlaces().map((p) => ({ id: p.id, name: p.name, color: inkOf(p), days: app.yearFor(p) }));
}

export function almanacDaySeries(): DaySeries[] {
  return orderedPlaces().map((p) => ({
    id: p.id,
    name: p.name,
    color: inkOf(p),
    lat: p.lat,
    lon: p.lon,
    day: app.dayFor(p),
    scale: app.scaleFor(p),
  }));
}

export function almanacMarkers(): GlobeMarker[] {
  return app.places.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, label: p.name, color: inkOf(p) }));
}

// --- Words -----------------------------------------------------------------------

// Sentences are English, so dates use an English locale even when the browser's is not.
const LOCALE = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en') ? navigator.language : 'en-GB';
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = fmtCache.get(key);
  if (!f) fmtCache.set(key, (f = new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone: 'UTC' })));
  return f;
}

/** "1 October", with the year when it differs from `year`. */
export function dayMonth(date: CivilDate, year = date.year): string {
  return date.year === year
    ? fmt('dm', { day: 'numeric', month: 'long' }).format(wallMidnight(date))
    : fmt('dmy', { day: 'numeric', month: 'long', year: 'numeric' }).format(wallMidnight(date));
}

/** "Thursday, 1 October 2026" */
export function longDate(date: CivilDate): string {
  return fmt('long', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(wallMidnight(date));
}

/** "Saturday, 21 March" */
export function longDay(date: CivilDate): string {
  return fmt('wdm', { weekday: 'long', day: 'numeric', month: 'long' }).format(wallMidnight(date));
}

/** "1 Oct" */
export function shortDate(date: CivilDate): string {
  return fmt('short', { day: 'numeric', month: 'short' }).format(wallMidnight(date));
}

/** Unsigned change for prose: "3 min 43 s", "12 s". */
export function amount(minutes: number): string {
  const total = Math.round(Math.abs(minutes) * 60);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m} min ${s} s` : `${s} s`;
}

// Cached per zone and quarter hour: the clock re-reads this every frame while time runs.
const zoneCache = new Map<string, string>();
export function zoneName(utcMs: number, tz: string): string {
  const key = `${tz}|${Math.floor(utcMs / 900_000)}`;
  let name = zoneCache.get(key);
  if (name === undefined) {
    if (zoneCache.size > 200) zoneCache.clear();
    zoneCache.set(key, (name = timeZoneName(utcMs, tz)));
  }
  return name;
}

const WIND: Record<string, string> = { N: 'north', E: 'east', S: 'south', W: 'west' };

/** "south-west" for an azimuth. */
export function direction(azimuth: number): string {
  const p = compassPoint(azimuth);
  // NNE → north-north-east; NE → north-east.
  return p.length === 3 ? `${WIND[p[0]]}-${WIND[p[1]]}-${WIND[p[2]]}` : [...p].map((c) => WIND[c]).join('-');
}

function isToday(date: CivilDate): boolean {
  return sameDate(date, civilDateOf(Date.now(), app.scale));
}

/** Days of `year` followed by the next year's, for looking ahead past 31 December. */
function twoYears(place: Place, year: number): DayLight[] {
  return [...app.yearFor(place, year), ...app.yearFor(place, year + 1)];
}

/**
 * One sentence that explains the selected day, e.g. "On 1 October Prague gets
 * 11 h 39 min of daylight, 3 min 43 s less than yesterday; the days get shorter
 * until 21 December."
 */
export function daySentence(place: Place): string {
  const year = app.date.year;
  const i = selectedDayIndex();
  const days = twoYears(place, year);
  const d = days[i];
  const prev = i > 0 ? days[i - 1] : app.yearFor(place, year - 1).at(-1)!;
  const when = isToday(d.date) ? 'Today' : `On ${dayMonth(d.date)}`;
  const name = place.name;

  if (d.polarDay || d.polarNight) {
    const polar = (x: DayLight) => (d.polarDay ? x.polarDay : x.polarNight);
    let j = i;
    while (j < days.length && polar(days[j])) j++;
    if (d.polarDay) {
      if (j === i + 1) return `${when} the sun never sets in ${name}. It is the last day of the midnight sun; tomorrow the sun dips below the horizon again.`;
      return `${when} the sun never sets in ${name}. The midnight sun lasts until ${dayMonth(days[j - 1].date, year)}, another ${j - i - 1} days.`;
    }
    if (j >= days.length) return `${when} the sun never rises in ${name}.`;
    return `${when} the sun never rises in ${name}. The polar night ends on ${dayMonth(days[j].date, year)}, when the sun clears the horizon again.`;
  }

  const head = `${when} ${name} gets ${formatDuration(d.daylightMin)} of daylight`;
  const change = d.daylightMin - prev.daylightMin;
  const dir = Math.sign(change);
  const same = Math.round(Math.abs(change) * 60) < 1;

  // Look ahead for the day the trend turns, or for midnight sun / polar night to begin.
  let turn: DayLight | null = null;
  let polarStart: DayLight | null = null;
  for (let j = i + 1; j < days.length && dir !== 0; j++) {
    if (days[j].polarDay || days[j].polarNight) {
      polarStart = days[j];
      break;
    }
    const delta = days[j].daylightMin - days[j - 1].daylightMin;
    if (Math.sign(delta) === -dir) {
      turn = days[j - 1];
      break;
    }
  }

  const compare = same ? 'about the same as yesterday' : `${amount(change)} ${dir > 0 ? 'more' : 'less'} than yesterday`;
  const longer = dir > 0 ? 'longer' : 'shorter';
  let tail = '';
  if (polarStart) {
    tail = polarStart.polarDay
      ? `; the days get longer until the midnight sun begins on ${dayMonth(polarStart.date, year)}`
      : `; the days get shorter until the polar night begins on ${dayMonth(polarStart.date, year)}`;
  } else if (turn && sameDate(turn.date, d.date)) {
    tail = dir > 0 ? '. This is the longest day of the year' : '. This is the shortest day of the year';
  } else if (turn) {
    tail = `; the days get ${longer} until ${dayMonth(turn.date, year)}`;
  }
  return `${head}, ${compare}${tail}.`;
}

/** "At 14:32 it is daylight in Prague, with the sun 28° above the south-west horizon." */
export function nowSentence(place: Place, clock: string, light: Light): string {
  const sun = sunNow(place);
  if (!sun) return '';
  const phase = light === Light.Day ? 'daylight' : light === Light.Night ? 'night' : LIGHT_NAMES[light].toLowerCase();
  const alt = Math.abs(sun.altitude);
  const where =
    sun.altitude >= 0
      ? `the sun ${alt.toFixed(0)}° above the ${direction(sun.azimuth)} horizon`
      : `the sun ${alt.toFixed(0)}° below the horizon, to the ${direction(sun.azimuth)}`;
  return `At ${clock} it is ${phase} in ${place.name}, with ${where}.`;
}

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

export interface YearAnnotation {
  index: number;
  label: string;
  short: string;
  kind: 'season' | 'clock';
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

// --- Notes --------------------------------------------------------------------------

/** Midnight-sun and polar-night days in the year. */
export function polarStats(place: Place): { polarDays: number; polarNights: number } {
  let polarDays = 0;
  let polarNights = 0;
  for (const d of app.yearFor(place)) {
    if (d.polarDay) polarDays++;
    if (d.polarNight) polarNights++;
  }
  return { polarDays, polarNights };
}

/**
 * Around the winter solstice the earliest sunset comes before the shortest day
 * and the latest sunrise after it. Returns those dates, or null where the
 * effect doesn't apply (tropics, polar night, clock changes in the window).
 */
export function solsticeDrift(place: Place): { shortest: CivilDate; earliestSunset: CivilDate; latestSunrise: CivilDate } | null {
  if (Math.abs(place.lat) < 15) return null;
  const y = app.date.year;
  const before = app.yearFor(place, y - 1);
  const all = [...before, ...app.yearFor(place, y), ...app.yearFor(place, y + 1)];
  const cur = app.yearFor(place, y);
  let s = 0;
  for (let i = 1; i < cur.length; i++) if (cur[i].daylightMin < cur[s].daylightMin) s = i;
  const center = before.length + s;
  const window = all.slice(center - 45, center + 46);
  if (window.some((d) => d.polarDay || d.polarNight || !d.sunrise || !d.sunset || Math.abs(d.lengthMin - 1440) >= 15)) return null;
  let early = window[0];
  let late = window[0];
  for (const d of window) {
    if (d.sunset!.minutes < early.sunset!.minutes) early = d;
    if (d.sunrise!.minutes > late.sunrise!.minutes) late = d;
  }
  return { shortest: cur[s].date, earliestSunset: early.date, latestSunrise: late.date };
}
