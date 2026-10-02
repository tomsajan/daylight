/** Words for eclipses, shared by the panels and the map readout. */

import {
  lunarContacts,
  type EclipseType,
  type LocalLunarEclipse,
  type LocalSolarEclipse,
  type LunarEclipse,
  type LunarEclipseType,
} from '$core/eclipse';

export const TYPE_NAMES: Record<EclipseType, string> = { T: 'Total', A: 'Annular', H: 'Hybrid', P: 'Partial' };
export const LUNAR_TYPE_NAMES: Record<LunarEclipseType, string> = { T: 'Total', P: 'Partial', N: 'Penumbral' };

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

/** The phase of a lunar eclipse at an instant: "totality", "the partial phase", … */
export function lunarPhaseName(e: LunarEclipse, ms: number): string {
  const at = new Map<string, number>(lunarContacts(e).map((c) => [c.name, c.time]));
  const after = (name: string) => at.has(name) && ms >= at.get(name)!;
  if (after('U3') && !after('U4')) return 'the partial phase';
  if (after('U2') && !after('U3')) return 'totality';
  if (after('U1') && !after('U2')) return 'the partial phase';
  if (after('U4') || !at.has('U1') || !after('U1')) return 'the penumbral phase';
  return 'the eclipse';
}

/** A lunar eclipse from one place, in words; clock() writes a time the way the page shows it. */
export function describeLunar(l: LocalLunarEclipse, clock: (ms: number) => string): { short: string; headline: string } {
  const e = l.eclipse;
  if (!l.visible) return { short: 'Not seen: Moon below the horizon', headline: 'Not seen: the Moon is below the horizon throughout' };
  const greatest = l.contacts.find((c) => c.name === 'Greatest')!;
  if (l.seen >= 1) {
    const high = greatest.visible ? `, the Moon ${greatest.altitude.toFixed(0)}° up at greatest eclipse` : '';
    return { short: 'The whole eclipse seen', headline: `The whole eclipse is seen${high}` };
  }
  const parts: string[] = [];
  const short: string[] = [];
  if (l.moonrise) {
    parts.push(`the Moon rises at ${clock(l.moonrise.time)}, during ${lunarPhaseName(e, l.moonrise.time)}`);
    short.push(`Moonrise during ${lunarPhaseName(e, l.moonrise.time)}`);
  }
  if (l.moonset) {
    parts.push(`the Moon sets at ${clock(l.moonset.time)}, during ${lunarPhaseName(e, l.moonset.time)}`);
    short.push(`Moonset during ${lunarPhaseName(e, l.moonset.time)}`);
  }
  const t = l.totalitySeen;
  const totality =
    t === undefined ? '' : t <= 0 ? '. Totality is not seen' : t >= 1 ? '. All of totality is seen' : `. ${percent(t)} of totality is seen`;
  return { short: short.join(', '), headline: `Seen in part: ${parts.join('; ')}${totality}` };
}
