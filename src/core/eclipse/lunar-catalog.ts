/**
 * Every lunar eclipse from 1980 to 2100, apart from the maths like the solar
 * catalog, so a page that only draws solar eclipses does not load it.
 */

import data from './data/lunar-eclipses.json';
import type { LunarEclipse } from './lunar';

export const LUNAR_ECLIPSES: readonly LunarEclipse[] = data.eclipses as LunarEclipse[];
