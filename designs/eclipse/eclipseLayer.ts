/**
 * A MapLibre custom layer that draws an eclipse pixel by pixel, the same way
 * the globe does. For a solar eclipse: night, the Moon's shadow at the current
 * time, and the eclipse's whole footprint (path of totality or annularity, its
 * limits and central line, coverage contours). For a lunar eclipse: where the
 * Moon is up now, how much of the eclipse each place sees, and where the Moon
 * rises or sets at each contact. Worked out per pixel, the lines stay exact at
 * any zoom, down to street level.
 *
 * Drawn tile by tile over the tiles MapLibre shows, so it follows the map on
 * the globe and in the flat (Mercator) view alike. The tiles are drawn with a
 * margin into a texture of their own first, where overlapping margins do no
 * harm, and the texture is laid over the map in one go: drawn straight onto
 * the map, neighbouring tiles leave hairline seams.
 */

import { createTileMesh, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MapLibreMap } from 'maplibre-gl';
import { eclipseDeltaT, msToElementTime, type SolarEclipse } from '$core/eclipse/elements';
import { mainPhase, moonHorizon, shadowView, type LunarEclipse } from '$core/eclipse/lunar';
import { ECLIPSE_GLSL, eclipseUniforms, type EclipseUniforms } from '$core/eclipse/glsl';
import { subsolarPoint } from '$core/astro/sun';

export interface EclipseLayerOptions {
  /** Night and twilight shading. */
  night: boolean;
  /** Twilight as one smooth fade instead of civil, nautical and astronomical bands. */
  smooth: boolean;
  /** The whole footprint of the eclipse; for a lunar eclipse, where it is seen. */
  path: boolean;
  /** The Moon's shadow at the current time; for a lunar eclipse, where the Moon is up. */
  shadow: boolean;
  /** Colours for a dark background map. */
  dark: boolean;
}

const EXTENT = 8192;
const RAD = Math.PI / 180;
/** From this zoom on, latitudes come from a series around the tile's centre, for precision. */
const SERIES_ZOOM = 6;
/** Sidereal degrees the Earth turns per hour of UT. */
const SIDEREAL_DEG_PER_HOUR = 15 * 1.00273791;

