/**
 * Lunar eclipses: the Moon passing through the Earth's shadow. Unlike a solar
 * eclipse it looks the same from everywhere the Moon is up, so the contacts are
 * single instants for the whole Earth and a place only decides how much of the
 * eclipse happens with the Moon above its horizon.
 *
 * The data (./lunar-catalog) is NASA's: contact times, magnitudes and the
 * Moon's place in the sky as polynomials in t, hours from t0 (TT), as for the
 * solar elements. The Moon's path relative to the shadow's centre is fitted to
 * the Sun's position and the shadow's radii follow from NASA's magnitudes;
 * contacts worked out from that geometry agree with NASA's within seconds.
 *
 * Conventions as in the rest of the core: degrees, east-positive longitudes,
 * time as Unix milliseconds (UTC).
 */

import { DEG, RAD, elementTimeToMs, eclipseDeltaT, msToElementTime } from './elements';
import { observerConstants, type Observer } from './local';

/** Total (the whole Moon in the umbra), partial (part of it), penumbral (the umbra missed). */
export type LunarEclipseType = 'T' | 'P' | 'N';

export interface LunarEclipse {
  /** Date of greatest eclipse, "YYYY-MM-DD". */
  id: string;
  type: LunarEclipseType;
  /** NASA's type code, e.g. "T+" or "Nx"; the second character refines the type. */
  typeCode: string;
  saros: number;
  /** Least distance of the Moon's centre from the shadow axis, Earth equatorial radii; positive north. */
  gamma: number;
  /** Fraction of the Moon's diameter in the penumbra and in the umbra at greatest eclipse (negative: short of it). */
  penumbralMagnitude: number;
  umbralMagnitude: number;
  /** ΔT NASA used, seconds. */
  deltaT: number;
  /** Julian Day (TT) of greatest eclipse. */
  jdGreatest: number;
  /** Julian Day (TT) of t0. */
  jd0: number;
  /** P1, U1, U2, greatest, U3, U4, P4: hours from t0, null for a contact the eclipse does not have. */
  contacts: (number | null)[];
  /** Greenwich sidereal time, hours, at the UT clock time t0. */
  gst: number;
  /** The Moon's horizontal parallax and semidiameter, degrees. */
  parallax: number;
  semidiameter: number;
  /** The Moon's right ascension and declination, degrees, as quadratics in t. */
  ra: number[];
  dec: number[];
  /** The Moon's centre relative to the shadow axis, east and north on the sky, degrees, as cubics in t. */
  x: number[];
  y: number[];
  /** Radii of the penumbra and umbra where the Moon crosses them, degrees. */
  penumbra: number;
  umbra: number;
}

export const LUNAR_CONTACTS = ['P1', 'U1', 'U2', 'Greatest', 'U3', 'U4', 'P4'] as const;
export type LunarContactName = (typeof LUNAR_CONTACTS)[number];

export const LUNAR_CONTACT_LABELS: Record<LunarContactName, string> = {
  P1: 'Penumbral eclipse begins',
  U1: 'Partial eclipse begins',
  U2: 'Totality begins',
  Greatest: 'Greatest eclipse',
  U3: 'Totality ends',
  U4: 'Partial eclipse ends',
  P4: 'Penumbral eclipse ends',
};

/** Sidereal degrees the Earth turns per hour of UT. */
const SIDEREAL_DEG_PER_HOUR = 15 * 1.00273791;

function poly(c: number[], t: number): number {
  let v = 0;
  for (let i = c.length - 1; i >= 0; i--) v = v * t + c[i];
  return v;
}

/** Element time t of a contact, or undefined. */
export function contactTime(e: LunarEclipse, name: LunarContactName): number | undefined {
  return e.contacts[LUNAR_CONTACTS.indexOf(name)] ?? undefined;
}

export interface LunarContact {
  name: LunarContactName;
  /** Unix milliseconds, UT. */
  time: number;
}

