import { describe, expect, it } from 'vitest';
import { formatSpeed } from './format';

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
