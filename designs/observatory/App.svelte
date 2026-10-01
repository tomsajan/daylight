<!--
  Observatory: the globe fills the screen against deep space and everything
  else floats over it on glass.
  - Desktop: left panel (search, facts, places), bottom dock (day ribbon and
    time controls) with a chart drawer that slides up, settings slide-over.
  - Phone: compact top search bar and a snapping bottom sheet.
  The globe canvas is made larger than the screen on one side so the Earth
  centres in the area the panels leave free, without shrinking it.
-->
<script lang="ts">
  import { app, MAX_PLACES } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { daySummary, globeMarkers, globeOptions, sunNow } from '$core/state/views';
  import Globe from '$core/globe/Globe.svelte';
  import type { Place } from '$core/geo/place';
  import { Light } from '$core/astro/daylight';
  import { formatClock, formatDate, formatDelta, formatDuration } from '$core/time/format';
  import Starfield from './Starfield.svelte';
  import Search from './Search.svelte';
  import Facts from './Facts.svelte';
  import PlaceList from './PlaceList.svelte';
  import DayRibbon from './DayRibbon.svelte';
  import Transport from './Transport.svelte';
  import DateControls from './DateControls.svelte';
  import ChartDeck from './ChartDeck.svelte';
  import SettingsDrawer from './SettingsDrawer.svelte';
  import BottomSheet, { type Snap } from './BottomSheet.svelte';
  import Icon from './Icon.svelte';
  import { OBS_GLOBE } from './palette';

  /** Phone top bar height without the safe area. */
  const TOP_BAR = 64;
  const GAP = 16;

  let vw = $state(window.innerWidth);
  let vh = $state(window.innerHeight);
  const mobile = $derived(vw < 820);
  const panelW = $derived(vw < 1100 ? 320 : 360);
  const wideCharts = $derived(vw >= 1360);
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  let compare = $state(false);
  const canAdd = $derived(app.places.length < MAX_PLACES);
  const adding = $derived(compare && canAdd);

  let settingsOpen = $state(false);
  let drawerOpen = $state(false);
  let drawerH = $state(0);
  let dockH = $state(120);
  let snap = $state<Snap>('peek');
  let peekHeight = $state(260);
  let globe: Globe | undefined = $state();

  const summary = $derived(daySummary());
  const sun = $derived(sunNow());
  const options = $derived({ ...globeOptions(), ...OBS_GLOBE });
  const hc = $derived(settings.hourCycle);
  const focusDistance = $derived(mobile ? 3.6 : 4.6);

  // Canvas box: wider than the screen to the right (desktop) or taller at the
  // top (phone) so the Earth's centre lands in the middle of the free area.
  const stageStyle = $derived(
    mobile
      ? `left:0;right:0;bottom:0;top:${TOP_BAR - peekHeight}px`
      : `left:0;bottom:0;right:${-(panelW + GAP)}px;top:${-(dockH + GAP)}px;transform:translateY(${drawerOpen ? -Math.round(drawerH / 2) : 0}px)`,
  );
  const chartHeight = $derived(Math.round(Math.max(170, Math.min(320, vh * 0.3))));

  function choose(place: Place, add: boolean) {
    if (add) app.addPlace(place);
    else app.replaceSelected(place);
  }

  function centerOnSelected() {
    if (app.selected) globe?.flyTo(app.selected.lat, app.selected.lon, focusDistance);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== ' ' || e.defaultPrevented || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, select, textarea, button, [role="slider"], [contenteditable="true"]')) return;
    e.preventDefault();
    app.toggle();
  }
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} onkeydown={onKey} />

