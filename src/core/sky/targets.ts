/**
 * What there is to photograph and when it is well placed: the deep-sky objects, the planets, the
 * Moon and the core of the Milky Way, with their altitude through a night and through a year.
 */
import { DSOS, DSO_TYPE_NAMES, CONSTELLATION_NAMES, dsoTitle, unitVector, type Dso } from './catalog';
import { PLANETS, angularDiameter, bodyLight, bodyVector, sinAltitude, skyFrame, type Planet, type Site, type Vec3, type Frame } from './frame';
import { crossings, intersect, intervals, moonTrack, noonOf, totalMs, HORIZON, TWILIGHT, type Interval, type Night } from './night';
import { sunAltitude } from '../astro/sun';
import { addDays, type CivilDate, type TimeScale } from '../time/timescale';
import { Constellation } from 'astronomy-engine';

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

export type TargetKind = 'dso' | 'planet' | 'moon' | 'core';

export interface Target {
  /** M31, NGC7000, Jupiter, Moon, core. */
  id: string;
  /** For lists: "M31 Andromeda Galaxy". */
  title: string;
  kind: TargetKind;
  /** Galaxy, Open cluster, Planet, … */
  typeName: string;
  /** dso type, or the kind for the rest; for filters and symbols. */
  group: string;
  /** Size in arcminutes: major and minor axes and position angle (east of north), where known. */
  size: [number | null, number | null, number | null];
  mag: number | null;
  /** Constellation's name. */
  constellation: string;
  dso?: Dso;
  planet?: Planet;
}

/** Sagittarius A*, the centre of the Galaxy, J2000. */
export const GALACTIC_CENTRE = { ra: 266.405, dec: -28.936 };

function dsoTarget(d: Dso): Target {
  return {
    id: d.id,
    title: dsoTitle(d),
    kind: 'dso',
    typeName: DSO_TYPE_NAMES[d.type],
    group: d.type,
    size: d.size,
    mag: d.mag,
    constellation: CONSTELLATION_NAMES.get(d.con) ?? d.con,
    dso: d,
  };
}

export const CORE: Target = {
  id: 'core',
  title: 'Milky Way core',
  kind: 'core',
  typeName: 'Centre of the Galaxy',
  group: 'core',
  // The bright part of the bulge, roughly, for framing.
  size: [1800, 1200, 60],
  mag: null,
  constellation: 'Sagittarius',
};

export const MOON: Target = { id: 'Moon', title: 'Moon', kind: 'moon', typeName: 'Moon', group: 'moon', size: [31, 31, null], mag: null, constellation: '' };

export const PLANET_TARGETS: Target[] = PLANETS.map((p) => ({ id: p, title: p, kind: 'planet', typeName: 'Planet', group: 'planet', size: [null, null, null], mag: null, constellation: '', planet: p }));

export const DSO_TARGETS: Target[] = DSOS.map(dsoTarget);

export const TARGETS: Target[] = [CORE, MOON, ...PLANET_TARGETS, ...DSO_TARGETS];
export const TARGET_BY_ID = new Map(TARGETS.map((t) => [t.id.toLowerCase(), t]));
export const findTarget = (id: string) => TARGET_BY_ID.get(id.toLowerCase());

/** A target's J2000 direction from the place at an instant: fixed for the deep sky, moving for the rest. */
export function targetVector(t: Target, ms: number, site: Site): Vec3 {
  if (t.dso) return unitVector(t.dso.ra, t.dso.dec);
  if (t.kind === 'core') return unitVector(GALACTIC_CENTRE.ra, GALACTIC_CENTRE.dec);
  return bodyVector(t.kind === 'moon' ? 'Moon' : t.planet!, ms, site).v;
}

