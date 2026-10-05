/**
 * The skyline from the chosen place, for the horizon view and the sky views:
 * worked out from elevation tiles when asked, one place at a time. Can be
 * switched off, which is remembered in this browser; nothing is downloaded then.
 *
 * How high the eyes are above the ground is remembered too. For the place at
 * hand the ground's height can be given by hand, and the terrain read more
 * finely; both are forgotten when the place moves.
 */

import { ElevationTiles, skyline, skylineTiles, type Skyline, type SkylineRequest } from '$core/terrain';

const KEY = 'daylight.eclipse.terrain';
const EYE_KEY = 'daylight.eclipse.eye';
const DEFAULT_EYE = 2;
/** More than a wide view needs; beyond it something is off, such as a place by the pole. */
const MAX_TILES = 150;
const MAX_TILES_PRECISE = 600;

function storedEye(): number {
  try {
    const v = Number(localStorage.getItem(EYE_KEY) ?? NaN);
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_EYE;
  } catch {
    return DEFAULT_EYE;
  }
}

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
  /** Eyes above the ground, metres. */
  eye = $state(storedEye());
  /** The ground at the place, metres above sea level, if given by hand. */
  ground = $state<number | null>(null);
  /** Read the terrain more finely for this place. */
  precise = $state(false);
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

  setEye(metres: number): void {
    this.eye = metres;
    try {
      localStorage.setItem(EYE_KEY, String(metres));
    } catch {
      // Not remembered.
    }
  }

  /** What every skyline asked for takes from here. */
  get options(): Pick<SkylineRequest, 'eye' | 'ground' | 'precise'> {
    return { eye: this.eye, ground: this.ground ?? undefined, precise: this.precise };
  }

  /** The place has moved: what was set for the old one no longer holds. */
  moved(): void {
    this.ground = null;
    this.precise = false;
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
      if (tiles.length > (req.precise ? MAX_TILES_PRECISE : MAX_TILES)) throw new Error(`Too many terrain tiles: ${tiles.length}`);
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
      if (!this.on || tiles.length > (req.precise ? MAX_TILES_PRECISE : MAX_TILES)) return null;
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
