#!/usr/bin/env node
// Downloads the countries of the world and writes them as a compact GeoJSON, the
// Eclipses map's background when it is offline and has no map tiles kept:
//
//   designs/eclipse/data/world.json   country outlines simplified to about 3 km, coordinates to 0.01°,
//                                     no attributes
//
// Source: Natural Earth 1:50m admin 0 countries (https://www.naturalearthdata.com), public domain.
// Usage: node scripts/fetch-world.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'designs/eclipse/data/world.json');
const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';

const round = (v) => Math.round(v * 100) / 100;
/** Points closer than this to the simplified line are dropped, in degrees. */
const TOLERANCE = 0.03;

/** Douglas-Peucker: the points of a line that keep its shape within TOLERANCE. */
function simplify(points) {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const len = Math.hypot(bx - ax, by - ay);
    let far = -1;
    let dist = TOLERANCE;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = points[i];
      const d = len ? Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / len : Math.hypot(x - ax, y - ay);
      if (d > dist) {
        dist = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** A ring simplified and rounded, without repeated points; undefined once too small to draw. */
function ring(points) {
  const out = [];
  for (const [lon, lat] of simplify(points)) {
    const p = [round(lon), round(lat)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out.length >= 4 ? out : undefined;
}

function polygon(rings) {
  const out = rings.map(ring);
  return out[0] ? out.filter(Boolean) : undefined;
}

const res = await fetch(URL);
if (!res.ok) throw new Error(`${res.status} ${URL}`);
const source = await res.json();

const polygons = [];
for (const f of source.features) {
  const g = f.geometry;
  const parts = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const p of parts) {
    const kept = polygon(p);
    if (kept) polygons.push(kept);
  }
}

const world = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polygons } };
await mkdir(dirname(OUT), { recursive: true });
const text = JSON.stringify(world);
await writeFile(OUT, text + '\n');
console.log(`${OUT}: ${polygons.length} polygons, ${(text.length / 1024).toFixed(0)} kB`);
