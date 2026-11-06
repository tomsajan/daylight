import { describe, expect, it } from 'vitest';
import { standardOffset, sunClock, sunClockYear, zeroCrossings } from './clock';
import { computeDay } from './daylight';
import { addDays, makeTimeScale, type CivilDate } from '../time/timescale';

const PRAGUE = { lat: 50.0755, lon: 14.4378, tz: 'Europe/Prague' };
const MADRID = { lat: 40.4168, lon: -3.7038, tz: 'Europe/Madrid' };
const SYDNEY = { lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney' };
const GREENWICH = { lat: 51.4779, lon: 0, tz: 'UTC' };

describe('sun against the clock', () => {
  it('matches solar noon from the daily light calculation', () => {
    for (const place of [PRAGUE, MADRID, SYDNEY]) {
      const scale = makeTimeScale('local', place);
      let date: CivilDate = { year: 2026, month: 1, day: 3 };
      for (let i = 0; i < 24; i++) {
        const day = computeDay(place, date, scale);
        expect(sunClock(place, date).total).toBeCloseTo(day.solarNoon.minutes - 720, 1);
        date = addDays(date, 15);
      }
    }
  });

  it('splits into the equation of time, longitude and summer time', () => {
    const winter = sunClock(PRAGUE, { year: 2026, month: 1, day: 15 });
    expect(winter.longitude).toBeCloseTo(60 - 14.4378 * 4, 6);
    expect(winter.summer).toBe(0);
    const summer = sunClock(PRAGUE, { year: 2026, month: 7, day: 15 });
    expect(summer.summer).toBe(60);
    expect(summer.total).toBeCloseTo(summer.equation + summer.longitude + 60, 9);
    // Madrid keeps Central European time at 3.7° W: the sun is late all year.
    expect(sunClock(MADRID, { year: 2026, month: 7, day: 15 }).total).toBeGreaterThan(130);
  });

  it('takes the standard offset in the southern hemisphere from its winter', () => {
    expect(standardOffset('Australia/Sydney', 2026)).toBe(600);
    expect(sunClock(SYDNEY, { year: 2026, month: 1, day: 15 }).summer).toBe(60);
  });

  it('puts the zeros of the equation of time around Apr 15, Jun 13, Sep 1 and Dec 25', () => {
    const year = sunClockYear(GREENWICH, 2026);
    expect(year).toHaveLength(365);
    const zeros = zeroCrossings(year.map((d) => d.equation)).map((i) => Math.round(i));
    const expected = [Date.UTC(2026, 3, 15), Date.UTC(2026, 5, 13), Date.UTC(2026, 8, 1), Date.UTC(2026, 11, 25)].map((t) =>
      Math.round((t - Date.UTC(2026, 0, 1)) / 86_400_000),
    );
    expect(zeros).toHaveLength(4);
    zeros.forEach((z, i) => expect(Math.abs(z - expected[i])).toBeLessThanOrEqual(2));
  });

  it('finds no zero where the clock is always ahead of the sun', () => {
    expect(zeroCrossings(sunClockYear(MADRID, 2026).map((d) => d.total))).toEqual([]);
  });

  it('does not count summer time jumps as crossings', () => {
    expect(zeroCrossings([-5, -3, 40, 42])).toEqual([]);
    expect(zeroCrossings([-2, 2])).toEqual([0.5]);
  });
});

describe('sun against other clocks', () => {
  const year = (kind: Parameters<typeof makeTimeScale>[0]) => sunClockYear(PRAGUE, 2026, makeTimeScale(kind, PRAGUE));
  const days = (values: number[]) =>
    zeroCrossings(values).map((i) => new Date(Date.UTC(2026, 0, 1) + Math.round(i) * 86_400_000).toISOString().slice(5, 10));

  it('leaves the equation of time alone on mean solar time, zero on four days', () => {
    const y = year('solar-mean');
    expect(y.every((c) => c.longitude === 0 && c.summer === 0 && c.total === c.equation)).toBe(true);
    expect(days(y.map((c) => c.total))).toHaveLength(4);
  });

  it('follows the sun exactly on sundial time', () => {
    expect(year('solar-apparent').every((c) => c.total === 0)).toBe(true);
  });

  it('counts the longitude from Greenwich on UTC', () => {
    const c = year('utc')[0];
    expect(c.longitude).toBeCloseTo(-14.4378 * 4, 6);
    expect(c.summer).toBe(0);
  });

  it('agrees on four days in Prague on standard time all year, once with summer time', () => {
    const y = year('local');
    expect(days(y.map((c) => c.total))).toEqual(['12-20']);
    expect(days(y.map((c) => c.standard))).toEqual(['04-26', '05-31', '09-08', '12-20']);
  });
});
