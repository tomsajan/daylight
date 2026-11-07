/**
 * Night Sky's own settings, kept in this browser: the camera and lens, the lowest altitude worth
 * photographing at, what the chart draws, and red night vision.
 */
import { DEFAULT_CAMERA, type CameraSettings } from '$core/sky/camera';

export interface SkyPrefs {
  camera: CameraSettings;
  /** Targets count as up above this altitude, degrees. */
  minAlt: number;
  layers: {
    constellations: boolean;
    names: boolean;
    milkyWay: boolean;
    deepSky: boolean;
    grid: boolean;
    frame: boolean;
    ground: boolean;
    atmosphere: boolean;
  };
  /** Which kinds of target the list shows. */
  groups: Record<string, boolean>;
  /** Everything in red, to keep the eyes used to the dark. */
  nightVision: boolean;
  /** Night lights on the map, 0-1. */
  lightsOpacity: number;
  basemap: string;
}

export const GROUPS: { id: string; name: string }[] = [
  { id: 'galaxy', name: 'Galaxies' },
  { id: 'nebula', name: 'Nebulae' },
  { id: 'open', name: 'Open clusters' },
  { id: 'globular', name: 'Globular clusters' },
  { id: 'planetary', name: 'Planetary nebulae' },
  { id: 'other', name: 'Other deep sky' },
  { id: 'solar', name: 'Moon and planets' },
  { id: 'core', name: 'Milky Way core' },
];

/** The list's group for a target's group. */
export function listGroup(group: string): string {
  if (group === 'remnant' || group === 'dark' || group === 'star') return 'other';
  if (group === 'planet' || group === 'moon') return 'solar';
  return group;
}

const DEFAULTS: SkyPrefs = {
  camera: DEFAULT_CAMERA,
  minAlt: 30,
  layers: { constellations: true, names: true, milkyWay: true, deepSky: true, grid: false, frame: true, ground: true, atmosphere: true },
  groups: Object.fromEntries(GROUPS.map((g) => [g.id, true])),
  nightVision: false,
  lightsOpacity: 0.85,
  basemap: 'dark',
};

const KEY = 'daylight.sky.v1';

function load(): SkyPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved) return structuredClone(DEFAULTS);
    return {
      ...DEFAULTS,
      ...saved,
      camera: { ...DEFAULTS.camera, ...saved.camera, custom: { ...DEFAULTS.camera.custom, ...saved.camera?.custom } },
      layers: { ...DEFAULTS.layers, ...saved.layers },
      groups: { ...DEFAULTS.groups, ...saved.groups },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const prefs: SkyPrefs = $state(load());

/** Call once from a component: saves the settings whenever they change. */
export function persistPrefs(): void {
  $effect(() => {
    const text = JSON.stringify(prefs);
    try {
      localStorage.setItem(KEY, text);
    } catch {
      // Not kept.
    }
  });
}
