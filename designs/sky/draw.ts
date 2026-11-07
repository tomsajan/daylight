/**
 * Drawing the sky chart on a canvas: the sky's own light (twilight, the Moon, the Milky Way)
 * worked out per pixel at a fraction of the resolution, then the constellations, stars, deep-sky
 * objects, planets and the Moon, the ground below the horizon, and the camera's frame.
 */
import { CONSTELLATIONS, DSOS, MILKY_WAY, STARS, STAR_NAMES, STAR_VECTORS, starColor, unitVector, type Dso } from '$core/sky/catalog';
import { PLANETS, angularDiameter, apparent, bodyLight, bodyVector, toHorizontal, type Frame, type Planet, type Site, type Vec3 } from '$core/sky/frame';
import { Projector, ellipseOutline, frameOutline, horizontalVector, type View } from '$core/sky/projection';
import { GALACTIC_CENTRE } from '$core/sky/targets';

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

export interface SkyLayers {
  constellations: boolean;
  names: boolean;
  milkyWay: boolean;
  deepSky: boolean;
  grid: boolean;
  frame: boolean;
}

export interface FrameSpec {
  /** J2000 direction of the frame's centre. */
  centre: Vec3;
  width: number;
  height: number;
  rotation: number;
  label: string;
}

export interface SkyScene {
  ms: number;
  site: Site;
  frame: Frame;
  view: View;
  layers: SkyLayers;
  /** The selected target's id and J2000 direction, ringed. */
  selected: { id: string; v: Vec3; label: string } | null;
  camera: FrameSpec | null;
}

/** Things drawn that a click can pick, in CSS pixels. */
export interface Pickable {
  id: string;
  x: number;
  y: number;
  label: string;
}

export const DSO_COLORS: Record<string, string> = {
  galaxy: '#ffa58a',
  nebula: '#7fe3c9',
  open: '#ffe485',
  globular: '#ffc970',
  planetary: '#9fd2ff',
  remnant: '#c9b4ff',
  dark: '#b9b2a6',
  star: '#e8e0c8',
};

const PLANET_COLORS: Record<Planet, string> = {
  Mercury: '#d8d2c8',
  Venus: '#fff6dc',
  Mars: '#ff9466',
  Jupiter: '#ffe9c8',
  Saturn: '#f3dea2',
  Uranus: '#a8e6ec',
  Neptune: '#9bb6ff',
};

// --- The Milky Way as a picture of the sky, made once ---------------------------------

const MW_W = 1024;
const MW_H = 512;
let milkyWay: Float32Array | null = null;

/** The Milky Way's brightness on a grid of right ascension and declination, from its outlines. */
function milkyWayMap(): Float32Array {
  if (milkyWay) return milkyWay;
  const canvas = document.createElement('canvas');
  canvas.width = MW_W;
  canvas.height = MW_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, MW_W, MW_H);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgb(48 48 48)';
  // Each level is one polygon: an outline and its holes, filled together so the holes stay dark.
  for (const level of MILKY_WAY) {
    ctx.beginPath();
    for (const ring of level) {
      // Carried on round past 0h/24h.
      let ra = ring[0][0];
      const pts = ring.map(([r, d]) => {
        ra += ((r - ra + 540) % 360) - 180;
        return [ra, d] as const;
      });
      const at = (r: number, d: number): [number, number] => [(r / 360) * MW_W, ((90 - d) / 180) * MW_H];
      const turn = pts[pts.length - 1][0] - pts[0][0];
      if (Math.abs(turn) > 180) {
        // An edge that goes all the way round the sky: drawn three times round, end to end, and
        // closed past the south pole, so that with the other edge it leaves the band between them.
        const shifts = turn < 0 ? [360, 0, -360] : [-360, 0, 360];
        const all = shifts.flatMap((sh) => pts.map(([r, d]) => at(r + sh, d)));
        all.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.lineTo(all[all.length - 1][0], MW_H + 10);
        ctx.lineTo(all[0][0], MW_H + 10);
        ctx.closePath();
      } else {
        // A patch or a hole: drawn at each of its places across the map's edge.
        for (const sh of [-360, 0, 360]) {
          pts.forEach(([r, d], i) => {
            const [x, y] = at(r + sh, d);
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          });
          ctx.closePath();
        }
      }
    }
    ctx.fill('evenodd');
  }
  // Softened, as it looks.
  const soft = document.createElement('canvas');
  soft.width = MW_W;
  soft.height = MW_H;
  const sctx = soft.getContext('2d', { willReadFrequently: true })!;
  sctx.filter = 'blur(3px)';
  sctx.drawImage(canvas, 0, 0);
  const data = sctx.getImageData(0, 0, MW_W, MW_H).data;
  milkyWay = new Float32Array(MW_W * MW_H);
  for (let i = 0; i < milkyWay.length; i++) milkyWay[i] = data[i * 4] / 255;
  return milkyWay;
}

