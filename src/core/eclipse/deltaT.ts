/**
 * ΔT = TT − UT1: how far the Earth's rotation lags behind uniform atomic time.
 * It decides where on Earth an eclipse falls: one second of ΔT moves a path
 * about 0.46 km east or west at the equator.
 *
 * Measured monthly values (IERS) cover 1962 to the last data file. After that
 * ΔT is unknowable in detail; it is held at the last measured value plus the
 * long-term slowing of the Earth by the tides, about 0.0031 s × years². By 2050
 * the real value could differ from this by several seconds, by 2100 by a minute
 * or so.
 */

import data from './data/delta-t.json';

const MS_PER_YEAR = 365.2425 * 86_400_000;
const YEAR_2000_MS = Date.UTC(2000, 0, 1);
/** Half the tidal acceleration of ΔT, s per year². */
const TIDAL = 0.0031;

function yearOf(ms: number): number {
  return 2000 + (ms - YEAR_2000_MS) / MS_PER_YEAR;
}

/** ΔT in seconds at an instant (Unix milliseconds). */
export function deltaT(ms: number): number {
  const year = yearOf(ms);
  const { start, step, values } = data;
  const i = (year - start) / step;
  if (i <= 0) return values[0];
  const last = values.length - 1;
  if (i >= last) {
    const years = (i - last) * step;
    return values[last] + TIDAL * years * years;
  }
  const k = Math.floor(i);
  return values[k] + (values[k + 1] - values[k]) * (i - k);
}

/** Whether ΔT at this instant is measured rather than extrapolated. */
export function deltaTMeasured(ms: number): boolean {
  return (yearOf(ms) - data.start) / data.step <= data.values.length - 1;
}