/** Details that change with the date: a planet's or the Moon's size, brightness and constellation. */
export function targetNow(t: Target, ms: number, site: Site): Target {
  if (t.kind !== 'planet' && t.kind !== 'moon') return t;
  const body = t.kind === 'moon' ? 'Moon' : t.planet!;
  const { v, dist } = bodyVector(body, ms, site);
  const ra = ((Math.atan2(v[1], v[0]) * DEG + 360) % 360) / 15;
  const dec = Math.asin(v[2]) * DEG;
  const d = angularDiameter(body, dist) * 60;
  return { ...t, size: [d, d, null], mag: bodyLight(body, ms).mag, constellation: Constellation(ra, dec).name };
}

export function separation(a: Vec3, b: Vec3): number {
  return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * DEG;
}

// --- One night -----------------------------------------------------------------

export interface Visibility {
  /** Altitude at each of the night's samples, degrees, without refraction. */
  alt: Float32Array;
  /** Highest point within the dark hours (or the whole night when it never gets dark). */
  best: { time: number; alt: number };
  /** Highest point over the whole window, noon to noon. */
  culmination: { time: number; alt: number };
  rises: number[];
  sets: number[];
  /** Spans in the dark hours with the target above the lowest altitude asked for. */
  darkWindows: Interval[];
  /** The same without the Moon above the horizon. */
  moonlessWindows: Interval[];
  darkMs: number;
  moonlessMs: number;
  /** Distance from the Moon at the best moment, degrees. */
  moonDistance: number;
}

export function visibility(t: Target, night: Night, site: Site, minAlt: number): Visibility {
  const n = night.times.length;
  const alt = new Float32Array(n);
  // Planets barely move in a night; the Moon is followed sample by sample.
  const fixed = t.kind === 'moon' ? null : targetVector(t, night.darkest.time, site);
  for (let i = 0; i < n; i++) {
    const v = fixed ?? night.moonVec[i];
    alt[i] = Math.asin(Math.max(-1, Math.min(1, sinAltitude(night.frames[i], v[0], v[1], v[2])))) * DEG;
  }
  let top = 0;
  for (let i = 1; i < n; i++) if (alt[i] > alt[top]) top = i;
  const inDark = (i: number) => night.dark.some((d) => night.times[i] >= d.start && night.times[i] <= d.end);
  let best = -1;
  for (let i = 0; i < n; i++) if ((night.dark.length === 0 || inDark(i)) && (best < 0 || alt[i] > alt[best])) best = i;
  const edge = (i: number) => {
    const a = alt[i] - minAlt;
    const b = alt[i + 1] - minAlt;
    return a === b ? night.times[i] : night.times[i] + ((night.times[i + 1] - night.times[i]) * a) / (a - b);
  };
  const above = intervals(night.times, (i) => alt[i] >= minAlt, edge);
  const darkWindows = intersect(above, night.dark);
  const moonlessWindows = intersect(above, night.moonless);
  const cross = crossings(night.times, alt, 0);
  const bi = Math.max(0, best);
  const target = fixed ?? night.moonVec[bi];
  return {
    alt,
    best: { time: night.times[bi], alt: alt[bi] },
    culmination: { time: night.times[top], alt: alt[top] },
    rises: cross.filter((c) => c.rising).map((c) => c.time),
    sets: cross.filter((c) => !c.rising).map((c) => c.time),
    darkWindows,
    moonlessWindows,
    darkMs: totalMs(darkWindows),
    moonlessMs: totalMs(moonlessWindows),
    moonDistance: t.kind === 'moon' ? 0 : separation(target, night.moonVec[bi]),
  };
}

// --- Through the year --------------------------------------------------------------

/** Every night of a year, sampled every 10 minutes while the Sun is low enough to count. */
export interface YearNights {
  year: number;
  /** One per night, the evening's date. */
  nights: {
    date: CivilDate;
    /** Samples in the dark (Sun below −18°, or below −12° on nights that get no darker). */
    times: number[];
    frames: Frame[];
    moonUp: boolean[];
    /** Whether the dark is only nautical. */
    nautical: boolean;
  }[];
}

const YEAR_STEP = 10 * 60_000;