// --- The sky's light ---------------------------------------------------------------------

/** The sky's colour overhead for an altitude of the Sun, RGB 0-255. */
function skyBase(sunAlt: number): [number, number, number] {
  const stops: [number, number, number, number][] = [
    [12, 78, 128, 205],
    [0, 52, 88, 152],
    [-4, 30, 46, 98],
    [-8, 15, 23, 56],
    [-12, 8, 12, 32],
    [-18, 4, 6, 16],
    [-90, 3, 5, 12],
  ];
  if (sunAlt >= stops[0][0]) return [stops[0][1], stops[0][2], stops[0][3]];
  for (let i = 1; i < stops.length; i++) {
    const [a, ...ca] = stops[i - 1];
    const [b, ...cb] = stops[i];
    if (sunAlt >= b) {
      const f = (sunAlt - b) / (a - b);
      return [cb[0] + (ca[0] - cb[0]) * f, cb[1] + (ca[1] - cb[1]) * f, cb[2] + (ca[2] - cb[2]) * f];
    }
  }
  return [3, 5, 12];
}

/** How faint a star can be seen with the Sun at an altitude and the Moon's light, roughly. */
export function limitingMagnitude(sunAlt: number, moonGlow: number): number {
  const twilight = sunAlt >= 0 ? -4 : sunAlt > -6 ? -4 + ((-sunAlt) / 6) * 5 : sunAlt > -12 ? 1 + ((-sunAlt - 6) / 6) * 3 : sunAlt > -18 ? 4 + ((-sunAlt - 12) / 6) * 2.2 : 6.2;
  return twilight - moonGlow * 1.6;
}

interface Light {
  /** J2000 directions of the Sun and the Moon, and the same in the place's horizontal frame. */
  sun: Vec3;
  sunH: Vec3;
  moonH: Vec3;
  sunAlt: number;
  moon: Vec3;
  moonAlt: number;
  /** 0-1: how much the Moon brightens the sky. */
  moonGlow: number;
  moonFraction: number;
}

/** The low-resolution sky, kept between frames. */
let scratch: HTMLCanvasElement | null = null;

