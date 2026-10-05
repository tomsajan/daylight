/**
 * The skyline from the chosen place, for the horizon view and the sky views:
 * worked out from elevation tiles when asked, one place at a time. Can be
 * switched off, which is remembered in this browser; nothing is downloaded then.
 */

import { ElevationTiles, skyline, skylineTiles, type Skyline, type SkylineRequest } from '$core/terrain';

const KEY = 'daylight.eclipse.terrain';
/** More than a wide view needs; beyond it something is off, such as a place by the pole. */
const MAX_TILES = 150;

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

class Terrain {
  on = $state(stored());
  status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  #skyline = $state.raw<Skyline | null>(null);
  #tiles = new ElevationTiles();
  #asked = '';
  #abort: AbortController | null = null;

  setOn(on: boolean): void {
    this.on = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // Not remembered.
    }
    if (!on) this.#drop();
  }

  /** The skyline from a place, if it is the one worked out. */
  at(place: { lat: number; lon: number } | null): Skyline | null {
    const s = this.#skyline;
    return this.on && s && place && s.lat === place.lat && s.lon === place.lon ? s : null;
  }

  /** Works out the skyline asked for, unless it is the one at hand or on its way. */
  async request(req: SkylineRequest, again = false): Promise<void> {
    const asked = JSON.stringify(req);
    if (!this.on || (asked === this.#asked && !again)) return;
    this.#drop();
    this.#asked = asked;
    const abort = (this.#abort = new AbortController());
    this.status = 'loading';
    try {
      const tiles = skylineTiles(req);
      if (tiles.length > MAX_TILES) throw new Error(`Too many terrain tiles: ${tiles.length}`);
      await this.#tiles.ensure(tiles, abort.signal);
      if (abort.signal.aborted) return;
      this.#skyline = skyline(req, this.#tiles.elevation);
      this.status = 'ready';
    } catch (err) {
      if (abort.signal.aborted) return;
      console.warn(err);
      this.status = 'error';
    }
  }

  /**
   * A skyline of its own for part of the view, with the rays closer together than in the one
   * kept here; for looking closely. Null if it cannot be had.
   */
  async detail(req: SkylineRequest): Promise<Skyline | null> {
    try {
      const tiles = skylineTiles(req);
      if (!this.on || tiles.length > MAX_TILES) return null;
      await this.#tiles.ensure(tiles);
      return skyline(req, this.#tiles.elevation);
    } catch (err) {
      console.warn(err);
      return null;
    }
  }

  #drop(): void {
    this.#abort?.abort();
    this.#abort = null;
    this.#asked = '';
    this.#skyline = null;
    this.status = 'idle';
  }
}

export const terrain = new Terrain();
