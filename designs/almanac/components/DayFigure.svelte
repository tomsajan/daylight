<!--
  Figure 2: the sun's altitude through the selected day, for every place,
  with zoom buttons for the hours. The sun can be dragged along the day.
-->
<script lang="ts">
  import DayChart from '$core/charts/DayChart.svelte';
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { orderedPlaces } from '$core/state/views';
  import { almanacDaySeries, almanacPalette, dayMonth, inkOf } from '../almanac.svelte';

  let chart: DayChart | undefined = $state();
  const others = $derived(orderedPlaces().length > 1);
</script>

<figure class="fig day-fig">
  <header class="fig-head">
    <p class="fig-no">Figure 2</p>
    <h2>The sun’s path on {dayMonth(app.date)}</h2>
  </header>

  <div class="zoom" role="group" aria-label="Zoom">
    <span class="zl">Hours</span>
    <button type="button" onclick={() => chart?.zoomOut()} aria-label="Zoom out hours" title="Show more of the day">−</button>
    <button type="button" onclick={() => chart?.zoomIn()} aria-label="Zoom in hours" title="Show fewer hours">+</button>
    <button type="button" class="reset" onclick={() => chart?.resetZoom()}>Whole day</button>
  </div>

  <div class="plate">
    {#if app.selected}
      <DayChart
        bind:this={chart}
        series={almanacDaySeries()}
        time={app.time}
        options={app.daylightOptions}
        twilight={settings.twilight}
        hourCycle={settings.hourCycle}
        palette={almanacPalette()}
        touchScroll
        onpicktime={(t) => app.setTime(t)}
      />
    {/if}
  </div>

  {#if others}
    <ul class="key" aria-label="Places">
      {#each orderedPlaces() as p (p.id)}
        <li><span class="sw" style="--c: {inkOf(p)}"></span>{p.name}</li>
      {/each}
    </ul>
  {/if}

  <figcaption>
    The curve is the sun’s height above the horizon, hour by hour. Where it crosses the horizon line the sun rises or sets; the shaded bands below are
    the three twilights, each 6° deeper than the last. The dot is the sun at the chosen time.
    <span class="how">Drag the sun along its path, or tap anywhere, to set the time of day. Pinch, scroll or use the buttons to zoom into the hours.</span>
  </figcaption>
</figure>

<style>
  .zoom {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    margin: 10px 0 8px;
    font-family: var(--sans);
    font-size: 0.85rem;
  }
  .zl {
    color: var(--muted);
    margin-right: 2px;
  }
  .zoom button {
    min-width: 34px;
    height: 34px;
    padding: 0 8px;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    background: transparent;
    color: var(--ink);
    font: 500 1rem/1 var(--sans);
    cursor: pointer;
  }
  .zoom button.reset {
    margin-left: 8px;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .zoom button:hover {
    border-color: var(--ink);
  }
  .plate {
    height: 280px;
    border-top: 1px solid var(--ink);
    border-bottom: 1px solid var(--rule);
    padding-top: 4px;
  }
  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    font-family: var(--sans);
    font-size: 0.8rem;
  }
  .key li {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .sw {
    width: 18px;
    border-top: 2.5px solid var(--c);
  }
  .how {
    display: block;
    margin-top: 4px;
    color: var(--muted);
  }
  @media (max-width: 759px) {
    .plate {
      height: 240px;
      margin-left: calc(-1 * var(--gutter) + 4px);
      margin-right: calc(-1 * var(--gutter) + 4px);
    }
  }
</style>
