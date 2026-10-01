/**
 * Finding the user's own place without asking for permission first:
 * the browser's time zone (e.g. "Europe/Prague") names a nearby city.
 * Precise geolocation is offered separately because it prompts the user.
 */
import { browserTimeZone } from '../time/timescale';
import { searchPlaces, resultToPlace } from './geocode';
import { makePlace, SAMPLE_PLACES, type Place } from './place';

export async function guessHomePlace(): Promise<Place> {
  const tz = browserTimeZone();
  const city = tz.split('/').pop()?.replace(/_/g, ' ');
  if (city && tz.includes('/') && !tz.startsWith('Etc/')) {
    try {
      const results = await searchPlaces(city, AbortSignal.timeout(5000), 3);
      const best = results.find((r) => /city|town|capital|administrative/.test(r.kind)) ?? results[0];
      if (best) {
        const place = resultToPlace(best);
        // Keep the user's own zone, e.g. for small places geocoded slightly off.
        return { ...place, tz };
      }
    } catch {
      // Offline or service down: fall through.
    }
  }
  const s = SAMPLE_PLACES[0];
  return makePlace(s.lat, s.lon, s.name, s.detail);
}

export function geolocate(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Geolocation is not available'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600_000 },
    );
  });
}