/** The contacts this eclipse has, in order. */
export function lunarContacts(e: LunarEclipse, dT = eclipseDeltaT(e)): LunarContact[] {
  return LUNAR_CONTACTS.flatMap((name, i) => {
    const t = e.contacts[i];
    return t === null ? [] : [{ name, time: elementTimeToMs(e, t, dT) }];
  });
}

/** First to last contact, Unix milliseconds. */
export function lunarSpan(e: LunarEclipse, dT = eclipseDeltaT(e)): { start: number; end: number } {
  return { start: elementTimeToMs(e, e.contacts[0]!, dT), end: elementTimeToMs(e, e.contacts[6]!, dT) };
}

/**
 * The phase the eclipse is about: from U1 to U4, or the whole penumbral eclipse
 * when the Moon misses the umbra. Element times.
 */
export function mainPhase(e: LunarEclipse): [number, number] {
  return e.contacts[1] !== null ? [e.contacts[1]!, e.contacts[5]!] : [e.contacts[0]!, e.contacts[6]!];
}

/** The Moon's geocentric right ascension and declination, degrees, at element time t. */
export function moonAt(e: LunarEclipse, t: number): { ra: number; dec: number } {
  return { ra: poly(e.ra, t), dec: poly(e.dec, t) };
}

/** Greenwich hour angle of the Moon, degrees, at element time t. */
export function moonGreenwichHourAngle(e: LunarEclipse, t: number, dT: number): number {
  return 15 * e.gst + (t - dT / 3600) * SIDEREAL_DEG_PER_HOUR - poly(e.ra, t);
}

/** Where the Moon is overhead at an instant. */
export function subLunarPoint(e: LunarEclipse, ms: number, dT = eclipseDeltaT(e)): { lat: number; lon: number } {
  const t = msToElementTime(e, ms, dT);
  const lon = -moonGreenwichHourAngle(e, t, dT);
  // Geocentric declination to the geodetic latitude under it.
  const lat = Math.atan(Math.tan(poly(e.dec, t) * RAD) / 0.99330562) * DEG;
  return { lat, lon: ((((lon + 180) % 360) + 360) % 360) - 180 };
}

export interface MoonPlace {
  /** Topocentric altitude of the Moon's centre, without refraction, degrees. */
  altitude: number;
  azimuth: number;
  /** Parallactic angle: from the direction of the north celestial pole to the zenith, degrees. */
  parallactic: number;
  /** Above the horizon: upper limb risen, refraction included. */
  visible: boolean;
}

/** The Moon's altitude at which its upper limb is on the horizon, refraction included. */
export function moonHorizon(e: LunarEclipse): number {
  return -0.5667 - e.semidiameter;
}

export function moonPlace(e: LunarEclipse, observer: Observer, ms: number, dT = eclipseDeltaT(e)): MoonPlace {
  const t = msToElementTime(e, ms, dT);
  const o = observerConstants(observer);
  const phi = observer.lat * RAD;
  const dec = poly(e.dec, t) * RAD;
  const h = (moonGreenwichHourAngle(e, t, dT) + observer.lon) * RAD;
  const geocentric = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
  // Seen from the surface the Moon sits lower by the parallax, up to a degree at the horizon.
  const rho = Math.hypot(o.rhoSin, o.rhoCos);
  const altitude = (geocentric - Math.asin(rho * Math.sin(e.parallax * RAD) * Math.cos(geocentric))) * DEG;
  const az = Math.atan2(-Math.cos(dec) * Math.sin(h), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(h));
  const q = Math.atan2(Math.sin(h), Math.tan(phi) * Math.cos(dec) - Math.sin(dec) * Math.cos(h));
  return {
    altitude,
    azimuth: (((az * DEG) % 360) + 360) % 360,
    parallactic: q * DEG,
    visible: altitude > moonHorizon(e),
  };
}

export interface ShadowView {
  /** The Moon's centre relative to the shadow axis, east and north on the sky, degrees. */
  x: number;
  y: number;
  /** Radii of penumbra, umbra and the Moon, degrees. */
  penumbra: number;
  umbra: number;
  moon: number;
  /** Fraction of the Moon's diameter inside the umbra and the penumbra (negative: outside). */
  umbralMagnitude: number;
  penumbralMagnitude: number;
}

