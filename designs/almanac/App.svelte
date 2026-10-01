<!--
  Almanac: daylight set like a printed almanac or a data-journalism feature.
  Masthead with the place set large and a one-sentence summary of the day,
  a sticky time bar, the year chart as the centrepiece, then the day chart,
  facts, globe, places and notes.

  Desktop: two independent columns (charts and notes on the left; facts,
  globe and places in a right-hand rail). Narrower: one article column, in
  reading order year → day → facts → globe → places, then the notes.
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { resolvedTheme, settings } from '$core/state/settings.svelte';
  import { daySummary } from '$core/state/views';
  import { formatClock, formatOffset, formatSpeed } from '$core/time/format';
  import { formatCoordinates } from '$core/geo/place';
  import AlmanacSearch from './components/AlmanacSearch.svelte';
  import TimeBar from './components/TimeBar.svelte';
  import YearFigure from './components/YearFigure.svelte';
  import DayFigure from './components/DayFigure.svelte';
  import FactsTable from './components/FactsTable.svelte';
  import GlobeInset from './components/GlobeInset.svelte';
  import PlacesTable from './components/PlacesTable.svelte';
  import Notes from './components/Notes.svelte';
  import Preferences from './components/Preferences.svelte';
  import DesignPicker from './components/DesignPicker.svelte';
  import Splitter from '$core/components/Splitter.svelte';
  import { clamp, panelSizes } from '$core/state/layout.svelte';
  import { daySentence, longDate, nowSentence, zoneName } from './almanac.svelte';

  let prefs: Preferences | undefined = $state();

  // Desktop: the rail's share of the two columns, dragged at the column gap.
  const sizes = panelSizes('almanac');
  let body: HTMLElement | undefined = $state();
  let mainCol: HTMLElement | undefined = $state();
  let startMain = 0;
  const railShare = $derived(sizes.get('rail'));
  const COLUMN_GAP = 56;

  function dragColumns(d: number) {
    if (!body) return;
    const cs = getComputedStyle(body);
    const inner = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - COLUMN_GAP;
    const main = clamp(startMain + d, 460, inner - 260);
    sizes.set('rail', 1 - main / inner);
  }

  let compare = $state(false);

  const theme = $derived(resolvedTheme());
  const place = $derived(app.selected);
  const summary = $derived(daySummary());
  const clock = $derived(formatClock(app.time, app.scale, settings.hourCycle));
  const zone = $derived(place && settings.timeScale === 'local' ? zoneName(app.time, place.tz) : formatOffset(app.time, app.scale));
  const sentence = $derived(place ? daySentence(place) : '');
  const now = $derived(place && summary ? nowSentence(place, clock, summary.lightNow) : '');
  const runState = $derived(
    app.live
      ? 'Live'
      : app.playing
        ? `Simulated, ${formatSpeed(Math.abs(app.speed))}${app.speed < 0 ? ' backwards' : ''}`
        : 'Paused',
  );

  // The page background, dialogs and browser chrome follow the edition.
  $effect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#151a24' : '#efe9da');
  });

  $effect(() => {
    document.title = place ? `${place.name}: daylight through the year` : 'Daylight Almanac';
  });
</script>

