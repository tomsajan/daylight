#!/usr/bin/env node
// Downloads the data behind the eclipse engine and writes it as compact JSON:
//
//   src/core/eclipse/data/solar-eclipses.json   Besselian elements of every solar eclipse, 1980-2100
//   src/core/eclipse/data/lunar-eclipses.json   every lunar eclipse, 1980-2100: contacts, the Moon's path
//                                               through the Earth's shadow, and its place in the sky
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
import { AstroTime, Body, EquatorFromVector, GeoVector, Rotation_EQJ_EQD, RotateVector } from 'astronomy-engine';

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


// ---------------------------------------------------------------- lunar eclipses

/** Rows of NASA's lunar eclipse catalog: date, type, Saros, gamma and magnitudes. */
async function lunarCatalog() {
  const rows = [];
  for (const [file, range] of [['lecat1901.html', '1901-2000'], ['lecat2001.html', '2001-2100']]) {
    const text = plain(await cached(file, `${NASA}/LEcat5/LE${range}.html`));
    // 09706  2025 Mar 14  06:59:56     75    311  123   T   -p   0.3484  2.2595  1.1784  362.6  218.3   65.4    3N  102W
    const re =
      /^\s*\d{5}\s+(\d{4}) (\w{3}) (\d{2})\s+\d\d:\d\d:\d\d\s+-?\d+\s+-?\d+\s+(\d+)\s+([TPN][a-z+-]?)\s+\S+\s+(-?\d\.\d+)\s+(-?\d\.\d+)\s+(-?\d\.\d+)\s/gm;
    for (const m of text.matchAll(re)) {
      const year = Number(m[1]);
      if (year < FIRST_YEAR || year > LAST_YEAR) continue;
      rows.push({
        id: `${year}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[3]}`,
        saros: Number(m[4]),
        type: m[5][0],
        typeCode: m[5],
        gamma: Number(m[6]),
        penumbralMagnitude: Number(m[7]),
        umbralMagnitude: Number(m[8]),
      });
    }
  }
  return rows;
}

/**
 * The elements of NASA's Javascript Lunar Eclipse Explorer (Espenak and Meeus), by date: per
 * eclipse 22 numbers, see lunarEclipse() for their meaning.
 */
async function lunarElements() {
  const byDate = new Map();
  for (const period of ['LE1901', 'LE2001']) {
    const text = await cached(`${period}.js`, `${NASA}/JLEX/${period}.js`);
    for (const block of text.split(/^\/\/ (?=\d{4}\s+\d+\s+\d+\s*$)/m).slice(1)) {
      const [date, ...lines] = block.split('\n');
      const [y, mo, d] = date.trim().split(/\s+/).map(Number);
      const numbers = lines.join(' ').match(/-?\d+\.\d+(?:e-?\d+)?|-?\d+(?=\s*,)/g).map(Number).slice(0, 22);
      byDate.set(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, numbers);
    }
  }
  return byDate;
}

/** Geocentric apparent right ascension and declination of the Sun (degrees) at a Julian Day (TT). */
function sunAt(jdTT, aberration) {
  const time = AstroTime.FromTerrestrialTime(jdTT - 2451545);
  const v = RotateVector(Rotation_EQJ_EQD(time), GeoVector(Body.Sun, time, aberration));
  const eq = EquatorFromVector(v);
  return { ra: eq.ra * 15, dec: eq.dec };
}

/** Least-squares polynomial of a degree through (t, v) samples. */
function fit(ts, vs, degree) {
  const n = degree + 1;
  const a = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  ts.forEach((t, k) => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) a[i][j] += t ** (i + j);
      a[i][n] += vs[k] * t ** i;
    }
  });
  for (let i = 0; i < n; i++) {
    for (let r = i + 1; r < n; r++) {
      const f = a[r][i] / a[i][i];
      for (let c = i; c <= n; c++) a[r][c] -= f * a[i][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = a[i][n];
    for (let j = i + 1; j < n; j++) s -= a[i][j] * x[j];
    x[i] = s / a[i][i];
  }
  return x;
}

const RAD = Math.PI / 180;

/** The Moon (ra, dec) relative to the shadow axis (ra, dec): east and north, degrees on a tangent plane. */
function offset(moon, axis) {
  const [a, d, a0, d0] = [moon.ra * RAD, moon.dec * RAD, axis.ra * RAD, axis.dec * RAD];
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
  return {
    x: (Math.cos(d) * Math.sin(a - a0)) / cosc / RAD,
    y: (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc / RAD,
  };
}

/**
 * One lunar eclipse from NASA's elements and catalog row. The elements give, at t hours from
 * t0 (TT): the contacts, the Moon's right ascension and declination, its parallax and
 * semidiameter, and Greenwich sidereal time. The Earth's shadow is not in them: its axis is
 * taken from the Sun's place (astronomy-engine), its radii from NASA's magnitudes, so the Moon
 * passes through it as deep as NASA has it.
 */
function lunarEclipse(row, el) {
  const [jdGreatest, t0, deltaT, , , , gst, parallax, semidiameter, ...rest] = el;
  const contacts = rest.slice(0, 7).map((t, i) => (i !== 3 && t === 0 ? null : t));
  const [ra, dec] = [rest.slice(7, 10), rest.slice(10, 13)];
  const mid = contacts[3];
  const jd0 = jdGreatest - mid / 24;
  const poly = (c, t) => c[0] + t * (c[1] + t * c[2]);
  const start = contacts[0] - 0.5;
  const end = contacts[6] + 0.5;
  const ts = [];
  const xs = [];
  const ys = [];
  for (let t = start; t <= end + 1e-9; t += (end - start) / 40) {
    const sun = sunAt(jd0 + t / 24, true);
    const o = offset({ ra: poly(ra, t), dec: poly(dec, t) }, { ra: sun.ra + 180, dec: -sun.dec });
    ts.push(t);
    xs.push(o.x);
    ys.push(o.y);
  }
  const x = fit(ts, xs, 3);
  const y = fit(ts, ys, 3);
  const at = (t) => Math.hypot(poly3(x, t), poly3(y, t));
  // NASA's magnitudes at its greatest eclipse: how far the shadow's edges reach across the Moon.
  const s0 = at(mid);
  const umbra = s0 + (2 * row.umbralMagnitude - 1) * semidiameter;
  const penumbra = s0 + (2 * row.penumbralMagnitude - 1) * semidiameter;
  return {
    id: row.id,
    type: row.type,
    typeCode: row.typeCode,
    saros: row.saros,
    gamma: row.gamma,
    penumbralMagnitude: row.penumbralMagnitude,
    umbralMagnitude: row.umbralMagnitude,
    deltaT,
    jdGreatest,
    jd0: round(jd0, 6),
    contacts,
    gst,
    parallax,
    semidiameter,
    ra,
    dec,
    x: x.map((v) => round(v, 7)),
    y: y.map((v) => round(v, 7)),
    penumbra: round(penumbra, 6),
    umbra: round(umbra, 6),
  };
}

function poly3(c, t) {
  return c[0] + t * (c[1] + t * (c[2] + t * c[3]));
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
const lunarRows = await lunarCatalog();
const elements = await lunarElements();
const lunar = lunarRows.map((row) => {
  const el = elements.get(row.id);
  if (!el) throw new Error(`no lunar elements for ${row.id}`);
  return lunarEclipse(row, el);
});
await writeFile(join(OUT, 'lunar-eclipses.json'), JSON.stringify({ credit, eclipses: lunar }) + '\n');
console.log(`wrote ${lunar.length} lunar eclipses`);
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
