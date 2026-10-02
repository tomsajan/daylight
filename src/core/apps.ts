/**
 * The site holds two apps: Daylight, in several designs of the same thing, and
 * Eclipses. Every page in designs/* says in its meta.ts which app it belongs to;
 * this module lists them and remembers where to go back to when switching apps.
 */

export type AppName = 'daylight' | 'eclipses';

export interface DesignMeta {
  name: string;
  tagline: string;
  description: string;
  /** Sort order among the app's designs. */
  order?: number;
  /** Defaults to daylight. */
  app?: AppName;
  /** A development page, only listed on a local host. */
  dev?: boolean;
}

export interface Design extends DesignMeta {
  slug: string;
  app: AppName;
}

export const DESIGNS: Design[] = Object.entries(import.meta.glob<{ default: DesignMeta }>('/designs/*/meta.ts', { eager: true }))
  .map(([path, mod]) => ({ slug: path.split('/')[2], ...mod.default, app: mod.default.app ?? 'daylight' }))
  .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));

/** The daylight design the start page and the switch from Eclipses open by default. */
export const DEFAULT_DAYLIGHT = 'observatory';

/** Running from the dev server or a local or LAN address, where the development pages are offered. */
export function isLocalHost(): boolean {
  if (import.meta.env.DEV) return true;
  const h = location.hostname;
  return h === 'localhost' || h === '[::1]' || h.endsWith('.localhost') || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
}

/** The designs a switcher or the start page offers for an app; the development pages are listed apart. */
export function designsOf(app: AppName): Design[] {
  return DESIGNS.filter((d) => d.app === app && !d.dev);
}

/** Slug of the page this is, empty on the start page. */
export const currentSlug = location.pathname.match(/\/designs\/([^/]+)/)?.[1] ?? '';
export const currentDesign = DESIGNS.find((d) => d.slug === currentSlug);

const LAST_DAYLIGHT = 'daylight.lastDesign';
const LAST_ECLIPSE = 'daylight.lastEclipse';

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    // Not remembered.
  }
}

// A daylight design remembers itself, so leaving Eclipses comes back to it.
if (currentDesign?.app === 'daylight' && !currentDesign.dev) write(() => localStorage, LAST_DAYLIGHT, currentSlug);

/** The daylight design last used in this browser, or the default. */
export function lastDaylightDesign(): string {
  const slug = read(() => localStorage, LAST_DAYLIGHT);
  return designsOf('daylight').some((d) => d.slug === slug) ? slug! : DEFAULT_DAYLIGHT;
}

/** The Eclipses page remembers its eclipse for this tab, so a trip to Daylight and back keeps it. */
export function rememberEclipse(id: string): void {
  write(() => sessionStorage, LAST_ECLIPSE, id);
}

/**
 * Link to the other app, from a page in designs/*. Places come along; time does not, as the two
 * apps look at different moments: now or a date in the year against the instant of an eclipse.
 */
export function otherAppHref(places: string): string {
  if (currentDesign?.app === 'eclipses') return `../${lastDaylightDesign()}/${places}`;
  const eclipse = read(() => sessionStorage, LAST_ECLIPSE);
  return `../eclipse/${places}${eclipse ? `#${eclipse}` : ''}`;
}
