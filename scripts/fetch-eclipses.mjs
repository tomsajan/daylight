#!/usr/bin/env node
// Downloads the data behind the eclipse engine and writes it as compact JSON:
//
//   src/core/eclipse/data/solar-eclipses.json   Besselian elements of every solar eclipse, 1980-2100
//   src/core/eclipse/data/delta-t.json          measured ΔT (TT - UT1), monthly since 1962
//
// Sources:
//   Eclipse predictions by Fred Espenak, NASA's GSFC (https://eclipse.gsfc.nasa.gov). Free to reproduce
//   with that acknowledgment.
//   Earth orientation (UT1 - UTC) and leap seconds from the IERS (https://www.iers.org).
//
// Raw pages are cached in .cache/eclipses/, so a rerun only downloads what is missing.
// Usage: node scripts/fetch-eclipses.mjs

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache/eclipses');
const OUT = join(ROOT, 'src/core/eclipse/data');
const NASA = 'https://eclipse.gsfc.nasa.gov';
const FIRST_YEAR = 1980;
const LAST_YEAR = 2100;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function cached(name, url) {
  const file = join(CACHE, name);
  if (existsSync(file)) return readFile(file, 'utf8');
  await new Promise((r) => setTimeout(r, 300)); // be gentle with the servers
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
  return text;
}

/** HTML to plain text: tags removed, the entities these pages use decoded. */
function plain(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&Delta;/g, 'Δ')
    .replace(/&mu;/g, 'μ')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function num(text, re, what) {
  const m = text.match(re);
  if (!m) throw new Error(`no ${what}`);
  return Number(m[1]);
}

/** "25°30.3'N" → 25.505 */
function angle(deg, min, hemi) {
  const v = Number(deg) + Number(min) / 60;
  return hemi === 'S' || hemi === 'W' ? -v : v;
}

// ---------------------------------------------------------------- eclipse list