function drawBackground(ctx: CanvasRenderingContext2D, p: Projector, scene: SkyScene, light: Light, w: number, h: number) {
  // A pixel of this picture is `step` pixels of the canvas.
  const step = Math.max(2, Math.round(Math.max(w, h) / 360));
  const bw = Math.ceil(w / step);
  const bh = Math.ceil(h / step);
  const img = ctx.createImageData(bw, bh);
  const out = img.data;
  const base = skyBase(light.sunAlt);
  const f = scene.frame;
  const mw = scene.layers.milkyWay ? milkyWayMap() : null;
  // The Milky Way shows in a dark sky only.
  const mwLight = mw ? Math.max(0, Math.min(1, (-light.sunAlt - 11) / 7)) * (1 - 0.75 * light.moonGlow) : 0;
  const twilightGlow = light.sunAlt > -18 && light.sunAlt < 8 ? Math.max(0, 1 - Math.abs(light.sunAlt + 3) / 15) : 0;
  const moonLift = light.moonGlow * 22;
  const [sx, sy, sz] = light.sunH;
  const [mx, my, mz] = light.moonH;
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const v = p.unproject((i + 0.5) * step, (j + 0.5) * step);
      const up = Math.max(0, v[2]);
      // Lighter towards the horizon.
      const haze = 1 + 0.7 * (1 - up) ** 3;
      let r = base[0] * haze + moonLift * 0.8;
      let g = base[1] * haze + moonLift * 0.9;
      let b = base[2] * haze + moonLift * 1.2;
      if (twilightGlow > 0) {
        const c = Math.max(0, v[0] * sx + v[1] * sy + v[2] * sz);
        const near = (1 - up) ** 4;
        const glow = twilightGlow * (c ** 6 * 0.9 + c * 0.15) * near;
        r += 255 * glow;
        g += 120 * glow;
        b += 50 * glow;
      }
      if (light.moonGlow > 0) {
        const c = Math.max(0, v[0] * mx + v[1] * my + v[2] * mz);
        const g2 = c ** 60 * 70 * light.moonGlow;
        r += g2;
        g += g2;
        b += g2 * 1.1;
      }
      if (mw && mwLight > 0 && v[2] > -0.05) {
        // Back to J2000 (the frame's transpose), then right ascension and declination.
        const ex = f[0] * v[0] + f[3] * v[1] + f[6] * v[2];
        const ey = f[1] * v[0] + f[4] * v[1] + f[7] * v[2];
        const ez = f[2] * v[0] + f[5] * v[1] + f[8] * v[2];
        const ra = Math.atan2(ey, ex);
        const x = Math.floor((((ra / (2 * Math.PI)) % 1) + 1) % 1 * MW_W) % MW_W;
        const y = Math.min(MW_H - 1, Math.floor(((Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, ez)))) / Math.PI) * MW_H));
        const m = mw[y * MW_W + x] * mwLight * Math.min(1, up * 4);
        r += m * 85;
        g += m * 90;
        b += m * 105;
      }
      const o = (j * bw + i) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  }
  scratch ??= document.createElement('canvas');
  const tmp = scratch;
  if (tmp.width !== bw || tmp.height !== bh) {
    tmp.width = bw;
    tmp.height = bh;
  }
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, bw * step, bh * step);
}

// --- Lines and shapes --------------------------------------------------------------------

/** A polyline of horizontal vectors, broken where it goes out of the projection. */
function polyline(ctx: CanvasRenderingContext2D, p: Projector, pts: Vec3[], close = false) {
  let pen = false;
  let last: [number, number] | null = null;
  const jump = Math.max(p.width, p.height) * 1.5;
  for (const v of close ? [...pts, pts[0]] : pts) {
    const q = p.project(v, -0.6);
    if (!q || (last && Math.hypot(q[0] - last[0], q[1] - last[1]) > jump)) {
      pen = false;
      last = q;
      continue;
    }
    if (pen) ctx.lineTo(q[0], q[1]);
    else ctx.moveTo(q[0], q[1]);
    pen = true;
    last = q;
  }
}

const horiz = (f: Frame, v: Vec3) => toHorizontal(f, v[0], v[1], v[2]);

/** A J2000 position seen from the place, lifted by refraction near the horizon. */
function seen(f: Frame, v: Vec3): Vec3 {
  const h = horiz(f, v);
  const alt = Math.asin(Math.max(-1, Math.min(1, h[2]))) * DEG;
  if (alt < -2 || alt > 30) return h;
  const lift = (apparent(alt) - alt) * RAD;
  const c = Math.hypot(h[0], h[1]) || 1;
  const a = Math.asin(Math.max(-1, Math.min(1, h[2]))) + lift;
  return [(h[0] / c) * Math.cos(a), (h[1] / c) * Math.cos(a), Math.sin(a)];
}

/**
 * The ground below the horizon, and the horizon's line. The horizon is drawn as the exact circle
 * it projects to: a broken-up line of points would close the fill across the sky when zoomed in.
 * With `fill` off only the line is drawn, and what is below the horizon shows.
 */
