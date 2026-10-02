import { describe, expect, it } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import { LUNAR_ECLIPSES } from './lunar-catalog';
import { SOLAR_ECLIPSES } from './catalog';
import { elementTimeToMs, eclipseDeltaT, greatestEclipseMs } from './elements';
import {
  LUNAR_CONTACTS,
  lunarContacts,
  lunarLocalCircumstances,
  moonPlace,
  shadowView,
  subLunarPoint,
  type LunarEclipse,
} from './lunar';

const byId = (id: string): LunarEclipse => LUNAR_ECLIPSES.find((e) => e.id === id)!;
const KINDS = { T: 'total', P: 'partial', N: 'penumbral' } as const;

describe('lunar eclipse catalog', () => {
  it('has every lunar eclipse 1980-2100, apart from the solar ones by date', () => {
    expect(LUNAR_ECLIPSES.length).toBe(276);
    const solar = new Set(SOLAR_ECLIPSES.map((e) => e.id));
    expect(LUNAR_ECLIPSES.filter((e) => solar.has(e.id))).toEqual([]);
  });

  it('finds the same eclipses as astronomy-engine, peaks within a minute while ΔT is known', () => {
    let ev = Astronomy.SearchLunarEclipse(new Date(Date.UTC(1980, 0, 1)));
    for (const e of LUNAR_ECLIPSES) {
      // The two size the shadow a little differently; only grazing eclipses can come out differently.
      const grazing = Math.abs(e.umbralMagnitude) < 0.01 || Math.abs(e.umbralMagnitude - 1) < 0.01;
      if (!grazing) expect(ev.kind, e.id).toBe(KINDS[e.type]);
      // Later the two extrapolate ΔT differently, by about two minutes at 2100.
      const tolerance = 60 + Math.max(0, +e.id.slice(0, 4) - 2025) * 1.2;
      expect(Math.abs(ev.peak.date.getTime() - greatestEclipseMs(e)) / 1000, e.id).toBeLessThan(tolerance);
      ev = Astronomy.NextLunarEclipse(ev.peak);
    }
  });
});

describe('the Moon in the shadow', () => {
  it('meets the shadow edges at NASA’s contact times, within 20 s', () => {
    for (const e of LUNAR_ECLIPSES) {
      const k = e.semidiameter;
      // Distance of the Moon's edge from each shadow edge at a contact: P1/P4, U1/U4 outside, U2/U3 inside.
      const edges: Record<string, (v: ReturnType<typeof shadowView>) => number> = {
        P1: (v) => v.penumbralMagnitude,
        U1: (v) => v.umbralMagnitude,
        U2: (v) => v.umbralMagnitude - 1,
        U3: (v) => v.umbralMagnitude - 1,
        U4: (v) => v.umbralMagnitude,
        P4: (v) => v.penumbralMagnitude,
      };
      for (const c of lunarContacts(e)) {
        if (c.name === 'Greatest') continue;
        // Magnitude changes by the Moon's speed through the shadow (about 0.55°/h) over its diameter.
        const miss = (edges[c.name](shadowView(e, c.time)) * 2 * k) / (0.55 / 3600);
        expect(Math.abs(miss), `${e.id} ${c.name}`).toBeLessThan(20);
      }
    }
  });

  it('has NASA’s magnitudes at greatest eclipse', () => {
    for (const e of LUNAR_ECLIPSES) {
      const v = shadowView(e, elementTimeToMs(e, e.contacts[3]!, eclipseDeltaT(e)));
      expect(v.umbralMagnitude).toBeCloseTo(e.umbralMagnitude, 3);
      expect(v.penumbralMagnitude).toBeCloseTo(e.penumbralMagnitude, 3);
    }
  });
});

describe('the Moon’s place, against astronomy-engine', () => {
  const cases: [string, number, number][] = [
    ['2025-03-14', 34.05, -118.25],
    ['2025-09-07', 50.08, 14.42],
    ['2022-11-08', 35.68, 139.69],
    ['2028-12-31', -33.87, 151.21],
  ];
  it.each(cases)('%s at %f, %f', (id, lat, lon) => {
    const e = byId(id);
    for (const c of lunarContacts(e)) {
      const observer = new Astronomy.Observer(lat, lon, 0);
      const eq = Astronomy.Equator(Astronomy.Body.Moon, new Date(c.time), observer, true, true);
      const hor = Astronomy.Horizon(new Date(c.time), observer, eq.ra, eq.dec);
      const ours = moonPlace(e, { lat, lon }, c.time);
      expect(Math.abs(ours.altitude - hor.altitude), `${id} ${c.name}`).toBeLessThan(0.05);
      const dAz = Math.abs(((ours.azimuth - hor.azimuth + 540) % 360) - 180);
      expect(dAz * Math.cos(hor.altitude * (Math.PI / 180)), `${id} ${c.name}`).toBeLessThan(0.05);
    }
  });

  it('puts the Moon overhead at the sub-lunar point', () => {
    const e = byId('2025-03-14');
    const ms = greatestEclipseMs(e);
    const p = subLunarPoint(e, ms);
    expect(moonPlace(e, p, ms).altitude).toBeGreaterThan(89);
  });
});

describe('lunar local circumstances', () => {
  it('sees the whole eclipse of 2025-03-14 from Los Angeles', () => {
    const l = lunarLocalCircumstances(byId('2025-03-14'), { lat: 34.05, lon: -118.25 });
    expect(l.seen).toBe(1);
    expect(l.totalitySeen).toBe(1);
    expect(l.contacts.map((c) => c.name)).toEqual([...LUNAR_CONTACTS]);
  });

  it('loses the Moon of 2025-03-14 to moonset in Prague, at astronomy-engine’s time', () => {
    const lat = 50.08;
    const lon = 14.42;
    const l = lunarLocalCircumstances(byId('2025-03-14'), { lat, lon });
    expect(l.moonset).toBeDefined();
    expect(l.moonrise).toBeUndefined();
    expect(l.seen).toBeGreaterThan(0);
    expect(l.seen).toBeLessThan(1);
    expect(l.totalitySeen).toBe(0);
    const ref = Astronomy.SearchRiseSet(Astronomy.Body.Moon, new Astronomy.Observer(lat, lon, 0), -1, new Date(l.contacts[0].time), 1)!;
    expect(Math.abs(ref.date.getTime() - l.moonset!.time) / 1000).toBeLessThan(60);
  });

  it('sees nothing from the far side', () => {
    const e = byId('2025-03-14');
    const p = subLunarPoint(e, greatestEclipseMs(e));
    const l = lunarLocalCircumstances(e, { lat: -p.lat, lon: p.lon + 180 });
    expect(l.visible).toBe(false);
    expect(l.seen).toBe(0);
  });
});
