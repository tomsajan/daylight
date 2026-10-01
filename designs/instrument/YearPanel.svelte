<!-- Year chart with mode switch, year stepping, visible zoom buttons and a cursor readout. -->
<script lang="ts">
  import YearChart from '$core/charts/YearChart.svelte';
  import { app } from '$core/state/app.svelte';
  import { settings, resolvedTheme } from '$core/state/settings.svelte';
  import { currentMinutes, selectedDayIndex, yearSeries } from '$core/state/views';
  import { formatDate, formatMinutes } from '$core/time/format';
  import { addDays } from '$core/time/timescale';
  import Panel from './Panel.svelte';
  import Icon from './Icon.svelte';
  import { ICON } from './icons';
  import { addMonths, dur } from './lib';
  import { instrumentPalette } from './palette';

  let chart: YearChart | undefined = $state();
  let hover = $state<{ dayIndex: number; minutes: number } | null>(null);

  const hc = $derived(settings.hourCycle);
  const series = $derived(yearSeries());
  const palette = $derived(instrumentPalette(resolvedTheme()));

  // Readout follows the pointer when hovering, otherwise the selected date.
  const cursorIndex = $derived(hover ? hover.dayIndex : selectedDayIndex());
  const cursorDay = $derived(series[0]?.days[Math.max(0, Math.min((series[0]?.days.length ?? 1) - 1, cursorIndex))]);

  function pickDay(dayIndex: number) {
    app.setDate(addDays({ year: app.date.year, month: 1, day: 1 }, dayIndex));
  }
</script>

<Panel title="Year" flush class="year-panel">
  {#snippet tools()}
    <div class="seg" aria-label="Year">
      <button type="button" class="btn" onclick={() => app.setDate(addMonths(app.date, -12))} aria-label="Previous year" title="Previous year">‹</button>
      <span class="btn yr num" aria-live="polite">{app.date.year}</span>
      <button type="button" class="btn" onclick={() => app.setDate(addMonths(app.date, 12))} aria-label="Next year" title="Next year">›</button>
    </div>
    <div class="seg" role="radiogroup" aria-label="Year chart mode">
      <button type="button" class="btn" role="radio" aria-checked={settings.chartMode === 'bands'} class:on={settings.chartMode === 'bands'} onclick={() => (settings.chartMode = 'bands')} title="Light through each day: sunrise, sunset and twilight (M)">Rise / set</button>
      <button type="button" class="btn" role="radio" aria-checked={settings.chartMode === 'daylength'} class:on={settings.chartMode === 'daylength'} onclick={() => (settings.chartMode = 'daylength')} title="Hours of daylight per day (M)">Day length</button>
    </div>
    <div class="zoom">
      <span class="lbl" title="Zoom the date axis">Dates</span>
      <div class="seg">
        <button type="button" class="btn" onclick={() => chart?.zoomOut()} aria-label="Zoom out dates" title="Show more days"><Icon d={ICON.minus} /></button>
        <button type="button" class="btn" onclick={() => chart?.zoomIn()} aria-label="Zoom in dates" title="Show fewer days, around the selected date"><Icon d={ICON.plus} /></button>
      </div>
      <span class="lbl" title="Zoom the hours axis">Hours</span>
      <div class="seg">
        <button type="button" class="btn" onclick={() => chart?.zoomTimeOut()} aria-label="Zoom out hours" title="Show more hours"><Icon d={ICON.minus} /></button>
        <button type="button" class="btn" onclick={() => chart?.zoomTimeIn()} aria-label="Zoom in hours" title="Show fewer hours"><Icon d={ICON.plus} /></button>
      </div>
      <button type="button" class="btn" onclick={() => chart?.resetZoom()} title="Show the whole year (or double-click the chart)">Reset</button>
    </div>
  {/snippet}

  <div class="inner">
    <div class="chart">
      {#if app.selected}
        <YearChart
          bind:this={chart}
          {series}
          year={app.date.year}
          mode={settings.chartMode}
          selectedIndex={selectedDayIndex()}
          currentMinutes={currentMinutes()}
          twilight={settings.twilight}
          hourCycle={hc}
          {palette}
          onhover={(h) => (hover = h)}
          onpick={(i, m) => {
            pickDay(i);
            if (settings.chartMode === 'bands') app.setMinutesOfDay(Math.max(0, Math.min(1439, m)));
          }}
        />
      {/if}
    </div>
    {#if cursorDay}
      <div class="readout num" class:hovering={hover}>
        <span><b class="lbl">{hover ? 'Cursor' : 'Selected'}</b>{formatDate(cursorDay.date, 'medium')}</span>
        <span><b class="lbl">Rise</b>{cursorDay.sunrise ? formatMinutes(cursorDay.sunrise.minutes, hc) : '—'}</span>
        <span><b class="lbl">Set</b>{cursorDay.sunset ? formatMinutes(cursorDay.sunset.minutes, hc) : '—'}</span>
        <span><b class="lbl">Daylight</b>{dur(cursorDay.daylightMin)}</span>
        {#if hover && settings.chartMode === 'bands'}
          <span><b class="lbl">Time</b>{formatMinutes(Math.max(0, Math.min(1439, hover.minutes)), hc)}</span>
        {/if}
        {#each series.slice(1) as s (s.id)}
          {@const d = s.days[Math.max(0, Math.min(s.days.length - 1, cursorIndex))]}
          {#if d}<span class="other"><i class="sw" style="--c: {s.color}"></i>{dur(d.daylightMin)}</span>{/if}
        {/each}
        <span class="hint">Tap a day to select it. Drag to pan, double-tap to reset.</span>
      </div>
    {/if}
  </div>
</Panel>

<style>
  .inner {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .chart {
    flex: 1;
    min-height: 0;
    padding: 4px 4px 0 0;
  }
  .yr {
    min-width: 46px;
    cursor: default;
    font: 600 11.5px var(--mono);
    letter-spacing: 0;
  }
  .yr:hover {
    border-color: var(--rule-strong);
  }
  .zoom {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .zoom .lbl {
    margin-left: 4px;
  }
  .readout {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 14px;
    padding: 5px 10px 6px;
    border-top: 1px solid var(--rule);
    font-size: 12px;
    font-weight: 500;
    flex: none;
  }
  .readout b {
    margin-right: 5px;
  }
  .readout.hovering {
    background: var(--accent-soft);
  }
  .other {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--ink-2);
  }
  .hint {
    margin-left: auto;
    font: 400 11px var(--sans);
    color: var(--faint);
  }
  @media (max-width: 759px) {
    .hint {
      display: none;
    }
  }
</style>
