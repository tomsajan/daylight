import { describe, expect, it } from 'vitest';
import * as A from 'astronomy-engine';
import { sunPosition } from './sun';
import { computeDay, computeYear, Light } from './daylight';
import { addDays, makeTimeScale, tzOffsetMinutes, type CivilDate } from '../time/timescale';

const CITIES = [
  { name: 'Prague', lat: 50.0755, lon: 14.4378, tz: 'Europe/Prague' },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney' },
  { name: 'Quito', lat: -0.1807, lon: -78.4678, tz: 'America/Guayaquil' },
  { name: 'Anchorage', lat: 61.2181, lon: -149.9003, tz: 'America/Anchorage' },
  { name: 'Kiritimati', lat: 1.8721, lon: -157.4278, tz: 'Pacific/Kiritimati' },
  { name: 'Reykjavik', lat: 64.1466, lon: -21.9426, tz: 'Atlantic/Reykjavik' },
  { name: 'Kathmandu', lat: 27.7172, lon: 85.324, tz: 'Asia/Kathmandu' },
  { name: 'Ushuaia', lat: -54.8019, lon: -68.303, tz: 'America/Argentina/Ushuaia' },
];

const MIN = 60_000;

describe('sun position', () => {
  it('matches astronomy-engine to within 0.05°', () => {
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      const t = Date.UTC(2000 + (i % 50), i % 12, 1 + (i % 28), (i * 7) % 24, (i * 13) % 60);
      const lat = -85 + ((i * 37) % 170);
      const lon = -180 + ((i * 73) % 360);
      const obs = new A.Observer(lat, lon, 0);
      const eq = A.Equator(A.Body.Sun, new Date(t), obs, true, true);
      const ref = A.Horizon(new Date(t), obs, eq.ra, eq.dec);
      const mine = sunPosition(t, lat, lon);
      worst = Math.max(worst, Math.abs(mine.altitude - ref.altitude));
      if (ref.altitude > -80 && ref.altitude < 80) {
        const dAz = Math.abs(((mine.azimuth - ref.azimuth + 540) % 360) - 180);
        expect(dAz).toBeLessThan(0.2);
      }
    }
    expect(worst).toBeLessThan(0.05);
  });
});

describe('sunrise and sunset', () => {
  it('match astronomy-engine within 1.5 minutes across a year', () => {
    for (const city of CITIES) {
      const scale = makeTimeScale('local', city);
      const obs = new A.Observer(city.lat, city.lon, 0);
      let date: CivilDate = { year: 2026, month: 1, day: 3 };
      for (let i = 0; i < 24; i++) {
        const day = computeDay(city, date, scale);
        const rise = A.SearchRiseSet(A.Body.Sun, obs, +1, new Date(day.start), 1);
        const set = A.SearchRiseSet(A.Body.Sun, obs, -1, new Date(day.start), 1);
        if (rise && rise.date.getTime() < day.end) {
          expect(day.sunrise, `${city.name} ${date.month}/${date.day} sunrise`).not.toBeNull();
          expect(Math.abs(day.sunrise!.time - rise.date.getTime()) / MIN).toBeLessThan(1.5);
        }
        if (set && set.date.getTime() < day.end) {
          expect(day.sunset, `${city.name} ${date.month}/${date.day} sunset`).not.toBeNull();
          expect(Math.abs(day.sunset!.time - set.date.getTime()) / MIN).toBeLessThan(1.5);
        }
        date = addDays(date, 15);
      }
    }
  });

  it('matches astronomy-engine for civil and astronomical twilight', () => {
    const city = CITIES[0];
    const scale = makeTimeScale('local', city);
    const obs = new A.Observer(city.lat, city.lon, 0);
    const day = computeDay(city, { year: 2026, month: 3, day: 15 }, scale);
    const civil = day.events.find((e) => e.boundary === 'civil' && e.rising)!;
    const astro = day.events.find((e) => e.boundary === 'astronomical' && !e.rising)!;
    const refCivil = A.SearchAltitude(A.Body.Sun, obs, +1, new Date(day.start), 1, -6)!;
    const refAstro = A.SearchAltitude(A.Body.Sun, obs, -1, new Date(day.start), 1, -18)!;
    expect(Math.abs(civil.time - refCivil.date.getTime()) / MIN).toBeLessThan(1);
    expect(Math.abs(astro.time - refAstro.date.getTime()) / MIN).toBeLessThan(1);
  });

  it('gives roughly 12h07m of daylight at the equator', () => {
    const quito = CITIES[2];
    for (const month of [1, 4, 7, 10]) {
      const day = computeDay(quito, { year: 2026, month, day: 1 }, makeTimeScale('local', quito));
      expect(day.daylightMin).toBeGreaterThan(12 * 60);
      expect(day.daylightMin).toBeLessThan(12 * 60 + 20);
    }
  });
});

