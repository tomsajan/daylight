/**
 * Chart palettes matching the Instrument theme tokens in theme.css.
 * Canvas can't read CSS variables cheaply on every frame, so the values are mirrored here.
 */
import { Light } from '$core/astro/daylight';
import type { ChartPalette } from '$core/charts/palette';

const FONT = '500 10.5px "IBM Plex Mono", ui-monospace, monospace';

export const INSTRUMENT_LIGHT: ChartPalette = {
  light: {
    [Light.Night]: '#1b2233',
    [Light.Astronomical]: '#2b3756',
    [Light.Nautical]: '#475d8c',
    [Light.Civil]: '#8ea3cb',
    [Light.Day]: '#f7dc93',
  },
  background: '#fbfbfc',
  grid: 'rgba(17, 22, 29, 0.09)',
  axis: 'rgba(17, 22, 29, 0.38)',
  text: '#4d5766',
  marker: '#d6246e',
  font: FONT,
};

export const INSTRUMENT_DARK: ChartPalette = {
  light: {
    [Light.Night]: '#05070c',
    [Light.Astronomical]: '#101830',
    [Light.Nautical]: '#1b2a4f',
    [Light.Civil]: '#344d86',
    [Light.Day]: '#dcb25a',
  },
  background: '#0e131a',
  grid: 'rgba(220, 230, 255, 0.07)',
  axis: 'rgba(220, 230, 255, 0.28)',
  text: '#8f9bad',
  marker: '#ff4f8b',
  font: FONT,
};

export function instrumentPalette(theme: 'light' | 'dark'): ChartPalette {
  return theme === 'dark' ? INSTRUMENT_DARK : INSTRUMENT_LIGHT;
}