/** The Moon in the Earth's shadow at an instant: the same for everyone who can see it. */
export function shadowView(e: LunarEclipse, ms: number, dT = eclipseDeltaT(e)): ShadowView {
  const t = msToElementTime(e, ms, dT);
  const x = poly(e.x, t);
  const y = poly(e.y, t);
  const s = Math.hypot(x, y);
  const k = e.semidiameter;
  return {
    x,
    y,
    penumbra: e.penumbra,
    umbra: e.umbra,
    moon: k,
    umbralMagnitude: (e.umbra + k - s) / (2 * k),
    penumbralMagnitude: (e.penumbra + k - s) / (2 * k),
  };
}

export interface LocalLunarContact extends LunarContact, MoonPlace {}

export interface MoonEvent extends MoonPlace {
  time: number;
}

export interface LocalLunarEclipse {
  eclipse: LunarEclipse;
  /** Every contact, with the Moon's place at it. */
  contacts: LocalLunarContact[];
  /** Moonrise or moonset between the first and last contact. */
  moonrise?: MoonEvent;
  moonset?: MoonEvent;
  /** Share of the main phase (U1 to U4, or P1 to P4 for a penumbral eclipse) with the Moon up, 0 to 1. */
  seen: number;
  /** Share of totality with the Moon up; undefined for an eclipse without totality. */
  totalitySeen?: number;
  /** Some of the main phase happens with the Moon up. */
  visible: boolean;
  /** ΔT used, seconds. */
  deltaT: number;
}

/** The eclipse from one place: the Moon's height at each contact, and how much of it is seen. */
export function lunarLocalCircumstances(e: LunarEclipse, observer: Observer, opts: { deltaT?: number } = {}): LocalLunarEclipse {
  const dT = opts.deltaT ?? eclipseDeltaT(e);
  const contacts = lunarContacts(e, dT).map((c) => ({ ...c, ...moonPlace(e, observer, c.time, dT) }));
  const result: LocalLunarEclipse = { eclipse: e, contacts, seen: 0, visible: false, deltaT: dT };

  const horizon = moonHorizon(e);
  const altAt = (t: number) => moonPlace(e, observer, elementTimeToMs(e, t, dT), dT).altitude - horizon;
  const [tStart, tEnd] = [e.contacts[0]!, e.contacts[6]!];

  // Moonrise and moonset between the first and last contact, found every five minutes and refined.
  const crossings: { t: number; rising: boolean }[] = [];
  const steps = Math.max(2, Math.ceil((tEnd - tStart) * 12));
  let prevT = tStart;
  let prevAlt = altAt(tStart);
  for (let i = 1; i <= steps; i++) {
    const t = tStart + ((tEnd - tStart) * i) / steps;
    const alt = altAt(t);
    if (Math.sign(alt) !== Math.sign(prevAlt)) {
      let lo = prevT;
      let hi = t;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(altAt(mid)) === Math.sign(prevAlt)) lo = mid;
        else hi = mid;
      }
      const tc = (lo + hi) / 2;
      crossings.push({ t: tc, rising: alt > 0 });
      const time = elementTimeToMs(e, tc, dT);
      const event = { time, ...moonPlace(e, observer, time, dT), visible: true };
      if (alt > 0) result.moonrise ??= event;
      else result.moonset ??= event;
    }
    prevT = t;
    prevAlt = alt;
  }

  /** Share of [a, b] with the Moon up. */
  const share = (a: number, b: number) => {
    let up = 0;
    let from = a;
    let isUp = altAt(a) > 0;
    for (const c of crossings) {
      if (c.t <= a || c.t >= b) continue;
      if (isUp) up += c.t - from;
      from = c.t;
      isUp = c.rising;
    }
    if (isUp) up += b - from;
    return up / (b - a);
  };
  const [a, b] = mainPhase(e);
  result.seen = share(a, b);
  if (e.contacts[2] !== null) result.totalitySeen = share(e.contacts[2]!, e.contacts[4]!);
  result.visible = result.seen > 0;
  return result;
}
