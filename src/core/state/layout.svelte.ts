/**
 * Panel sizes the user has dragged, per design (each design has its own
 * layout), persisted in localStorage. A missing size means the design's
 * default; double-clicking a splitter clears it again.
 */

const STORAGE_KEY = 'daylight.layout.v1';

type Sizes = Record<string, number>;

function load(): Record<string, Sizes> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

const store = $state<Record<string, Sizes>>(load());

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(store)));
    } catch {
      // Private mode or storage full: sizes just won't persist.
    }
  }, 250);
}

export interface PanelSizes {
  /** The stored size, or undefined for the design's default. */
  get(name: string): number | undefined;
  set(name: string, value: number): void;
  clear(name: string): void;
}

export function panelSizes(design: string): PanelSizes {
  return {
    get: (name) => store[design]?.[name],
    set(name, value) {
      if (!Number.isFinite(value)) return;
      (store[design] ??= {})[name] = Math.round(value * 1000) / 1000;
      save();
    },
    clear(name) {
      if (store[design]?.[name] === undefined) return;
      delete store[design][name];
      save();
    },
  };
}

/** Back to every design's default panel sizes. */
export function resetLayout(): void {
  for (const k of Object.keys(store)) delete store[k];
  save();
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}
