import { describe, expect, it } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import { SOLAR_ECLIPSES } from './catalog';
import type { SolarEclipse } from './elements';
import { deltaT, deltaTMeasured } from './deltaT';
import { localCircumstances, phaseAt } from './local';
import { centralLine, centralPointAt, distanceKm, greatestEclipse, limitsAt } from './path';
import { msToElementTime } from './elements';
import nasaPaths from './testdata/nasa-paths.json';

const byId = (id: string): SolarEclipse => SOLAR_ECLIPSES.find((e) => e.id === id)!;
const point = ([lat, lon]: number[]) => ({ lat, lon });

/**
 * Path widths agree within 1% (or 1 km) where the Sun is high. Under about 20°
 * the paths get very wide and our width (shortest distance from the central line to
 * each limit) and NASA's formula part by up to 5%.
 */
const widthTolerance = (width: number, sunAlt: number) => (sunAlt < 20 ? 0.05 * width : Math.max(1, 0.01 * width));

describe('ΔT', () => {
  it('follows the measured values', () => {
    expect(deltaT(Date.UTC(1980, 0, 1))).toBeCloseTo(50.54, 1);
    expect(deltaT(Date.UTC(2000, 0, 1))).toBeCloseTo(63.83, 1);
    expect(deltaT(Date.UTC(2020, 0, 1))).toBeCloseTo(69.36, 1);
    expect(deltaTMeasured(Date.UTC(2020, 0, 1))).toBe(true);
  });

  it('grows slowly after the last measurement', () => {
    const now = deltaT(Date.UTC(2026, 0, 1));
    expect(deltaTMeasured(Date.UTC(2050, 0, 1))).toBe(false);
    expect(deltaT(Date.UTC(2050, 0, 1)) - now).toBeGreaterThan(0);
    expect(deltaT(Date.UTC(2100, 0, 1)) - now).toBeGreaterThan(10);
    expect(deltaT(Date.UTC(2100, 0, 1)) - now).toBeLessThan(25);
  });
});

describe('greatest eclipse, against NASA', () => {
  it('has NASA’s gamma for every eclipse, 1980-2100', () => {
    expect(SOLAR_ECLIPSES.length).toBeGreaterThan(260);
    for (const e of SOLAR_ECLIPSES) expect(Math.abs(greatestEclipse(e, { deltaT: e.deltaT }).gamma - e.gamma), e.id).toBeLessThan(2e-4);
  });

  it('puts central eclipses at NASA’s point, with its duration and path width', () => {
    // Eclipses whose NASA page gives greatest eclipse to 0.1′ and 0.1 s (the rest only to whole degrees).
    const precise = SOLAR_ECLIPSES.filter(
      (e) => e.type !== 'P' && !(Number.isInteger(e.greatest.lat) && Number.isInteger(e.greatest.lon)),
    );
    expect(precise.length).toBeGreaterThanOrEqual(70);
    for (const e of precise) {
      const g = greatestEclipse(e, { deltaT: e.deltaT });
      expect(distanceKm(g, e.greatest), e.id).toBeLessThan(0.3);
      expect(Math.abs(g.sunAlt - e.greatest.sunAlt), e.id).toBeLessThan(0.1);
      expect(Math.abs(g.duration! - e.greatest.duration!), e.id).toBeLessThan(0.5);
      expect(Math.abs(g.pathWidth! - e.greatest.pathWidth!), e.id).toBeLessThan(widthTolerance(e.greatest.pathWidth!, g.sunAlt));
    }
  });

  it('matches NASA’s catalog for the other central eclipses, to its rounding', () => {
    const rounded = SOLAR_ECLIPSES.filter(
      (e) => e.type !== 'P' && Number.isInteger(e.greatest.lat) && Number.isInteger(e.greatest.lon),
    );
    for (const e of rounded) {
      const g = greatestEclipse(e, { deltaT: e.deltaT });
      expect(distanceKm(g, e.greatest), e.id).toBeLessThan(80);
      if (e.greatest.duration === undefined) continue; // non-central: the axis misses the Earth
      expect(Math.abs(g.duration! - e.greatest.duration), e.id).toBeLessThanOrEqual(1);
      // The catalog rounds widths to whole kilometres.
      expect(Math.abs(g.pathWidth! - e.greatest.pathWidth!), e.id).toBeLessThan(0.5 + widthTolerance(e.greatest.pathWidth!, g.sunAlt));
    }
  });

  it('puts partial eclipses at NASA’s point, to its whole degrees', () => {
    for (const e of SOLAR_ECLIPSES.filter((e) => e.type === 'P')) {
      const g = greatestEclipse(e, { deltaT: e.deltaT });
      // Rounding to whole degrees alone moves a point up to ~80 km.
      expect(distanceKm(g, e.greatest), e.id).toBeLessThan(80);
    }
  });
});

