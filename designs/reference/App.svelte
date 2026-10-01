<!--
  Reference layout: the minimum wiring of every shared component.
  Design variants start from this to see how state and components connect.
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { settings, resolvedTheme } from '$core/state/settings.svelte';
  import {
    chartPalette,
    currentMinutes,
    daySeries,
    daySummary,
    globeMarkers,
    globeOptions,
    selectedDayIndex,
    sunNow,
    yearSeries,
  } from '$core/state/views';
  import Globe from '$core/globe/Globe.svelte';
  import YearChart from '$core/charts/YearChart.svelte';
  import DayChart from '$core/charts/DayChart.svelte';
  import PlaceSearch from '$core/components/PlaceSearch.svelte';
  import TimeControls from '$core/components/TimeControls.svelte';
  import SettingsPanel from '$core/components/SettingsPanel.svelte';
  import DesignSwitcher from '$core/components/DesignSwitcher.svelte';
  import Splitter from '$core/components/Splitter.svelte';
  import { clamp, panelSizes } from '$core/state/layout.svelte';
  import { LIGHT_NAMES } from '$core/astro/daylight';
  import { addDays } from '$core/time/timescale';
  import { compassPoint, formatClock, formatDate, formatDelta, formatDuration, formatShift, formatMinutes } from '$core/time/format';
  import { formatCoordinates } from '$core/geo/place';

  let addMode = $state(false);
  let settingsOpen = $state(false);
  let yearChart: YearChart | undefined = $state();

  const theme = $derived(resolvedTheme());
  const summary = $derived(daySummary());
  const sun = $derived(sunNow());
  const hc = $derived(settings.hourCycle);

  // Draggable sizes: globe column share, globe and chart heights (px).
  const sizes = panelSizes('reference');
  let layout: HTMLDivElement | undefined = $state();
  let start = 0;
  const px = (name: string) => (sizes.get(name) != null ? `${sizes.get(name)}px` : undefined);
  const globeShare = $derived(sizes.get('globeShare'));

  function pickDay(dayIndex: number) {
    app.setDate(addDays({ year: app.date.year, month: 1, day: 1 }, dayIndex));
  }
</script>

<div
  class="layout"
  data-theme={theme}
  bind:this={layout}
  style:--globe-col={globeShare != null ? `${globeShare}fr` : undefined}
  style:--info-col={globeShare != null ? `${1 - globeShare}fr` : undefined}
