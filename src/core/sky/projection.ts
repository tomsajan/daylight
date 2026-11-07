/**
 * The sky chart's projection: stereographic, as seen from inside the sphere, looking towards a
 * direction (azimuth, altitude) with "up" towards the zenith. Stereographic keeps shapes true and
 * maps circles to circles, so the horizon is a circle and the whole sky fits in view.
 *
 * Horizontal vectors as in frame.ts: x north, y west, z up.
 */
import type { Vec3 } from './frame';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface View {
  /** The direction in the middle of the chart. */
  az: number;
  alt: number;
  /** Angle across the chart's shorter side, degrees. */
  fov: number;
}

export function horizontalVector(az: number, alt: number): Vec3 {
  const a = az * RAD;
  const h = alt * RAD;
  return [Math.cos(h) * Math.cos(a), -Math.cos(h) * Math.sin(a), Math.sin(h)];
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

export class Projector {
  readonly f: Vec3;
  readonly r: Vec3;
  readonly u: Vec3;
  /** Pixels per unit of the stereographic plane (2·tan(θ/2) for an angle θ from the middle). */
  readonly k: number;
  readonly cx: number;
  readonly cy: number;

  constructor(
    readonly view: View,
    readonly width: number,
    readonly height: number,
  ) {
    this.f = horizontalVector(view.az, view.alt);
    // Up is the zenith, straightened against the view; at the zenith itself, away from the azimuth.
    const z: Vec3 = [0, 0, 1];
    const up: Vec3 = [z[0] - this.f[0] * this.f[2], z[1] - this.f[1] * this.f[2], z[2] - this.f[2] * this.f[2]];
    this.u = Math.hypot(...up) > 1e-6 ? norm(up) : norm(horizontalVector(view.az + 180, 0));
    // Facing south with the zenith up, west is on the right.
    this.r = cross(this.f, this.u);
    this.k = Math.min(width, height) / (4 * Math.tan((view.fov * RAD) / 4));
    this.cx = width / 2;
    this.cy = height / 2;
  }

  /** Screen position of a horizontal direction, or null when it is nearly behind the viewer. */
  project(h: Vec3, limit = -0.9): [number, number] | null {
    const Z = dot(h, this.f);
    if (Z < limit) return null;
    const s = 2 / (1 + Z);
    return [this.cx + this.k * s * dot(h, this.r), this.cy - this.k * s * dot(h, this.u)];
  }

  /** The horizontal direction at a screen position. */
  unproject(x: number, y: number): Vec3 {
    const sx = (x - this.cx) / this.k;
    const sy = -(y - this.cy) / this.k;
    const q = sx * sx + sy * sy;
    const a = 4 / (4 + q);
    const b = (4 - q) / (4 + q);
    return [
      a * sx * this.r[0] + a * sy * this.u[0] + b * this.f[0],
      a * sx * this.r[1] + a * sy * this.u[1] + b * this.f[1],
      a * sx * this.r[2] + a * sy * this.u[2] + b * this.f[2],
    ];
  }

  /**
   * The horizon on the screen. Stereographic projection maps it to an exact circle, centred
   * straight above or below the middle of the chart (up is the zenith). Below the horizon lies
   * outside the circle when looking up and inside it when looking down. When the circle is too
   * big to draw, the horizon is a straight line at `y` with the ground below it.
   */
  horizon(): { kind: 'circle'; x: number; y: number; r: number; groundInside: boolean } | { kind: 'line'; y: number } {
    const a = this.view.alt * RAD;
    const sin = Math.sin(a);
    const r = (2 * this.k) / Math.abs(sin || 1e-12);
    if (r > 1e6 || !Number.isFinite(r)) return { kind: 'line', y: this.cy + 2 * this.k * Math.tan(a / 2) };
    return { kind: 'circle', x: this.cx, y: this.cy - (2 * this.k * Math.cos(a)) / sin, r, groundInside: sin < 0 };
  }

  /** Pixels per degree in the middle of the chart. */
  get pxPerDegree(): number {
    return this.k * RAD;
  }
}

/** Azimuth and altitude of a horizontal vector. */
export function toAzAlt(h: Vec3): { az: number; alt: number } {
  return { az: ((Math.atan2(-h[1], h[0]) * DEG) % 360 + 360) % 360, alt: Math.asin(Math.max(-1, Math.min(1, h[2]))) * DEG };
}

/**
 * The outline of a camera frame on the sky as J2000 unit vectors: a rectangle of `width` × `height`
 * degrees on the plane touching the sky at the target (a lens draws straight lines straight).
 * `angle` is the position angle of the frame's top edge, east of north, as astrophotographers
 * give it: at 0 the top points north and the long side runs east-west; at 90 the top points east.
 */
export function frameOutline(target: Vec3, width: number, height: number, angle: number, perSide = 24): Vec3[][] {
  const t = norm(target);
  // East and north at the target, in J2000.
  let east: Vec3 = cross([0, 0, 1], t);
  if (Math.hypot(...east) < 1e-9) east = [0, 1, 0];
  east = norm(east);
  const north = cross(t, east);
  const c = Math.cos(angle * RAD);
  const s = Math.sin(angle * RAD);
  // Up turns from north towards east; across turns with it, from east towards south.
  const ay: Vec3 = [north[0] * c + east[0] * s, north[1] * c + east[1] * s, north[2] * c + east[2] * s];
  const ax: Vec3 = [east[0] * c - north[0] * s, east[1] * c - north[1] * s, east[2] * c - north[2] * s];
  const hx = Math.tan((width * RAD) / 2);
  const hy = Math.tan((height * RAD) / 2);
  const at = (u: number, v: number): Vec3 => norm([t[0] + ax[0] * u * hx + ay[0] * v * hy, t[1] + ax[1] * u * hx + ay[1] * v * hy, t[2] + ax[2] * u * hx + ay[2] * v * hy]);
  const side = (u0: number, v0: number, u1: number, v1: number) =>
    Array.from({ length: perSide + 1 }, (_, i) => at(u0 + ((u1 - u0) * i) / perSide, v0 + ((v1 - v0) * i) / perSide));
  // One closed line, and a short tick on the top edge's middle to tell which way is up in the picture.
  return [
    [...side(-1, -1, 1, -1), ...side(1, -1, 1, 1).slice(1), ...side(1, 1, -1, 1).slice(1), ...side(-1, 1, -1, -1).slice(1)],
    [at(0, 1), at(0, 1.12)],
  ];
}

/** The ellipse of an object's size on the sky, as J2000 unit vectors: axes in arcminutes, angle east of north. */
export function ellipseOutline(target: Vec3, major: number, minor: number, pa: number, points = 48): Vec3[] {
  const t = norm(target);
  let east: Vec3 = cross([0, 0, 1], t);
  if (Math.hypot(...east) < 1e-9) east = [0, 1, 0];
  east = norm(east);
  const north = cross(t, east);
  const a = Math.tan((major / 120) * RAD);
  const b = Math.tan((minor / 120) * RAD);
  const p = pa * RAD;
  // The major axis points pa from north towards east.
  const am: Vec3 = [north[0] * Math.cos(p) + east[0] * Math.sin(p), north[1] * Math.cos(p) + east[1] * Math.sin(p), north[2] * Math.cos(p) + east[2] * Math.sin(p)];
  const bm = cross(t, am);
  return Array.from({ length: points + 1 }, (_, i) => {
    const w = (i / points) * 2 * Math.PI;
    const ca = a * Math.cos(w);
    const sb = b * Math.sin(w);
    return norm([t[0] + am[0] * ca + bm[0] * sb, t[1] + am[1] * ca + bm[1] * sb, t[2] + am[2] * ca + bm[2] * sb]);
  });
}
