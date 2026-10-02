/**
 * Local circumstances of a solar eclipse: what an observer at one place sees,
 * from first contact to last, after the method of the Explanatory Supplement to
 * the Astronomical Almanac and Meeus, "Elements of Solar Eclipses".
 *
 * The observer is placed on the fundamental plane (ξ, η, ζ) and compared with
 * the shadow: the eclipse is greatest where the observer is closest to the shadow
 * axis, and the contacts are where the observer crosses the edge of the penumbra
 * (first and last contact) or of the umbra (start and end of totality or
 * annularity).
 *
 * Not modelled: the mountains and valleys on the Moon's limb (they move the
 * contacts by a second or two and the path edges by a kilometre or two),
 * refraction at the contacts, and the difference between UT1 and UTC (under a
 * second).
 */

import {
  DEG,
  EARTH_B_A,
  EARTH_RADIUS_KM,
  RAD,
  elementTimeToMs,
  elementsAt,
  eclipseDeltaT,
  hourAngle,
  msToElementTime,
  type ElementsAt,
  type SolarEclipse,
} from './elements';

export interface Observer {
  lat: number;
  /** East-positive. */
  lon: number;
  /** Height above sea level, metres. */
  height?: number;
}

/** The observer's geocentric position, ρ sin φ′ and ρ cos φ′, in Earth radii. */
export interface ObserverConstants {
  lat: number;
  lon: number;
  rhoSin: number;
  rhoCos: number;
}

export function observerConstants({ lat, lon, height = 0 }: Observer): ObserverConstants {
  const phi = lat * RAD;
  const u = Math.atan(EARTH_B_A * Math.tan(phi));
  const h = height / 1000 / EARTH_RADIUS_KM;
  return {
    lat,
    lon,
    rhoSin: EARTH_B_A * Math.sin(u) + h * Math.sin(phi),
    rhoCos: Math.cos(u) + h * Math.cos(phi),
  };
}

/** The observer relative to the shadow at one instant. */
export interface Relative {
  /** Element time, hours from t0 (TT). */
  t: number;
  el: ElementsAt;
  /** Local hour angle of the shadow axis, radians. */
  h: number;
  xi: number;
  eta: number;
  zeta: number;
  /** Observer relative to the shadow axis, and the rate of that, per hour. */
  u: number;
  v: number;
  a: number;
  b: number;
  /** Radii of penumbra and umbra on the observer's plane; L2 < 0 for a total eclipse. */
  L1: number;
  L2: number;
}

export function relative(e: SolarEclipse, o: ObserverConstants, t: number, dT: number): Relative {
  const el = elementsAt(e, t);
  const h = hourAngle(el, o.lon, dT);
  const sd = Math.sin(el.d);
  const cd = Math.cos(el.d);
  const xi = o.rhoCos * Math.sin(h);
  const eta = o.rhoSin * cd - o.rhoCos * sd * Math.cos(h);
  const zeta = o.rhoSin * sd + o.rhoCos * cd * Math.cos(h);
  const dXi = el.dmu * o.rhoCos * Math.cos(h);
  const dEta = el.dmu * xi * sd - zeta * el.dd;
  return {
    t,
    el,
    h,
    xi,
    eta,
    zeta,
    u: el.x - xi,
    v: el.y - eta,
    a: el.dx - dXi,
    b: el.dy - dEta,
    L1: el.l1 - zeta * e.tanF1,
    L2: el.l2 - zeta * e.tanF2,
  };
}

/** Altitude and azimuth of the Sun (geometric, degrees) for an observer. */
export function sunAltAz(r: Relative, o: ObserverConstants): { altitude: number; azimuth: number } {
  const phi = o.lat * RAD;
  const d = r.el.d;
  const sinAlt = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(r.h);
  const az = Math.atan2(
    -Math.cos(d) * Math.sin(r.h),
    Math.sin(d) * Math.cos(phi) - Math.cos(d) * Math.sin(phi) * Math.cos(r.h),
  );
  return { altitude: Math.asin(sinAlt) * DEG, azimuth: ((az * DEG) % 360 + 360) % 360 };
}