describe('polar regions', () => {
  const tromso = { lat: 69.6492, lon: 18.9553, tz: 'Europe/Oslo' };
  const scale = makeTimeScale('local', tromso);

  it('detects polar night', () => {
    const day = computeDay(tromso, { year: 2026, month: 12, day: 21 }, scale);
    expect(day.polarNight).toBe(true);
    expect(day.sunrise).toBeNull();
    expect(day.daylightMin).toBe(0);
    // Still civil twilight around noon.
    expect(day.durations[Light.Civil]).toBeGreaterThan(60);
  });

  it('detects polar day', () => {
    const day = computeDay(tromso, { year: 2026, month: 6, day: 21 }, scale);
    expect(day.polarDay).toBe(true);
    expect(day.daylightMin).toBeCloseTo(24 * 60, 0);
    expect(day.segments).toHaveLength(1);
  });

  it('handles the North Pole year', () => {
    const pole = { lat: 90, lon: 0, tz: 'UTC' };
    const year = computeYear(pole, 2026, makeTimeScale('utc', pole));
    const polarDays = year.filter((d) => d.polarDay).length;
    // Roughly 186 days of midnight sun at the pole, refraction included.
    expect(polarDays).toBeGreaterThan(180);
    expect(polarDays).toBeLessThan(195);
  });
});

describe('time scales', () => {
  const prague = CITIES[0];

  it('handles DST transitions', () => {
    const scale = makeTimeScale('local', prague);
    const spring = computeDay(prague, { year: 2026, month: 3, day: 29 }, scale);
    const autumn = computeDay(prague, { year: 2026, month: 10, day: 25 }, scale);
    expect(spring.lengthMin).toBe(23 * 60);
    expect(autumn.lengthMin).toBe(25 * 60);
    for (const day of [spring, autumn]) {
      expect(day.segments[0].startMin).toBe(0);
      expect(day.segments[day.segments.length - 1].endMin).toBe(1440);
      for (const s of day.segments) expect(s.endMin).toBeGreaterThanOrEqual(s.startMin);
    }
    // Sunrise jumps an hour later on the clock across the spring change.
    const before = computeDay(prague, { year: 2026, month: 3, day: 28 }, scale);
    expect(spring.sunrise!.minutes - before.sunrise!.minutes).toBeGreaterThan(55);
  });

  it('puts solar noon at 12:00 in apparent solar time', () => {
    const scale = makeTimeScale('solar-apparent', prague);
    for (const month of [2, 5, 8, 11]) {
      const day = computeDay(prague, { year: 2026, month, day: 10 }, scale);
      expect(Math.abs(day.solarNoon.minutes - 720)).toBeLessThan(0.5);
    }
  });

  it('reads UTC offsets from IANA zones', () => {
    expect(tzOffsetMinutes('Europe/Prague', Date.UTC(2026, 0, 15))).toBe(60);
    expect(tzOffsetMinutes('Europe/Prague', Date.UTC(2026, 6, 15))).toBe(120);
    expect(tzOffsetMinutes('Asia/Kathmandu', Date.UTC(2026, 6, 15))).toBe(345);
    expect(tzOffsetMinutes('Pacific/Kiritimati', Date.UTC(2026, 6, 15))).toBe(14 * 60);
    expect(tzOffsetMinutes('America/St_Johns', Date.UTC(2026, 0, 15))).toBe(-210);
  });

  it('covers every day of the year with segments', () => {
    for (const city of CITIES) {
      const year = computeYear(city, 2026, makeTimeScale('local', city));
      expect(year).toHaveLength(365);
      for (const day of year) {
        const total = Object.values(day.durations).reduce((a, b) => a + b, 0);
        expect(total).toBeCloseTo(day.lengthMin, 3);
      }
    }
  });
});