/** Rows of NASA's catalog: date, type and the catalog figures. */
async function catalog() {
  const rows = [];
  for (const [file, range] of [['cat1901.html', '1901-2000'], ['cat2001.html', '2001-2100']]) {
    const text = plain(await cached(file, `${NASA}/SEcat5/SE${range}.html`));
    // 09568  2027 Aug 02  10:07:50     76    341  136   T   nn   0.1421  1.0790  26N  33E  82  258  06m23s
    const re =
      /^\s*\d{5}\s+(\d{4}) (\w{3}) (\d{2})\s+(\d\d:\d\d:\d\d)\s+(-?\d+)\s+(-?\d+)\s+(\d+)\s+([TAHP][a-z0-9+-]?)\s+\S+\s+(-?\d\.\d+)\s+(\d\.\d+)\s+(\d+)([NS])\s+(\d+)([EW])\s+(\d+)\s*(\d*)\s*(\S*)\s*$/gm;
    for (const m of text.matchAll(re)) {
      const year = Number(m[1]);
      if (year < FIRST_YEAR || year > LAST_YEAR) continue;
      rows.push({
        year,
        month: m[2],
        day: m[3],
        type: m[8][0],
        typeCode: m[8],
        saros: Number(m[7]),
        gamma: Number(m[9]),
        magnitude: Number(m[10]),
        lat: Number(m[11]) * (m[12] === 'S' ? -1 : 1),
        lon: Number(m[13]) * (m[14] === 'W' ? -1 : 1),
        sunAlt: Number(m[15]),
        pathWidth: m[16] ? Number(m[16]) : undefined,
        duration: m[17] ? duration(m[17]) : undefined,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- elements

function elementsUrl({ year, month, day, type }) {
  const half = year <= 1950 ? 1901 : year <= 2000 ? 1951 : year <= 2050 ? 2001 : 2051;
  return `${NASA}/SEbeselm/SEbeselm${half}/SE${year}${month}${day}${type}beselm.html`;
}

function parseElements(html, row) {
  const t = plain(html);
  const polynomial = (n) => {
    const m = t.match(new RegExp(`^\\s+${n}((?:\\s+-?\\d+\\.\\d+)+)\\s*$`, 'm'));
    if (!m) throw new Error(`no polynomial row ${n}`);
    return m[1].trim().split(/\s+/).map(Number);
  };
  const [r0, r1, r2, r3] = [0, 1, 2, 3].map(polynomial);
  const t0 = num(t, /t0 =\s+(\d+\.\d+) TDT/, 't0');
  const valid = t.match(/valid over the period\s+(-?\d+\.\d+)\s*≤\s*t0\s*≤\s*(-?\d+\.\d+)/);
  const ge = t.match(/Instant of\s+(\d\d):(\d\d):(\d\d\.\d) TDT\s+J\.D\. = (\d+\.\d+)/);
  if (!valid || !ge) throw new Error('no validity or greatest eclipse');
  const jdGreatest = Number(ge[4]);
  // JD of 0h TT on the eclipse date, from the greatest-eclipse JD and its clock time.
  const jd0 = jdGreatest - (Number(ge[1]) + Number(ge[2]) / 60 + Number(ge[3]) / 3600) / 24;

  const e = {
    id: `${row.year}-${String(MONTHS.indexOf(row.month) + 1).padStart(2, '0')}-${row.day}`,
    type: row.type,
    typeCode: row.typeCode,
    saros: row.saros,
    sarosMember: num(t, /Saros Series =\s+\d+ \(\s*(\d+)\//, 'saros member'),
    gamma: num(t, /Gamma =\s+(-?\d+\.\d+)/, 'gamma'),
    magnitude: num(t, /Eclipse Magnitude =\s+(\d+\.\d+)/, 'magnitude'),
    deltaT: num(t, /ΔT =\s+(-?\d+\.\d+) s/, 'ΔT'),
    jdGreatest: round(jdGreatest, 6),
    jd0: round(jd0 + t0 / 24, 6),
    // The fit spans six hours around t0 and may run past midnight ("19.00 ≤ t0 ≤ 1.00").
    range: [Number(valid[1]), Number(valid[2])].map((v) => ((v - t0 + 36) % 24) - 12),
    x: [r0[0], r1[0], r2[0], r3[0]],
    y: [r0[1], r1[1], r2[1], r3[1]],
    d: [r0[2], r1[2], r2[2]],
    l1: [r0[3], r1[3], r2[3]],
    l2: [r0[4], r1[4], r2[4]],
    mu: [r0[5], r1[5], r2[5] ?? 0],
    tanF1: num(t, /Tan ƒ1 = (\d\.\d+)/, 'tan f1'),
    tanF2: num(t, /Tan ƒ2 = (\d\.\d+)/, 'tan f2'),
    // The catalog's rounded figures, replaced below by the page's finer ones where it has them.
    greatest: { lat: row.lat, lon: row.lon, sunAlt: row.sunAlt, pathWidth: row.pathWidth, duration: row.duration },
  };

  // Most central eclipses also list the point and duration of greatest eclipse to a tenth of an arcminute.
  const g = t.match(
    /Greatest Eclipse:\s+Time =\s+[\d:.]+ UT\s+Lat =\s+(\d+)°\s*([\d.]+)'([NS])\s+Long =\s+(\d+)°\s*([\d.]+)'([EW])\s+\(GE\)\s+Sun Altitude =\s+([\d.]+)°\s+Path Width =\s+([\d.]+) km\s+Sun Azimuth =\s+([\d.]+)°\s+Central Duration =\s+(\d+)m([\d.]+)s/,
  );
  if (g) {
    e.greatest = {
      lat: round(angle(g[1], g[2], g[3]), 4),
      lon: round(angle(g[4], g[5], g[6]), 4),
      sunAlt: Number(g[7]),
      pathWidth: Number(g[8]),
      duration: Number(g[10]) * 60 + Number(g[11]),
    };
  }
  return e;
}

/** "06m23s" → 383 */
function duration(text) {
  const m = text.match(/^(\d+)m([\d.]+)s$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}

function round(v, digits) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

// ---------------------------------------------------------------- test fixtures

/** NASA path tables the tests compare against: total, annular, hybrid, and one near sunrise. */
const TEST_PATHS = ['1999Aug11T', '2023Apr20H', '2023Oct14A', '2024Apr08T', '2026Aug12T', '2027Aug02T'];

/** Rows of a path table: time (UT), limits, central line, and the Sun's altitude, path width and duration there. */
async function pathTable(name) {
  const year = Number(name.slice(0, 4));
  const half = year <= 2000 ? 1951 : year <= 2050 ? 2001 : 2051;
  const text = plain(await cached(`SE${name}path.html`, `${NASA}/SEpath/SEpath${half}/SE${name}path.html`));
  const ll = String.raw`(\d+) (\d+\.\d)([NS]) (\d+) (\d+\.\d)([EW])`;
  const re = new RegExp(String.raw`^\s*(\d\d):(\d\d)\s+${ll}\s+${ll}\s+${ll}\s+[\d.]+\s+(\d+)\s+\d+\s+(\d+)\s+(\d+)m([\d.]+)s`, 'gm');
  const point = (m, i) => [round(angle(m[i], m[i + 1], m[i + 2]), 4), round(angle(m[i + 3], m[i + 4], m[i + 5]), 4)];
  return [...text.matchAll(re)].map((m) => ({
    ut: `${m[1]}:${m[2]}`,
    north: point(m, 3),
    south: point(m, 9),
    central: point(m, 15),
    sunAlt: Number(m[21]),
    width: Number(m[22]),
    duration: Number(m[23]) * 60 + Number(m[24]),
  }));
}

// ---------------------------------------------------------------- ΔT

/** Monthly ΔT = 32.184 s + (TAI - UTC) - (UT1 - UTC), from the IERS C04 series. */
async function deltaT() {
  const leaps = plain(await cached('leap-seconds.dat', 'https://hpiers.obspm.fr/iers/bul/bulc/Leap_Second.dat'))
    .split('\n')
    .filter((l) => /^\s*\d+\.0\s/.test(l))
    .map((l) => l.trim().split(/\s+/).map(Number))
    .map(([mjd, , , , taiUtc]) => ({ mjd, taiUtc }));
  const eop = await cached(
    'eop-c04.txt',
    'https://datacenter.iers.org/data/latestVersion/EOP_14_C04_IAU1980_one_file_1962-now.txt',
  );
  const values = [];
  let first;
  for (const line of eop.split('\n')) {
    const m = line.match(/^(\d{4})\s+(\d+)\s+1\s+(\d+)\s+\S+\s+\S+\s+(-?\d+\.\d+)/);
    if (!m) continue;
    const [year, month, mjd, ut1Utc] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    // Before 1972 UTC was not stepped in whole seconds; those years are only kept for continuity.
    const taiUtc = leaps.filter((l) => l.mjd <= mjd).at(-1)?.taiUtc ?? 10;
    first ??= year + (month - 1) / 12;
    values.push(round(32.184 + taiUtc - ut1Utc, 2));
  }
  return { start: first, step: 1 / 12, values };
}

// ---------------------------------------------------------------- main

const rows = await catalog();
console.log(`${rows.length} eclipses ${FIRST_YEAR}-${LAST_YEAR}`);
const eclipses = [];
for (const row of rows) {
  const url = elementsUrl(row);
  const html = await cached(url.slice(url.lastIndexOf('/') + 1), url);
  eclipses.push(parseElements(html, row));
}
await mkdir(OUT, { recursive: true });
const credit = 'Eclipse Predictions by Fred Espenak, NASA\'s GSFC';
await writeFile(join(OUT, 'solar-eclipses.json'), JSON.stringify({ credit, eclipses }) + '\n');
const dt = await deltaT();
await writeFile(
  join(OUT, 'delta-t.json'),
  JSON.stringify({ credit: 'IERS EOP 14 C04 and Bulletin C', ...dt }) + '\n',
);
console.log(`wrote ${eclipses.length} eclipses, ${dt.values.length} months of ΔT`);

const paths = {};
for (const name of TEST_PATHS) paths[name] = await pathTable(name);
await writeFile(join(ROOT, 'src/core/eclipse/testdata/nasa-paths.json'), JSON.stringify(paths) + '\n');
console.log(`wrote path tables: ${TEST_PATHS.map((n) => `${n} ${paths[n].length} rows`).join(', ')}`);