<div class="obs" class:obs--mobile={mobile} style:--panel-w="{panelW}px">
  <Starfield />

  <div class="stage" style={stageStyle}>
    <Globe
      bind:this={globe}
      time={app.time}
      markers={globeMarkers()}
      selectedId={app.selected?.id}
      {options}
      focus={app.selected}
      {focusDistance}
      onpick={(lat, lon) => app.pickPoint(lat, lon, adding)}
      onmarker={(id) => app.select(id)}
    />
  </div>

  {#snippet comparePill()}
    <div class="pill o-glass" class:pill--adding={adding}>
      {#if adding}
        <span class="pill__text">{touch ? 'Tap' : 'Click'} the globe to add a place <span class="pill__count">{app.places.length} of {MAX_PLACES}</span></span>
        <button type="button" class="pill__btn pill__btn--done" onclick={() => (compare = false)}>Done</button>
      {:else}
        {#if !mobile}<span class="pill__text">{touch ? 'Tap' : 'Click'} the globe to pick a place</span>{/if}
        <button
          type="button"
          class="pill__btn"
          onclick={() => (compare = true)}
          disabled={!canAdd}
          title={canAdd ? 'Add places to compare' : `Remove a place to add another (maximum ${MAX_PLACES})`}
        >
          <Icon name="plus" size={15} /> Compare
        </button>
      {/if}
    </div>
  {/snippet}

  {#if !mobile}
    <!-- Desktop -------------------------------------------------------------->
    <aside class="panel o-glass o-scroll" aria-label="Place and daylight">
      <div class="brand">
        <svg viewBox="0 0 32 20" aria-hidden="true"><path d="M5 16a11 11 0 0 1 22 0" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M1 16h30" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /><circle cx="16" cy="16" r="5" fill="currentColor" /></svg>
        <span>Daylight</span>
      </div>
      <Search onselect={choose} compare={adding} {canAdd} />
      <div class="facts">
        {#if summary}
          <Facts {summary} {sun} />
        {:else}
          <p class="loading">Finding your location…</p>
        {/if}
      </div>
      <PlaceList {compare} oncompare={(on) => (compare = on)} />
    </aside>

    <div class="top-center">{@render comparePill()}</div>

    <div class="corner">
      <button type="button" class="o-btn o-btn--icon o-glass round" onclick={() => (settingsOpen = true)} aria-label="Settings" title="Settings">
        <Icon name="gear" />
      </button>
    </div>

    <div class="globe-tools o-glass" role="group" aria-label="Globe view">
      <button type="button" class="o-btn o-btn--icon o-btn--quiet" onclick={() => globe?.zoomIn()} aria-label="Zoom in on the globe" title="Zoom in"><Icon name="plus" /></button>
      <button type="button" class="o-btn o-btn--icon o-btn--quiet" onclick={() => globe?.zoomOut()} aria-label="Zoom out on the globe" title="Zoom out"><Icon name="minus" /></button>
      <button type="button" class="o-btn o-btn--icon o-btn--quiet" onclick={centerOnSelected} aria-label="Centre the globe on the selected place" title="Centre on {app.selected?.name ?? 'the selected place'}"><Icon name="center" /></button>
    </div>

    <section class="drawer o-glass" class:drawer--open={drawerOpen} style:bottom="{dockH + GAP + 10}px" bind:offsetHeight={drawerH} inert={!drawerOpen} aria-label="Charts" id="obs-charts">
      <ChartDeck layout={wideCharts ? 'side' : 'tabs'} height={chartHeight} />
    </section>

    <div class="dock o-glass" bind:offsetHeight={dockH}>
      <DayRibbon day={summary?.day ?? null} lightNow={summary?.lightNow ?? Light.Night} />
      <div class="dock__row">
        <Transport />
        <DateControls />
        <button type="button" class="o-btn charts-btn" class:o-btn--on={drawerOpen} aria-expanded={drawerOpen} aria-controls="obs-charts" onclick={() => (drawerOpen = !drawerOpen)}>
          <Icon name="chart" /> Charts <Icon name={drawerOpen ? 'down' : 'up'} />
        </button>
      </div>
    </div>
  {:else}
    <!-- Phone ---------------------------------------------------------------->
    <div class="topbar">
      <div class="topbar__search">
        <Search onselect={choose} compare={adding} {canAdd} onfocuschange={(f) => f && (snap = 'peek')} />
      </div>
      <button type="button" class="o-btn o-btn--icon o-glass round" onclick={() => (settingsOpen = true)} aria-label="Settings"><Icon name="gear" /></button>
    </div>
    <div class="top-left" style:opacity={snap === 'full' ? 0 : 1}>{@render comparePill()}</div>

    <BottomSheet bind:snap bind:peekHeight topGap={TOP_BAR + 8}>
      {#snippet header()}
        {#if summary}
          <div class="peek">
            <div class="peek__top">
              <div class="peek__who"><Facts {summary} {sun} compact trio={false} rows={false} /></div>
              <div class="peek__clock">
                <span class="peek__time">{formatClock(app.time, app.scale, hc)}</span>
                <span class="peek__date">{formatDate(app.date, 'short')}</span>
              </div>
            </div>
            <DayRibbon day={summary.day} lightNow={summary.lightNow} />
            <p class="peek__len">
              <span class="peek__lbl">Daylight</span>
              <strong>{formatDuration(summary.day.daylightMin)}</strong>
              <span class="peek__delta" class:up={summary.change > 0}>{Math.abs(summary.change) < 1 / 120 ? 'same as yesterday' : `${formatDelta(summary.change)} vs yesterday`}</span>
            </p>
            <div class="peek__controls"><Transport /></div>
          </div>
        {:else}
          <p class="loading">Finding your location…</p>
        {/if}
      {/snippet}

      <section class="block">
        <ChartDeck layout="tabs" height={vh < 760 ? 190 : 220} />
      </section>
      <section class="block">
        <h2>Date and time</h2>
        <DateControls />
      </section>
      <section class="block">
        <PlaceList {compare} oncompare={(on) => (compare = on)} />
      </section>
      {#if summary}
        <section class="block block--facts">
          <h2>More about {summary.place.name}</h2>
          <Facts {summary} {sun} compact header={false} />
        </section>
      {/if}
      <section class="block">
        <button type="button" class="o-btn" onclick={() => (settingsOpen = true)}><Icon name="gear" /> Settings</button>
      </section>
    </BottomSheet>
  {/if}

  {#if settingsOpen}
    <SettingsDrawer onclose={() => (settingsOpen = false)} />
  {/if}
</div>

<style>
  .obs {
    position: fixed;
    inset: 0;
    overflow: hidden;
  }
  .stage {
    position: absolute;
    transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  /* --- Desktop ---------------------------------------------------------------- */

  .panel {
    position: absolute;
    z-index: 20;
    top: 16px;
    left: 16px;
    bottom: 16px;
    width: var(--panel-w);
    box-sizing: border-box;
    padding: 18px 20px 22px;
    border-radius: var(--r-panel);
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--gold);
    font-size: 18px;
    letter-spacing: 0.04em;
  }
  .brand svg {
    width: 30px;
    height: 19px;
  }
  .brand span {
    color: var(--ink);
    font-weight: 400;
  }
  .facts {
    padding: 6px 0 4px;
  }
  .loading {
    margin: 8px 0;
    color: var(--ink-2);
  }

  .top-center {
    position: absolute;
    z-index: 15;
    top: 16px;
    left: calc(var(--panel-w) + 32px);
    right: 72px;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }
  .corner {
    position: absolute;
    z-index: 25;
    top: 16px;
    right: 16px;
  }
  .round {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: var(--glass);
  }
  .globe-tools {
    position: absolute;
    z-index: 15;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    border-radius: 16px;
  }

  .dock,
  .drawer {
    position: absolute;
    z-index: 20;
    left: calc(var(--panel-w) + 32px);
    right: 16px;
    box-sizing: border-box;
    border-radius: var(--r-panel);
  }
  .dock {
    bottom: calc(16px + var(--safe-bottom));
    padding: 6px 18px 12px;
  }
  .dock__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 14px;
    margin-top: 2px;
  }
  .charts-btn :global(svg:last-child) {
    width: 16px;
    height: 16px;
    opacity: 0.7;
  }
  .drawer {
    padding: 14px 18px 14px;
    background: rgb(8 13 29 / 0.74);
    opacity: 0;
    visibility: hidden;
    transform: translateY(24px);
    transition:
      opacity 0.28s,
      transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1),
      visibility 0s linear 0.36s;
  }
  .drawer--open {
    opacity: 1;
    visibility: visible;
    transform: none;
    transition:
      opacity 0.28s,
      transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1),
      visibility 0s;
  }

  /* --- Compare pill (both layouts) ------------------------------------------- */

  .pill {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 5px 5px 5px 16px;
    border-radius: 999px;
    font-size: 14px;
    color: var(--ink-2);
    box-shadow: 0 8px 30px rgb(0 0 0 / 0.35);
  }
  .pill--adding {
    color: #fff3d6;
    border-color: color-mix(in srgb, var(--gold) 60%, transparent);
    background: rgb(60 42 10 / 0.6);
  }
  .pill__count {
    margin-left: 6px;
    color: var(--gold);
  }
  .pill__btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px 0 11px;
    border: 1px solid color-mix(in srgb, var(--gold) 45%, transparent);
    border-radius: 999px;
    background: rgb(242 196 109 / 0.12);
    color: var(--gold-hot);
    font-size: 14px;
    cursor: pointer;
  }
  .pill__btn:hover:not(:disabled) {
    background: rgb(242 196 109 / 0.22);
  }
  .pill__btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .pill__btn--done {
    padding: 0 16px;
    border: 0;
    background: var(--gold);
    color: var(--on-gold);
    font-weight: 500;
  }
  .pill__btn--done:hover:not(:disabled) {
    background: var(--gold-hot);
  }

  /* --- Phone ------------------------------------------------------------------ */

  .topbar {
    position: absolute;
    z-index: 40;
    top: calc(10px + var(--safe-top));
    left: max(12px, var(--safe-left));
    right: max(12px, var(--safe-right));
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .topbar__search {
    flex: 1;
    min-width: 0;
  }
  .topbar .round {
    flex: none;
  }
  .top-left {
    position: absolute;
    z-index: 25;
    top: calc(68px + var(--safe-top));
    left: max(12px, var(--safe-left));
    right: 12px;
    pointer-events: none;
    transition: opacity 0.2s;
  }
  .obs--mobile .pill {
    padding: 4px;
    font-size: 13px;
  }
  .obs--mobile .pill--adding {
    padding-left: 14px;
  }

  .peek {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .peek__top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .peek__who {
    min-width: 0;
  }
  .peek__clock {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .peek__time {
    font-size: 22px;
    font-weight: 300;
    line-height: 1.25;
    color: #fff8ea;
  }
  .peek__date {
    font-size: 12.5px;
    color: var(--ink-2);
  }
  .peek__len {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    margin: 0;
    font-size: 15px;
  }
  .peek__len strong {
    font-weight: 500;
  }
  .peek__lbl,
  .peek__delta {
    font-size: 13px;
    color: var(--ink-2);
  }
  .peek__delta.up {
    color: var(--gold);
  }
  .peek__controls {
    margin-top: 6px;
  }
  .peek__controls :global(.transport) {
    justify-content: space-between;
  }
  .peek__controls :global(.speed) {
    flex: 1;
  }

  .block {
    padding: 18px 0;
    border-bottom: 1px solid var(--hair);
  }
  .block:last-child {
    border-bottom: 0;
  }
  .block h2 {
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-2);
  }

  @media (prefers-reduced-motion: reduce) {
    .stage,
    .drawer,
    .drawer--open {
      transition: none;
    }
  }
</style>
