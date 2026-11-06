/**
 * One night at a place: from noon to the next noon, when the Sun sets and how dark it gets, when
 * the Moon is up and how much of it is lit, and the hours that are both dark and moonless, the
 * ones that count for photographing faint things.
 *
 * Worked out from samples two minutes apart, with every crossing placed on the straight line
 * between two samples (well under a minute off). The Moon's direction is taken from
 * astronomy-engine once an hour and interpolated; the Earth's turning comes from each sample's
 * own frame, so its altitude stays accurate.
 */
import { MoonPhase, SearchMoonPhase } from 'astronomy-engine';
import { sunAltitude } from '../astro/sun';
import { addDays, fromWall, wallMidnight, type CivilDate, type TimeScale } from '../time/timescale';
import { astroTime, bodyLight, bodyVector, skyFrame, sinAltitude, type Frame, type Site, type Vec3 } from './frame';

const DEG = 180 / Math.PI;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Sun and Moon on the horizon: the upper edge, lifted by refraction (geometric altitude of the centre). */
export const HORIZON = -0.833;
export const TWILIGHT = { civil: -6, nautical: -12, astronomical: -18 } as const;

export interface Interval {
  start: number;
  end: number;
}

export type Darkness = 'astronomical' | 'nautical' | 'civil' | 'none';

export interface MoonInfo {
  /** Lit fraction at the night's darkest moment, 0-1. */
  fraction: number;
  /** Ecliptic longitude of the Moon less the Sun's: 0 new, 90 first quarter, 180 full, 270 last quarter. */
  phase: number;
  name: string;
  /** Times the Moon rises and sets within the night's window. */
  rises: number[];
  sets: number[];
  /** Whether the Moon is up at the window's start. */
  upAtStart: boolean;
}

export interface Night {
  /** The evening's date on the place's clock. */
  date: CivilDate;
  /** Noon to the next noon, UTC ms. */
  start: number;
  end: number;
  /** Sample times, two minutes apart, and what was found at each. */
  times: Float64Array;
  frames: Frame[];
  sunAlt: Float32Array;
  moonAlt: Float32Array;
  /** The Moon's J2000 direction at each sample, for its distance from a target. */
  moonVec: Vec3[];
  sunset: number | null;
  sunrise: number | null;
  /** When the Sun goes below 6°, 12° and 18° in the evening, and comes back up through them in the morning. */
  dusk: { civil: number | null; nautical: number | null; astronomical: number | null };
  dawn: { civil: number | null; nautical: number | null; astronomical: number | null };
  /** The Sun's lowest point. */
  darkest: { time: number; sunAlt: number };
  /** How dark it gets at best. */
  darkness: Darkness;
  /** The altitude the Sun has to be below for the night's "dark" hours: −18°, or the best the night offers. */
  darkLimit: number;
  /** Sun below darkLimit. */
  dark: Interval[];
  /** Dark, and the Moon below the horizon. */
  moonless: Interval[];
  moon: MoonInfo;
}

export const STEP = 2 * MINUTE;

/** Times a sampled series crosses a level, placed on the line between samples. */
export function crossings(times: ArrayLike<number>, values: ArrayLike<number>, level: number): { time: number; rising: boolean }[] {
  const out: { time: number; rising: boolean }[] = [];
  for (let i = 0; i + 1 < values.length; i++) {
    const a = values[i] - level;
    const b = values[i + 1] - level;
    if ((a < 0 && b >= 0) || (a >= 0 && b < 0)) out.push({ time: times[i] + ((times[i + 1] - times[i]) * a) / (a - b), rising: b >= 0 });
  }
  return out;
}

/** Spans where a test holds, the edges placed between samples where it changes. */
export function intervals(times: ArrayLike<number>, holds: (i: number) => boolean, edge: (i: number) => number): Interval[] {
  const out: Interval[] = [];
  let start: number | null = holds(0) ? times[0] : null;
  for (let i = 1; i < times.length; i++) {
    const h = holds(i);
    if (h && start === null) start = edge(i - 1);
    else if (!h && start !== null) {
      out.push({ start, end: edge(i - 1) });
      start = null;
    }
  }
  if (start !== null) out.push({ start, end: times[times.length - 1] });
  return out;
}

export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of a)
    for (const y of b) {
      const s = Math.max(x.start, y.start);
      const e = Math.min(x.end, y.end);
      if (e > s) out.push({ start: s, end: e });
    }
  return out;
}

export function totalMs(list: Interval[]): number {
  return list.reduce((s, i) => s + i.end - i.start, 0);
}

export function moonPhaseName(phase: number): string {
  const names = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return names[Math.round((((phase % 360) + 360) % 360) / 45) % 8];
}

/** Noon on a date of the place's clock, UTC ms. */
export function noonOf(date: CivilDate, scale: TimeScale): number {
  return fromWall(wallMidnight(date) + 12 * HOUR, scale);
}

