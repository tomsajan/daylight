/**
 * How opaque the ground is in the sky views: 1 hides the Sun or Moon below the
 * horizon, 0 leaves it in full view with only the horizon line drawn. Shared by
 * the solar and lunar views and remembered in this browser.
 */

const KEY = 'daylight.eclipse.ground';
const DEFAULT = 0.92;

function load(): number {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export const ground = $state({ opacity: load() });

export function setGroundOpacity(v: number): void {
  ground.opacity = v;
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    // Not remembered.
  }
}
