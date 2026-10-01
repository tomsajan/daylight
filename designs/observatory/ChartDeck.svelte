<!--
  Year chart and day chart with their controls, either side by side (wide
  drawer) or as tabs (narrow drawer, phone sheet).
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { currentMinutes, daySeries, selectedDayIndex, yearSeries } from '$core/state/views';
  import YearChart from '$core/charts/YearChart.svelte';
  import DayChart from '$core/charts/DayChart.svelte';
  import { Light } from '$core/astro/daylight';
  import { addDays } from '$core/time/timescale';
  import { formatDate } from '$core/time/format';
  import { LIGHT_COLORS, LIGHT_SHORT, OBS_CHART_PALETTE } from './palette';
  import Icon from './Icon.svelte';

  interface Props {
    layout: 'side' | 'tabs';
    /** Chart canvas height in px. */
    height: number;
  }
  let { layout, height }: Props = $props();

  let tab = $state<'year' | 'day'>('year');
  let yearChart: YearChart | undefined = $state();
  let dayChart: DayChart | undefined = $state();

  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const showYear = $derived(layout === 'side' || tab === 'year');
  const showDay = $derived(layout === 'side' || tab === 'day');
  const hc = $derived(settings.hourCycle);

  const legend = $derived(
    [Light.Day, Light.Civil, Light.Nautical, Light.Astronomical, Light.Night].filter(
      (l) =>
        l === Light.Day ||
        l === Light.Night ||
        (l === Light.Civil && settings.twilight.civil) ||
        (l === Light.Nautical && settings.twilight.nautical) ||
        (l === Light.Astronomical && settings.twilight.astronomical),
    ),
  );
  // Line colours only matter once there is more than one place.
  const lines = $derived(app.places.length > 1 ? app.places : []);

  function pickDay(dayIndex: number, minutes: number) {
    app.setDate(addDays({ year: app.date.year, month: 1, day: 1 }, dayIndex));
    if (settings.chartMode === 'bands') app.setMinutesOfDay(minutes);
  }
</script>

<div class="deck deck--{layout}">
  {#if layout === 'tabs'}
    <div class="o-seg tabs" role="tablist" aria-label="Charts">
      <button type="button" role="tab" aria-selected={tab === 'year'} onclick={() => (tab = 'year')}>Year {app.date.year}</button>
      <button type="button" role="tab" aria-selected={tab === 'day'} onclick={() => (tab = 'day')}>{formatDate(app.date, 'short')}</button>
    </div>
  {/if}

  <div class="panes">
    <section class="pane pane--year" hidden={!showYear} aria-label="Year chart">
      <header>
        {#if layout === 'side'}<h3>Year {app.date.year}</h3>{/if}
        <div class="o-seg" role="group" aria-label="Year chart shows">
          <button type="button" aria-pressed={settings.chartMode === 'bands'} onclick={() => (settings.chartMode = 'bands')}>Sunrise &amp; sunset</button>
          <button type="button" aria-pressed={settings.chartMode === 'daylength'} onclick={() => (settings.chartMode = 'daylength')}>Day length</button>
        </div>
        <div class="zoom" role="group" aria-label="Zoom dates">
          <button type="button" class="o-btn o-btn--sm o-btn--icon" onclick={() => yearChart?.zoomOut()} title="Zoom out" aria-label="Zoom out"><Icon name="minus" /></button>
          <button type="button" class="o-btn o-btn--sm o-btn--icon" onclick={() => yearChart?.zoomIn()} title="Zoom in on the selected date" aria-label="Zoom in"><Icon name="plus" /></button>
          <button type="button" class="o-btn o-btn--sm o-btn--icon" onclick={() => yearChart?.resetZoom()} title="Show the whole year" aria-label="Reset zoom"><Icon name="reset" /></button>
        </div>
      </header>
      <div class="chart" style:height="{height}px">
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
            palette={OBS_CHART_PALETTE}
            onpick={pickDay}
          />
        {/if}
      </div>
    </section>

    <section class="pane pane--day" hidden={!showDay} aria-label="Day chart">
      <header>
        {#if layout === 'side'}<h3>{formatDate(app.date, 'long')}</h3>{/if}
        <span class="sub">Sun altitude through the day</span>
        <div class="zoom">
          <button type="button" class="o-btn o-btn--sm o-btn--icon" onclick={() => dayChart?.resetZoom()} title="Reset zoom" aria-label="Reset day chart zoom"><Icon name="reset" /></button>
        </div>
      </header>
      <div class="chart" style:height="{height}px">
        {#if app.selected}
          <DayChart
            bind:this={dayChart}
            series={daySeries()}
            time={app.time}
            options={app.daylightOptions}
            twilight={settings.twilight}
            hourCycle={hc}
            palette={OBS_CHART_PALETTE}
            onpicktime={(t) => app.setTime(t)}
          />
        {/if}
      </div>
    </section>
  </div>

  <footer>
    <ul class="legend" aria-label="Legend">
      {#each legend as l (l)}
        <li><span class="sw" style:background={LIGHT_COLORS[l]}></span>{LIGHT_SHORT[l]}</li>
      {/each}
      {#each lines as p (p.id)}
        <li><span class="ln" style:background={app.colorOf(p)}></span>{p.name}</li>
      {/each}
    </ul>
    <p class="hint">
      {#if touch}
        Pinch to zoom, drag to pan, double-tap to reset. Tap a day or a time to jump there.
      {:else}
        Scroll to zoom dates, Shift+scroll for hours, drag to pan, double-click to reset. Click to jump to a day or time.
      {/if}
    </p>
  </footer>
</div>

<style>
  .deck {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .tabs {
    align-self: flex-start;
  }
  .panes {
    display: flex;
    gap: 18px;
    min-width: 0;
  }
  .pane {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .deck--side .pane--year {
    flex: 3;
  }
  .deck--side .pane--day {
    flex: 2;
  }
  .pane[hidden] {
    display: none;
  }
  header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 10px;
    min-height: 36px;
  }
  h3 {
    margin: 0 auto 0 0;
    font-size: 16px;
    font-weight: 400;
  }
  .sub {
    margin-right: auto;
    font-size: 13px;
    color: var(--ink-2);
  }
  .deck--side .sub {
    display: none;
  }
  .zoom {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }
  .chart {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    background: #060a17;
    border: 1px solid var(--hair);
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px 16px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 12.5px;
    color: var(--ink-2);
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.2);
  }
  .ln {
    width: 14px;
    height: 3px;
    border-radius: 2px;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--ink-3);
  }
</style>