function drawGround(ctx: CanvasRenderingContext2D, p: Projector, w: number, h: number, sunAlt: number, fill: boolean) {
  const hz = p.horizon();
  const outline = () => {
    ctx.beginPath();
    if (hz.kind === 'line') {
      ctx.moveTo(-10, hz.y);
      ctx.lineTo(w + 10, hz.y);
    } else ctx.arc(hz.x, hz.y, hz.r, 0, 2 * Math.PI);
  };
  if (fill) {
    outline();
    if (hz.kind === 'line') {
      ctx.lineTo(w + 10, Math.max(h, hz.y) + 10);
      ctx.lineTo(-10, Math.max(h, hz.y) + 10);
      ctx.closePath();
    } else if (!hz.groundInside) ctx.rect(0, 0, w, h);
    const lit = Math.max(0, Math.min(1, (sunAlt + 12) / 18));
    ctx.fillStyle = `rgb(${10 + 26 * lit} ${13 + 30 * lit} ${11 + 22 * lit} / 0.93)`;
    ctx.fill('evenodd');
  }
  outline();
  ctx.strokeStyle = 'rgb(150 170 150 / 0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawGrid(ctx: CanvasRenderingContext2D, p: Projector) {
  ctx.beginPath();
  for (const alt of [15, 30, 45, 60, 75]) {
    const ring: Vec3[] = [];
    for (let a = 0; a <= 360; a += 3) ring.push(horizontalVector(a, alt));
    polyline(ctx, p, ring);
  }
  for (let az = 0; az < 360; az += 30) {
    const line: Vec3[] = [];
    for (let alt = 0; alt <= 90; alt += 3) line.push(horizontalVector(az, alt));
    polyline(ctx, p, line);
  }
  ctx.strokeStyle = 'rgb(140 170 220 / 0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawCompass(ctx: CanvasRenderingContext2D, p: Projector) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  names.forEach((n, i) => {
    const q = p.project(horizontalVector(i * 45, -2.2 - 6 / Math.max(1, p.pxPerDegree)), -0.2);
    if (!q) return;
    ctx.fillStyle = i % 2 ? 'rgb(200 210 190 / 0.6)' : 'rgb(240 230 200 / 0.95)';
    ctx.fillText(n, q[0], q[1]);
  });
}

function drawConstellations(ctx: CanvasRenderingContext2D, p: Projector, f: Frame, names: boolean) {
  ctx.beginPath();
  for (const c of CONSTELLATIONS) for (const line of c.lines) polyline(ctx, p, line.map(([ra, dec]) => seen(f, unitVector(ra, dec))));
  ctx.strokeStyle = 'rgb(120 160 230 / 0.38)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (!names) return;
  ctx.font = '10.5px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgb(150 180 235 / 0.55)';
  for (const c of CONSTELLATIONS) {
    const h = horiz(f, unitVector(c.label[0], c.label[1]));
    if (h[2] < 0.02) continue;
    const q = p.project(h, 0);
    if (q) ctx.fillText(c.name.toUpperCase(), q[0], q[1]);
  }
}

/** Star colours, worked out once. */
let colors: string[] | null = null;

function drawStars(ctx: CanvasRenderingContext2D, p: Projector, f: Frame, limit: number, names: boolean) {
  colors ??= STARS.map((s) => starColor(s[3]));
  const zoom = Math.max(1, Math.min(2.2, (90 / p.view.fov) ** 0.3));
  const labels: [number, number, string][] = [];
  for (let i = 0; i < STARS.length; i++) {
    const mag = STARS[i][2];
    if (mag > limit) break;
    const h = seen(f, [STAR_VECTORS[i * 3], STAR_VECTORS[i * 3 + 1], STAR_VECTORS[i * 3 + 2]]);
    if (h[2] < -0.01) continue;
    const q = p.project(h, 0);
    if (!q || q[0] < -5 || q[1] < -5 || q[0] > p.width + 5 || q[1] > p.height + 5) continue;
    const r = Math.max(0.55, (2.9 - 0.42 * mag) * zoom);
    const fade = Math.max(0.25, Math.min(1, (limit - mag) / 2.2));
    ctx.globalAlpha = fade;
    ctx.fillStyle = colors[i];
    if (r < 1) ctx.fillRect(q[0] - r, q[1] - r, r * 2, r * 2);
    else {
      ctx.beginPath();
      ctx.arc(q[0], q[1], r, 0, Math.PI * 2);
      ctx.fill();
    }
    const name = names ? STAR_NAMES.get(i) : undefined;
    if (name && (mag < 1.6 || p.view.fov < 70)) labels.push([q[0] + r + 3, q[1], name]);
  }
  ctx.globalAlpha = 1;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgb(235 228 205 / 0.75)';
  for (const [x, y, n] of labels) ctx.fillText(n, x, y);
}

