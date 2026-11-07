/**
 * Where to read about a target and see what it looks like: Wikipedia, with its article's lead
 * picture and first lines fetched on request, and SIMBAD.
 */
import type { Target } from './targets';

/** Wikipedia's titles where the name or designation finds no article, or the wrong one. */
const WIKI_TITLES: Record<string, string> = { Mercury: 'Mercury (planet)', core: 'Galactic Center', IC4604: 'Rho Ophiuchi cloud complex' };

/** What Wikipedia knows the target by: "Messier 31", "NGC 7000", "Barnard 33", "Jupiter". */
export function wikipediaTerm(t: Target): string {
  if (WIKI_TITLES[t.id]) return WIKI_TITLES[t.id];
  if (!t.dso) return t.id;
  const m = /^M(\d+)$/.exec(t.dso.id);
  if (m) return `Messier ${m[1]}`;
  // Designations from catalogues Wikipedia has no pages for: the name instead.
  if (/^ESO/.test(t.dso.desig) && t.dso.name) return t.dso.name;
  return t.dso.desig;
}

/** Wikipedia's page for the target: "go" lands on the article when the term names one, a search otherwise. */
export function wikipediaUrl(t: Target): string {
  return `https://en.wikipedia.org/wiki/Special:Search?go=Go&search=${encodeURIComponent(wikipediaTerm(t))}`;
}

/**
 * SIMBAD's page for a deep-sky object, with its measurements and references: at CDS in Strasbourg,
 * or at its mirror at Harvard, for when Strasbourg is not answering.
 */
export function simbadUrl(t: Target, mirror = false): string | null {
  if (!t.dso) return null;
  const m = /^M(\d+)$/.exec(t.dso.id);
  const ident = m ? `M ${m[1]}` : t.dso.desig.replace(/^ESO0*(\d+)-/, 'ESO $1-');
  return `https://${mirror ? 'simbad.harvard.edu' : 'simbad.cds.unistra.fr'}/simbad/sim-id?Ident=${encodeURIComponent(ident)}`;
}

export interface Summary {
  /** The article's title, its page and its first lines. */
  title: string;
  page: string;
  extract: string;
  /** The article's lead picture, about 330 pixels wide, if it has one. */
  image: { url: string; width: number; height: number } | null;
}

const summaries = new Map<string, Promise<Summary | null>>();

function fetchSummary(term: string): Promise<Summary | null> {
  return fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term.replace(/ /g, '_'))}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) =>
      j && j.type === 'standard'
        ? {
            title: j.title,
            page: j.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(term)}`,
            extract: j.extract ?? '',
            image: j.thumbnail ? { url: j.thumbnail.source, width: j.thumbnail.width, height: j.thumbnail.height } : null,
          }
        : null,
    );
}

/**
 * Wikipedia's summary of the target's article, fetched once per target; null when it has none.
 * By the designation first, then by the common name.
 */
export function wikipediaSummary(t: Target): Promise<Summary | null> {
  const term = wikipediaTerm(t);
  let p = summaries.get(term);
  if (!p) {
    const name = t.dso?.name.replace(/\s*\(.*\)$/, '');
    p = fetchSummary(term)
      .then((s) => (s || !name || name === term ? s : fetchSummary(name)))
      .catch(() => {
        // Offline: try again next time.
        summaries.delete(term);
        return null;
      });
    summaries.set(term, p);
  }
  return p;
}