>
  <header>
    <h1>Daylight</h1>
    <div class="search">
      <PlaceSearch onselect={(p) => (addMode ? app.addPlace(p) : app.replaceSelected(p))} />
    </div>
    <label class="add"><input type="checkbox" bind:checked={addMode} /> Add to compare</label>
    <button class="dl-btn" onclick={() => (settingsOpen = !settingsOpen)}>Settings</button>
    <DesignSwitcher />
  </header>

  <section class="globe" style:height={px('globe')}>
    <Globe
      time={app.time}
      markers={globeMarkers()}
      selectedId={app.selected?.id}
      options={globeOptions()}
      focus={app.selected}
      focusDistance={3.8}
      onpick={(lat, lon) => app.pickPoint(lat, lon, addMode)}
      onmarker={(id) => app.select(id)}
    />
    <div class="grip">
      <Splitter
        axis="y"
        label="Globe height"
        onstart={() => (start = layout?.querySelector('.globe')?.clientHeight ?? 0)}
        onmove={(d) => sizes.set('globe', clamp(start + d, 240, 1400))}
        onreset={() => sizes.clear('globe')}
      />
    </div>
  </section>
  <div class="split-cols">
    <Splitter
      axis="x"
      label="Globe and info widths"
      onstart={() => (start = layout?.querySelector('.globe')?.clientWidth ?? 0)}
      onmove={(d) => {
        const total = (layout?.querySelector('.globe')?.clientWidth ?? 0) + (layout?.querySelector('.info')?.clientWidth ?? 0);
        sizes.set('globeShare', clamp(start + d, 240, total - 240) / total);
      }}
      onreset={() => sizes.clear('globeShare')}
    />
  </div>

  <section class="info">
    <div class="places">
      {#each app.places as p (p.id)}
        <span class="chip" class:selected={p.id === app.selected?.id} style="--c: {app.colorOf(p)}">
          <button onclick={() => app.select(p.id)}>{p.name}</button>
          {#if app.places.length > 1}<button aria-label="Remove {p.name}" onclick={() => app.removePlace(p.id)}>×</button>{/if}
        </span>
      {/each}
    </div>
    {#if summary}
      <h2>{summary.place.name} <small>{summary.place.detail} · {formatCoordinates(summary.place.lat, summary.place.lon)} · {summary.place.tz}</small></h2>
      <p>
        {formatDate(app.date, 'long')}, {formatClock(app.time, app.scale, hc)} — {LIGHT_NAMES[summary.lightNow]}
        {#if sun}· sun {sun.altitude.toFixed(1)}° {compassPoint(sun.azimuth)}{/if}
      </p>
      <dl>
        <dt>Sunrise</dt><dd>{summary.day.sunrise ? formatMinutes(summary.day.sunrise.minutes, hc) : '—'}</dd>
        <dt>Sunset</dt><dd>{summary.day.sunset ? formatMinutes(summary.day.sunset.minutes, hc) : '—'}</dd>
        <dt>Daylight</dt><dd>{formatDuration(summary.day.daylightMin)} ({formatDelta(summary.change)})</dd>
        {#if summary.morningChange != null && summary.eveningChange != null}
          <dt>Since yesterday</dt><dd>sunrise {formatShift('sunrise', summary.morningChange)}, sunset {formatShift('sunset', summary.eveningChange)}</dd>
        {/if}
        <dt>Solar noon</dt><dd>{formatMinutes(summary.day.solarNoon.minutes, hc)} at {summary.day.solarNoon.altitude.toFixed(1)}°</dd>
        <dt>Longest day</dt><dd>{formatDate(summary.longest.date, 'short')} · {formatDuration(summary.longest.daylightMin)}</dd>
        <dt>Shortest day</dt><dd>{formatDate(summary.shortest.date, 'short')} · {formatDuration(summary.shortest.daylightMin)}</dd>
      </dl>
      {#if summary.day.polarDay}<p><strong>Midnight sun</strong> — the sun doesn't set today.</p>{/if}
      {#if summary.day.polarNight}<p><strong>Polar night</strong> — the sun doesn't rise today.</p>{/if}
    {:else}
      <p>Finding your location…</p>
    {/if}
    <TimeControls />
  </section>

  <section class="year">
    <div class="chart-head">
      <h3>{app.date.year}</h3>
      <select class="dl-input" bind:value={settings.chartMode} aria-label="Year chart shows">
        <option value="bands">Sunrise &amp; sunset</option>
        <option value="daylength">Day length</option>
        <option value="change">Daily change</option>
      </select>
      <button class="dl-btn" onclick={() => yearChart?.zoomIn()}>+</button>
      <button class="dl-btn" onclick={() => yearChart?.zoomOut()}>−</button>
      <button class="dl-btn" onclick={() => yearChart?.resetZoom()}>Reset</button>
    </div>
    <div class="chart" style:height={px('year')}>
      {#if app.selected}
        <YearChart
          bind:this={yearChart}
          series={yearSeries()}
          year={app.date.year}
          mode={settings.chartMode}
          selectedIndex={selectedDayIndex()}
          currentMinutes={currentMinutes()}
          twilight={settings.twilight}
          hourCycle={hc}
          palette={chartPalette()}
          onpick={(i, m) => {
            pickDay(i);
            if (settings.chartMode === 'bands') app.setMinutesOfDay(m);
          }}
        />
      {/if}
    </div>
    <div class="grip">
      <Splitter
        axis="y"
        label="Year chart height"
        onstart={() => (start = layout?.querySelector('.year .chart')?.clientHeight ?? 0)}
        onmove={(d) => sizes.set('year', clamp(start + d, 180, 1200))}
        onreset={() => sizes.clear('year')}
      />
    </div>
  </section>

  <section class="day">
    <h3>{formatDate(app.date, 'medium')}</h3>
    <div class="chart" style:height={px('day')}>
      {#if app.selected}
        <DayChart
          series={daySeries()}
          time={app.time}
          options={app.daylightOptions}
          twilight={settings.twilight}
          hourCycle={hc}
          palette={chartPalette()}
          onpicktime={(t) => app.setTime(t)}
        />
      {/if}
    </div>
    <div class="grip">
      <Splitter
        axis="y"
        label="Day chart height"
        onstart={() => (start = layout?.querySelector('.day .chart')?.clientHeight ?? 0)}
        onmove={(d) => sizes.set('day', clamp(start + d, 160, 1000))}
        onreset={() => sizes.clear('day')}
      />
    </div>
  </section>

  {#if settingsOpen}
    <aside class="settings">
      <button class="dl-btn close" onclick={() => (settingsOpen = false)}>Close</button>
      <SettingsPanel />
    </aside>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    font: 15px/1.45 system-ui, sans-serif;
  }
  .layout {
    --dl-bg: #f6f7fb;
    --dl-fg: #151a26;
    --dl-surface: #fff;
    --dl-muted: #5d6578;
    --dl-border: #d6dae3;
    --dl-accent: #2f6fdd;
    background: var(--dl-bg);
    color: var(--dl-fg);
    min-height: 100vh;
    display: grid;
    gap: 12px;
    padding: 12px;
    box-sizing: border-box;
    grid-template-columns: minmax(0, var(--globe-col, 1fr)) minmax(0, var(--info-col, 1fr));
    grid-template-areas:
      'header header'
      'globe info'
      'year year'
      'day day';
  }
  .layout[data-theme='dark'] {
    --dl-bg: #0c1020;
    --dl-fg: #e7ebf5;
    --dl-surface: #161c30;
    --dl-muted: #9aa3bb;
    --dl-border: #2b3350;
    --dl-color-scheme: dark;
  }
  header {
    grid-area: header;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  h1 {
    margin: 0;
    font-size: 1.3rem;
  }
  .search {
    flex: 1;
    min-width: 220px;
  }
  .globe {
    position: relative;
    grid-area: globe;
    height: min(60vh, 520px);
    background: #05070f;
    border-radius: 12px;
  }
  .info {
    grid-area: info;
  }
  .split-cols {
    grid-area: info;
    justify-self: start;
    width: 12px;
    margin-left: -12px;
  }
  .grip {
    height: 12px;
  }
  .globe .grip {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -12px;
  }
  .year {
    grid-area: year;
  }
  .day {
    grid-area: day;
  }
  .chart {
    height: 340px;
  }
  .day .chart {
    height: 240px;
  }
  .chart-head {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  h2 small {
    font-weight: normal;
    font-size: 0.6em;
    color: var(--dl-muted);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
  }
  dt {
    color: var(--dl-muted);
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .places {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    border: 2px solid var(--c);
    border-radius: 99px;
    overflow: hidden;
  }
  .chip.selected {
    background: color-mix(in srgb, var(--c) 25%, transparent);
  }
  .chip button {
    border: 0;
    background: none;
    color: inherit;
    padding: 3px 9px;
    cursor: pointer;
    font: inherit;
  }
  .settings {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: min(380px, 100vw);
    overflow-y: auto;
    padding: 16px;
    box-sizing: border-box;
    background: var(--dl-surface);
    box-shadow: -10px 0 30px rgb(0 0 0 / 0.3);
    z-index: 100;
  }
  .close {
    margin-bottom: 12px;
  }
  @media (max-width: 760px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: 'header' 'globe' 'info' 'year' 'day';
    }
    .globe {
      height: 50vh;
    }
    .split-cols {
      display: none;
    }
  }
</style>