function dsoSymbol(ctx: CanvasRenderingContext2D, d: Dso, x: number, y: number, s: number) {
  ctx.beginPath();
  switch (d.type) {
    case 'galaxy':
      ctx.ellipse(x, y, s * 1.3, s * 0.6, (-(d.size[2] ?? 0) * Math.PI) / 180, 0, Math.PI * 2);
      break;
    case 'open':
      ctx.setLineDash([2, 2]);
      ctx.arc(x, y, s, 0, Math.PI * 2);
      break;
    case 'globular':
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.moveTo(x - s, y);
      ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s);
      ctx.lineTo(x, y + s);
      break;
    case 'planetary':
      ctx.arc(x, y, s * 0.6, 0, Math.PI * 2);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        ctx.moveTo(x + dx * s * 0.6, y + dy * s * 0.6);
        ctx.lineTo(x + dx * s * 1.2, y + dy * s * 1.2);
      }
      break;
    case 'nebula':
    case 'remnant':
      ctx.rect(x - s, y - s, s * 2, s * 2);
      break;
    default:
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s, y);
      ctx.closePath();
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawDeepSky(ctx: CanvasRenderingContext2D, p: Projector, f: Frame, picks: Pickable[], selected: string | null) {
  const pxDeg = p.pxPerDegree;
  ctx.lineWidth = 1.2;
  ctx.font = '10.5px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  // The whole sky shows the brighter and bigger ones only; zoomed in, all of them.
  const wide = p.view.fov >= 100;
  for (const d of DSOS) {
    if (wide && d.id !== selected && !((d.mag ?? 99) < 8 || (d.size[0] ?? 0) > 40)) continue;
    const v = unitVector(d.ra, d.dec);
    const h = horiz(f, v);
    if (h[2] < -0.01 && d.id !== selected) continue;
    const q = p.project(h, 0);
    if (!q || q[0] < -50 || q[1] < -50 || q[0] > p.width + 50 || q[1] > p.height + 50) continue;
    const color = DSO_COLORS[d.type];
    ctx.strokeStyle = color;
    ctx.globalAlpha = h[2] < 0 ? 0.35 : 0.85;
    const major = d.size[0] ?? 0;
    if ((major / 60) * pxDeg > 14) {
      ctx.beginPath();
      polyline(ctx, p, ellipseOutline(v, major, d.size[1] ?? major, d.size[2] ?? 0).map((e) => horiz(f, e)), true);
      ctx.stroke();
    } else {
      dsoSymbol(ctx, d, q[0], q[1], 4.2);
    }
    const label = p.view.fov < 100 || (d.mag !== null && d.mag < 5);
    if (label) {
      ctx.fillStyle = color;
      ctx.fillText(d.id.replace(/^([A-Z]+)(\d)/, '$1 $2').replace(/^M /, 'M'), q[0] + 7, q[1] - 6);
    }
    picks.push({ id: d.id, x: q[0], y: q[1], label: d.name || d.desig });
  }
  ctx.globalAlpha = 1;
}

