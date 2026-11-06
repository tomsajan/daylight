import { describe, expect, it } from 'vitest';
import * as A from 'astronomy-engine';
import { DSOS, STARS, STAR_NAMES, CONSTELLATIONS, MILKY_WAY } from './catalog';
import { altAzOf, skyFrame } from './frame';
import { moonPhaseName, nightOf, totalMs } from './night';
import { findTarget, monthSpan, visibility, yearNights, yearVisibility } from './targets';
import { field, fieldOfView, rule500, ruleNpf, DEFAULT_CAMERA } from './camera';
import { makeTimeScale } from '../time/timescale';

const PRAGUE = { lat: 50.0755, lon: 14.4378, tz: 'Europe/Prague' };
const SITE = { lat: PRAGUE.lat, lon: PRAGUE.lon };
const scale = makeTimeScale('local', PRAGUE);
const minutes = (ms: number) => ms / 60_000;

describe('catalogues', () => {
  it('holds the stars to magnitude 6, the constellations and all 110 Messier objects', () => {
    expect(STARS.length).toBeGreaterThan(4900);
    expect([...STAR_NAMES.values()]).toContain('Vega');
    expect(new Set(CONSTELLATIONS.map((c) => c.id)).size).toBe(88);
    expect(MILKY_WAY).toHaveLength(5);
    const messier = DSOS.filter((d) => /^M\d+$/.test(d.id));
    expect(messier).toHaveLength(110);
    const m31 = DSOS.find((d) => d.id === 'M31')!;
    expect(m31.name).toBe('Andromeda Galaxy');
    expect(m31.ra).toBeCloseTo(10.68, 1);
    expect(m31.size[0]).toBeGreaterThan(150);
  });
});

describe('the sky from a place', () => {
  it('puts a star where astronomy-engine does', () => {
    const t = Date.UTC(2026, 6, 15, 21, 30);
    const f = skyFrame(t, SITE);
    // Vega, J2000.
    const ra = 279.2347;
    const dec = 38.7837;
    const ours = altAzOf(f, ra, dec);
    // astronomy-engine wants coordinates of date for Horizon.
    const eqd = A.RotateVector(A.Rotation_EQJ_EQD(A.MakeTime(new Date(t))), A.VectorFromSphere(new A.Spherical(dec, ra, 1), A.MakeTime(new Date(t))));
    const s = A.EquatorFromVector(eqd);
    const theirs = A.Horizon(new Date(t), new A.Observer(SITE.lat, SITE.lon, 0), s.ra, s.dec);
    expect(ours.alt).toBeCloseTo(theirs.altitude, 2);
    expect(ours.az).toBeCloseTo(theirs.azimuth, 2);
  });
});