/**
 * The Moon's J2000 direction from the place every `hours` over a span, and a lookup that
 * interpolates between them (the parallax swings it by up to a degree over a day, smoothly).
 */
export function moonTrack(start: number, end: number, site: Site, hours = 1): (ms: number) => Vec3 {
  const step = hours * HOUR;
  const count = Math.ceil((end - start) / step) + 1;
  const track: Vec3[] = [];
  for (let h = 0; h <= count; h++) track.push(bodyVector('Moon', start + h * step, site).v);
  return (ms) => {
    const x = Math.max(0, Math.min(count - 1e-9, (ms - start) / step));
    const i = Math.floor(x);
    const f = x - i;
    const a = track[i];
    const b = track[i + 1];
    const v: Vec3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  };
}

/** The night that begins on the evening of a date at a place, on the place's clock. */
export function nightOf(site: Site, date: CivilDate, scale: TimeScale): Night {
  const start = noonOf(date, scale);
  const end = noonOf(addDays(date, 1), scale);
  const n = Math.floor((end - start) / STEP) + 1;
  const times = new Float64Array(n);
  const sunAlt = new Float32Array(n);
  const moonAlt = new Float32Array(n);
  const frames: Frame[] = [];
  const moonVec: Vec3[] = [];
  const moonAt = moonTrack(start, end, site);
  for (let i = 0; i < n; i++) {
    const t = Math.min(end, start + i * STEP);
    times[i] = t;
    sunAlt[i] = sunAltitude(t, site.lat, site.lon);
    const f = skyFrame(t, site);
    frames.push(f);
    const m = moonAt(t);
    moonVec.push(m);
    moonAlt[i] = Math.asin(sinAltitude(f, m[0], m[1], m[2])) * DEG;
  }

  const at = (level: number) => crossings(times, sunAlt, level);
  const firstDown = (level: number) => at(level).find((c) => !c.rising)?.time ?? null;
  const lastUp = (level: number) => at(level).findLast((c) => c.rising)?.time ?? null;

  let low = 0;
  for (let i = 1; i < n; i++) if (sunAlt[i] < sunAlt[low]) low = i;
  const darkest = { time: times[low], sunAlt: sunAlt[low] };
  const darkness: Darkness =
    darkest.sunAlt < TWILIGHT.astronomical ? 'astronomical' : darkest.sunAlt < TWILIGHT.nautical ? 'nautical' : darkest.sunAlt < TWILIGHT.civil ? 'civil' : 'none';
  const darkLimit = darkness === 'astronomical' ? TWILIGHT.astronomical : darkness === 'nautical' ? TWILIGHT.nautical : TWILIGHT.civil;

  const edge = (values: Float32Array, level: number) => (i: number) => {
    const a = values[i] - level;
    const b = values[i + 1] - level;
    return a === b ? times[i] : times[i] + ((times[i + 1] - times[i]) * a) / (a - b);
  };
  const dark = darkness === 'none' ? [] : intervals(times, (i) => sunAlt[i] < darkLimit, edge(sunAlt, darkLimit));
  const moonDown = intervals(times, (i) => moonAlt[i] < HORIZON, edge(moonAlt, HORIZON));
  const moonCross = crossings(times, moonAlt, HORIZON);

  const phase = MoonPhase(astroTime(darkest.time));
  return {
    date,
    start,
    end,
    times,
    frames,
    sunAlt,
    moonAlt,
    moonVec,
    sunset: firstDown(HORIZON),
    sunrise: lastUp(HORIZON),
    dusk: { civil: firstDown(TWILIGHT.civil), nautical: firstDown(TWILIGHT.nautical), astronomical: firstDown(TWILIGHT.astronomical) },
    dawn: { civil: lastUp(TWILIGHT.civil), nautical: lastUp(TWILIGHT.nautical), astronomical: lastUp(TWILIGHT.astronomical) },
    darkest,
    darkness,
    darkLimit,
    dark,
    moonless: intersect(dark, moonDown),
    moon: {
      fraction: bodyLight('Moon', darkest.time).fraction,
      phase,
      name: moonPhaseName(phase),
      rises: moonCross.filter((c) => c.rising).map((c) => c.time),
      sets: moonCross.filter((c) => !c.rising).map((c) => c.time),
      upAtStart: moonAlt[0] >= HORIZON,
    },
  };
}

/** The sample nearest an instant. */
export function sampleIndex(night: Night, ms: number): number {
  return Math.max(0, Math.min(night.times.length - 1, Math.round((ms - night.start) / STEP)));
}

/** The next new and full Moons after an instant. */
export function nextMoons(ms: number): { newMoon: number | null; fullMoon: number | null } {
  const t = astroTime(ms);
  return { newMoon: SearchMoonPhase(0, t, 40)?.date.getTime() ?? null, fullMoon: SearchMoonPhase(180, t, 40)?.date.getTime() ?? null };
}
