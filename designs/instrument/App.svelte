<!--
  Instrument: a dense console of panels around the comparison matrix.
  ≥1180px: everything on one screen; the column widths and row heights can be
  dragged at the gaps (double-click a gap to reset it). 760–1179px: two-column scrolling grid.
  <760px: tabbed views (Globe / Year / Day / Compare) with a compact control strip at the bottom.
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { settings, resolvedTheme } from '$core/state/settings.svelte';
  import { daySummary } from '$core/state/views';
  import { formatMinutes } from '$core/time/format';
  import Panel from './Panel.svelte';
  import SearchBox from './SearchBox.svelte';
  import GlobePanel from './GlobePanel.svelte';
  import YearPanel from './YearPanel.svelte';
  import DayPanel from './DayPanel.svelte';
  import CompareTable from './CompareTable.svelte';
  import SunPath from './SunPath.svelte';
  import SelectedReadout from './SelectedReadout.svelte';
  import ControlStrip from './ControlStrip.svelte';
  import StatusBar from './StatusBar.svelte';
  import HelpPopover from './HelpPopover.svelte';
  import SettingsDrawer from './SettingsDrawer.svelte';
  import DesignSwitcher from '$core/components/DesignSwitcher.svelte';
  import AppSwitch from '$core/components/AppSwitch.svelte';
  import TimeSheet from './TimeSheet.svelte';
  import Splitter from '$core/components/Splitter.svelte';
  import { clamp, panelSizes } from '$core/state/layout.svelte';
  import Icon from './Icon.svelte';
  import { ICON } from './icons';
  import { delta, dur, stepDays, stepMinutes, stepMonths } from './lib';
  import { ui, type Tab } from './ui.svelte';

  const theme = $derived(resolvedTheme());
  $effect(() => {
    document.documentElement.dataset.theme = theme;
  });

  const summary = $derived(daySummary());
  const hc = $derived(settings.hourCycle);

  // --- Panel sizes (desktop console) -----------------------------------------
  // Left and right columns and the compare table in px, the year/day split as
  // the year row's share. Unset ones fall back to the grid's defaults in CSS.

  const sizes = panelSizes('instrument');
  let grid: HTMLElement | undefined = $state();
  const box = (sel: string) => grid?.querySelector(sel)?.getBoundingClientRect() ?? new DOMRect();
  let start = { a: 0, b: 0 };

  const gridVars = $derived.by(() => {
    const vars: string[] = [];
    const left = sizes.get('left');
    const right = sizes.get('right');
    const top = sizes.get('table');
    const year = sizes.get('yearShare');
    if (left != null) vars.push(`--c-left: ${left}px`);
    if (right != null) vars.push(`--c-right: ${right}px`);
    if (top != null) vars.push(`--r-table: ${top}px`, '--table-max: none');
    if (year != null) vars.push(`--r-year: ${year}fr`, `--r-day: ${1 - year}fr`);
    return vars.join(';');
  });

  const MIN_MIDDLE = 380;
  const MIN_ROW = 200;

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'globe', label: 'Globe', icon: ICON.globe },
    { id: 'year', label: 'Year', icon: ICON.year },
    { id: 'day', label: 'Day', icon: ICON.day },
    { id: 'compare', label: 'Compare', icon: ICON.table },
  ];

  // --- Keyboard ---------------------------------------------------------------

  function isTyping(e: KeyboardEvent): boolean {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return false;
    // A focused slider (time scrubber, speed) keeps its arrow keys; the other shortcuts still work.
    if (t instanceof HTMLInputElement && t.type === 'range') return /^(Arrow|Page|Home$|End$)/.test(e.key);
    return !!t.closest('input, select, textarea, [contenteditable="true"]');
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (ui.closeAll()) e.preventDefault();
      return;
    }
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    let handled = true;
    switch (k) {
      case ' ':
        app.toggle();
        break;
      case 'ArrowLeft':
        stepDays(e.shiftKey ? -7 : -1);
        break;
      case 'ArrowRight':
        stepDays(e.shiftKey ? 7 : 1);
        break;
      case 'ArrowUp':
        stepMonths(1);
        break;
      case 'ArrowDown':
        stepMonths(-1);
        break;
      case ',':
      case '<':
        stepMinutes(e.shiftKey ? -60 : -15);
        break;
      case '.':
      case '>':
        stepMinutes(e.shiftKey ? 60 : 15);
        break;
      case 'r':
      case 'R':
        // Flip direction at the same rate (stays paused if paused).
        app.setSpeed(-app.speed);
        break;
      case 'n':
      case 'N':
        app.goLive();
        break;
      case '+':
      case '=':
        app.stepSpeed(1);
        break;
      case '-':
      case '_':
        app.stepSpeed(-1);
        break;
      case 'a':
      case 'A':
        ui.pickMode = ui.pickMode === 'add' ? 'replace' : 'add';
        break;
      case 'm':
      case 'M':
        settings.chartMode = settings.chartMode === 'bands' ? 'daylength' : settings.chartMode === 'daylength' ? 'change' : 'bands';
        break;
      case '/':
        ui.focusSearch();
        break;
      case 's':
      case 'S':
        ui.settingsOpen = !ui.settingsOpen;
        break;
      case '?':
        ui.helpOpen = !ui.helpOpen;
        break;
      default:
        if (/^[1-6]$/.test(k) && app.places[+k - 1]) app.select(app.places[+k - 1].id);
        else handled = false;
    }
    if (handled) e.preventDefault();
  }

  // Space on a focused button would also "click" it on keyup; the shortcut wins.
  function onKeyup(e: KeyboardEvent) {
    if (e.key === ' ' && !isTyping(e)) e.preventDefault();
  }
