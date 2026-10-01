import type { SunriseDefinition } from '../astro/daylight';
import type { TimeScaleKind } from '../time/timescale';

export interface Settings {
  /** Which clock times are shown in. */
  timeScale: TimeScaleKind;
  hourCycle: '24' | '12';
  /** What counts as sunrise/sunset. */
  sunrise: SunriseDefinition;
  /** Eye height above the surroundings, metres (lowers the horizon). */
  observerHeight: number;
  /** Twilight phases drawn in charts. */
  twilight: { civil: boolean; nautical: boolean; astronomical: boolean };
  theme: 'auto' | 'light' | 'dark';
  /** Year chart: light bands or day length curve. */
  chartMode: 'bands' | 'daylength';
  globe: {
    twilightStyle: 'bands' | 'smooth';
    terminatorLines: boolean;
    nightLights: boolean;
    latitudeLines: boolean;
    graticule: boolean;
    atmosphere: boolean;
    followSun: boolean;
    autoRotate: boolean;
    showLabels: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  timeScale: 'local',
  hourCycle: '24',
  sunrise: 'standard',
  observerHeight: 0,
  twilight: { civil: true, nautical: true, astronomical: true },
  theme: 'auto',
  chartMode: 'bands',
  globe: {
    twilightStyle: 'bands',
    terminatorLines: true,
    nightLights: true,
    latitudeLines: true,
    graticule: false,
    atmosphere: true,
    followSun: false,
    autoRotate: false,
    showLabels: true,
  },
};

const STORAGE_KEY = 'daylight.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const saved = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      twilight: { ...DEFAULT_SETTINGS.twilight, ...saved.twilight },
      globe: { ...DEFAULT_SETTINGS.globe, ...saved.globe },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** Reactive, persisted settings. Mutate fields directly: `settings.hourCycle = '12'`. */
export const settings: Settings = $state(load());

export function resetSettings(): void {
  Object.assign(settings, structuredClone(DEFAULT_SETTINGS));
}

$effect.root(() => {
  $effect(() => {
    const json = JSON.stringify(settings);
    try {
      localStorage.setItem(STORAGE_KEY, json);
    } catch {
      // Private mode or storage full: settings just won't persist.
    }
  });
});

const darkQuery = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
let osDark = $state(darkQuery?.matches ?? false);
darkQuery?.addEventListener('change', (e) => (osDark = e.matches));

/** Resolved light/dark for the `theme` setting, following the OS when 'auto'. Reactive. */
export function resolvedTheme(): 'light' | 'dark' {
  if (settings.theme !== 'auto') return settings.theme;
  return osDark ? 'dark' : 'light';
}
