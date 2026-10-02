/**
 * Three.js Earth with a physically placed day/night terminator and twilight
 * zones. The Earth stays fixed in the scene and the sun moves around it, so
 * geographic coordinates map to scene coordinates directly.
 *
 * Place markers are HTML elements laid over the canvas (class names
 * `globe-marker`, `globe-marker--selected`, `globe-sun`), so each design can
 * style them with plain CSS.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { subsolarPoint } from '../astro/sun';
import { eclipseDeltaT, msToElementTime, type SolarEclipse } from '../eclipse/elements';
import { ECLIPSE_GLSL, eclipseUniforms } from '../eclipse/glsl';
// Imported, not served from /public: Vite then emits hashed files with URLs that work
// from every page (designs live in subfolders) and under any base path.
import dayTexture from './textures/earth-blue-marble.jpg';
import nightTexture from './textures/earth-night.jpg';
import waterTexture from './textures/earth-water.png';

export interface GlobeMarker {
  id: string;
  lat: number;
  lon: number;
  label: string;
  color?: string;
}

export interface GlobeOptions {
  /** Draw civil/nautical/astronomical twilight as distinct bands, or blend smoothly. */
  twilightStyle: 'bands' | 'smooth';
  /** Thin lines along the sunrise and twilight boundaries. */
  terminatorLines: boolean;
  nightLights: boolean;
  /** Brightness of the sunlit side, 1 = natural. */
  dayBrightness: number;
  /** Brightness of the dark side (before city lights), 0 = black. */
  nightBrightness: number;
  /** Equator, tropics and polar circles. */
  latitudeLines: boolean;
  /** 30° lat/lon graticule. */
  graticule: boolean;
  atmosphere: boolean;
  /** Sun glint on oceans. */
  specular: boolean;
  /** Keep the camera above the subsolar point as time runs. */
  followSun: boolean;
  /** Slowly spin when idle. */
  autoRotate: boolean;
  /** Labels next to markers. */
  showLabels: boolean;
  showSunMarker: boolean;
  /** With an eclipse set: its whole footprint (path of totality or annularity, coverage contours). */
  eclipsePath: boolean;
  /** With an eclipse set: the Moon's shadow at the current time. */
  eclipseShadow: boolean;
  /** CSS colours. */
  atmosphereColor: string;
  lineColor: string;
  terminatorColor: string;
  eclipseColor: string;
  background: string | null;
}

export const DEFAULT_GLOBE_OPTIONS: GlobeOptions = {
  twilightStyle: 'bands',
  terminatorLines: true,
  nightLights: true,
  dayBrightness: 1,
  nightBrightness: 0.06,
  latitudeLines: true,
  graticule: false,
  atmosphere: true,
  specular: true,
  followSun: false,
  autoRotate: false,
  showLabels: true,
  showSunMarker: true,
  eclipsePath: true,
  eclipseShadow: true,
  atmosphereColor: '#5aa8ff',
  lineColor: '#ffffff',
  terminatorColor: '#ffcc66',
  eclipseColor: '#ff6b4a',
  background: null,
};

const TROPIC = 23.4368;
const FOV = 35;

/** Camera distance (Earth radii) at which the globe just fills the narrower side of the view. */
export const FIT_DISTANCE = 1 / Math.sin((FOV * Math.PI) / 360);

/** Geographic coordinates to a unit vector (matches SphereGeometry UVs). */
export function latLonToVector(lat: number, lon: number, radius = 1): THREE.Vector3 {
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(phi) * Math.cos(lam), Math.sin(phi), -Math.cos(phi) * Math.sin(lam)).multiplyScalar(radius);
}

export function vectorToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const n = v.clone().normalize();
  return { lat: (Math.asin(n.y) * 180) / Math.PI, lon: (Math.atan2(-n.z, n.x) * 180) / Math.PI };
}

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const earthFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D waterMap;
  uniform vec3 sunDir;
  uniform float bands;
  uniform float lines;
  uniform float lights;
  uniform float specular;
  uniform float dayLevel;
  uniform float nightLevel;
  uniform vec3 terminatorColor;
  uniform float eclPath;
  uniform float eclShadow;
  // Element time now.
  uniform float eclNow;
  uniform vec3 eclColor;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
