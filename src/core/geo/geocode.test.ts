import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchPlaces } from './geocode';

const NOMINATIM_PRAGUE = [{ name: 'Prague', display_name: 'Prague, Czechia', lat: '50.08', lon: '14.43', type: 'city' }];

/** Photon fails; Nominatim answers. Returns the URLs that were fetched. */
function photonDown(): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes('photon')) return new Response('down', { status: 503 });
      return new Response(JSON.stringify(NOMINATIM_PRAGUE), { status: 200 });
    }),
  );
  return urls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('searchPlaces fallback', () => {
  it('never asks Nominatim while typing', async () => {
    const urls = photonDown();
    await expect(searchPlaces('Prag')).rejects.toThrow('503');
    expect(urls.some((u) => u.includes('nominatim'))).toBe(false);
  });

  it('falls back to Nominatim on an explicit search, at most once a second', async () => {
    const urls = photonDown();
    const first = await searchPlaces('Prague', { fallback: true });
    expect(first[0].lat).toBeCloseTo(50.08);

    vi.useFakeTimers();
    const second = searchPlaces('Prague', { fallback: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(urls.filter((u) => u.includes('nominatim'))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(700);
    await second;
    expect(urls.filter((u) => u.includes('nominatim'))).toHaveLength(2);
  });
});