/** How much of the Sun is hidden at one instant. */
export interface Phase {
  /** Fraction of the Sun's diameter covered; 0 outside the eclipse. */
  magnitude: number;
  /** Fraction of the Sun's area covered. */
  obscuration: number;
  /** Apparent diameter of the Moon over that of the Sun. */
  moonSunRatio: number;
  /** Sun's geometric altitude and azimuth, degrees. */
  altitude: number;
  azimuth: number;
}

function phaseOf(r: Relative, o: ObserverConstants): Phase {
  const m = Math.hypot(r.u, r.v);
  const ratio = (r.L1 - r.L2) / (r.L1 + r.L2);
  const magnitude = Math.max(0, (r.L1 - m) / (r.L1 + r.L2));
  // Centre distance in solar radii: the penumbra's edge is where the discs touch.
  const s = (m * (1 + ratio)) / r.L1;
  return { magnitude, obscuration: obscuration(s, ratio), moonSunRatio: ratio, ...sunAltAz(r, o) };
}

/** Fraction of a unit disc covered by a disc of radius k whose centre is s away. */
export function obscuration(s: number, k: number): number {
  if (s >= 1 + k) return 0;
  if (s <= Math.abs(1 - k)) return k >= 1 ? 1 : k * k;
  const a1 = Math.acos((s * s + 1 - k * k) / (2 * s));
  const a2 = Math.acos((s * s + k * k - 1) / (2 * s * k));
  const tri = 0.5 * Math.sqrt((-s + 1 + k) * (s + 1 - k) * (s - 1 + k) * (s + 1 + k));
  return Math.min(1, Math.max(0, (a1 + k * k * a2 - tri) / Math.PI));
}

/** The phase of the eclipse seen by an observer at an instant (Unix ms, UT). */
export function phaseAt(e: SolarEclipse, observer: Observer, ms: number, dT = eclipseDeltaT(e)): Phase {
  const o = observerConstants(observer);
  return phaseOf(relative(e, o, msToElementTime(e, ms, dT), dT), o);
}

export type LocalKind = 'none' | 'partial' | 'annular' | 'total';

export interface Contact extends Phase {
  /** Unix milliseconds, UT. */
  time: number;
  /** Sun above the horizon (upper limb, refraction included). */
  visible: boolean;
}

export interface LocalSolarEclipse {
  eclipse: SolarEclipse;
  /**
   * What this place gets at its greatest eclipse, even if the Sun is down by
   * then; 'none' as well when the Sun is down throughout.
   */
  kind: LocalKind;
  /** First contact: the partial eclipse begins. */
  c1?: Contact;
  /** Second contact: totality or annularity begins. */
  c2?: Contact;
  /** Greatest eclipse at this place. */
  max?: Contact;
  /** Third contact: totality or annularity ends. */
  c3?: Contact;
  /** Fourth contact: the partial eclipse ends. */
  c4?: Contact;
  /** Length of totality or annularity, seconds. */
  duration?: number;
  /** Sunrise or sunset while the eclipse is under way. */
  sunrise?: Contact;
  sunset?: Contact;
  /** Some part of the eclipse happens with the Sun up. */
  visible: boolean;
  /** Greatest phase that can actually be seen: the maximum, or the moment of sunrise or sunset. */
  visibleMax?: Contact;
  /** ΔT used, seconds. */
  deltaT: number;
}

export interface LocalOptions {
  /** ΔT in seconds; measured or extrapolated by default. */
  deltaT?: number;
  /** Sun altitude counted as sunrise and sunset, degrees. */
  horizon?: number;
}

const TOLERANCE = 1e-7; // hours, under a millisecond

