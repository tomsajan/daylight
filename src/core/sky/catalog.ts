/**
 * The night sky's catalogues: stars to magnitude 6, the constellations' figures, the Milky Way's
 * outline and the deep-sky targets. Written by scripts/fetch-sky.mjs; positions J2000, degrees.
 */
import starData from './data/stars.json';
import constellationData from './data/constellations.json';
import milkyWayData from './data/milkyway.json';
import dsoData from './data/dso.json';

const RAD = Math.PI / 180;

export type DsoType = 'galaxy' | 'open' | 'globular' | 'planetary' | 'nebula' | 'remnant' | 'dark' | 'star';

export const DSO_TYPE_NAMES: Record<DsoType, string> = {
  galaxy: 'Galaxy',
  open: 'Open cluster',
  globular: 'Globular cluster',
  planetary: 'Planetary nebula',
  nebula: 'Nebula',
  remnant: 'Supernova remnant',
  dark: 'Dark nebula',
  star: 'Star group',
};

export interface Dso {
  /** M31, NGC7000, IC434, B33, … */
  id: string;
  /** Common name, empty when it has none. */
  name: string;
  /** Catalogue designation: NGC 224, IC 434, Barnard 33. */
  desig: string;
  type: DsoType;
  ra: number;
  dec: number;
  /** Visual magnitude, null where not known (large nebulae). */
  mag: number | null;
  /** Major and minor axes in arcminutes and the position angle of the major axis, east of north. */
  size: [number | null, number | null, number | null];
  /** Constellation, IAU abbreviation. */
  con: string;
}

export interface Constellation {
  id: string;
  name: string;
  label: [number, number];
  /** Stick figure: polylines of [ra, dec]. */
  lines: [number, number][][];
}

export const STAR_CREDIT = starData.credit;
export const CONSTELLATION_CREDIT = constellationData.credit;
export const MILKY_WAY_CREDIT = milkyWayData.credit;
export const DSO_CREDIT = dsoData.credit;

/** [ra, dec, magnitude, B−V], brightest first. */
export const STARS = starData.stars as [number, number, number, number][];
/** Index into STARS, proper name. */
export const STAR_NAMES = new Map(starData.names as [number, string][]);
export const CONSTELLATIONS = constellationData.constellations as Constellation[];
/** Rings of [ra, dec] for each of five levels, faintest first. */
export const MILKY_WAY = milkyWayData.levels as [number, number][][][];
export const DSOS = dsoData.objects as Dso[];

/** Full names by abbreviation; Serpens' two parts under one. */
export const CONSTELLATION_NAMES = new Map(CONSTELLATIONS.map((c) => [c.id, c.name.replace(/ (Caput|Cauda)$/, '')]));

/** Unit vector of a J2000 position, x towards the equinox, z towards the north pole. */
export function unitVector(ra: number, dec: number): [number, number, number] {
  const a = ra * RAD;
  const d = dec * RAD;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

/** Star positions as unit vectors, x y z after each other, worked out once. */
export const STAR_VECTORS: Float64Array = (() => {
  const v = new Float64Array(STARS.length * 3);
  STARS.forEach(([ra, dec], i) => v.set(unitVector(ra, dec), i * 3));
  return v;
})();

/** A star's colour from its B−V index, as an RGB string (after Ballesteros' temperature formula). */
export function starColor(bv: number): string {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  // Rough blackbody colour, softened towards white, as stars look to the eye.
  let r: number;
  let g: number;
  let b: number;
  if (t >= 6600) {
    r = 255 * Math.pow(t / 100 - 60, -0.1332);
    g = 255 * Math.pow(t / 100 - 60, -0.0755) * 1.03;
    b = 255;
  } else {
    r = 255;
    g = 99.47 * Math.log(t / 100) - 161.12;
    b = t <= 1900 ? 0 : 138.5 * Math.log(t / 100 - 10) - 305;
  }
  const soft = (c: number) => Math.round(Math.max(0, Math.min(255, c)) * 0.55 + 255 * 0.45);
  return `rgb(${soft(r)} ${soft(g)} ${soft(b)})`;
}

/** The object's name for a list: "M31 Andromeda Galaxy", "NGC 7000 North America Nebula". */
export function dsoTitle(d: Dso): string {
  const id = d.id.startsWith('M') ? d.id : d.desig;
  return d.name && d.name !== id ? `${id} ${d.name}` : id;
}
