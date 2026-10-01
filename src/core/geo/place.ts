import tzLookup from '@photostructure/tz-lookup';
import { normalizeLongitude } from '../astro/sun';

export interface Place {
  id: string;
  /** Short name, e.g. "Prague". */
  name: string;
  /** Context such as region and country, e.g. "Czechia". */
  detail: string;
  lat: number;
  lon: number;
  /** IANA time zone. */
  tz: string;
}

export function timeZoneAt(lat: number, lon: number): string {
  try {
    return tzLookup(lat, normalizeLongitude(lon));
  } catch {
    // Outside any zone's polygon (e.g. near the poles): nautical time zone.
    const hours = Math.round(normalizeLongitude(lon) / 15);
    return hours === 0 ? 'UTC' : `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}`;
  }
}

let idCounter = 0;

export function makePlace(lat: number, lon: number, name?: string, detail = ''): Place {
  return {
    id: `p${Date.now().toString(36)}${(idCounter++).toString(36)}`,
    name: name || formatCoordinates(lat, lon),
    detail,
    lat,
    lon: normalizeLongitude(lon),
    tz: timeZoneAt(lat, lon),
  };
}

export function formatCoordinates(lat: number, lon: number, digits = 2): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(digits)}°${ns} ${Math.abs(lon).toFixed(digits)}°${ew}`;
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A few well-spread places to fall back on and to offer as examples. */
export const SAMPLE_PLACES: Array<Pick<Place, 'name' | 'detail' | 'lat' | 'lon'>> = [
  { name: 'Prague', detail: 'Czechia', lat: 50.0755, lon: 14.4378 },
  { name: 'Tromsø', detail: 'Norway', lat: 69.6492, lon: 18.9553 },
  { name: 'Singapore', detail: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { name: 'Ushuaia', detail: 'Argentina', lat: -54.8019, lon: -68.303 },
  { name: 'Reykjavík', detail: 'Iceland', lat: 64.1466, lon: -21.9426 },
  { name: 'Sydney', detail: 'Australia', lat: -33.8688, lon: 151.2093 },
  { name: 'New York', detail: 'United States', lat: 40.7128, lon: -74.006 },
  { name: 'Longyearbyen', detail: 'Svalbard', lat: 78.2232, lon: 15.6267 },
];
