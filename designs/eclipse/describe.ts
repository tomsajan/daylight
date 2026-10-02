/** Words for eclipses, shared by the panels and the map readout. */

import type { EclipseType, LocalSolarEclipse } from '$core/eclipse';

export const TYPE_NAMES: Record<EclipseType, string> = { T: 'Total', A: 'Annular', H: 'Hybrid', P: 'Partial' };

/** "2m 21.4s", or "48.0s" under a minute. */
export function formatSeconds(s: number, digits = 1): string {
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(digits);
  return m ? `${m}m ${rest.padStart(digits ? 3 + digits : 2, '0')}s` : `${rest}s`;
}

export const percent = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;

/** Coverage with enough digits that a deep partial eclipse never reads as 100%. */
export function coverage(v: number): string {
  if (v >= 1) return '100%';
  // Rounded down near 100%, so only totality shows as 100%.
  const down = (digits: number) => `${(Math.floor(v * 100 * 10 ** digits) / 10 ** digits).toFixed(digits)}%`;
  if (v > 0.999) return down(2);
  if (v > 0.99) return down(1);
  if (v > 0 && v < 0.01) return percent(v, 1);
  return percent(v);
}

export function describeLocal(l: LocalSolarEclipse): { short: string; headline: string } {
  const best = l.visibleMax;
  if (l.kind === 'none' || !best) return { short: 'No eclipse here', headline: 'No eclipse here' };
  const covered = `${coverage(best.obscuration)} of the Sun covered`;
  const sunDown = l.max && !l.max.visible ? ' (maximum after sunset or before sunrise)' : '';
  if ((l.kind === 'total' || l.kind === 'annular') && l.duration && l.max?.visible) {
    const what = l.kind === 'total' ? 'Totality' : 'Annularity';
    return {
      short: `${what} ${formatSeconds(l.duration, 0)}`,
      headline: `${l.kind === 'total' ? 'Total' : 'Annular'} eclipse: ${what.toLowerCase()} lasts ${formatSeconds(l.duration)}`,
    };
  }
  return { short: `Partial, ${covered}${sunDown ? ', sun low' : ''}`, headline: `Partial eclipse: up to ${covered}${sunDown}` };
}