</script>

<svelte:window onkeydown={onKeydown} onkeyup={onKeyup} />

<div class="ins">
  <header class="top">
    <div class="brand" aria-label="Daylight Instrument">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M2 12h20" stroke="currentColor" stroke-width="1.5" />
        <path d="M5 12a7 7 0 0 1 14 0" fill="var(--sun)" />
      </svg>
      <span class="word">Daylight</span>
      <span class="model">Instrument</span>
    </div>
    <div class="app-link app-link--start"><AppSwitch /></div>
    <div class="search-slot"><SearchBox /></div>
    <div class="top-tools">
      <div class="design"><DesignSwitcher label="Design" /></div>
      <div class="app-link app-link--icon"><AppSwitch compact /></div>
      <button type="button" class="btn help-btn" onclick={() => (ui.helpOpen = !ui.helpOpen)} aria-expanded={ui.helpOpen} title="Keyboard shortcuts (?)">?</button>
      <button type="button" class="btn settings-btn" onclick={() => (ui.settingsOpen = true)} title="Settings (S)" aria-label="Settings">
        <Icon d={ICON.gear} size={15} /><span class="txt">Settings</span>
      </button>
    </div>
  </header>

  <!-- Phones: the selected place's key numbers stay visible on every tab. -->
  {#if summary}
    <div class="selstrip num">
      <i class="sw" style="--c: {app.colorOf(summary.place)}"></i>
      <strong>{summary.place.name}</strong>
      <span><b>↑</b>{summary.day.sunrise ? formatMinutes(summary.day.sunrise.minutes, hc) : '—'}</span>
      <span><b>↓</b>{summary.day.sunset ? formatMinutes(summary.day.sunset.minutes, hc) : '—'}</span>
      <span>{dur(summary.day.daylightMin)}</span>
      <span class="chg" class:up={summary.change > 0.004} class:down={summary.change < -0.004}>{delta(summary.change)}</span>
    </div>
  {/if}

  <nav class="tabs" aria-label="Views">
    {#each TABS as t (t.id)}
      <button type="button" class:on={ui.tab === t.id} aria-current={ui.tab === t.id ? 'page' : undefined} onclick={() => (ui.tab = t.id)}>
        <Icon d={t.icon} size={15} />{t.label}{#if t.id === 'compare'}<span class="count num">{app.places.length}</span>{/if}
      </button>
    {/each}
  </nav>

  <main class="grid" bind:this={grid} style={gridVars}>
    <div class="a-globe" class:on={ui.tab === 'globe'}><GlobePanel /></div>
    <div class="a-table" class:on={ui.tab === 'compare'}>
      <Panel title="Compare" sub="Selected date, live sun" flush>
        <CompareTable />
      </Panel>
    </div>
    <div class="a-year" class:on={ui.tab === 'year'}><YearPanel /></div>
    <div class="a-sun" class:on={ui.tab === 'day'}>
      <Panel title="Sun path" sub={app.selected?.name}>
        <SunPath />
      </Panel>
    </div>
    <div class="a-info" class:on={ui.tab === 'globe'}>
      <Panel title="Selected place">
        <SelectedReadout />
      </Panel>
    </div>
    <div class="a-day" class:on={ui.tab === 'day'}><DayPanel /></div>

    <div class="split split-left">
      <Splitter
        axis="x"
        label="Globe column width"
        onstart={() => (start.a = box('.a-globe').width)}
        onmove={(d) => sizes.set('left', clamp(start.a + d, 220, (grid?.clientWidth ?? 0) - box('.a-sun').width - MIN_MIDDLE))}
        onreset={() => sizes.clear('left')}
      />
    </div>
    <div class="split split-right">
      <Splitter
        axis="x"
        label="Sun path column width"
        onstart={() => (start.a = box('.a-sun').width)}
        onmove={(d) => sizes.set('right', clamp(start.a - d, 220, (grid?.clientWidth ?? 0) - box('.a-globe').width - MIN_MIDDLE))}
        onreset={() => sizes.clear('right')}
      />
    </div>
    <div class="split split-table">
      <Splitter
        axis="y"
        label="Compare table height"
        onstart={() => (start.a = box('.a-table').height)}
        onmove={(d) => sizes.set('table', clamp(start.a + d, 90, (grid?.clientHeight ?? 0) - 2 * MIN_ROW - 24))}
        onreset={() => sizes.clear('table')}
      />
    </div>
    <div class="split split-rows">
      <Splitter
        axis="y"
        label="Year and day chart heights"
        onstart={() => (start = { a: box('.a-year').height, b: box('.a-day').height })}
        onmove={(d) => {
          const total = start.a + start.b;
          sizes.set('yearShare', clamp(start.a + d, MIN_ROW, total - MIN_ROW) / total);
        }}
        onreset={() => sizes.clear('yearShare')}
      />
    </div>
  </main>

  <div class="controls-full"><ControlStrip /></div>
  <div class="controls-compact"><ControlStrip compact /></div>
  <div class="statusbar"><StatusBar /></div>

  {#if ui.helpOpen}<HelpPopover />{/if}
  {#if ui.settingsOpen}<SettingsDrawer />{/if}
  {#if ui.timeSheetOpen}<TimeSheet />{/if}
</div>

<style>
  .ins {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
    background: var(--bezel);
    color: var(--ink);
  }

  /* --- Header ---------------------------------------------------------------- */
  .top {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 46px;
    padding: 0 8px 0 12px;
    padding-top: env(safe-area-inset-top);
    box-sizing: content-box;
    background: var(--panel);
    border-bottom: 1px solid var(--rule);
    flex: none;
    position: relative;
    z-index: 20;
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 7px;
    flex: none;
  }
  .brand svg {
    width: 20px;
    height: 20px;
    align-self: center;
    color: var(--ink);
  }
  .word {
    font: 700 15px var(--sans);
    letter-spacing: 0.02em;
  }
  .model {
    font: 500 10px var(--mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .search-slot {
    flex: 0 1 400px;
    min-width: 0;
  }
  .top-tools {
    margin-left: auto;
    display: flex;
    gap: 6px;
    flex: none;
  }
  .help-btn {
    font: 600 12px var(--mono);
  }
  .design {
    display: flex;
    align-items: center;
    margin-right: 4px;
  }
  .design :global(.dl-design__label) {
    font: 600 10px/1.2 var(--sans);
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .design :global(.dl-design select) {
    height: 28px;
    padding: 0 4px;
    border-color: var(--rule-strong);
    border-radius: var(--r);
    background: var(--panel);
    font: 500 11.5px var(--mono);
  }
  .design :global(.dl-design select:hover) {
    border-color: var(--accent);
  }
  .app-link {
    display: flex;
    align-items: center;
    margin-right: 4px;
  }
  .app-link :global(.dl-app) {
    height: 28px;
    padding: 0 8px;
    border-color: var(--rule-strong);
    border-radius: var(--r);
    font: 500 11.5px var(--mono);
  }
  .app-link :global(.dl-app:hover) {
    border-color: var(--accent);
  }
  .app-link--icon {
    display: none;
  }
  .app-link--icon :global(.dl-app) {
    width: 36px;
    height: 34px;
    padding: 0;
    justify-content: center;
  }

  /* --- Main grid ------------------------------------------------------------- */
  .grid {
    flex: 1;
    min-height: 0;
    display: grid;
    gap: 6px;
    padding: 6px;
  }
  .grid > div {
    min-width: 0;
    min-height: 0;
    display: flex;
  }
  .grid > div > :global(.panel) {
    flex: 1;
  }
  .a-globe {
    grid-area: globe;
  }
  .a-table {
    grid-area: table;
  }
  .a-year {
    grid-area: year;
  }
  .a-sun {
    grid-area: sun;
  }
  .a-info {
    grid-area: info;
  }
  .a-day {
    grid-area: day;
  }

  .selstrip,
  .tabs,
  .controls-compact,
  .grid > .split {
    display: none;
  }
  .controls-full,
  .statusbar {
    flex: none;
  }

  /* Desktop console: one screen, no page scroll. */
  @media (min-width: 1180px) {
    .grid {
      overflow: hidden;
      grid-template-columns: var(--c-left, minmax(280px, 25fr)) minmax(0, 52fr) var(--c-right, minmax(270px, 23fr));
      grid-template-rows: var(--r-table, auto) minmax(0, var(--r-year, 1.2fr)) minmax(0, var(--r-day, 1fr));
      grid-template-areas:
        'globe table table'
        'globe year sun'
        'info day sun';
    }
    .a-table {
      max-height: var(--table-max, 42vh);
    }
    /* Drag handles sit over the 6px gaps, laid on the grid lines they move. */
    .grid > .split {
      display: block;
      z-index: 5;
      --dl-split-color: var(--accent);
      --dl-split-width: 2px;
    }
    .split-left,
    .split-right {
      justify-self: start;
      width: 12px;
      margin-left: -9px;
    }
    .split-left {
      grid-column: 2;
      grid-row: 1 / -1;
    }
    .split-right {
      grid-column: 3;
      grid-row: 2 / -1;
    }
    .split-table,
    .split-rows {
      align-self: start;
      height: 12px;
      margin-top: -9px;
    }
    .split-table {
      grid-column: 2 / -1;
      grid-row: 2;
    }
    .split-rows {
      grid-column: 1 / 3;
      grid-row: 3;
    }
  }

  /* Tablet / small laptop: two columns, page scrolls, controls stay docked. */
  @media (min-width: 760px) and (max-width: 1179px) {
    .grid {
      overflow-y: auto;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: 440px auto 420px 340px;
      grid-template-areas:
        'globe sun'
        'table table'
        'year year'
        'day info';
    }
  }

  /* Phones: tabbed views. */
  @media (max-width: 759px) {
    .top {
      gap: 8px;
      height: 48px;
      padding-left: 10px;
    }
    .model,
    .word,
    .design,
    .app-link,
    .help-btn,
    .settings-btn .txt,
    .statusbar,
    .controls-full {
      display: none;
    }
    .search-slot {
      flex: 1;
    }
    .app-link--icon {
      display: flex;
      margin-right: 0;
    }
    .settings-btn {
      width: 36px;
      height: 34px;
    }

    .selstrip {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 30px;
      padding: 0 12px;
      background: var(--panel-2);
      border-bottom: 1px solid var(--rule);
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      flex: none;
    }
    .selstrip strong {
      font: 600 13px var(--sans);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 0 1 auto;
    }
    .selstrip b {
      color: var(--sun);
      margin-right: 1px;
    }
    .selstrip .chg {
      margin-left: auto;
    }
    .up {
      color: var(--led-live);
    }
    .down {
      color: var(--danger);
    }

    .tabs {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      background: var(--panel);
      border-bottom: 1px solid var(--rule);
      flex: none;
    }
    .tabs button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      height: 40px;
      border: 0;
      border-bottom: 2px solid transparent;
      background: none;
      font: 600 11px var(--sans);
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--muted);
      cursor: pointer;
    }
    .tabs button.on {
      color: var(--ink);
      border-bottom-color: var(--accent);
    }
    .count {
      font-size: 10px;
      padding: 0 4px;
      border: 1px solid var(--rule-strong);
      border-radius: 2px;
      letter-spacing: 0;
    }

    .grid {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: 6px;
    }
    /* Only the active tab's panels are shown. */
    .grid > div:not(.on) {
      display: none;
    }
    .a-globe,
    .a-year,
    .a-table {
      flex: 1 0 320px;
    }
    .a-day {
      flex: 1 0 260px;
    }
    .a-sun,
    .a-info {
      flex: none;
    }
    /* Day tab: chart first, then the compass. */
    .a-day {
      order: 1;
    }
    .a-sun {
      order: 2;
    }
    .a-sun :global(svg) {
      max-height: 300px;
    }

    .controls-compact {
      display: block;
      flex: none;
      padding-bottom: env(safe-area-inset-bottom);
      background: var(--panel);
    }
  }
</style>
