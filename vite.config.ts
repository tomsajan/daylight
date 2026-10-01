import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
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

export default defineConfig({
  plugins: [svelte()],
  base: './',
  resolve: {
    alias: { $core: resolve(root, 'src/core') },
  },
  server: { host: true },
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
