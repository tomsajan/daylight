import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));

// Every folder in designs/ with an index.html becomes its own page,
// so design variants can be added without touching this file.
const designPages = Object.fromEntries(
  readdirSync(resolve(root, 'designs'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(root, 'designs', d.name, 'index.html')))
    .map((d) => [d.name, resolve(root, 'designs', d.name, 'index.html')]),
);

const DAY = 24 * 3600;

/**
 * What the app fetches from elsewhere, and its own largest images, kept as they are used and never fetched ahead.
 * Tiles are capped by count and age, oldest dropped first, so the store stays within
 * some tens of MB; the browser may also clear it when the device runs short of space.
 * Place search is not kept: it needs the network.
 * The cache names are listed in src/core/offline/storage.ts, which clears them.
 */
const RUNTIME_CACHING = [
  {
    // The globe's sharper day and night images, on devices that load them; their names change with their content.
    urlPattern: /\/assets\/[\w-]+-8k-[\w-]+\.jpg$/,
    handler: 'CacheFirst' as const,
    options: { cacheName: 'globe-images', expiration: { maxEntries: 4, purgeOnQuotaError: true } },
  },
  {
    urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
    handler: 'StaleWhileRevalidate' as const,
    options: { cacheName: 'fonts', expiration: { maxEntries: 40, maxAgeSeconds: 365 * DAY } },
  },
  {
    // Map styles, their tile index, sprites and label glyphs: fresh when online.
    urlPattern: /^https:\/\/tiles\.openfreemap\.org\/(styles|fonts|sprites|planet\/?$)/,
    handler: 'NetworkFirst' as const,
    options: {
      cacheName: 'map-styles',
      networkTimeoutSeconds: 4,
      expiration: { maxEntries: 300, maxAgeSeconds: 90 * DAY, purgeOnQuotaError: true },
    },
  },
  {
    urlPattern: /^https:\/\/(tiles\.openfreemap\.org\/planet\/|tiles\.maps\.eox\.at\/|api\.mapy\.com\/v1\/maptiles\/)/,
    handler: 'CacheFirst' as const,
    options: {
      cacheName: 'map-tiles',
      expiration: { maxEntries: 1000, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true },
    },
  },
  {
    // The globe's sharper pictures when zoomed in: 500 m tiles from NASA GIBS, 5-150 kB each.
    urlPattern: /^https:\/\/gibs\.earthdata\.nasa\.gov\/wmts\//,
    handler: 'CacheFirst' as const,
    options: {
      cacheName: 'globe-tiles',
      expiration: { maxEntries: 600, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true },
    },
  },
  {
    // One place's horizon reads 100-200 of these.
    urlPattern: /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\//,
    handler: 'CacheFirst' as const,
    options: {
      cacheName: 'terrain-tiles',
      expiration: { maxEntries: 400, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true },
    },
  },
];

export default defineConfig({
  plugins: [
    svelte(),
    // A service worker that keeps the whole site on the device, so it opens offline.
    // Registered from src/core/offline, the manifest is public/manifest.webmanifest:
    // the plugin's own versions assume every page sits at the root.
    VitePWA({
      injectRegister: null,
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{html,js,css,json,jpg,png,svg,webmanifest}'],
        // The globe's 8192 wide images are kept when first loaded instead (see RUNTIME_CACHING):
        // a device that cannot take them uses the 4096 wide ones, which are here.
        globIgnores: ['**/*-8k-*.jpg'],
        // The largest chunk (three.js) and the globe's day texture.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // The state is in the query string: any page with any query is the cached page.
        ignoreURLParametersMatching: [/./],
        cleanupOutdatedCaches: true,
        // A new version takes over at once rather than when every tab has closed.
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: RUNTIME_CACHING,
      },
    }),
  ],
  base: './',
  resolve: {
    alias: { $core: resolve(root, 'src/core') },
  },
  server: { host: true },
  // MapLibre's worker is an ES module.
  worker: { format: 'es' },
  build: {
    // three.js + time zone boundaries; ~190 kB gzipped, fine for this app.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: { main: resolve(root, 'index.html'), ...designPages },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
