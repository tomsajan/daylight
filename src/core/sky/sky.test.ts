import { describe, expect, it } from 'vitest';
import * as A from 'astronomy-engine';
import { DSOS, STARS, STAR_NAMES, CONSTELLATIONS, MILKY_WAY, unitVector } from './catalog';
import { simbadUrl, wikipediaTerm } from './links';
import { Projector, ellipseOutline, frameOutline, horizontalVector, insideFrame, rotateBy } from './projection';
import { altAzOf, skyFrame } from './frame';
import { moonPhaseName, nightOf, totalMs } from './night';
import { findTarget, monthSpan, visibility, yearNights, yearVisibility } from './targets';
import { field, fieldOfView, pitchFromMegapixels, rule500, ruleNpf, sensorOf, DEFAULT_CAMERA } from './camera';
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

  it('works out the pixel pitch from megapixels', () => {
    // 24 MP on full frame: 6000 × 4000 pixels of 6 µm.
    expect(pitchFromMegapixels(36, 24, 24)).toBeCloseTo(6, 6);
    expect(sensorOf({ ...DEFAULT_CAMERA, megapixels: 24 }).pixel).toBeCloseTo(6, 6);
    expect(sensorOf({ ...DEFAULT_CAMERA, sensor: 'apsc', megapixels: 24 }).pixel).toBeCloseTo(3.91, 2);
    expect(sensorOf({ ...DEFAULT_CAMERA, megapixels: null }).pixel).toBe(5.9);
  });

  it('gives the 500 and NPF exposure limits', () => {
    expect(rule500({ ...DEFAULT_CAMERA, focal: 20 })).toBeCloseTo(25, 0);
    // 20 mm at f/2.8 with 5.9 µm pixels: about 8 s on the equator, longer towards the pole.
    const npf = ruleNpf({ ...DEFAULT_CAMERA, focal: 20 }, 0);
    expect(npf).toBeCloseTo((16.856 * 2.8 + 0.0997 * 20 + 13.713 * 5.9) / 20, 6);
    expect(ruleNpf({ ...DEFAULT_CAMERA, focal: 20 }, 60)).toBeCloseTo(npf * 2, 6);
  });
});

describe('sky chart projection', () => {
  it('turns screen positions into directions and back', () => {
    const p = new Projector({ az: 135, alt: 40, fov: 90 }, 800, 600);
    for (const [x, y] of [
      [400, 300],
      [10, 20],
      [790, 590],
      [123, 456],
    ]) {
      const q = p.project(p.unproject(x, y))!;
      expect(q[0]).toBeCloseTo(x, 6);
      expect(q[1]).toBeCloseTo(y, 6);
    }
    const mid = p.project(horizontalVector(135, 40))!;
    expect(mid[0]).toBeCloseTo(400, 6);
    expect(mid[1]).toBeCloseTo(300, 6);
  });

  it('draws the whole sky with north up and east on the left, as looking up', () => {
    const p = new Projector({ az: 180, alt: 90, fov: 180 }, 600, 600);
    const north = p.project(horizontalVector(0, 0))!;
    const east = p.project(horizontalVector(90, 0))!;
    expect(north[1]).toBeCloseTo(0, 6);
    expect(east[0]).toBeCloseTo(0, 6);
    // Facing south, a little above the horizon: west on the right, the zenith above.
    const s = new Projector({ az: 180, alt: 20, fov: 60 }, 600, 600);
    expect(s.project(horizontalVector(200, 20))![0]).toBeGreaterThan(300);
    expect(s.project(horizontalVector(180, 30))![1]).toBeLessThan(300);
  });

  it('puts the horizon on an exact circle, at any zoom', () => {
    for (const view of [
      { az: 200, alt: 30, fov: 60 },
      { az: 10, alt: -12, fov: 40 },
      { az: 100, alt: 2, fov: 3 },
      { az: 0, alt: 90, fov: 186 },
    ]) {
      const p = new Projector(view, 900, 600);
      const hz = p.horizon();
      for (const az of [view.az - 1, view.az, view.az + 1, view.az + 120]) {
        const q = p.project(horizontalVector(az, 0), -1);
        if (!q) continue;
        if (hz.kind === 'line') expect(q[1]).toBeCloseTo(hz.y, 0);
        else expect(Math.hypot(q[0] - hz.x, q[1] - hz.y) / hz.r).toBeCloseTo(1, 6);
      }
      // Is the ground where the circle says it is?
      const below = p.project(horizontalVector(view.az, -5), -1);
      if (below && hz.kind === 'circle') expect(Math.hypot(below[0] - hz.x, below[1] - hz.y) < hz.r).toBe(hz.groundInside);
    }
    expect(new Projector({ az: 0, alt: 0.05, fov: 0.5 }, 900, 600).horizon().kind).toBe('line');
  });

  it('frames a rectangle of the right size around a target', () => {
    const t = unitVector(10.68, 41.27);
    const [outline] = frameOutline(t, 10, 6, 0);
    const corner = outline[0];
    const angle = (Math.acos(t[0] * corner[0] + t[1] * corner[1] + t[2] * corner[2]) * 180) / Math.PI;
    expect(angle).toBeCloseTo((Math.atan(Math.hypot(Math.tan((5 * Math.PI) / 180), Math.tan((3 * Math.PI) / 180))) * 180) / Math.PI, 6);
  });
});

