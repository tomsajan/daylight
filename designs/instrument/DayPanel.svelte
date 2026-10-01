<!-- Sun altitude through the selected day for every compared place; zoom buttons; the sun can be dragged along the day. -->
<script lang="ts">
  import DayChart from '$core/charts/DayChart.svelte';
  import { app } from '$core/state/app.svelte';
  import { settings, resolvedTheme } from '$core/state/settings.svelte';
  import { daySeries } from '$core/state/views';
  import { formatDate } from '$core/time/format';
  import Panel from './Panel.svelte';
  import Icon from './Icon.svelte';
  import { ICON } from './icons';
  import { instrumentPalette } from './palette';
  import { ui } from './ui.svelte';

  let chart: DayChart | undefined = $state();
  let zoomed = $state(false);
  const palette = $derived(instrumentPalette(resolvedTheme()));
</script>

<Panel title="Day" sub={formatDate(app.date, 'long')} flush class="day-panel">
  {#snippet tools()}
    <span class="lbl">Zoom</span>
    <div class="seg">
      <button type="button" class="btn" onclick={() => chart?.zoomOut()} disabled={!zoomed} aria-label="Zoom out" title="Show more of the day"><Icon d={ICON.minus} /></button>
      <button type="button" class="btn" onclick={() => chart?.zoomIn()} aria-label="Zoom in" title="Show fewer hours"><Icon d={ICON.plus} /></button>
    </div>
    <button type="button" class="btn" onclick={() => chart?.resetZoom()} disabled={!zoomed} title="Show the whole day (or double-click the chart)">Reset</button>
  {/snippet}
  <div class="inner">
    <div class="chart">
      {#if app.selected}
        <DayChart
          bind:this={chart}
          series={daySeries()}
          time={app.time}
          options={app.daylightOptions}
          twilight={settings.twilight}
          hourCycle={settings.hourCycle}
          {palette}
          touchScroll={ui.phone}
          onpicktime={(t) => app.setTime(t)}
          onviewchange={(z) => (zoomed = z.x || z.y)}
        />
      {/if}
    </div>
    <div class="legend">
      {#each app.places as p (p.id)}
        <button type="button" class="key" class:on={p.id === app.selected?.id} onclick={() => app.select(p.id)}>
          <i class="sw" style="--c: {app.colorOf(p)}"></i>{p.name}
        </button>
      {/each}
      <span class="hint">Sun altitude in degrees. Drag the sun or tap to set the time.</span>
    </div>
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
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 4px;
    padding: 3px 8px 5px;
    border-top: 1px solid var(--rule);
    flex: none;
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 6px;
    border: 1px solid transparent;
    border-radius: 2px;
    background: none;
    font-size: 12px;
    font-weight: 500;
    color: var(--ink-2);
    cursor: pointer;
  }
  .key.on {
    border-color: var(--rule-strong);
    color: var(--ink);
    font-weight: 600;
  }
  .hint {
    margin-left: auto;
    font-size: 11px;
    color: var(--faint);
  }
</style>
