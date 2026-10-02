import { describe, expect, it } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import { SOLAR_ECLIPSES } from './catalog';
import type { SolarEclipse } from './elements';
import { deltaT, deltaTMeasured } from './deltaT';
import { localCircumstances, phaseAt, skyView } from './local';
import { centralLine, centralPointAt, distanceKm, globalSpan, greatestEclipse, limitsAt, pathDistances } from './path';
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

describe('sky view, against astronomy-engine', () => {
  // Where the Moon stands against the Sun, from the two bodies' topocentric positions.
  function expected(lat: number, lon: number, ms: number) {
    const observer = new Astronomy.Observer(lat, lon, 0);
    const date = new Date(ms);
    const at = (body: Astronomy.Body) => {
      const eq = Astronomy.Equator(body, date, observer, true, true);
      return { ...Astronomy.Horizon(date, observer, eq.ra, eq.dec), dist: eq.dist };
    };
    const sun = at(Astronomy.Body.Sun);
    const moon = at(Astronomy.Body.Moon);
    const sunRadius = 959.63 / 3600 / sun.dist;
    const dAz = ((moon.azimuth - sun.azimuth + 540) % 360) - 180;
    // Facing the Sun, a larger azimuth is to the right.
    return {
      x: (dAz * Math.cos((sun.altitude * Math.PI) / 180)) / sunRadius,
      y: (moon.altitude - sun.altitude) / sunRadius,
    };
  }

  const cases: [string, number, number, number][] = [
    ['2024-04-08', 31.0, -104.0, Date.UTC(2024, 3, 8, 18, 0)],
    ['2027-08-02', 25.687, 32.639, Date.UTC(2027, 7, 2, 9, 30)],
    ['2026-08-12', 39.47, -0.376, Date.UTC(2026, 7, 12, 18, 20)],
    ['2023-10-14', 40.0, -110.0, Date.UTC(2023, 9, 14, 16, 0)],
    ['2017-08-21', 44.0, -120.0, Date.UTC(2017, 7, 21, 17, 0)],
  ];
  it.each(cases)('%s: places the Moon against the Sun, zenith up', (id, lat, lon, ms) => {
    const v = skyView(byId(id), { lat, lon }, ms);
    const want = expected(lat, lon, ms);
    // Within a few hundredths of the Sun's radius (about half an arcsecond per hundredth).
    expect(Math.abs(v.moonX - want.x)).toBeLessThan(0.05);
    expect(Math.abs(v.moonY - want.y)).toBeLessThan(0.05);
  });
});

describe('global span and distances', () => {
  it('spans NASA’s first to last contact of the penumbra and umbra', () => {
    // NASA, 2024 April 8: P1 15:42:15, P4 20:52:19, U1 16:38:48, U4 19:55:30 (TD); ΔT 69.1 s.
    const span = globalSpan(byId('2024-04-08'), { deltaT: 69.1 });
    const td = (h: number, m: number, s: number) => Date.UTC(2024, 3, 8, h, m, s) - 69.1 * 1000;
    // A sphere for the Earth: within a couple of minutes.
    expect(Math.abs(span.start - td(15, 42, 15)) / 1000).toBeLessThan(120);
    expect(Math.abs(span.end - td(20, 52, 19)) / 1000).toBeLessThan(120);
    expect(Math.abs(span.centralStart! - td(16, 38, 48)) / 1000).toBeLessThan(120);
    expect(Math.abs(span.centralEnd! - td(19, 55, 30)) / 1000).toBeLessThan(120);
    expect(globalSpan(byId('2027-02-06')).centralStart).toBeDefined();
    expect(globalSpan(SOLAR_ECLIPSES.find((e) => e.type === 'P')!).centralStart).toBeUndefined();
  });

  it('measures the distance to the central line and the limits', () => {
    const e = byId('2024-04-08');
    const centre = centralPointAt(e, Date.UTC(2024, 3, 8, 18, 30))!;
    const onLine = pathDistances(e, centre)!;
    expect(onLine.centre).toBeLessThan(0.05);
    expect(onLine.inside).toBe(true);
    // Half the path width either side, give or take the path's asymmetry.
    expect(onLine.north! + onLine.south!).toBeCloseTo(centre.width!, -1);
    // 100 km north of the line: about 100 km closer to the northern limit, outside if the path is narrower.
    const north = pathDistances(e, { lat: centre.lat + 100 / 111.2, lon: centre.lon })!;
    expect(north.centre).toBeGreaterThan(60);
    expect(north.centre).toBeLessThan(100.5);
    expect(north.inside).toBe(north.north! < north.south! ? north.centre < centre.width! / 2 + 5 : true);
    expect(pathDistances(SOLAR_ECLIPSES.find((x) => x.type === 'P')!, { lat: 0, lon: 0 })).toBeUndefined();
  });
});
