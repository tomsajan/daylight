/**
 * Every solar eclipse from 1980 to 2100. Kept apart from the maths so that
 * code drawing a single eclipse does not pull the whole catalog (~140 kB) in.
 */

import data from './data/solar-eclipses.json';
import { greatestEclipseMs, type SolarEclipse } from './elements';

export const SOLAR_ECLIPSES: readonly SolarEclipse[] = data.eclipses as SolarEclipse[];
/** Acknowledgment NASA asks for wherever the predictions are shown. */
export const ECLIPSE_CREDIT: string = data.credit;

/** The eclipse whose greatest phase is nearest to a given instant. */
export function nearestEclipse(ms: number, eclipses: readonly SolarEclipse[] = SOLAR_ECLIPSES): SolarEclipse {
  let best = eclipses[0];
  for (const e of eclipses) {
    if (Math.abs(greatestEclipseMs(e, e.deltaT) - ms) < Math.abs(greatestEclipseMs(best, best.deltaT) - ms)) best = e;
  }
  return best;
}
