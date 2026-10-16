/**
 * Background maps. OpenFreeMap (vector maps from OpenStreetMap data) and the
 * Sentinel-2 cloudless mosaic need no key. Mapy.com needs an API key; it is
 * read from VITE_MAPY_API_KEY at build time or entered on the page and kept in
 * this browser. A key used on a public site should be restricted to that
 * site's address in the Mapy.com developer account.
 */

import type { GeoJSONSourceSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';

export interface Basemap {
  id: string;
  name: string;
  /** Dark background: the eclipse is drawn in lighter colours. */
  dark: boolean;
  /** Needs a Mapy.com API key. */
  mapy?: boolean;
  style: (mapyKey: string) => string | StyleSpecification;
}

const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

function raster(tiles: string[], attribution: string, maxzoom: number, background: string): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { base: { type: 'raster', tiles, tileSize: 256, maxzoom, attribution } },
    layers: [
      // Shows past the tiles' reach, around the poles.
      { id: 'background', type: 'background', paint: { 'background-color': background } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  };
}

const MAPY_ATTRIBUTION = '<a href="https://api.mapy.com/copyright" target="_blank" rel="noopener">© Seznam.cz a.s. and others</a>';

function mapy(mapset: string, retina: boolean) {
  return (key: string) =>
    raster(
      [`https://api.mapy.com/v1/maptiles/${mapset}/${retina ? '256@2x' : '256'}/{z}/{x}/{y}?apikey=${encodeURIComponent(key)}`],
      MAPY_ATTRIBUTION,
      mapset === 'aerial' ? 20 : 19,
      mapset === 'aerial' ? '#1d2a33' : '#e9eef0',
    );
}

export const BASEMAPS: Basemap[] = [
  { id: 'streets', name: 'Streets', dark: false, style: () => 'https://tiles.openfreemap.org/styles/liberty' },
  { id: 'light', name: 'Light', dark: false, style: () => 'https://tiles.openfreemap.org/styles/positron' },
  { id: 'dark', name: 'Dark', dark: true, style: () => 'https://tiles.openfreemap.org/styles/dark' },
  {
    id: 'satellite',
    name: 'Satellite (Sentinel-2)',
    dark: true,
    style: () =>
      raster(
        ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'],
        '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless by EOX</a> (modified Copernicus Sentinel data 2024)',
        14,
        '#1d2a33',
      ),
  },
  { id: 'mapy-outdoor', name: 'Mapy.com tourist', dark: false, mapy: true, style: mapy('outdoor', true) },
  { id: 'mapy-basic', name: 'Mapy.com basic', dark: false, mapy: true, style: mapy('basic', true) },
  { id: 'mapy-aerial', name: 'Mapy.com aerial', dark: true, mapy: true, style: mapy('aerial', false) },
];

/**
 * The background map without a network: the style as it was kept (see the service
 * worker in vite.config.ts) laid over the countries of the world, which ship with
 * the app. Where tiles were kept they show; elsewhere the plain world map does.
 * Without a kept style, the world map alone.
 */
export async function offlineStyle(basemap: Basemap, key: string): Promise<StyleSpecification> {
  const world = (await import('./data/world.json')).default as GeoJSONSourceSpecification['data'];
  const spec = basemap.style(key);
  let style: StyleSpecification | undefined;
  try {
    style = typeof spec === 'string' ? await (await fetch(spec)).json() : structuredClone(spec);
  } catch {
    // Never loaded online: the world map alone.
  }
  const own = style?.layers.find((l) => l.type === 'background');
  const plain = basemap.dark
    ? { sea: '#16222c', land: '#2c3438', border: '#4b565d' }
    : { sea: '#c6dbe5', land: '#f2efe7', border: '#a8a69c' };
  // A vector map draws land as its background, so the world's land takes that colour.
  const land = typeof spec === 'string' && own?.paint?.['background-color'] ? own.paint['background-color'] : plain.land;
  const under: LayerSpecification[] = [
    { id: 'offline-sea', type: 'background', paint: { 'background-color': plain.sea } },
    { id: 'offline-land', type: 'fill', source: 'offline-world', paint: { 'fill-color': land } },
    { id: 'offline-borders', type: 'line', source: 'offline-world', paint: { 'line-color': plain.border, 'line-width': 0.6 } },
  ];
  const source = { type: 'geojson' as const, data: world };
  if (!style) return { version: 8, glyphs: GLYPHS, sources: { 'offline-world': source }, layers: under };
  return {
    ...style,
    sources: { ...style.sources, 'offline-world': source },
    layers: [...under, ...style.layers.filter((l) => l.type !== 'background')],
  };
}

const KEY_STORAGE = 'daylight.mapyApiKey';
let enteredKey = '';

/** The Mapy.com API key: one entered on the page, or the build's. */
export function mapyKey(): string {
  let stored = '';
  try {
    stored = localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    // Storage blocked.
  }
  return enteredKey || stored || import.meta.env.VITE_MAPY_API_KEY || '';
}

export function saveMapyKey(key: string): void {
  enteredKey = key;
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Storage blocked: the key works for this visit only.
  }
}
