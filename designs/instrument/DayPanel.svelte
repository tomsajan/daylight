<!-- Sun altitude through the selected day for every compared place. -->
<script lang="ts">
  import DayChart from '$core/charts/DayChart.svelte';
  import { app } from '$core/state/app.svelte';
  import { settings, resolvedTheme } from '$core/state/settings.svelte';
  import { daySeries } from '$core/state/views';
  import { formatDate } from '$core/time/format';
  import Panel from './Panel.svelte';
  import { instrumentPalette } from './palette';

  let chart: DayChart | undefined = $state();
  const palette = $derived(instrumentPalette(resolvedTheme()));
</script>

<Panel title="Day" sub={formatDate(app.date, 'long')} flush class="day-panel">
  {#snippet tools()}
    <button type="button" class="btn" onclick={() => chart?.resetZoom()} title="Show the whole day (or double-click the chart)">Reset zoom</button>
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
          onpick={(m) => app.setMinutesOfDay(m)}
        />
      {/if}
    </div>
    <div class="legend">
      {#each app.places as p (p.id)}
        <button type="button" class="key" class:on={p.id === app.selected?.id} onclick={() => app.select(p.id)}>
          <i class="sw" style="--c: {app.colorOf(p)}"></i>{p.name}
        </button>
      {/each}
      <span class="hint">Sun altitude in degrees. Tap to set the time.</span>
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
