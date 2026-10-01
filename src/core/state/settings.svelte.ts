import type { SunriseDefinition } from '../astro/daylight';
import type { TimeScaleKind } from '../time/timescale';
import { resetLayout } from './layout.svelte';

/** Year chart: light bands, hours of daylight, or the day-to-day change. */
export type ChartMode = 'bands' | 'daylength' | 'change';

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
  chartMode: ChartMode;
  /** Globe lighting: day 1 = natural (0.5–2); night 0 = black (0–0.4). */
  globeBrightness: { day: number; night: number };
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
  globeBrightness: { day: 1, night: 0.06 },
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
      globeBrightness: { ...DEFAULT_SETTINGS.globeBrightness, ...saved.globeBrightness },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** Reactive, persisted settings. Mutate fields directly: `settings.hourCycle = '12'`. */
export const settings: Settings = $state(load());

/** Every setting back to its default, panel sizes included. */
export function resetSettings(): void {
  Object.assign(settings, structuredClone(DEFAULT_SETTINGS));
  resetLayout();
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
