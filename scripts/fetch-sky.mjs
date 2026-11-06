// Writes the night sky's catalogues to src/core/sky/data/:
//
// - stars.json: every star to magnitude 6 (about 5000) with its colour, and the proper names of the
//   brighter ones, from d3-celestial (Olaf Frohn, BSD 3-clause; Hipparcos positions);
// - constellations.json: the 88 IAU constellations, their names, label points and stick figures,
//   from d3-celestial;
// - milkyway.json: the outline of the Milky Way in five steps of brightness, from d3-celestial,
//   thinned to about 0.4° between points;
// - dso.json: the Messier objects and a hand-picked list of other favourite deep-sky targets, with
//   their sizes and orientation, from OpenNGC (Mattia Verga, CC BY-SA 4.0).
//
// Positions are J2000. Run: node scripts/fetch-sky.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const D3 = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/';
const NGC = 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/';
const OUT = new URL('../src/core/sky/data/', import.meta.url);

/** Other favourite targets, by OpenNGC name, with a name of our own where OpenNGC has none or another. */
const EXTRA = {
  NGC7000: 'North America Nebula',
  IC5070: 'Pelican Nebula',
  NGC6960: 'Western Veil Nebula',
  NGC6992: 'Eastern Veil Nebula',
  NGC2237: 'Rosette Nebula',
  B033: 'Horsehead Nebula',
  IC0434: 'Horsehead region (IC 434)',
  NGC2024: 'Flame Nebula',
  NGC1977: 'Running Man Nebula',
  NGC1499: 'California Nebula',
  IC1805: 'Heart Nebula',
  IC1848: 'Soul Nebula',
  NGC0869: 'Double Cluster (h Persei)',
  NGC0884: 'Double Cluster (χ Persei)',
  NGC7023: 'Iris Nebula',
  IC1396: "Elephant's Trunk Nebula",
  IC5146: 'Cocoon Nebula',
  NGC6888: 'Crescent Nebula',
  NGC7635: 'Bubble Nebula',
  NGC7293: 'Helix Nebula',
  NGC6543: "Cat's Eye Nebula",
  NGC0253: 'Sculptor Galaxy',
  NGC4631: 'Whale Galaxy',
  NGC4565: 'Needle Galaxy',
  NGC3628: 'Hamburger Galaxy',
  NGC3372: 'Carina Nebula',
  NGC5139: 'Omega Centauri',
  NGC0104: '47 Tucanae',
  NGC2070: 'Tarantula Nebula',
  NGC5128: 'Centaurus A',
  NGC4755: 'Jewel Box',
  NGC0281: 'Pacman Nebula',
  NGC7380: 'Wizard Nebula',
  IC0410: 'Tadpoles Nebula',
  IC2177: 'Seagull Nebula',
  NGC2359: "Thor's Helmet",
  NGC2264: 'Christmas Tree Cluster and Cone Nebula',
  IC0063: 'Ghost of Cassiopeia',
  NGC6946: 'Fireworks Galaxy',
  NGC2403: 'NGC 2403',
  NGC0891: 'Silver Sliver Galaxy',
  NGC7331: 'NGC 7331',
  NGC2392: 'Eskimo Nebula',
  NGC3242: 'Ghost of Jupiter',
  NGC6302: 'Bug Nebula',
  NGC6357: 'War and Peace Nebula',
  NGC6334: "Cat's Paw Nebula",
  IC4628: 'Prawn Nebula',
  IC2944: 'Running Chicken Nebula',
  IC2602: 'Southern Pleiades',
  NGC1365: 'Great Barred Spiral',
  NGC2997: 'NGC 2997',
  NGC4945: 'NGC 4945',
  IC0405: 'Flaming Star Nebula',
  IC0443: 'Jellyfish Nebula',
  IC2118: 'Witch Head Nebula',
  IC4604: 'Rho Ophiuchi clouds',
  'ESO056-115': 'Large Magellanic Cloud',
  NGC0292: 'Small Magellanic Cloud',
  NGC0300: 'NGC 300',
  NGC6939: 'NGC 6939',
  NGC0457: 'Owl Cluster',
  NGC0752: 'NGC 752',
  NGC7789: "Caroline's Rose",
};

