/**
 * Place search and reverse geocoding, straight from the browser.
 * Photon (komoot, OpenStreetMap data) is built for search-as-you-type.
 * Nominatim is only a fallback for searches the user explicitly asks for
 * (pressing Enter): its usage policy forbids autocomplete and allows at most
 * one request per second. Both are free public services, so requests are
 * kept sparse: callers should debounce, and reverse lookups are throttled.
 */
import { formatCoordinates, makePlace, type Place } from './place';

export interface SearchResult {
  name: string;
  detail: string;
  lat: number;
  lon: number;
  /** e.g. "city", "country", "mountain" */
  kind: string;
}

const PHOTON = 'https://photon.komoot.io';
const NOMINATIM = 'https://nominatim.openstreetmap.org';

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    osm_value?: string;
    type?: string;
  };
}

function photonToResult(f: PhotonFeature): SearchResult {
  const p = f.properties;
  const name = p.name || p.city || p.state || p.country || formatCoordinates(f.geometry.coordinates[1], f.geometry.coordinates[0]);
  const detail = [p.city !== name ? p.city : undefined, p.state !== name ? p.state : undefined, p.country !== name ? p.country : undefined]
    .filter(Boolean)
    .join(', ');
  return { name, detail, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], kind: p.osm_value || p.type || '' };
}

interface NominatimItem {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  type?: string;
}

function nominatimToResult(r: NominatimItem): SearchResult {
  const parts = r.display_name.split(', ');
  const name = r.name || parts[0];
  return { name, detail: parts.slice(1).filter((p) => p !== name).slice(-2).join(', '), lat: +r.lat, lon: +r.lon, kind: r.type || '' };
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface SearchOptions {
  signal?: AbortSignal;
  limit?: number;
  /** An explicit search (Enter), not typing: may fall back to Nominatim if Photon fails. */
  fallback?: boolean;
}

let lastNominatim = 0;

export async function searchPlaces(query: string, { signal, limit = 8, fallback = false }: SearchOptions = {}): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const coords = parseCoordinates(q);
  if (coords) return [{ name: formatCoordinates(coords.lat, coords.lon), detail: 'Coordinates', ...coords, kind: 'coordinates' }];

  try {
    const data = await getJson<{ features: PhotonFeature[] }>(
      `${PHOTON}/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=en`,
      signal,
    );
    return data.features.map(photonToResult);
  } catch (err) {
    if (signal?.aborted || !fallback) throw err;
    const wait = lastNominatim + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    signal?.throwIfAborted();
    lastNominatim = Date.now();
    const data = await getJson<NominatimItem[]>(
      `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=${limit}&accept-language=en`,
      signal,
    );
    return data.map(nominatimToResult);
  }
}

let lastReverse = 0;

/** Name for a point; falls back to its coordinates (e.g. in the ocean). */
export async function reverseGeocode(lat: number, lon: number): Promise<{ name: string; detail: string }> {
  const fallback = { name: formatCoordinates(lat, lon), detail: '' };
  // Nominatim asks for at most one request per second; Photon is similar in spirit.
  const wait = lastReverse + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReverse = Date.now();
  try {
    const data = await getJson<{ features: PhotonFeature[] }>(`${PHOTON}/reverse?lat=${lat}&lon=${lon}&lang=en`);
    if (!data.features.length) return fallback;
    const r = photonToResult(data.features[0]);
    // Prefer the town over a street or building name.
    const props = data.features[0].properties;
    const name = props.city || r.name;
    const detail = [props.state, props.country].filter((x) => x && x !== name).join(', ');
    return { name, detail };
  } catch {
    return fallback;
  }
}

export function resultToPlace(r: SearchResult): Place {
  return makePlace(r.lat, r.lon, r.name, r.detail);
}

/** Accepts "50.08, 14.44", "50.08 14.44" or "50.08N 14.44E". */
export function parseCoordinates(text: string): { lat: number; lon: number } | null {
  const m = text
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?[\s,;]+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?$/i);
  if (!m) return null;
  let lat = parseFloat(m[1]);
  let lon = parseFloat(m[3]);
  if (m[2]?.toUpperCase() === 'S') lat = -lat;
  if (m[4]?.toUpperCase() === 'W') lon = -lon;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
