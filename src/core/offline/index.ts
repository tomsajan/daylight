/**
 * Offline use: a service worker (built by vite-plugin-pwa, see vite.config.ts)
 * keeps the whole site on the device, and the map and terrain tiles as they are
 * looked at, so the app opens and works without a network.
 */

import { watchInstall } from './install.svelte';

export { install, installApp } from './install.svelte';

/** The caches of things fetched from elsewhere; the app's own files are kept apart and not cleared. */
const CLEARABLE_CACHES = ['map-tiles', 'terrain-tiles', 'map-styles'];

/** Registers the service worker; in a production build only, so development always runs fresh code. */
export function registerOffline(): void {
  watchInstall();
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // The worker sits at the site's root, next to the manifest every page links to.
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!manifest) return;
  const url = new URL('sw.js', manifest.href);
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url, { scope: new URL('./', url).pathname }).catch(() => {
      // Not supported here (e.g. a private window): the app works online as before.
    });
  });
}

/** Bytes this site keeps on the device, or undefined where the browser does not say. */
export async function offlineUsage(): Promise<number | undefined> {
  try {
    return (await navigator.storage?.estimate?.())?.usage;
  } catch {
    return undefined;
  }
}

/** Deletes the kept map and terrain tiles; the app itself stays available offline. */
export async function clearOfflineTiles(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await Promise.all(CLEARABLE_CACHES.map((name) => caches.delete(name)));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1e6) return `${Math.max(0, Math.round(bytes / 1e3))} kB`;
  return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
}