export function yearNights(site: Site, year: number, scale: TimeScale): YearNights {
  const first: CivilDate = { year, month: 1, day: 1 };
  const span0 = noonOf(first, scale);
  const span1 = noonOf({ year: year + 1, month: 1, day: 1 }, scale);
  const moonAt = moonTrack(span0, span1, site, 3);
  const nights: YearNights['nights'] = [];
  for (let date = first; date.year === year; date = addDays(date, 1)) {
    const start = noonOf(date, scale);
    const end = noonOf(addDays(date, 1), scale);
    const dark: number[] = [];
    const nautical: number[] = [];
    for (let t = start; t <= end; t += YEAR_STEP) {
      const s = sunAltitude(t, site.lat, site.lon);
      if (s < TWILIGHT.astronomical) dark.push(t);
      else if (s < TWILIGHT.nautical) nautical.push(t);
    }
    const times = dark.length ? dark : nautical;
    const frames = times.map((t) => skyFrame(t, site));
    const moonUp = times.map((t, i) => {
      const m = moonAt(t);
      return Math.asin(sinAltitude(frames[i], m[0], m[1], m[2])) * DEG >= HORIZON;
    });
    nights.push({ date, times, frames, moonUp, nautical: !dark.length && nautical.length > 0 });
  }
  return { year, nights };
}

export interface YearVisibility {
  /** Per night: hours above the altitude in the dark, and those of them without the Moon. */
  dark: Float32Array;
  moonless: Float32Array;
  /** Per night: the highest altitude in the dark, degrees (−90 when there is no dark). */
  best: Float32Array;
  /** Months (1-12) worth planning for, best first. */
  bestMonths: number[];
}

/** A deep-sky target, or the core, through a year of nights. Planets and the Moon move too much for this. */
export function yearVisibility(t: Target, year: YearNights, minAlt: number): YearVisibility {
  const v = targetVector(t, 0, { lat: 0, lon: 0 });
  const k = year.nights.length;
  const dark = new Float32Array(k);
  const moonless = new Float32Array(k);
  const best = new Float32Array(k).fill(-90);
  const sinMin = Math.sin(minAlt * RAD);
  const stepH = YEAR_STEP / 3_600_000;
  year.nights.forEach((n, j) => {
    for (let i = 0; i < n.times.length; i++) {
      const s = sinAltitude(n.frames[i], v[0], v[1], v[2]);
      best[j] = Math.max(best[j], Math.asin(Math.max(-1, Math.min(1, s))) * DEG);
      if (s >= sinMin) {
        dark[j] += stepH;
        if (!n.moonUp[i]) moonless[j] += stepH;
      }
    }
  });
  // Months by their average dark hours with the target up; the Moon comes and goes each month.
  const months = new Array(12).fill(0);
  const counts = new Array(12).fill(0);
  year.nights.forEach((n, j) => {
    months[n.date.month - 1] += dark[j];
    counts[n.date.month - 1]++;
  });
  const avg = months.map((m, i) => m / counts[i]);
  const top = Math.max(...avg);
  const bestMonths = top > 0.5 ? avg.map((a, i) => [a, i + 1]).filter(([a]) => a >= top * 0.7).sort((a, b) => b[0] - a[0]).map(([, m]) => m) : [];
  return { dark, moonless, best, bestMonths };
}

/** "September to November", "December to February", from a set of months, in the order of the year. */
export function monthSpan(months: number[]): string {
  if (!months.length) return '';
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const set = new Set(months);
  // Runs of consecutive months, wrapping round the new year.
  const runs: number[][] = [];
  let startAt = 1;
  while (set.has(startAt) && set.size < 12) startAt = (startAt % 12) + 1;
  let run: number[] = [];
  for (let k = 0; k < 12; k++) {
    const m = ((startAt - 1 + k) % 12) + 1;
    if (set.has(m)) run.push(m);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  if (set.size === 12) return 'all year';
  const one = (r: number[]) => (r.length === 1 ? names[r[0] - 1] : `${names[r[0] - 1]} to ${names[r[r.length - 1] - 1]}`);
  return runs.map(one).join(' and ');
}