/** Iterates from t to the instant the observer is closest to the shadow axis. */
function maximum(e: SolarEclipse, o: ObserverConstants, t: number, dT: number): Relative {
  let r = relative(e, o, t, dT);
  for (let i = 0; i < 30; i++) {
    const step = -(r.u * r.a + r.v * r.b) / (r.a * r.a + r.b * r.b);
    t += step;
    r = relative(e, o, t, dT);
    if (Math.abs(step) < TOLERANCE) break;
  }
  return r;
}

/**
 * Iterates from t to the instant the observer crosses the edge of the penumbra
 * (umbra = false) or umbra; sign −1 for the entry, +1 for the exit.
 */
function contact(e: SolarEclipse, o: ObserverConstants, t: number, dT: number, umbra: boolean, sign: number) {
  let r = relative(e, o, t, dT);
  for (let i = 0; i < 30; i++) {
    const L = umbra ? Math.abs(r.L2) : r.L1;
    const n2 = r.a * r.a + r.b * r.b;
    const n = Math.sqrt(n2);
    const S = (r.a * r.v - r.u * r.b) / (n * L);
    if (Math.abs(S) > 1) return null;
    const step = -(r.u * r.a + r.v * r.b) / n2 + (sign * L * Math.sqrt(1 - S * S)) / n;
    t += step;
    r = relative(e, o, t, dT);
    if (Math.abs(step) < TOLERANCE) break;
  }
  return r;
}

export function localCircumstances(e: SolarEclipse, observer: Observer, opts: LocalOptions = {}): LocalSolarEclipse {
  const dT = opts.deltaT ?? eclipseDeltaT(e);
  const horizon = opts.horizon ?? -0.833;
  const o = observerConstants(observer);
  const result: LocalSolarEclipse = { eclipse: e, kind: 'none', visible: false, deltaT: dT };

  const tGreatest = (e.jdGreatest - e.jd0) * 24;
  const rMax = maximum(e, o, tGreatest, dT);
  const m = Math.hypot(rMax.u, rMax.v);
  if (m >= rMax.L1) return result;

  const at = (r: Relative): Contact => {
    const p = phaseOf(r, o);
    return { time: elementTimeToMs(e, r.t, dT), visible: p.altitude > horizon, ...p };
  };
  const tMax = rMax.t;
  result.max = at(rMax);
  const c1 = contact(e, o, tMax, dT, false, -1);
  const c4 = contact(e, o, tMax, dT, false, 1);
  if (c1) result.c1 = at(c1);
  if (c4) result.c4 = at(c4);
  result.kind = 'partial';

  if (m < Math.abs(rMax.L2)) {
    result.kind = rMax.L2 < 0 ? 'total' : 'annular';
    const c2 = contact(e, o, tMax, dT, true, -1);
    const c3 = contact(e, o, tMax, dT, true, 1);
    if (c2) result.c2 = at(c2);
    if (c3) result.c3 = at(c3);
    if (c2 && c3) result.duration = (c3.t - c2.t) * 3600;
  }

  // Sunrise and sunset between the first and last contact.
  const tStart = c1?.t ?? tMax;
  const tEnd = c4?.t ?? tMax;
  const altAt = (t: number) => sunAltAz(relative(e, o, t, dT), o).altitude - horizon;
  const steps = Math.max(2, Math.ceil((tEnd - tStart) * 12)); // every 5 minutes
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
      const c = { ...at(relative(e, o, tc, dT)), visible: true };
      if (alt > 0) result.sunrise = c;
      else result.sunset = c;
    }
    prevT = t;
    prevAlt = alt;
  }

  const candidates = [result.max, result.sunrise, result.sunset].filter((c): c is Contact => !!c && c.visible);
  result.visible = candidates.length > 0 || !!(result.c1?.visible || result.c4?.visible);
  result.visibleMax = candidates.sort((p, q) => q.magnitude - p.magnitude)[0];
  // On the night side the shadow's projection can still cover the observer; nothing is seen there.
  if (!result.visible) return { eclipse: e, kind: 'none', visible: false, deltaT: dT };
  return result;
}