${ECLIPSE_GLSL}
  // How far from night (0) to day (1) the light is at a sun altitude (degrees).
  float lightFraction(float alt) {
    if (bands > 0.5) {
      // Distinct steps: night, astronomical, nautical, civil, day.
      float aa = fwidth(alt) * 0.75;
      return 0.08 * smoothstep(-18.0 - aa, -18.0 + aa, alt)
        + 0.10 * smoothstep(-12.0 - aa, -12.0 + aa, alt)
        + 0.17 * smoothstep(-6.0 - aa, -6.0 + aa, alt)
        + 0.65 * smoothstep(-0.833 - aa, -0.833 + aa, alt);
    }
    float f = smoothstep(-18.0, 0.0, alt);
    return f * f;
  }

  float isoLine(float value, float level) {
    float w = fwidth(value) * 1.2;
    return 1.0 - smoothstep(0.0, w, abs(value - level));
  }

  void main() {
    vec3 n = normalize(vNormal);
    float s = dot(n, sunDir);
    float alt = degrees(asin(clamp(s, -1.0, 1.0)));

    // The observer on the WGS 84 ellipsoid (texture latitudes are geodetic), for the eclipse.
    float lon = degrees(atan(-n.z, n.x));
    vec2 ellipsoid = observerOnEllipsoid(asin(clamp(n.y, -1.0, 1.0)));
    float rs = ellipsoid.x;
    float rc = ellipsoid.y;

    // The Moon's shadow now: how much of the Sun is hidden, and the outlines of penumbra and umbra.
    float cover = 0.0;
    float shadowEdge = 0.0;
    if (eclShadow > 0.5) {
      Rel r = towardsLimb(relAt(eclNow, rs, rc, lon));
      float m = length(vec2(r.u, r.v));
      float ratio = (r.L1 - r.L2) / (r.L1 + r.L2);
      // Twilight is sunlight on the air along the same line to the Sun, so the Moon dims it too:
      // the shadow goes on to the end of twilight, and the darker of the two is drawn below.
      float up = smoothstep(-18.5, -17.5, alt);
      cover = covered(m * (1.0 + ratio) / r.L1, ratio) * up;
      shadowEdge = (isoLine(m - r.L1, 0.0) * 0.45 + isoLine(m - abs(r.L2), 0.0) * 0.95) * up;
    }

    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;

    // A gentle lambert falloff in daylight keeps the globe looking round, but
    // stays well above twilight so day and night never blur together.
    float sunlit = mix(0.8, 1.0, clamp(s * 2.5, 0.0, 1.0));
    float level = mix(nightLevel, dayLevel, lightFraction(alt));
    float twilight = level * mix(1.0, sunlit, step(-0.833, alt));
    // Daylight falls with the hidden fraction of the Sun. The fraction drops off fast away from
    // the centre line, so it is eased to show the whole partial zone; the result is a brightness
    // as seen (colours here are linear, hence the 2.2), down to deep twilight in the umbra.
    // Where the shadow reaches into twilight the darker of the two wins, so it never lightens.
    float seenLight = 1.0 - 0.85 * pow(max(cover, 1e-6), 0.7);
    vec3 color = day * min(twilight, dayLevel * sunlit * pow(seenLight, 2.2));

    // City lights fade in as the sky darkens (nautical twilight onward).
    float dark = 1.0 - smoothstep(-12.0, -4.0, alt);
    color += night * vec3(1.0, 0.85, 0.6) * dark * lights * 1.4;

    if (specular > 0.5) {
      float water = texture2D(waterMap, vUv).r;
      vec3 viewDir = normalize(cameraPosition - vWorld);
      vec3 refl = reflect(-sunDir, n);
      // Fade the glint out towards the terminator and at grazing view angles,
      // where foreshortening would stretch it into a smudge along the limb.
      float facing = smoothstep(0.6, 0.95, dot(n, viewDir));
      float glint = pow(max(dot(refl, viewDir), 0.0), 200.0) * water * smoothstep(0.05, 0.35, s) * facing;
      color += vec3(1.0, 0.95, 0.85) * glint * 0.35;
    }

    color = mix(color, vec3(1.0, 0.93, 0.85), clamp(shadowEdge, 0.0, 1.0));

    if (eclPath > 0.5) {
      // Each pixel finds its own greatest eclipse: the instant it passes closest to the shadow axis.
      float t = eclGreatest;
      Rel r = eclipseMaximum(rs, rc, lon, t);
      float m = length(vec2(r.u, r.v));
      float magnitude = (r.L1 - m) / (r.L1 + r.L2);
      // Only where the Sun is up at that moment, within the span the elements cover.
      float seen = step(0.0, r.zeta) * step(eclRange.x, t) * step(t, eclRange.y);
      float edge = m - abs(r.L2);
      float inside = 1.0 - smoothstep(-fwidth(edge), fwidth(edge), edge);
      color = mix(color, eclColor, 0.3 * inside * seen);
      // Path limits, central line, the outer limit of the partial eclipse, and magnitude 0.2 to 0.8.
      float l = isoLine(edge, 0.0) * 0.95 + isoLine(m, 0.0) * 0.45 + isoLine(magnitude, 0.0) * 0.5;
      for (int k = 1; k <= 4; k++) l += isoLine(magnitude, 0.2 * float(k)) * 0.22;
      color = mix(color, eclColor, clamp(l * seen * step(0.0, magnitude), 0.0, 1.0));
    }

    if (lines > 0.5) {
      float l = isoLine(alt, -0.833) * 0.9
        + isoLine(alt, -6.0) * 0.45
        + isoLine(alt, -12.0) * 0.3
        + isoLine(alt, -18.0) * 0.2;
      color = mix(color, terminatorColor, clamp(l, 0.0, 1.0));
    }

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const atmosphereFragment = /* glsl */ `
  uniform vec3 glowColor;
  uniform vec3 sunDir;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float rim = 1.0 - abs(dot(normalize(vNormal), viewDir));
    float intensity = pow(rim, 3.0);
    float lit = 0.35 + 0.65 * smoothstep(-0.3, 0.4, dot(normalize(vNormal), sunDir));
    gl_FragColor = vec4(glowColor, intensity * lit);
    #include <colorspace_fragment>
  }
`;

export class GlobeRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  /** Called when the user taps the globe surface (not after a drag). */
  onPick: ((lat: number, lon: number) => void) | null = null;
  /** Called when a marker is tapped. */
  onMarkerClick: ((id: string) => void) | null = null;

  private opts: GlobeOptions;
  private container: HTMLElement;
  private overlay: HTMLDivElement;
  private earth: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private atmosphere: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private latLines: THREE.Group;
  private graticule: THREE.Group;
  private markers: GlobeMarker[] = [];
  private selectedId: string | null = null;
  private markerEls = new Map<string, HTMLDivElement>();
  private sunEl: HTMLDivElement;
  private sunDir = new THREE.Vector3(1, 0, 0);
  private subsolar = { lat: 0, lon: 0 };
  private time = Date.now();
  private eclipse: { e: SolarEclipse; deltaT: number } | null = null;
  private dirty = true;
  private frame = 0;
  private resizeObserver: ResizeObserver;
  private flight: { from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number } | null = null;
  private disposed = false;

  constructor(container: HTMLElement, options: Partial<GlobeOptions> = {}) {
    this.container = container;
    this.opts = { ...DEFAULT_GLOBE_OPTIONS, ...options };
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.overlay = document.createElement('div');
    this.overlay.className = 'globe-overlay';
    Object.assign(this.overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
    container.appendChild(this.overlay);

    this.sunEl = document.createElement('div');
    this.sunEl.className = 'globe-sun';
    this.sunEl.title = 'Sun overhead';
    this.overlay.appendChild(this.sunEl);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);
    this.camera.position.copy(latLonToVector(30, 15, 4));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.15;
    this.controls.maxDistance = 10;
    this.controls.zoomSpeed = 0.8;
    this.controls.autoRotateSpeed = 0.4;
    this.controls.addEventListener('change', () => {
      this.updateRotateSpeed();
      this.dirty = true;
    });
    this.controls.addEventListener('start', () => {
      this.flight = null;
    });

    const loader = new THREE.TextureLoader();
    const tex = (url: string, srgb = true) => {
      const t = loader.load(url, () => (this.dirty = true));
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      return t;
    };

    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 64),
      new THREE.ShaderMaterial({
        vertexShader: earthVertex,
        fragmentShader: earthFragment,
        uniforms: {
          dayMap: { value: tex(dayTexture) },
          nightMap: { value: tex(nightTexture) },
          waterMap: { value: tex(waterTexture, false) },
          sunDir: { value: this.sunDir },
          bands: { value: 1 },
          lines: { value: 1 },
          lights: { value: 1 },
          dayLevel: { value: 1 },
          nightLevel: { value: 0.06 },
          specular: { value: 1 },
          terminatorColor: { value: new THREE.Color() },
          eclPath: { value: 0 },
          eclShadow: { value: 0 },
          eclX: { value: new THREE.Vector4() },
          eclY: { value: new THREE.Vector4() },
          eclD: { value: new THREE.Vector3() },
          eclMu: { value: new THREE.Vector3() },
          eclL1: { value: new THREE.Vector3() },
          eclL2: { value: new THREE.Vector3() },
          eclTanF: { value: new THREE.Vector2() },
          eclRange: { value: new THREE.Vector2() },
          eclLonShift: { value: 0 },
          eclGreatest: { value: 0 },
          eclNow: { value: 0 },
          eclColor: { value: new THREE.Color() },
        },
      }),
    );
    this.scene.add(this.earth);

    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.06, 96, 48),
      new THREE.ShaderMaterial({
        vertexShader: atmosphereVertex,
        fragmentShader: atmosphereFragment,
        uniforms: { glowColor: { value: new THREE.Color() }, sunDir: { value: this.sunDir } },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.atmosphere);

    this.latLines = new THREE.Group();
    for (const lat of [0, TROPIC, -TROPIC, 90 - TROPIC, -(90 - TROPIC)]) this.latLines.add(this.circleOfLatitude(lat, lat === 0 ? 0.55 : 0.35));
    this.scene.add(this.latLines);

    this.graticule = new THREE.Group();
    for (let lat = -60; lat <= 60; lat += 30) this.graticule.add(this.circleOfLatitude(lat, 0.15));
    for (let lon = -180; lon < 180; lon += 30) this.graticule.add(this.meridian(lon, 0.15));
    this.scene.add(this.graticule);

    this.applyOptions();
    this.setupPicking();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.setTime(Date.now());

    const loop = () => {
      if (this.disposed) return;
      this.frame = requestAnimationFrame(loop);
      this.tick();
    };
    loop();
  }

  // --- Public API ----------------------------------------------------------

  setTime(utcMs: number): void {
    this.time = utcMs;
    this.updateEclipseTime();
    this.subsolar = subsolarPoint(utcMs);
    const prev = this.sunDir.clone();
    this.sunDir.copy(latLonToVector(this.subsolar.lat, this.subsolar.lon));
    if (this.opts.followSun && !this.flight) {
      // Rotate the camera by the same amount the sun moved.
      const q = new THREE.Quaternion().setFromUnitVectors(prev, this.sunDir);
      this.camera.position.applyQuaternion(q);
      this.camera.lookAt(0, 0, 0);
    }
    this.dirty = true;
  }

  setMarkers(markers: GlobeMarker[], selectedId: string | null = this.selectedId): void {
    this.markers = markers;
    this.selectedId = selectedId;
    const keep = new Set(markers.map((m) => m.id));
    for (const [id, el] of this.markerEls) {
      if (!keep.has(id)) {
        el.remove();
        this.markerEls.delete(id);
      }
    }
    for (const m of markers) {
      let el = this.markerEls.get(m.id);
      if (!el) {
        el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.pointerEvents = 'auto';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onMarkerClick?.(m.id);
        });
        const label = document.createElement('span');
        label.className = 'globe-marker__label';
        el.appendChild(label);
        this.overlay.appendChild(el);
        this.markerEls.set(m.id, el);
      }
      el.className = `globe-marker${m.id === selectedId ? ' globe-marker--selected' : ''}`;
      el.style.setProperty('--marker-color', m.color ?? '');
      const label = el.firstElementChild as HTMLSpanElement;
      label.textContent = m.label;
      label.style.display = this.opts.showLabels ? '' : 'none';
    }
    this.dirty = true;
  }

  /**
   * Show a solar eclipse: its footprint and, while the time is within it, the
   * Moon's shadow. ΔT defaults to the measured or extrapolated value.
   */
  setEclipse(e: SolarEclipse | null, deltaT?: number): void {
    this.eclipse = e ? { e, deltaT: deltaT ?? eclipseDeltaT(e) } : null;
    const u = this.earth.material.uniforms;
    if (e) {
      for (const [name, value] of Object.entries(eclipseUniforms(e, this.eclipse!.deltaT))) {
        const uniform = u[name];
        if (typeof value === 'number') uniform.value = value;
        else (uniform.value as THREE.Vector2 | THREE.Vector3 | THREE.Vector4).fromArray(value);
      }
    }
    this.applyOptions();
  }

  setOptions(options: Partial<GlobeOptions>): void {
    this.opts = { ...this.opts, ...options };
    this.applyOptions();
  }

  getOptions(): GlobeOptions {
    return { ...this.opts };
  }

  /** Smoothly turn the globe to face a point, optionally changing zoom. */
  flyTo(lat: number, lon: number, distance?: number, durationMs = 1200): void {
    const d = distance ?? this.camera.position.length();
    const to = latLonToVector(lat, lon, d);
    this.flight = { from: this.camera.position.clone(), to, start: performance.now(), duration: durationMs };
  }

  /** Zoom by a factor (<1 zooms in). */
  zoom(factor: number): void {
    const d = THREE.MathUtils.clamp(this.camera.position.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.flight = { from: this.camera.position.clone(), to: this.camera.position.clone().setLength(d), start: performance.now(), duration: 400 };
  }

  get subsolarPoint(): { lat: number; lon: number } {
    return { ...this.subsolar };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        const mat = o.material as THREE.Material & { uniforms?: Record<string, { value: unknown }> };
        for (const u of Object.values(mat.uniforms ?? {})) if (u.value instanceof THREE.Texture) u.value.dispose();
        mat.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }

  // --- Internals -----------------------------------------------------------

  private applyOptions(): void {
    const o = this.opts;
    const u = this.earth.material.uniforms;
    u.bands.value = o.twilightStyle === 'bands' ? 1 : 0;
    u.lines.value = o.terminatorLines ? 1 : 0;
    u.lights.value = o.nightLights ? 1 : 0;
    u.dayLevel.value = o.dayBrightness;
    u.nightLevel.value = o.nightBrightness;
    u.specular.value = o.specular ? 1 : 0;
    (u.terminatorColor.value as THREE.Color).set(o.terminatorColor);
    (u.eclColor.value as THREE.Color).set(o.eclipseColor);
    u.eclPath.value = this.eclipse && o.eclipsePath ? 1 : 0;
    this.updateEclipseTime();
    (this.atmosphere.material.uniforms.glowColor.value as THREE.Color).set(o.atmosphereColor);
    this.atmosphere.visible = o.atmosphere;
    this.latLines.visible = o.latitudeLines;
    this.graticule.visible = o.graticule;
    for (const group of [this.latLines, this.graticule]) {
      group.traverse((c) => {
        if (c instanceof THREE.Line) (c.material as THREE.LineBasicMaterial).color.set(o.lineColor);
      });
    }
    this.controls.autoRotate = o.autoRotate;
    this.renderer.setClearColor(o.background ?? 0x000000, o.background ? 1 : 0);
    this.sunEl.style.display = o.showSunMarker ? '' : 'none';
    for (const el of this.markerEls.values()) {
      (el.firstElementChild as HTMLElement).style.display = o.showLabels ? '' : 'none';
    }
    this.dirty = true;
  }

  private updateEclipseTime(): void {
    const u = this.earth.material.uniforms;
    if (!this.eclipse) {
      u.eclShadow.value = 0;
      return;
    }
    const { e, deltaT } = this.eclipse;
    const t = msToElementTime(e, this.time, deltaT);
    u.eclNow.value = t;
    // Outside the span of the polynomials the shadow is off the Earth anyway.
    u.eclShadow.value = this.opts.eclipseShadow && t >= e.range[0] && t <= e.range[1] ? 1 : 0;
    this.dirty = true;
  }

  private circleOfLatitude(lat: number, opacity: number): THREE.Line {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 2) pts.push(latLonToVector(lat, lon, 1.001));
    return this.line(pts, opacity, lat !== 0);
  }

  private meridian(lon: number, opacity: number): THREE.Line {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 2) pts.push(latLonToVector(lat, lon, 1.001));
    return this.line(pts, opacity, false);
  }

  private line(points: THREE.Vector3[], opacity: number, dashed: boolean): THREE.Line {
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color: this.opts.lineColor, transparent: true, opacity, dashSize: 0.02, gapSize: 0.015 })
      : new THREE.LineBasicMaterial({ color: this.opts.lineColor, transparent: true, opacity });
    const line = new THREE.Line(geom, mat);
    if (dashed) line.computeLineDistances();
    return line;
  }

  private setupPicking(): void {
    const el = this.renderer.domElement;
    let down: { x: number; y: number; t: number } | null = null;
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 500;
      down = null;
      if (moved > 6 || !quick || !this.onPick) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const hit = ray.intersectObject(this.earth)[0];
      if (hit) {
        const { lat, lon } = vectorToLatLon(hit.point);
        this.onPick(lat, lon);
      }
    });
  }

  private updateRotateSpeed(): void {
    // Slower rotation when zoomed in, so a drag moves the surface under the finger.
    const d = this.camera.position.length();
    this.controls.rotateSpeed = THREE.MathUtils.clamp((d - 1) * 0.35, 0.03, 1);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    // The narrower side always spans FOV degrees, so the globe fits portrait screens too.
    this.camera.fov = w < h ? 2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * (h / w)) * (180 / Math.PI) : FOV;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private tick(): void {
    if (this.flight) {
      const f = this.flight;
      const k = Math.min(1, (performance.now() - f.start) / f.duration);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      const dir = f.from.clone().normalize().lerp(f.to.clone().normalize(), e).normalize();
      // Slerp-ish: normalised lerp is fine except for antipodal jumps, nudge those.
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
      const len = THREE.MathUtils.lerp(f.from.length(), f.to.length(), e);
      this.camera.position.copy(dir.multiplyScalar(len));
      this.camera.lookAt(0, 0, 0);
      this.updateRotateSpeed();
      if (k >= 1) this.flight = null;
      this.dirty = true;
    }
    if (this.controls.update()) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.positionOverlay();
  }

  private positionOverlay(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const camDir = this.camera.position.clone().normalize();
    const camDist = this.camera.position.length();
    const place = (el: HTMLElement, lat: number, lon: number) => {
      const p = latLonToVector(lat, lon);
      // Hidden behind the limb? Visible iff dot(p, cam) > 1/dist.
      const visible = p.dot(camDir) > 1 / camDist + 0.01;
      if (!visible) {
        el.style.visibility = 'hidden';
        return;
      }
      const s = p.project(this.camera);
      el.style.visibility = 'visible';
      el.style.transform = `translate(${((s.x + 1) / 2) * w}px, ${((1 - s.y) / 2) * h}px)`;
    };
    for (const m of this.markers) {
      const el = this.markerEls.get(m.id);
      if (el) place(el, m.lat, m.lon);
    }
    if (this.opts.showSunMarker) place(this.sunEl, this.subsolar.lat, this.subsolar.lon);
  }
}