/** The Moon's disc with its phase, the lit side towards the Sun. */
function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fraction: number, towardsSun: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(towardsSun);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgb(58 60 70)';
  ctx.fill();
  const w = r * Math.abs(2 * fraction - 1);
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  if (fraction >= 0.5) ctx.ellipse(0, 0, w, r, 0, Math.PI / 2, (3 * Math.PI) / 2, false);
  else ctx.ellipse(0, 0, w, r, 0, Math.PI / 2, -Math.PI / 2, true);
  ctx.fillStyle = '#f4f1e6';
  ctx.fill();
  ctx.restore();
}

function drawSolarSystem(ctx: CanvasRenderingContext2D, p: Projector, scene: SkyScene, light: Light, picks: Pickable[]) {
  const f = scene.frame;
  const pxDeg = p.pxPerDegree;
  ctx.font = '11.5px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const planet of PLANETS) {
    const { v, dist } = bodyVector(planet, scene.ms, scene.site);
    const h = seen(f, v);
    if (h[2] < -0.01 && planet !== scene.selected?.id) continue;
    const q = p.project(h, 0);
    if (!q) continue;
    const mag = bodyLight(planet, scene.ms).mag;
    const r = Math.max(Math.max(1.6, 3.6 - 0.35 * mag), (angularDiameter(planet, dist) / 2) * pxDeg);
    ctx.globalAlpha = h[2] < 0 ? 0.4 : 1;
    ctx.beginPath();
    ctx.arc(q[0], q[1], r, 0, Math.PI * 2);
    ctx.fillStyle = PLANET_COLORS[planet];
    ctx.fill();
    if (scene.layers.names) {
      ctx.fillStyle = PLANET_COLORS[planet];
      ctx.fillText(planet, q[0] + r + 4, q[1]);
    }
    picks.push({ id: planet, x: q[0], y: q[1], label: planet });
  }
  ctx.globalAlpha = 1;
  // The Sun, while up.
  const sh = horiz(f, light.sun);
  if (sh[2] > -0.02) {
    const q = p.project(sh, 0);
    if (q) {
      ctx.beginPath();
      ctx.arc(q[0], q[1], Math.max(6, 0.27 * pxDeg), 0, Math.PI * 2);
      ctx.fillStyle = '#ffe680';
      ctx.fill();
    }
  }
  const mh = seen(f, light.moon);
  if (mh[2] > -0.02 || scene.selected?.id === 'Moon') {
    const q = p.project(mh, 0);
    if (q) {
      // The way to the Sun from the Moon, on the screen: a step along the great circle towards it.
      const s = light.sun;
      const m = light.moon;
      const c = s[0] * m[0] + s[1] * m[1] + s[2] * m[2];
      const toward: Vec3 = [m[0] + 0.02 * (s[0] - c * m[0]), m[1] + 0.02 * (s[1] - c * m[1]), m[2] + 0.02 * (s[2] - c * m[2])];
      const q2 = p.project(seen(f, toward), 0);
      const angle = q2 ? Math.atan2(q2[1] - q[1], q2[0] - q[0]) : 0;
      const r = Math.max(7, 0.26 * pxDeg);
      ctx.globalAlpha = mh[2] < 0 ? 0.45 : 1;
      drawMoon(ctx, q[0], q[1], r, light.moonFraction, angle);
      ctx.globalAlpha = 1;
      if (scene.layers.names) {
        ctx.fillStyle = 'rgb(240 236 220 / 0.85)';
        ctx.fillText('Moon', q[0] + r + 4, q[1]);
      }
      picks.push({ id: 'Moon', x: q[0], y: q[1], label: 'Moon' });
    }
  }
}

function drawCore(ctx: CanvasRenderingContext2D, p: Projector, f: Frame, picks: Pickable[], names: boolean) {
  const h = horiz(f, unitVector(GALACTIC_CENTRE.ra, GALACTIC_CENTRE.dec));
  if (h[2] < -0.01) return;
  const q = p.project(h, 0);
  if (!q) return;
  ctx.strokeStyle = 'rgb(255 236 200 / 0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(q[0] - 6, q[1]);
  ctx.lineTo(q[0] + 6, q[1]);
  ctx.moveTo(q[0], q[1] - 6);
  ctx.lineTo(q[0], q[1] + 6);
  ctx.stroke();
  if (names) {
    ctx.fillStyle = 'rgb(255 236 200 / 0.75)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Milky Way core', q[0] + 8, q[1] + 8);
  }
  picks.push({ id: 'core', x: q[0], y: q[1], label: 'Milky Way core' });
}