/** Where OpenNGC's entry is for a part of the object (a cluster in it, its brightest knot) or its type is unusual. */
const FIXES = {
  IC1396: { size: [170, 140, null] },
  NGC6357: { size: [50, 40, null] },
  NGC6334: { type: 'nebula', size: [40, 30, null] },
};

/** Messier objects OpenNGC names differently or not at all. */
const MESSIER_NAMES = {
  1: 'Crab Nebula',
  8: 'Lagoon Nebula',
  13: 'Great Hercules Cluster',
  16: 'Eagle Nebula',
  17: 'Omega Nebula',
  20: 'Trifid Nebula',
  27: 'Dumbbell Nebula',
  31: 'Andromeda Galaxy',
  33: 'Triangulum Galaxy',
  42: 'Orion Nebula',
  44: 'Beehive Cluster',
  45: 'Pleiades',
  51: 'Whirlpool Galaxy',
  57: 'Ring Nebula',
  63: 'Sunflower Galaxy',
  64: 'Black Eye Galaxy',
  74: 'Phantom Galaxy',
  76: 'Little Dumbbell Nebula',
  81: "Bode's Galaxy",
  82: 'Cigar Galaxy',
  83: 'Southern Pinwheel Galaxy',
  97: 'Owl Nebula',
  101: 'Pinwheel Galaxy',
  104: 'Sombrero Galaxy',
};

/** OpenNGC's object types, grouped as they are drawn and filtered. */
const TYPES = {
  G: 'galaxy',
  GPair: 'galaxy',
  GTrpl: 'galaxy',
  GGroup: 'galaxy',
  OCl: 'open',
  '*Ass': 'open',
  GCl: 'globular',
  PN: 'planetary',
  HII: 'nebula',
  EmN: 'nebula',
  Neb: 'nebula',
  RfN: 'nebula',
  'Cl+N': 'nebula',
  SNR: 'remnant',
  DrkN: 'dark',
  '**': 'star',
  '*': 'star',
  Other: 'star',
};

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
/** d3-celestial's longitudes run -180..180; right ascension 0..360. */
const ra = (lon) => round(((lon % 360) + 360) % 360, 3);

async function get(url, json = true) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return json ? r.json() : r.text();
}

function sexagesimal(s, hours) {
  const sign = s.trim().startsWith('-') ? -1 : 1;
  const [a, b, c] = s.replace(/^[+-]/, '').split(':').map(Number);
  return sign * (a + b / 60 + c / 3600) * (hours ? 15 : 1);
}

async function stars() {
  const [data, names] = await Promise.all([get(D3 + 'stars.6.json'), get(D3 + 'starnames.json')]);
  const list = data.features
    .map((f) => ({ id: f.id, ra: ra(f.geometry.coordinates[0]), dec: round(f.geometry.coordinates[1], 3), mag: f.properties.mag, bv: Number(f.properties.bv) }))
    .filter((s) => s.mag <= 6)
    .sort((a, b) => a.mag - b.mag);
  // Proper names for the stars bright enough to be labelled; Bayer letters with the constellation for the rest.
  const named = [];
  list.forEach((s, i) => {
    const n = names[s.id];
    if (n?.name && s.mag < 3.2) named.push([i, n.name]);
  });
  return {
    credit: 'Stars: d3-celestial (Olaf Frohn, BSD 3-clause), Hipparcos positions.',
    // ra, dec (J2000, degrees), magnitude, B-V colour index.
    stars: list.map((s) => [s.ra, s.dec, s.mag, Number.isFinite(s.bv) ? round(s.bv, 2) : 0.6]),
    names: named,
  };
}

async function constellations() {
  const [info, lines] = await Promise.all([get(D3 + 'constellations.json'), get(D3 + 'constellations.lines.json')]);
  const figures = new Map(lines.features.map((f) => [f.id, f.geometry.coordinates]));
  return {
    credit: 'Constellations: d3-celestial (Olaf Frohn, BSD 3-clause).',
    // Serpens comes in two parts, Caput and Cauda, each with its label; the figure goes with the first.
    constellations: info.features.map((f, i, all) => ({
      id: f.id,
      name: f.properties.name,
      label: [ra(f.geometry.coordinates[0]), round(f.geometry.coordinates[1], 2)],
      lines: all.findIndex((g) => g.id === f.id) === i ? (figures.get(f.id) ?? []).map((l) => l.map(([lon, lat]) => [ra(lon), round(lat, 3)])) : [],
    })),
  };
}

