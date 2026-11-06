import { describe, expect, it } from 'vitest';
import { formatShift, formatSigned, formatSpeed, formatSunClock } from './format';

describe('formatSpeed', () => {
  it('picks a readable unit', () => {
    expect(formatSpeed(1)).toBe('1×');
    expect(formatSpeed(3.14)).toBe('3.1×');
    expect(formatSpeed(10)).toBe('10×');
    expect(formatSpeed(60)).toBe('1 min/s');
    expect(formatSpeed(9000)).toBe('2.5 h/s');
    expect(formatSpeed(86400)).toBe('1 day/s');
    expect(formatSpeed(3 * 86400)).toBe('3 days/s');
    expect(formatSpeed(30 * 86400)).toBe('1 month/s');
  });
});

describe('formatShift', () => {
  it('turns daylight gained into earlier sunrises and later sunsets', () => {
    expect(formatShift('sunrise', 1.8)).toBe('1 min 48 s earlier');
    expect(formatShift('sunrise', -0.5)).toBe('30 s later');
    expect(formatShift('sunset', 1.8)).toBe('1 min 48 s later');
    expect(formatShift('sunset', -2)).toBe('2 min 0 s earlier');
    expect(formatShift('sunset', 0.001)).toBe('no change');
    expect(formatShift('sunrise', -1.8, true)).toBe('1m 48s later');
    expect(formatShift('sunset', 0.5, true)).toBe('30s later');
  });
});

describe('sun against the clock', () => {
  it('says which way and how far', () => {
    expect(formatSunClock(31.2)).toBe('31 min behind the clock');
    expect(formatSunClock(-62)).toBe('1 h 02 min ahead of the clock');
    expect(formatSunClock(0.3)).toBe('with the clock');
    expect(formatSigned(2.4)).toBe('+2 min');
    expect(formatSigned(-65)).toBe('−1 h 05 min');
    expect(formatSigned(0.2)).toBe('0 min');
  });
});