const fragmentSource = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 v_tile;
  out vec4 fragColor;

  uniform float u_path;
  uniform float u_shadow;
  uniform float u_night;
  uniform float u_smooth;
  uniform float u_now;
  uniform vec3 u_sun;
  uniform vec3 u_pathColor;
  uniform vec3 u_lineColor;
  // The tile: west edge and width in degrees of longitude.
  uniform vec2 u_lon;
  // Latitude (radians) as a cubic in the distance from the tile's middle row (v − 0.5),
  // or, with u_latSeries = 0, exactly from the Mercator y of the tile's top and its height.
  uniform float u_latSeries;
  uniform vec4 u_lat;
  uniform vec2 u_mercY;
  ${ECLIPSE_GLSL}

  // Lunar eclipse (u_lunar = 1): the Moon's right ascension and declination as quadratics in
  // element time, the Greenwich sidereal angle (ΔT applied) at t = 0 and per hour, the sine of
  // its parallax and the altitude at which it rises. Contacts P1 … P4 in element time, −1000
  // for one the eclipse does not have.
  uniform float u_lunar;
  uniform vec3 u_moonRa;
  uniform vec3 u_moonDec;
  uniform vec2 u_sidereal;
  uniform float u_sinParallax;
  uniform float u_moonHorizon;
  uniform float u_contacts[7];
  uniform vec2 u_mainPhase;
  uniform vec3 u_moonTint;

  // How far the Moon is above the altitude where it rises (degrees, negative below) at time t.
  float moonUp(float t, float lat, float lon) {
    float ra = u_moonRa.x + t * (u_moonRa.y + t * u_moonRa.z);
    float dec = radians(u_moonDec.x + t * (u_moonDec.y + t * u_moonDec.z));
    float h = radians(u_sidereal.x + t * u_sidereal.y - ra + lon);
    float a = asin(clamp(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(h), -1.0, 1.0));
    return degrees(a - asin(u_sinParallax * cos(a))) - u_moonHorizon;
  }

  float isoLine(float value, float level, float width) {
    float w = fwidth(value) * width;
    return 1.0 - smoothstep(0.0, w, abs(value - level));
  }

  // Premultiplied "over": a layer of colour c and opacity a on top of what is there.
  void over(inout vec4 dst, vec3 c, float a) {
    a = clamp(a, 0.0, 1.0);
    dst = vec4(c * a, a) + dst * (1.0 - a);
  }

  float latitude() {
    if (u_latSeries > 0.5) {
      float d = v_tile.y - 0.5;
      return u_lat.x + d * (u_lat.y + d * (u_lat.z + d * u_lat.w));
    }
    float y = u_mercY.x + v_tile.y * u_mercY.y;
    // Beyond the Mercator square (the caps reaching the poles), straight on to ±90°.
    if (y < 0.0) return mix(1.48442222, 1.57079633, clamp(-y, 0.0, 1.0));
    if (y > 1.0) return -mix(1.48442222, 1.57079633, clamp(y - 1.0, 0.0, 1.0));
    return atan(sinh(3.14159265 * (1.0 - 2.0 * y)));
  }

  void main() {
    float lat = latitude();
    float lon = u_lon.x + v_tile.x * u_lon.y;
    float lonRad = radians(lon);
    vec3 n = vec3(cos(lat) * cos(lonRad), cos(lat) * sin(lonRad), sin(lat));
    float alt = degrees(asin(clamp(dot(n, u_sun), -1.0, 1.0)));
    vec2 ellipsoid = observerOnEllipsoid(lat);
    float rs = ellipsoid.x;
    float rc = ellipsoid.y;
    vec4 color = vec4(0.0);
    float aa = max(fwidth(alt), 1e-4) * 0.75;

    float night = 0.0;
    if (u_night > 0.5 && u_smooth > 0.5) {
      night = 0.52 * (1.0 - smoothstep(-18.0, 0.0, alt));
    } else if (u_night > 0.5) {
      night = 0.22 * (1.0 - smoothstep(-0.833 - aa, -0.833 + aa, alt))
        + 0.1 * (1.0 - smoothstep(-6.0 - aa, -6.0 + aa, alt))
        + 0.1 * (1.0 - smoothstep(-12.0 - aa, -12.0 + aa, alt))
        + 0.1 * (1.0 - smoothstep(-18.0 - aa, -18.0 + aa, alt));
    }

    if (u_lunar > 0.5) {
      over(color, vec3(0.02, 0.04, 0.16), night);
      if (u_path > 0.5) {
        // Share of the main phase with the Moon up: its altitude sampled through the phase, and
        // where it crosses the horizon between two samples, the crossing found on the straight line.
        const int N = 16;
        float dt = (u_mainPhase.y - u_mainPhase.x) / float(N);
        float prev = moonUp(u_mainPhase.x, lat, lon);
        float up = 0.0;
        for (int i = 1; i <= N; i++) {
          float next = moonUp(u_mainPhase.x + dt * float(i), lat, lon);
          if (prev > 0.0 && next > 0.0) up += 1.0;
          else if (prev > 0.0 || next > 0.0) up += max(prev, next) / abs(next - prev);
          prev = next;
        }
        over(color, vec3(0.06, 0.06, 0.09), 0.45 * (1.0 - up / float(N)));
        // Where the Moon rises or sets at each contact: faint for the penumbra, bold for totality.
        float lines = 0.0;
        for (int k = 0; k < 7; k++) {
          if (k == 3 || u_contacts[k] < -100.0) continue;
          float weight = (k == 0 || k == 6) ? 0.45 : (k == 1 || k == 5) ? 0.75 : 1.0;
          lines = max(lines, isoLine(moonUp(u_contacts[k], lat, lon), 0.0, k == 2 || k == 4 ? 2.0 : 1.5) * weight);
        }
        over(color, u_lineColor, lines);
      }
      if (u_shadow > 0.5) {
        // The Moon's horizon now: inside it the eclipse can be seen at this moment.
        over(color, u_moonTint, isoLine(moonUp(u_now, lat, lon), 0.0, 2.5) * 0.95);
      }
      fragColor = color;
      return;
    }

    float eclipse = 0.0;
    float edges = 0.0;
    if (u_shadow > 0.5) {
      Rel r = towardsLimb(relAt(u_now, rs, rc, lon));
      float m = length(vec2(r.u, r.v));
      float ratio = (r.L1 - r.L2) / (r.L1 + r.L2);
      // Twilight is sunlight on the air along the same line to the Sun, so the Moon dims it as
      // much as daylight: the shadow goes on to the end of twilight (or sunset, without night).
      float limit = u_night > 0.5 ? -18.0 : -0.833;
      float up = smoothstep(limit - aa, limit + aa, alt);
      float cover = covered(m * (1.0 + ratio) / r.L1, ratio) * up;
      // Eased like the globe's, so the whole partial zone shows, yet light enough to read the
      // map under the umbra; no darker than full night, which then takes over without a seam.
      eclipse = 0.52 * pow(max(cover, 1e-6), 0.7);
      edges = (isoLine(m - r.L1, 0.0, 1.5) * 0.5 + isoLine(m - abs(r.L2), 0.0, 2.0) * 0.95) * up;
    }

    // The darker of twilight and eclipse, so crossing into twilight never lightens the shadow.
    float shade = max(night, eclipse);
    float tint = clamp((eclipse - night) / max(eclipse, 1e-6), 0.0, 1.0);
    over(color, mix(vec3(0.02, 0.04, 0.16), vec3(0.0, 0.0, 0.03), tint), shade);
    over(color, vec3(1.0, 0.93, 0.85), edges);

    if (u_path > 0.5) {
      float t = eclGreatest;
      Rel r = eclipseMaximum(rs, rc, lon, t);
      float m = length(vec2(r.u, r.v));
      float magnitude = (r.L1 - m) / (r.L1 + r.L2);
      // Only where the Sun is up at the maximum, within the span the elements cover.
      float seen = step(0.0, r.zeta) * step(eclRange.x, t) * step(t, eclRange.y);
      float edge = m - abs(r.L2);
      float inside = 1.0 - smoothstep(-fwidth(edge), fwidth(edge), edge);
      over(color, u_pathColor, 0.28 * inside * seen);
      float partial = seen * step(0.0, magnitude);
      float contours = 0.0;
      for (int k = 1; k <= 9; k++) contours += isoLine(magnitude, 0.1 * float(k), 1.0) * (k % 2 == 0 ? 0.4 : 0.18);
      over(color, u_lineColor, (isoLine(magnitude, 0.0, 1.5) * 0.6 + contours) * partial);
      over(color, u_lineColor, isoLine(m, 0.0, 1.5) * 0.7 * seen);
      over(color, u_lineColor, isoLine(edge, 0.0, 2.0) * 0.95 * seen);
    }

    fragColor = color;
  }