/** Drops points closer than `step` degrees to the last one kept. */
function thin(ring, step) {
  const out = [ring[0]];
  for (const p of ring.slice(1)) {
    const q = out[out.length - 1];
    const dx = (p[0] - q[0]) * Math.cos((p[1] * Math.PI) / 180);
    if (Math.hypot(dx, p[1] - q[1]) >= step) out.push(p);
  }
  return out;
}

async function milkyWay() {
  const data = await get(D3 + 'mw.json');
  return {
    credit: 'Milky Way outline: d3-celestial (Olaf Frohn, BSD 3-clause).',
    // Five levels, faintest first; each a list of rings of [ra, dec].
    levels: data.features.map((f) =>
      f.geometry.coordinates
        .flat()
        .map((ring) => thin(ring, 0.4).map(([lon, lat]) => [round(((lon % 360) + 360) % 360, 2), round(lat, 2)]))
        .filter((ring) => ring.length >= 4),
    ),
  };
}

function parseCsv(text) {
  const [head, ...rows] = text.trim().split('\n');
  const keys = head.split(';');
  return rows.map((r) => Object.fromEntries(r.split(';').map((v, i) => [keys[i], v])));
}

async function deepSky() {
  const rows = [...parseCsv(await get(NGC + 'NGC.csv', false)), ...parseCsv(await get(NGC + 'addendum.csv', false))];
  const byName = new Map(rows.map((r) => [r.Name, r]));
  const out = [];
  const num = (v) => (v === '' || v === undefined ? null : Number(v));
  const designation = (name) => name.replace(/^(NGC|IC)0*(\d+)/, '$1 $2').replace(/^B0*(\d+)/, 'Barnard $1').replace(/^Mel0*(\d+)/, 'Melotte $1');
  function add(r, id, name) {
    const type = TYPES[r.Type];
    if (!type) throw new Error(`${r.Name}: type ${r.Type}`);
    out.push({
      id,
      name: name ?? '',
      desig: designation(r.Name),
      type,
      ra: round(sexagesimal(r.RA, true), 4),
      dec: round(sexagesimal(r.Dec, false), 4),
      mag: num(r['V-Mag']) ?? num(r['B-Mag']),
      // Major and minor axes in arcminutes, position angle east of north.
      size: [num(r.MajAx), num(r.MinAx), num(r.PosAng)],
      con: r.Const,
      ...FIXES[r.Name],
    });
  }
  const messier = rows.filter((r) => r.M && r.Type !== 'Dup').map((r) => [Number(r.M), r]);
  // M102 is not certain; most take it to be the Spindle Galaxy.
  if (!messier.some(([m]) => m === 102)) messier.push([102, byName.get('NGC5866')]);
  messier.sort((a, b) => a[0] - b[0]);
  for (const [m, r] of messier) {
    const common = r['Common names']?.split(',')[0] || '';
    add(r, `M${m}`, MESSIER_NAMES[m] ?? (m === 102 ? 'Spindle Galaxy' : common));
  }
  const missing = [];
  for (const [key, name] of Object.entries(EXTRA)) {
    let r = byName.get(key);
    // A duplicate entry points to the main one.
    if (r?.Type === 'Dup') r = byName.get(r.NGC ? `NGC${r.NGC.padStart(4, '0')}` : `IC${r.IC.padStart(4, '0')}`);
    if (!r) missing.push(key);
    else add(r, key.replace(/^([A-Z]+)0+(\d)/, '$1$2'), name);
  }
  if (missing.length) console.warn('Not in OpenNGC:', missing.join(', '));
  return {
    credit: 'Deep-sky objects: OpenNGC (Mattia Verga, CC BY-SA 4.0).',
    objects: out,
  };
}

mkdirSync(OUT, { recursive: true });
const write = (name, data) => {
  const text = JSON.stringify(data);
  writeFileSync(new URL(name, OUT), text + '\n');
  console.log(name, (text.length / 1024).toFixed(0), 'kB');
};
write('stars.json', await stars());
write('constellations.json', await constellations());
write('milkyway.json', await milkyWay());
write('dso.json', await deepSky());