describe('path, against NASA’s path tables', () => {
  for (const [name, rows] of Object.entries(nasaPaths)) {
    const id = new Date(`${name.slice(0, 4)} ${name.slice(4, 7)} ${name.slice(7, 9)} UTC`).toISOString().slice(0, 10);
    it(`${id}: central line, limits, duration`, () => {
      const e = byId(id);
      for (const row of rows) {
        const [hh, mm] = row.ut.split(':').map(Number);
        const ms = Date.parse(`${id}T00:00:00Z`) + (hh * 60 + mm) * 60_000;
        const c = centralPointAt(e, ms, { deltaT: e.deltaT })!;
        expect(distanceKm(c, point(row.central)), row.ut).toBeLessThan(0.5);
        expect(Math.abs(c.duration! - row.duration), row.ut).toBeLessThan(0.3);
        expect(Math.abs(c.width! - row.width), row.ut).toBeLessThan(0.5 + widthTolerance(row.width, row.sunAlt));

        const { north, south } = limitsAt(e, msToElementTime(e, ms, e.deltaT), e.deltaT, true);
        // In the total part of a hybrid path NASA's "northern" limit is the more southerly one.
        const [n, s] = e.type === 'H' && c.kind === 'total' ? [south, north] : [north, south];
        for (const [ours, theirs] of [[n, row.north], [s, row.south]] as const) {
          // With the Sun low a limit slides far along the ground for a tiny change, so compare where it is up.
          if (phaseAt(e, point(theirs), ms, e.deltaT).altitude < 10) continue;
          expect(distanceKm(ours!, point(theirs)), row.ut).toBeLessThan(1.5);
        }
      }
    });
  }

  it('changes from annular to total along a hybrid path', () => {
    const kinds = new Set(centralLine(byId('2023-04-20'), { stepMinutes: 5 }).map((p) => p.kind));
    expect(kinds).toEqual(new Set(['annular', 'total']));
  });
});

describe('local circumstances, against astronomy-engine', () => {
  // astronomy-engine works from its own ephemerides and ΔT model, not from Besselian elements.
  const places: [string, number, number, string][] = [
    ['Luxor', 25.687, 32.639, '2027-08-02'],
    ['Dallas', 32.78, -96.8, '2024-04-08'],
    ['Munich', 48.14, 11.58, '1999-08-11'],
    ['Prague', 50.08, 14.43, '1999-08-11'],
    ['Reykjavík', 64.15, -21.94, '2026-08-12'],
    ['Albuquerque', 35.08, -106.65, '2023-10-14'],
    ['Exmouth', -21.93, 114.13, '2023-04-20'],
    ['Prague', 50.08, 14.43, '2025-03-29'],
  ];
  for (const [name, lat, lon, id] of places) {
    it(`${name}, ${id}`, () => {
      const ref = Astronomy.SearchLocalSolarEclipse(new Date(Date.parse(id) - 86_400_000), new Astronomy.Observer(lat, lon, 0));
      const local = localCircumstances(byId(id), { lat, lon });
      expect(local.kind).toBe(ref.kind);
      const near = (ms: number | undefined, ev: Astronomy.EclipseEvent | undefined) => {
        expect(ms).toBeDefined();
        expect(Math.abs(ms! - ev!.time.date.getTime())).toBeLessThan(15_000);
      };
      near(local.c1?.time, ref.partial_begin);
      near(local.max?.time, ref.peak);
      near(local.c4?.time, ref.partial_end);
      if (ref.total_begin) near(local.c2?.time, ref.total_begin);
      if (ref.total_end) near(local.c3?.time, ref.total_end);
      expect(Math.abs(local.max!.obscuration - ref.obscuration)).toBeLessThan(0.002);
      expect(Math.abs(local.max!.altitude - ref.peak.altitude)).toBeLessThan(0.1);
    });
  }
});

describe('local circumstances', () => {
  it('finds no eclipse outside the penumbra', () => {
    const sydney = localCircumstances(byId('2027-08-02'), { lat: -33.87, lon: 151.21 });
    expect(sydney.kind).toBe('none');
    expect(sydney.visible).toBe(false);
  });

  it('notes a sunset during the eclipse', () => {
    // 12 August 2026: the partial eclipse over Rome is still under way at sunset.
    const rome = localCircumstances(byId('2026-08-12'), { lat: 41.9, lon: 12.5 });
    expect(rome.kind).toBe('partial');
    expect(rome.c1!.visible).toBe(true);
    expect(rome.c4!.visible).toBe(false);
    expect(rome.sunset!.time).toBeGreaterThan(rome.c1!.time);
    expect(rome.sunset!.time).toBeLessThan(rome.c4!.time);
    expect(rome.visible).toBe(true);
  });

  it('is total for longer on the central line than off it', () => {
    const e = byId('2027-08-02');
    const centre = greatestEclipse(e);
    const off = localCircumstances(e, { lat: centre.lat + 0.5, lon: centre.lon });
    expect(off.kind).toBe('total');
    expect(off.duration!).toBeLessThan(centre.duration!);
  });
});
