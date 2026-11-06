/**
 * Camera and lens: what a frame covers on the sky, how fine its pixels are, and how long an
 * exposure on a fixed tripod can be before the stars trail.
 */

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

export interface Sensor {
  id: string;
  name: string;
  /** Millimetres. */
  width: number;
  height: number;
  /** Pixel pitch, micrometres. */
  pixel: number;
}

/** Common sensors; the pixel pitch is a typical one for the size. */
export const SENSORS: Sensor[] = [
  { id: 'ff', name: 'Full frame (36 × 24 mm)', width: 36, height: 24, pixel: 5.9 },
  { id: 'apsc', name: 'APS-C (23.5 × 15.6 mm)', width: 23.5, height: 15.6, pixel: 3.9 },
  { id: 'apsc-canon', name: 'APS-C Canon (22.3 × 14.9 mm)', width: 22.3, height: 14.9, pixel: 3.7 },
  { id: 'mft', name: 'Micro Four Thirds (17.3 × 13 mm)', width: 17.3, height: 13, pixel: 3.3 },
  { id: '1in', name: '1-inch (13.2 × 8.8 mm)', width: 13.2, height: 8.8, pixel: 2.4 },
  { id: 'asi2600', name: 'ZWO ASI2600 / APS-C astro (23.5 × 15.7 mm)', width: 23.5, height: 15.7, pixel: 3.76 },
  { id: 'asi294', name: 'ZWO ASI294 (19.1 × 13 mm)', width: 19.1, height: 13, pixel: 4.63 },
  { id: 'asi533', name: 'ZWO ASI533 (11.3 × 11.3 mm)', width: 11.31, height: 11.31, pixel: 3.76 },
  { id: 'asi585', name: 'ZWO ASI585 (11.2 × 6.3 mm)', width: 11.2, height: 6.3, pixel: 2.9 },
  { id: 'asi183', name: 'ZWO ASI183 (13.2 × 8.8 mm)', width: 13.2, height: 8.8, pixel: 2.4 },
];

export interface CameraSettings {
  /** A SENSORS id, or 'custom'. */
  sensor: string;
  custom: { width: number; height: number; pixel: number };
  /** Focal length, mm. */
  focal: number;
  /** Aperture, f-number. */
  fNumber: number;
  /** Turn of the frame on the sky: 0 has the long side east-west, degrees. */
  rotation: number;
}

export const DEFAULT_CAMERA: CameraSettings = {
  sensor: 'ff',
  custom: { width: 36, height: 24, pixel: 5.9 },
  focal: 50,
  fNumber: 2.8,
  rotation: 0,
};

export function sensorOf(c: CameraSettings): Sensor {
  return SENSORS.find((s) => s.id === c.sensor) ?? { id: 'custom', name: 'Custom', ...c.custom };
}

/** The field of view across a side of the sensor, degrees: 2·atan(side / 2f). */
export function fieldOfView(side: number, focal: number): number {
  return 2 * Math.atan(side / (2 * focal)) * DEG;
}

export interface Field {
  width: number;
  height: number;
  diagonal: number;
  /** Arcseconds per pixel. */
  pixelScale: number;
  /** Crop factor against full frame, by the diagonal. */
  crop: number;
}

export function field(c: CameraSettings): Field {
  const s = sensorOf(c);
  return {
    width: fieldOfView(s.width, c.focal),
    height: fieldOfView(s.height, c.focal),
    diagonal: fieldOfView(Math.hypot(s.width, s.height), c.focal),
    pixelScale: (206.265 * s.pixel) / c.focal,
    crop: Math.hypot(36, 24) / Math.hypot(s.width, s.height),
  };
}

/** The "500 rule": the longest exposure in seconds before stars trail visibly, for prints of old. */
export function rule500(c: CameraSettings): number {
  return 500 / (c.focal * field(c).crop);
}

/**
 * The NPF rule (Frédéric Michaud, Société Astronomique de France), which takes the pixels and the
 * aperture into account: t = (16.856 N + 0.0997 f + 13.713 p) / (f · cos δ), in seconds, at the
 * target's declination δ (stars near the pole move slower).
 */
export function ruleNpf(c: CameraSettings, declination = 0): number {
  const p = sensorOf(c).pixel;
  const cos = Math.max(0.05, Math.cos(declination * RAD));
  return (16.856 * c.fNumber + 0.0997 * c.focal + 13.713 * p) / (c.focal * cos);
}

/** How far a star drifts on the sensor in a second, in pixels, at a declination. */
export function driftPixels(c: CameraSettings, declination = 0): number {
  return (15.041 * Math.cos(declination * RAD)) / field(c).pixelScale;
}

/** Focal length that makes a frame's shorter side about `fill` times an object's size (arcminutes). */
export function focalToFrame(c: CameraSettings, sizeArcmin: number, fill = 1.5): number {
  const s = sensorOf(c);
  const angle = ((sizeArcmin * fill) / 60) * RAD;
  return Math.min(s.width, s.height) / (2 * Math.tan(angle / 2));
}
