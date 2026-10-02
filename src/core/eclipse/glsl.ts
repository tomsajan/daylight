/**
 * The eclipse maths of ./local.ts in GLSL, so a renderer can work out the
 * Moon's shadow for every pixel: the globe and the eclipse map share it.
 *
 * The chunk declares its uniforms (prefixed ecl) and these functions:
 *   observerOnEllipsoid(lat)   ρ sin φ′ and ρ cos φ′ for a geodetic latitude (radians)
 *   relAt(t, rs, rc, lon)      the observer relative to the shadow at element time t
 *   eclipseMaximum(rs, rc, lon, t)  the observer's greatest eclipse, searched from t
 *   covered(sep, k)            fraction of the Sun's disc hidden
 * Set the uniforms with eclipseUniforms().
 */

import { eclipseDeltaT, greatestEclipseMs, msToElementTime, type SolarEclipse } from './elements';

export const ECLIPSE_GLSL = /* glsl */ `
  // Solar eclipse: Besselian elements as polynomials in t (hours from t0, TT).
  uniform vec4 eclX;
  uniform vec4 eclY;
  uniform vec3 eclD;
  uniform vec3 eclMu;
  uniform vec3 eclL1;
  uniform vec3 eclL2;
  uniform vec2 eclTanF;
  uniform vec2 eclRange;
  // −ΔT turned into degrees of Earth rotation.
  uniform float eclLonShift;
  // Element time of greatest eclipse (start of each pixel's search).
  uniform float eclGreatest;

  // The observer relative to the Moon's shadow at element time t; the same
  // quantities as relative() in core/eclipse/local.ts.
  struct Rel { float u; float v; float a; float b; float L1; float L2; float zeta; };

  vec2 observerOnEllipsoid(float phi) {
    float reduced = atan(0.99664719 * sin(phi), cos(phi));
    return vec2(0.99664719 * sin(reduced), cos(reduced));
  }

  Rel relAt(float t, float rs, float rc, float lon) {
    float x = eclX.x + t * (eclX.y + t * (eclX.z + t * eclX.w));
    float y = eclY.x + t * (eclY.y + t * (eclY.z + t * eclY.w));
    float dx = eclX.y + t * (2.0 * eclX.z + 3.0 * t * eclX.w);
    float dy = eclY.y + t * (2.0 * eclY.z + 3.0 * t * eclY.w);
    float d = radians(eclD.x + t * (eclD.y + t * eclD.z));
    float dd = radians(eclD.y + 2.0 * t * eclD.z);
    float dmu = radians(eclMu.y + 2.0 * t * eclMu.z);
    float h = radians(eclMu.x + t * (eclMu.y + t * eclMu.z) + lon + eclLonShift);
    float sd = sin(d);
    float cd = cos(d);
    float xi = rc * sin(h);
    float eta = rs * cd - rc * sd * cos(h);
    float zeta = rs * sd + rc * cd * cos(h);
    Rel r;
    r.u = x - xi;
    r.v = y - eta;
    r.a = dx - dmu * rc * cos(h);
    r.b = dy - (dmu * xi * sd - zeta * dd);
    r.L1 = eclL1.x + t * (eclL1.y + t * eclL1.z) - zeta * eclTanF.x;
    r.L2 = eclL2.x + t * (eclL2.y + t * eclL2.z) - zeta * eclTanF.y;
    r.zeta = zeta;
    return r;
  }

  // The instant the observer passes closest to the shadow axis; t comes back as that instant.
  Rel eclipseMaximum(float rs, float rc, float lon, inout float t) {
    Rel r = relAt(t, rs, rc, lon);
    for (int i = 0; i < 5; i++) {
      t -= (r.u * r.a + r.v * r.b) / (r.a * r.a + r.b * r.b);
      r = relAt(t, rs, rc, lon);
    }
    return r;
  }

  // Fraction of the Sun's disc (radius 1) covered by the Moon's (radius k) at centre distance s.
  float covered(float sep, float k) {
    if (sep >= 1.0 + k) return 0.0;
    if (sep <= abs(1.0 - k)) return k >= 1.0 ? 1.0 : k * k;
    float a1 = acos(clamp((sep * sep + 1.0 - k * k) / (2.0 * sep), -1.0, 1.0));
    float a2 = acos(clamp((sep * sep + k * k - 1.0) / (2.0 * sep * k), -1.0, 1.0));
    float tri = 0.5 * sqrt(max(0.0, (-sep + 1.0 + k) * (sep + 1.0 - k) * (sep - 1.0 + k) * (sep + 1.0 + k)));
    return clamp((a1 + k * k * a2 - tri) / 3.14159265, 0.0, 1.0);
  }
`;

export interface EclipseUniforms {
  eclX: [number, number, number, number];
  eclY: [number, number, number, number];
  eclD: [number, number, number];
  eclMu: [number, number, number];
  eclL1: [number, number, number];
  eclL2: [number, number, number];
  eclTanF: [number, number];
  eclRange: [number, number];
  eclLonShift: number;
  eclGreatest: number;
}

/** Values for the uniforms of ECLIPSE_GLSL. ΔT defaults to the measured or extrapolated value. */
export function eclipseUniforms(e: SolarEclipse, dT = eclipseDeltaT(e)): EclipseUniforms {
  return {
    eclX: [e.x[0], e.x[1], e.x[2], e.x[3]],
    eclY: [e.y[0], e.y[1], e.y[2], e.y[3]],
    eclD: [e.d[0], e.d[1], e.d[2]],
    eclMu: [e.mu[0], e.mu[1], e.mu[2]],
    eclL1: [e.l1[0], e.l1[1], e.l1[2]],
    eclL2: [e.l2[0], e.l2[1], e.l2[2]],
    eclTanF: [e.tanF1, e.tanF2],
    eclRange: [e.range[0], e.range[1]],
    eclLonShift: -0.00417807 * dT,
    eclGreatest: msToElementTime(e, greatestEclipseMs(e, dT), dT),
  };
}