function drawSelected(ctx: CanvasRenderingContext2D, p: Projector, f: Frame, sel: NonNullable<SkyScene['selected']>) {
  const q = p.project(seen(f, sel.v), -0.6);
  if (!q) return;
  ctx.strokeStyle = '#ffd25e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(q[0], q[1], 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '600 12.5px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgb(5 8 18 / 0.8)';
  ctx.strokeText(sel.label, q[0] + 17, q[1] + 12);
  ctx.fillStyle = '#ffd25e';
  ctx.fillText(sel.label, q[0] + 17, q[1] + 12);
}

function drawCameraFrame(ctx: CanvasRenderingContext2D, p: Projector, f: Frame, cam: FrameSpec) {
  const [outline, tick] = frameOutline(cam.centre, cam.width, cam.height, cam.rotation);
  ctx.beginPath();
  polyline(ctx, p, outline.map((v) => seen(f, v)));
  polyline(ctx, p, tick.map((v) => seen(f, v)));
  ctx.strokeStyle = 'rgb(5 8 18 / 0.7)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // The label above the frame's top-left corner.
  const corner = p.project(seen(f, outline[outline.length - 1 - 24 * 0]), -0.6);
  const top = outline.slice(48, 73).map((v) => p.project(seen(f, v), -0.6)).filter((q): q is [number, number] => !!q);
  const at = top.sort((a, b) => a[1] - b[1])[0] ?? corner;
  if (at) {
    ctx.font = '11.5px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgb(5 8 18 / 0.8)';
    ctx.strokeText(cam.label, at[0], at[1] - 4);
    ctx.fillStyle = '#ffc77a';
    ctx.fillText(cam.label, at[0], at[1] - 4);
  }
}

/** Draws the whole chart; returns what a click can pick. */
export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, scene: SkyScene): Pickable[] {
  const p = new Projector(scene.view, w, h);
  const f = scene.frame;
  const sun = bodyVector('Sun', scene.ms, scene.site).v;
  const moon = bodyVector('Moon', scene.ms, scene.site).v;
  const sunAlt = Math.asin(horiz(f, sun)[2]) * DEG;
  const moonAlt = Math.asin(horiz(f, moon)[2]) * DEG;
  const moonFraction = bodyLight('Moon', scene.ms).fraction;
  const moonGlow = moonAlt > 0 ? moonFraction ** 1.5 * Math.min(1, moonAlt / 10 + 0.3) : 0;
  const light: Light = { sun, sunH: horiz(f, sun), moon, moonH: horiz(f, moon), sunAlt, moonAlt, moonGlow, moonFraction };
  const picks: Pickable[] = [];

  drawBackground(ctx, p, scene, light, w, h);
  if (scene.layers.grid) drawGrid(ctx, p);
  if (scene.layers.constellations) drawConstellations(ctx, p, f, scene.layers.names);
  drawStars(ctx, p, f, limitingMagnitude(sunAlt, moonGlow), scene.layers.names);
  if (scene.layers.milkyWay) drawCore(ctx, p, f, picks, scene.layers.names);
  if (scene.layers.deepSky) drawDeepSky(ctx, p, f, picks, scene.selected?.id ?? null);
  drawSolarSystem(ctx, p, scene, light, picks);
  drawGround(ctx, p, w, h, sunAlt, true);
  drawCompass(ctx, p);
  // The frame only once the target is up; below the horizon it would lie on the ground.
  if (scene.camera && scene.layers.frame && horiz(f, scene.camera.centre)[2] > -0.03) drawCameraFrame(ctx, p, f, scene.camera);
  if (scene.selected) drawSelected(ctx, p, f, scene.selected);
  return picks;
}

export { Projector };
