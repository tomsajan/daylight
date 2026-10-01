import { Light } from '../astro/daylight';

export interface ChartPalette {
  /** Fill per light level, darkest to brightest. */
  light: Record<Light, string>;
  background: string;
  grid: string;
  axis: string;
  text: string;
  /** Selected date / current time marker. */
  marker: string;
  font: string;
}

export const LIGHT_PALETTE: ChartPalette = {
  light: {
    [Light.Night]: '#1d2747',
    [Light.Astronomical]: '#2f3f6e',
    [Light.Nautical]: '#4c6299',
    [Light.Civil]: '#8fa3cf',
    [Light.Day]: '#ffe9a8',
  },
  background: '#ffffff',
  grid: 'rgba(20, 30, 50, 0.12)',
  axis: 'rgba(20, 30, 50, 0.35)',
  text: '#3c4558',
  marker: '#e5484d',
  font: '11px system-ui, sans-serif',
};

export const DARK_PALETTE: ChartPalette = {
  light: {
    [Light.Night]: '#070b18',
    [Light.Astronomical]: '#121b36',
    [Light.Nautical]: '#1f2e57',
    [Light.Civil]: '#3c5590',
    [Light.Day]: '#e8c46a',
  },
  background: '#0b1020',
  grid: 'rgba(255, 255, 255, 0.10)',
  axis: 'rgba(255, 255, 255, 0.30)',
  text: '#b7c0d6',
  marker: '#ff6b6b',
  font: '11px system-ui, sans-serif',
};

/**
 * Which level a segment is drawn as when some twilights are hidden:
 * a hidden phase takes the colour of the next darker visible one.
 */
export function visibleLevel(light: Light, show: { civil: boolean; nautical: boolean; astronomical: boolean }): Light {
  let l = light;
  const hidden = (x: Light) =>
    (x === Light.Civil && !show.civil) || (x === Light.Nautical && !show.nautical) || (x === Light.Astronomical && !show.astronomical);
  while (l > Light.Night && l < Light.Day && hidden(l)) l--;
  return l;
}