<div class="alm">
  <nav class="topline" aria-label="Site">
    <a class="wordmark" href="../../" title="All designs">The Daylight Almanac</a>
    <div class="find">
      <AlmanacSearch label="Find a place" onselect={(p) => app.replaceSelected(p)} oncompare={(p) => app.addPlace(p)} />
    </div>
    <div class="design"><DesignPicker /></div>
    <button type="button" class="prefs-btn" onclick={() => prefs?.open()}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h9M15 6h2M3 14h2M8 14h9" /><circle cx="13.5" cy="6" r="1.8" /><circle cx="6.5" cy="14" r="1.8" /></svg>
      Preferences
    </button>
  </nav>

  <header class="masthead">
    {#if place}
      <p class="dateline">
        <span>{longDate(app.date)}, {clock} {zone}</span>
        <span class="state" class:live={app.live}>{runState}</span>
      </p>
      <h1>{place.name}</h1>
      <p class="where">{place.detail ? `${place.detail}, ` : ''}{formatCoordinates(place.lat, place.lon)}</p>
      <p class="dek">{sentence}</p>
      {#if now}<p class="nowline">{now}</p>{/if}
    {:else}
      <p class="dateline"><span>Setting the type…</span></p>
      <h1 class="pending">Finding your place</h1>
      <p class="dek">The almanac starts where your device’s time zone suggests you are. You can look up any other place with the search above.</p>
    {/if}
  </header>

  <TimeBar />

  <main class="body" bind:this={body} style:--rail={railShare != null ? `${railShare}fr` : undefined} style:--main={railShare != null ? `${1 - railShare}fr` : undefined}>
    <div class="col main-col" bind:this={mainCol}>
      <div class="s-year"><YearFigure /></div>
      <div class="s-day"><DayFigure /></div>
    </div>
    <div class="col rail">
      <div class="s-facts"><FactsTable /></div>
      <div class="s-globe"><GlobeInset bind:compare /></div>
      <div class="s-places"><PlacesTable /></div>
    </div>
    <div class="split-cols">
      <Splitter
        axis="x"
        label="Column widths"
        onstart={() => (startMain = mainCol?.offsetWidth ?? 0)}
        onmove={dragColumns}
        onreset={() => sizes.clear('rail')}
      />
    </div>
  </main>

  <div class="notes-wrap"><Notes /></div>

  <footer class="colophon">
    <p>
      Sun positions follow the NOAA solar calculator; sunrise and sunset agree with published tables to about a minute. Place names from OpenStreetMap.
      <button type="button" class="link" onclick={() => prefs?.open()}>Preferences</button>
    </p>
    <p class="other">This almanac is one of several designs of the same app. <DesignPicker label="Read it as" /></p>
  </footer>

  <Preferences bind:this={prefs} />
</div>

<style>
  .alm {
    /* clip, not hidden: hidden would make this a scroll container and break the sticky time bar. */
    overflow-x: clip;
    min-height: 100vh;
    min-height: 100dvh;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .topline,
  .masthead,
  .body,
  .notes-wrap,
  .colophon {
    max-width: var(--page);
    margin: 0 auto;
    padding-left: var(--gutter);
    padding-right: var(--gutter);
    box-sizing: border-box;
  }

  /* --- Top line ---------------------------------------------------------------- */
  .topline {
    display: flex;
    align-items: center;
    gap: 24px;
    padding-top: calc(14px + env(safe-area-inset-top));
    padding-bottom: 10px;
  }
  .wordmark {
    font: italic 500 1.2rem/1 var(--serif);
    color: inherit;
    text-decoration: none;
    white-space: nowrap;
  }
  .find {
    flex: 1;
    max-width: 440px;
    margin-left: auto;
  }
  .design {
    flex: none;
  }
  .prefs-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 4px;
    border: 0;
    background: none;
    color: inherit;
    font: 500 0.88rem/1 var(--sans);
    cursor: pointer;
  }
  .prefs-btn svg {
    width: 18px;
    height: 18px;
    fill: var(--paper);
    stroke: currentColor;
    stroke-width: 1.5;
  }
  .prefs-btn:hover {
    color: var(--accent);
  }

  /* --- Masthead ----------------------------------------------------------------- */
  .masthead {
    padding-top: 36px;
    padding-bottom: 30px;
  }
  .dateline {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 16px;
    margin: 0;
    padding-top: 10px;
    border-top: 3px double var(--ink);
    font: 400 0.88rem/1.4 var(--sans);
    font-variant-numeric: tabular-nums;
  }
  .state {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
  }
  .state::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    box-sizing: border-box;
  }
  .state.live {
    color: var(--ink);
  }
  .state.live::before {
    background: var(--now);
    border-color: var(--now);
  }
  h1 {
    margin: 14px 0 0;
    font: 400 clamp(3.2rem, 1.6rem + 6.4vw, 8rem) / 0.92 var(--serif);
    font-variation-settings: 'opsz' 72;
    letter-spacing: -0.025em;
    overflow-wrap: anywhere;
    hyphens: auto;
  }
  h1.pending {
    color: var(--muted);
    font-style: italic;
  }
  .where {
    margin: 10px 0 0;
    font: italic 400 1.1rem/1.3 var(--serif);
    color: var(--muted);
  }
  .dek {
    margin: 22px 0 0;
    max-width: 30em;
    font: 400 clamp(1.25rem, 1.05rem + 0.8vw, 1.6rem) / 1.38 var(--serif);
    text-wrap: pretty;
  }
  .nowline {
    margin: 12px 0 0;
    max-width: 44em;
    font: 400 0.95rem/1.5 var(--sans);
    color: var(--muted);
  }

  /* --- Body --------------------------------------------------------------------- */
  .body {
    display: grid;
    grid-template-columns: minmax(0, var(--main, 8fr)) minmax(0, var(--rail, 4fr));
    gap: 56px;
    padding-top: 36px;
  }
  /* Placed explicitly: the handle below is, and explicitly placed items are
     laid out first, so an auto-placed rail would drop to a second row. */
  .main-col {
    grid-column: 1;
    grid-row: 1;
  }
  .rail {
    grid-column: 2;
    grid-row: 1;
  }
  /* The column gap is a drag handle; a hairline rule shows on hover. */
  .split-cols {
    grid-column: 2;
    grid-row: 1;
    justify-self: start;
    width: 16px;
    margin-left: -36px;
    --dl-split-color: var(--rule-strong);
    --dl-split-width: 1px;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 56px;
    min-width: 0;
  }
  .rail {
    gap: 48px;
  }
  .rail :global(.fig-head h2) {
    font-size: 1.4rem;
  }

  .notes-wrap {
    margin-top: 64px;
  }
  .colophon {
    margin-top: 48px;
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .colophon p.other {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    margin-top: 10px;
    padding-top: 0;
    border-top: 0;
  }
  .colophon p {
    margin: 0;
    padding-top: 12px;
    border-top: 1px solid var(--rule-strong);
    font: 400 0.82rem/1.5 var(--sans);
    color: var(--muted);
  }

  /* One article column below desktop width, in reading order. */
  @media (max-width: 1099px) {
    .body {
      display: flex;
      flex-direction: column;
      gap: 48px;
      max-width: 760px;
    }
    .col {
      display: contents;
    }
    .split-cols {
      display: none;
    }
    .s-year {
      order: 1;
    }
    .s-day {
      order: 2;
    }
    .s-facts {
      order: 3;
    }
    .s-globe {
      order: 4;
    }
    .s-places {
      order: 5;
    }
    .masthead,
    .topline,
    .notes-wrap,
    .colophon {
      max-width: 760px;
    }
    .rail :global(.fig-head h2) {
      font-size: 1.65rem;
    }
    .design :global(.dl-design__label) {
      display: none;
    }
  }

  @media (max-width: 759px) {
    .topline {
      flex-wrap: wrap;
      gap: 6px 12px;
    }
    .find {
      order: 3;
      flex-basis: 100%;
      max-width: none;
    }
    /* No room on the top line; the colophon and Preferences carry the switcher on phones. */
    .design {
      display: none;
    }
    .prefs-btn {
      margin-left: auto;
    }
    .masthead {
      padding-top: 22px;
      padding-bottom: 22px;
    }
    h1 {
      margin-top: 10px;
    }
    .dek {
      margin-top: 16px;
    }
    .body {
      gap: 40px;
      padding-top: 24px;
    }
    .notes-wrap {
      margin-top: 48px;
    }
    .body :global(.fig-head h2) {
      font-size: 1.4rem;
    }
  }
</style>