describe('a night', () => {
  it('finds dusk and dawn where astronomy-engine does', () => {
    const night = nightOf(SITE, { year: 2026, month: 11, day: 7 }, scale);
    const obs = new A.Observer(SITE.lat, SITE.lon, 0);
    const dusk = A.SearchAltitude(A.Body.Sun, obs, -1, A.MakeTime(new Date(night.start)), 1, -18)!.date.getTime();
    const dawn = A.SearchAltitude(A.Body.Sun, obs, +1, A.MakeTime(new Date(night.start)), 1, -18)!.date.getTime();
    expect(Math.abs(minutes(night.dusk.astronomical! - dusk))).toBeLessThan(2);
    expect(Math.abs(minutes(night.dawn.astronomical! - dawn))).toBeLessThan(2);
    const set = A.SearchRiseSet(A.Body.Sun, obs, -1, A.MakeTime(new Date(night.start)), 1)!.date.getTime();
    expect(Math.abs(minutes(night.sunset! - set))).toBeLessThan(2);
    expect(night.darkness).toBe('astronomical');
    expect(night.dark).toHaveLength(1);
  });

  it('places moonrise and moonset where astronomy-engine does', () => {
    const night = nightOf(SITE, { year: 2026, month: 11, day: 1 }, scale);
    const obs = new A.Observer(SITE.lat, SITE.lon, 0);
    const rise = A.SearchRiseSet(A.Body.Moon, obs, +1, A.MakeTime(new Date(night.start)), 1)!.date.getTime();
    expect(night.moon.rises.length).toBeGreaterThan(0);
    expect(Math.abs(minutes(night.moon.rises[0] - rise))).toBeLessThan(3);
  });

  it('has no astronomical darkness in Prague at midsummer', () => {
    const night = nightOf(SITE, { year: 2026, month: 6, day: 21 }, scale);
    expect(night.darkness).toBe('nautical');
    expect(night.darkLimit).toBe(-12);
    expect(night.darkest.sunAlt).toBeGreaterThan(-17.5);
    expect(night.dark.length).toBe(1);
  });

  it('is moonless only where the Moon is down', () => {
    // Full Moon on 2026-11-24: no moonless dark at all.
    const full = nightOf(SITE, { year: 2026, month: 11, day: 24 }, scale);
    expect(totalMs(full.moonless)).toBeLessThan(30 * 60_000);
    expect(full.moon.fraction).toBeGreaterThan(0.97);
    // New Moon on 2026-11-09: all of the dark is moonless.
    const dark = nightOf(SITE, { year: 2026, month: 11, day: 9 }, scale);
    expect(totalMs(dark.moonless)).toBeCloseTo(totalMs(dark.dark), -5);
  });

  it('names the phases', () => {
    expect(moonPhaseName(2)).toBe('New Moon');
    expect(moonPhaseName(90)).toBe('First quarter');
    expect(moonPhaseName(185)).toBe('Full Moon');
    expect(moonPhaseName(280)).toBe('Last quarter');
    expect(moonPhaseName(350)).toBe('New Moon');
  });
});

describe('targets', () => {
  it('has the Andromeda Galaxy high on an autumn night in Prague, and Omega Centauri never', () => {
    const night = nightOf(SITE, { year: 2026, month: 11, day: 9 }, scale);
    const m31 = visibility(findTarget('M31')!, night, SITE, 30);
    expect(m31.culmination.alt).toBeCloseTo(90 - Math.abs(50.0755 - 41.27), 0);
    expect(m31.moonlessMs).toBeGreaterThan(6 * 3_600_000);
    const omega = visibility(findTarget('NGC5139')!, night, SITE, 0);
    expect(omega.darkMs).toBe(0);
  });

  it('puts the best months of Orion in winter and the Milky Way core in summer', () => {
    const year = yearNights(SITE, 2026, scale);
    expect(year.nights).toHaveLength(365);
    const orion = yearVisibility(findTarget('M42')!, year, 20);
    expect(orion.bestMonths.slice(0, 2).every((m) => m === 12 || m === 1 || m === 2 || m === 11)).toBe(true);
    const core = yearVisibility(findTarget('core')!, year, 5);
    expect(core.bestMonths[0]).toBeGreaterThanOrEqual(6);
    expect(core.bestMonths[0]).toBeLessThanOrEqual(9);
  });

  it('names spans of months', () => {
    expect(monthSpan([10, 9, 11])).toBe('September to November');
    expect(monthSpan([12, 1, 2])).toBe('December to February');
    expect(monthSpan([3, 7])).toBe('March and July');
    expect(monthSpan([])).toBe('');
  });
});

describe('camera', () => {
  it('works out the field of view', () => {
    expect(fieldOfView(36, 50)).toBeCloseTo(39.6, 1);
    const f = field({ ...DEFAULT_CAMERA, focal: 200 });
    expect(f.width).toBeCloseTo(10.29, 2);
    expect(f.height).toBeCloseTo(6.87, 2);
    expect(f.pixelScale).toBeCloseTo(6.08, 2);
  });

  it('gives the 500 and NPF exposure limits', () => {
    expect(rule500({ ...DEFAULT_CAMERA, focal: 20 })).toBeCloseTo(25, 0);
    // 20 mm at f/2.8 with 5.9 µm pixels: about 8 s on the equator, longer towards the pole.
    const npf = ruleNpf({ ...DEFAULT_CAMERA, focal: 20 }, 0);
    expect(npf).toBeCloseTo((16.856 * 2.8 + 0.0997 * 20 + 13.713 * 5.9) / 20, 6);
    expect(ruleNpf({ ...DEFAULT_CAMERA, focal: 20 }, 60)).toBeCloseTo(npf * 2, 6);
  });
});