describe('frame angle', () => {
  it('turns the top of the frame from north towards east', () => {
    const ra = 83.8;
    const dec = -5.4;
    const pa = (angle: number) => {
      const top = frameOutline(unitVector(ra, dec), 10, 6, angle)[1][0];
      const tRa = (Math.atan2(top[1], top[0]) * 180) / Math.PI;
      const tDec = (Math.asin(top[2]) * 180) / Math.PI;
      return (((Math.atan2((tRa - ra) * Math.cos((dec * Math.PI) / 180), tDec - dec) * 180) / Math.PI) + 360) % 360;
    };
    expect(pa(0)).toBeCloseTo(0, 0);
    expect(pa(90)).toBeCloseTo(90, 0);
    expect(pa(30)).toBeCloseTo(30, 0);
  });
});

describe('object outlines', () => {
  it('turns an ellipse to its position angle, east of north', () => {
    const ra = 10.68;
    const dec = 41.27;
    const tip = ellipseOutline(unitVector(ra, dec), 180, 70, 35)[0];
    const tipRa = (Math.atan2(tip[1], tip[0]) * 180) / Math.PI;
    const tipDec = (Math.asin(tip[2]) * 180) / Math.PI;
    const pa = (Math.atan2((tipRa - ra) * Math.cos((dec * Math.PI) / 180), tipDec - dec) * 180) / Math.PI;
    // Measured on the sphere's flat approximation, so within a degree.
    expect(Math.abs(pa - 35)).toBeLessThan(1);
    expect(Math.hypot((tipRa - ra) * Math.cos((dec * Math.PI) / 180), tipDec - dec)).toBeCloseTo(1.5, 2);
  });
});

describe('links', () => {
  const dso = (id: string) => findTarget(id)!;
  it('names targets as Wikipedia and SIMBAD know them', () => {
    expect(wikipediaTerm(dso('M31'))).toBe('Messier 31');
    expect(wikipediaTerm(dso('NGC7000'))).toBe('NGC 7000');
    expect(wikipediaTerm(dso('B33'))).toBe('Barnard 33');
    expect(wikipediaTerm(dso('ESO56-115'))).toBe('Large Magellanic Cloud');
    expect(wikipediaTerm(dso('Mercury'))).toBe('Mercury (planet)');
    expect(simbadUrl(dso('M31'))).toContain('Ident=M%2031');
    expect(simbadUrl(dso('ESO56-115'))).toContain('Ident=ESO%2056-115');
    expect(simbadUrl(dso('Jupiter'))).toBeNull();
    expect(simbadUrl(dso('M31'), true)).toBe('https://simbad.harvard.edu/simbad/sim-id?Ident=M%2031');
  });
});

describe('moving the frame', () => {
  it('knows what falls inside the frame', () => {
    const t = unitVector(83.82, -5.39);
    expect(insideFrame(t, 10, 6, 0, t)).toBe(true);
    // 4° east is inside a 10° wide frame at angle 0, 4° north is outside one 6° high; turned 90°, the other way round.
    const east = unitVector(83.82 + 4 / Math.cos((5.39 * Math.PI) / 180), -5.39);
    const north = unitVector(83.82, -1.39);
    expect(insideFrame(t, 10, 6, 0, east)).toBe(true);
    expect(insideFrame(t, 10, 6, 0, north)).toBe(false);
    expect(insideFrame(t, 10, 6, 90, east)).toBe(false);
    expect(insideFrame(t, 10, 6, 90, north)).toBe(true);
    expect(insideFrame(t, 10, 6, 0, unitVector(263.82, 5.39))).toBe(false);
  });

  it('turns a direction the way one point moves to another', () => {
    const a = unitVector(10, 20);
    const b = unitVector(12, 21);
    const r = rotateBy(a, b, a);
    for (let i = 0; i < 3; i++) expect(r[i]).toBeCloseTo(b[i], 9);
    // Angles between directions are kept.
    const v = unitVector(11, 25);
    const rv = rotateBy(a, b, v);
    expect(rv[0] * r[0] + rv[1] * r[1] + rv[2] * r[2]).toBeCloseTo(v[0] * a[0] + v[1] * a[1] + v[2] * a[2], 9);
  });
});