`;

const vertexMain = /* glsl */ `
  in vec2 a_pos;
  uniform vec2 u_mercY;
  out vec2 v_tile;

  void main() {
    gl_Position = projectTile(a_pos);
    vec2 p = a_pos / ${EXTENT.toFixed(1)};
    // The meshes reach the poles with special vertices; they get a Mercator y one
    // world-height beyond the edge, which the fragment shader takes as the pole.
    if (a_pos.y < -32767.5) p.y = (-1.0 - u_mercY.x) / u_mercY.y;
    if (a_pos.y > 32766.5) p.y = (2.0 - u_mercY.x) / u_mercY.y;
    v_tile = p;
  }
`;

const compositeVertex = /* glsl */ `#version 300 es
  void main() {
    // One triangle over the whole screen.
    vec2 p = vec2(float((gl_VertexID & 1) << 2), float((gl_VertexID & 2) << 1)) - 1.0;
    gl_Position = vec4(p, 0.0, 1.0);
  }
`;

const compositeFragment = /* glsl */ `#version 300 es
  precision highp float;
  uniform sampler2D u_texture;
  out vec4 fragColor;
  void main() {
    fragColor = texelFetch(u_texture, ivec2(gl_FragCoord.xy), 0);
  }
`;

interface Mesh {
  vao: WebGLVertexArrayObject;
  count: number;
  type: number;
}

interface Target {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

/** Latitude (radians) at Mercator y, 0 at the top of the world and 1 at the bottom. */
function latitudeAt(y: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
}

export class EclipseLayer implements CustomLayerInterface {
  readonly id = 'eclipse';
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private programs = new Map<string, WebGLProgram>();
  private composite: WebGLProgram | null = null;
  private emptyVao: WebGLVertexArrayObject | null = null;
  private meshes = new Map<string, Mesh>();
  private target: Target | null = null;
  private drawn = false;
  private eclipse: { e: SolarEclipse; deltaT: number; uniforms: EclipseUniforms } | null = null;
  private lunar: { e: LunarEclipse; deltaT: number } | null = null;
  private time = Date.now();
  private opts: EclipseLayerOptions = { night: true, smooth: false, path: true, shadow: true, dark: false };

  setEclipse(e: SolarEclipse | LunarEclipse | null, deltaT?: number): void {
    this.eclipse = null;
    this.lunar = null;
    if (e && 'umbra' in e) {
      this.lunar = { e, deltaT: deltaT ?? eclipseDeltaT(e) };
    } else if (e) {
      const dT = deltaT ?? eclipseDeltaT(e);
      this.eclipse = { e, deltaT: dT, uniforms: eclipseUniforms(e, dT) };
    }
    this.map?.triggerRepaint();
  }

  setTime(ms: number): void {
    this.time = ms;
    this.map?.triggerRepaint();
  }

  setOptions(opts: Partial<EclipseLayerOptions>): void {
    this.opts = { ...this.opts, ...opts };
    this.map?.triggerRepaint();
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.gl = gl as WebGL2RenderingContext;
  }

  onRemove(): void {
    const gl = this.gl;
    if (gl) {
      for (const p of this.programs.values()) gl.deleteProgram(p);
      for (const m of this.meshes.values()) gl.deleteVertexArray(m.vao);
      if (this.composite) gl.deleteProgram(this.composite);
      if (this.emptyVao) gl.deleteVertexArray(this.emptyVao);
      if (this.target) {
        gl.deleteFramebuffer(this.target.framebuffer);
        gl.deleteTexture(this.target.texture);
      }
    }
    this.programs.clear();
    this.meshes.clear();
    this.composite = null;
    this.emptyVao = null;
    this.target = null;
    this.map = null;
    this.gl = null;
  }

  private link(gl: WebGL2RenderingContext, vertexSource: string, fragment: string): WebGLProgram {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    // One attribute slot for every variant, so the meshes serve them all.
    gl.bindAttribLocation(program, 0, 'a_pos');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    return program;
  }

  private program(gl: WebGL2RenderingContext, shaderData: CustomRenderMethodInput['shaderData']): WebGLProgram {
    let program = this.programs.get(shaderData.variantName);
    if (!program) {
      const vertexSource = `#version 300 es\n${shaderData.vertexShaderPrelude}\n${shaderData.define}\n${vertexMain}`;
      program = this.link(gl, vertexSource, fragmentSource);
      this.programs.set(shaderData.variantName, program);
    }
    return program;
  }

  /** A tile's mesh, finer at low zoom so it follows the curve of the globe, with a margin. */
  private mesh(gl: WebGL2RenderingContext, z: number, north: boolean, south: boolean): Mesh {
    const granularity = Math.max(2, Math.min(128, 256 >> z));
    const key = `${granularity}|${north}|${south}`;
    let mesh = this.meshes.get(key);
    if (mesh) return mesh;
    const data = createTileMesh({ granularity, generateBorders: true, extendToNorthPole: north, extendToSouthPole: south });
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.SHORT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const is32 = data.uses32bitIndices;
    mesh = { vao, count: data.indices.byteLength / (is32 ? 4 : 2), type: is32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
    this.meshes.set(key, mesh);
    return mesh;
  }

  /** The texture the tiles are drawn into, the size of the map's drawing buffer. */
  private renderTarget(gl: WebGL2RenderingContext): Target {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    if (this.target && this.target.width === width && this.target.height === height) return this.target;
    if (this.target) {
      gl.deleteFramebuffer(this.target.framebuffer);
      gl.deleteTexture(this.target.texture);
    }
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    this.target = { framebuffer, texture, width, height };
    return this.target;
  }

  /** Draws the tiles into the texture, before MapLibre draws the map. */
  prerender(gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const map = this.map;
    this.drawn = false;
    if (!map) return;
    const gl2 = gl as WebGL2RenderingContext;
    const e = this.eclipse;
    const lunar = this.lunar;
    let now = 0;
    let shadow = false;
    if (e) {
      now = msToElementTime(e.e, this.time, e.deltaT);
      shadow = this.opts.shadow && now >= e.e.range[0] && now <= e.e.range[1];
    } else if (lunar) {
      now = msToElementTime(lunar.e, this.time, lunar.deltaT);
      shadow = this.opts.shadow && now >= lunar.e.contacts[0]! && now <= lunar.e.contacts[6]!;
    }
    const path = !!(e || lunar) && this.opts.path;
    if (!shadow && !path && !this.opts.night) return;

    const target = this.renderTarget(gl2);
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, target.framebuffer);
    gl2.viewport(0, 0, target.width, target.height);
    gl2.clearColor(0, 0, 0, 0);
    gl2.clear(gl2.COLOR_BUFFER_BIT);
    // Each pixel simply takes the last tile drawn over it: margins overlap without adding up.
    gl2.disable(gl2.BLEND);
    gl2.disable(gl2.DEPTH_TEST);
    gl2.disable(gl2.STENCIL_TEST);
    gl2.disable(gl2.CULL_FACE);
    gl2.colorMask(true, true, true, true);

    const program = this.program(gl2, args.shaderData);
    gl2.useProgram(program);
    const loc = (name: string) => gl2.getUniformLocation(program, name);
    if (e) {
      for (const [name, value] of Object.entries(e.uniforms)) {
        const l = loc(name);
        if (typeof value === 'number') gl2.uniform1f(l, value);
        else if (value.length === 2) gl2.uniform2fv(l, value);
        else if (value.length === 3) gl2.uniform3fv(l, value);
        else gl2.uniform4fv(l, value);
      }
    }
    gl2.uniform1f(loc('u_lunar'), lunar ? 1 : 0);
    if (lunar) {
      const l = lunar.e;
      gl2.uniform3fv(loc('u_moonRa'), l.ra);
      gl2.uniform3fv(loc('u_moonDec'), l.dec);
      gl2.uniform2f(loc('u_sidereal'), 15 * l.gst - (lunar.deltaT / 3600) * SIDEREAL_DEG_PER_HOUR, SIDEREAL_DEG_PER_HOUR);
      gl2.uniform1f(loc('u_sinParallax'), Math.sin(l.parallax * RAD));
      gl2.uniform1f(loc('u_moonHorizon'), moonHorizon(l));
      gl2.uniform1fv(loc('u_contacts'), l.contacts.map((t) => t ?? -1000));
      gl2.uniform2fv(loc('u_mainPhase'), mainPhase(l));
      // The Moon's colour: pale in the penumbra, orange once the umbra bites, red in totality.
      const v = shadowView(l, this.time, lunar.deltaT);
      const tint = v.umbralMagnitude >= 1 ? [0.9, 0.22, 0.1] : v.umbralMagnitude > 0 ? [1.0, 0.55, 0.2] : [1.0, 0.92, 0.75];
      gl2.uniform3fv(loc('u_moonTint'), tint);
    }
    gl2.uniform1f(loc('u_path'), path ? 1 : 0);
    gl2.uniform1f(loc('u_shadow'), shadow ? 1 : 0);
    gl2.uniform1f(loc('u_night'), this.opts.night ? 1 : 0);
    gl2.uniform1f(loc('u_smooth'), this.opts.smooth ? 1 : 0);
    gl2.uniform1f(loc('u_now'), now);
    const sun = subsolarPoint(this.time);
    const sLat = sun.lat * RAD;
    const sLon = sun.lon * RAD;
    gl2.uniform3f(loc('u_sun'), Math.cos(sLat) * Math.cos(sLon), Math.cos(sLat) * Math.sin(sLon), Math.sin(sLat));
    gl2.uniform3fv(loc('u_pathColor'), this.opts.dark ? [1.0, 0.55, 0.25] : [0.95, 0.35, 0.1]);
    gl2.uniform3fv(loc('u_lineColor'), this.opts.dark ? [1.0, 0.72, 0.35] : [0.75, 0.2, 0.05]);

    const globe = map.getProjection()?.type === 'globe';
    for (const tile of map.coveringTiles({ tileSize: 512 })) {
      if (globe && tile.wrap !== 0) continue;
      const { x, y, z } = tile.canonical;
      const size = 1 / 2 ** z;
      const projection = args.getProjectionData({ tileID: tile, applyGlobeMatrix: true });
      gl2.uniformMatrix4fv(loc('u_projection_matrix'), false, projection.mainMatrix);
      gl2.uniformMatrix4fv(loc('u_projection_fallback_matrix'), false, projection.fallbackMatrix);
      gl2.uniform4f(loc('u_projection_tile_mercator_coords'), ...projection.tileMercatorCoords);
      gl2.uniform4f(loc('u_projection_clipping_plane'), ...projection.clippingPlane);
      gl2.uniform1f(loc('u_projection_transition'), projection.projectionTransition);
      // Where the tile is, worked out here in double precision so street-level tiles stay sharp.
      gl2.uniform2f(loc('u_lon'), (x * size + tile.wrap) * 360 - 180, size * 360);
      gl2.uniform2f(loc('u_mercY'), y * size, size);
      const north = globe && y === 0;
      const south = globe && y === 2 ** z - 1;
      // Tiles reaching the poles take the exact formula, which knows what to do past the edge.
      const series = z >= SERIES_ZOOM && !north && !south;
      gl2.uniform1f(loc('u_latSeries'), series ? 1 : 0);
      if (series) {
        // lat(y): dφ/dy = −2π cos φ, d²φ/dy² = −4π² sin φ cos φ, d³φ/dy³ = 8π³ cos 2φ cos φ.
        const phi = latitudeAt((y + 0.5) * size);
        const c = Math.cos(phi);
        const s = Math.sin(phi);
        const PI = Math.PI;
        gl2.uniform4f(loc('u_lat'), phi, -2 * PI * c * size, -2 * PI * PI * s * c * size ** 2, ((4 / 3) * PI ** 3 * Math.cos(2 * phi) * c) * size ** 3);
      }
      const mesh = this.mesh(gl2, z, north, south);
      gl2.bindVertexArray(mesh.vao);
      gl2.drawElements(gl2.TRIANGLES, mesh.count, mesh.type, 0);
    }
    gl2.bindVertexArray(null);
    this.drawn = true;
  }

  /** Lays the texture over the map. */
  render(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    if (!this.drawn || !this.target) return;
    const gl2 = gl as WebGL2RenderingContext;
    if (!this.composite) {
      this.composite = this.link(gl2, compositeVertex, compositeFragment);
      this.emptyVao = gl2.createVertexArray();
    }
    gl2.useProgram(this.composite);
    gl2.activeTexture(gl2.TEXTURE0);
    gl2.bindTexture(gl2.TEXTURE_2D, this.target.texture);
    gl2.uniform1i(gl2.getUniformLocation(this.composite, 'u_texture'), 0);
    // Premultiplied colour over the map; the map's own alpha (opaque) is left as it is.
    gl2.enable(gl2.BLEND);
    gl2.blendFuncSeparate(gl2.ONE, gl2.ONE_MINUS_SRC_ALPHA, gl2.ZERO, gl2.ONE);
    gl2.disable(gl2.DEPTH_TEST);
    gl2.disable(gl2.STENCIL_TEST);
    gl2.bindVertexArray(this.emptyVao);
    gl2.drawArrays(gl2.TRIANGLES, 0, 3);
    gl2.bindVertexArray(null);
  }
}
