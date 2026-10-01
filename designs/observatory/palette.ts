/** Observatory colours shared by the charts, the day ribbon and the light-phase badges. */
import { Light } from '$core/astro/daylight';
import type { ChartPalette } from '$core/charts/palette';
import type { GlobeOptions } from '$core/globe/GlobeRenderer';

/** Sky colour per light level: deep space through twilight blues to sunlight gold. */
export const LIGHT_COLORS: Record<Light, string> = {
  [Light.Night]: '#070b19',
  [Light.Astronomical]: '#111c3b',
  [Light.Nautical]: '#203263',
  [Light.Civil]: '#40599a',
  [Light.Day]: '#f2c46d',
};

/** Short names for legends and badges (sentence case, no jargon beyond the standard terms). */
export const LIGHT_SHORT: Record<Light, string> = {
  [Light.Night]: 'Night',
  [Light.Astronomical]: 'Astronomical',
  [Light.Nautical]: 'Nautical',
  [Light.Civil]: 'Civil',
  [Light.Day]: 'Daylight',
};

export const OBS_CHART_PALETTE: ChartPalette = {
  light: LIGHT_COLORS,
  // Solid: the charts also use it to outline compared places' lines.
  background: '#060a17',
  grid: 'rgba(236, 230, 216, 0.08)',
  axis: 'rgba(236, 230, 216, 0.3)',
  text: '#aab0c2',
  // Sunset coral: reads on both the gold daylight band and the night blues.
  marker: '#ff7a5c',
  font: '500 11px Jost, Futura, system-ui, sans-serif',
};

/** Globe colours tuned to the gold-on-navy palette. */
export const OBS_GLOBE: Partial<GlobeOptions> = {
  terminatorColor: '#ffc861',
  atmosphereColor: '#5c95ff',
  lineColor: '#c8d3ff',
};
