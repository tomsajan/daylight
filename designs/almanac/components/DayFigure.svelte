<!-- Figure 2: the sun's altitude through the selected day, for every place. -->
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
    <span class="how">
      Tap to set the time of day.
      <button type="button" class="link" onclick={() => chart?.resetZoom()}>Reset the view</button>
    </span>
  </figcaption>
</figure>

<style>
  .plate {
    height: 280px;
    margin-top: 14px;
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
  @media (pointer: coarse) {
    .plate :global(canvas) {
      touch-action: pan-y !important;
    }
  }
  @media (max-width: 759px) {
    .plate {
      height: 240px;
      margin-left: calc(-1 * var(--gutter) + 4px);
      margin-right: calc(-1 * var(--gutter) + 4px);
    }
  }
</style>
