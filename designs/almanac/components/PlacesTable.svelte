<!--
  Places compared: one ruled row per place with the selected day's figures,
  buttons to show or remove each, and a search to add another.
-->
<script lang="ts">
  import { app, MAX_PLACES } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { daySummary } from '$core/state/views';
  import { formatDelta, formatDuration, formatMinutes } from '$core/time/format';
  import { formatCoordinates } from '$core/geo/place';
  import AlmanacSearch from './AlmanacSearch.svelte';
  import { dayMonth, inkOf } from '../almanac.svelte';

  const rows = $derived(app.places.map((p) => ({ place: p, s: daySummary(p)! })));
  const hc = $derived(settings.hourCycle);
  const full = $derived(app.places.length >= MAX_PLACES);

  function time(m: number | undefined): string {
    return m == null ? '—' : formatMinutes(m, hc);
  }
</script>

<section class="places" aria-labelledby="alm-places-title">
  <header class="fig-head">
    <p class="fig-no">Comparison</p>
    <h2 id="alm-places-title">Places side by side on {dayMonth(app.date)}</h2>
  </header>
  <p class="intro">
    {#if app.places.length === 1}
      Add up to {MAX_PLACES - 1} more places to draw them on the charts and compare their days here.
    {:else}
      {app.places.length} of {MAX_PLACES} places. Choose one to make it the subject of the page; its colour is its line in the charts.
    {/if}
  </p>

  <table>
    <thead>
      <tr>
        <th scope="col" class="c-name">Place</th>
        <th scope="col" class="c-num">Sunrise</th>
        <th scope="col" class="c-num">Sunset</th>
        <th scope="col" class="c-num">Daylight</th>
        <th scope="col" class="c-num c-change">Change</th>
        <th scope="col" class="c-act"><span class="sr">Actions</span></th>
      </tr>
    </thead>
    <tbody>
      {#each rows as { place, s } (place.id)}
        {@const selected = place.id === app.selected?.id}
        <tr class:selected style="--c: {inkOf(place)}">
          <th scope="row" class="c-name">
            <button type="button" class="name" onclick={() => app.select(place.id)} aria-pressed={selected} title={selected ? 'Shown above' : `Show ${place.name}`}>
              <span class="sw" aria-hidden="true"></span>
              <span class="nm">{place.name}</span>
              <span class="dt">{place.detail || formatCoordinates(place.lat, place.lon, 1)}</span>
            </button>
          </th>
          {#if s.day.polarDay || s.day.polarNight}
            <td class="c-num c-polar" colspan="2">{s.day.polarDay ? 'Midnight sun' : 'Polar night'}</td>
          {:else}
            <td class="c-num">{time(s.day.sunrise?.minutes)}</td>
            <td class="c-num">{time(s.day.sunset?.minutes)}</td>
          {/if}
          <td class="c-num c-len">{formatDuration(s.day.daylightMin)}</td>
          <td class="c-num c-change">{formatDelta(s.change)}</td>
          <td class="c-act">
            {#if app.places.length > 1}
              <button type="button" class="remove" onclick={() => app.removePlace(place.id)} aria-label="Remove {place.name} from the comparison" title="Remove">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
              </button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="add">
    <AlmanacSearch
      label="Add a place to the comparison"
      placeholder={full ? 'Replace the selected place with…' : 'Add a place to compare…'}
      selectLabel={full ? 'Replace' : 'Add'}
      onselect={(p) => app.addPlace(p)}
    />
    {#if full}
      <p class="note">That’s {MAX_PLACES} places, the most the charts can show. A new place replaces the selected one; remove one to make room.</p>
    {/if}
  </div>
</section>

<style>
  .intro {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 0.95rem;
  }
  table {
    width: 100%;
    margin-top: 14px;
    border-collapse: collapse;
    border-top: 1px solid var(--ink);
    font-variant-numeric: tabular-nums;
  }
  thead th {
    padding: 8px 0 6px;
    font: 400 0.78rem/1.2 var(--sans);
    color: var(--muted);
    text-align: left;
    border-bottom: 1px solid var(--rule-strong);
  }
  tbody tr {
    border-bottom: 1px solid var(--rule);
  }
  tbody tr.selected {
    background: var(--wash);
  }
  td,
  tbody th {
    padding: 4px 0;
    vertical-align: middle;
    text-align: left;
  }
  .c-num {
    padding-left: 14px;
    width: 1%;
    white-space: nowrap;
    font: 400 1.05rem/1.2 var(--serif);
    font-feature-settings: 'lnum', 'tnum';
  }
  thead .c-num {
    font: 400 0.78rem/1.2 var(--sans);
  }
  .c-change {
    font-family: var(--sans);
    font-size: 0.82rem;
    color: var(--muted);
  }
  .c-polar {
    font-style: italic;
  }
  .c-act {
    width: 44px;
    text-align: right;
  }
  .name {
    display: grid;
    grid-template-columns: 22px 1fr;
    align-items: baseline;
    width: 100%;
    padding: 8px 6px 8px 0;
    border: 0;
    background: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .sw {
    width: 14px;
    border-top: 3px solid var(--c);
    align-self: center;
  }
  .nm {
    font: 500 1.1rem/1.2 var(--serif);
  }
  .selected .nm {
    font-weight: 600;
  }
  .name:hover .nm {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  .dt {
    grid-column: 2;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .remove {
    display: inline-grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .remove:hover {
    color: var(--alert);
  }
  .remove svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    stroke-width: 1.6;
  }
  .add {
    margin-top: 18px;
    max-width: 460px;
  }
  .note {
    margin: 8px 0 0;
    font-size: 0.84rem;
    color: var(--muted);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  /* Phones: drop the change column and tighten the figures. */
  @media (max-width: 559px) {
    .c-change {
      display: none;
    }
    .c-num {
      padding-left: 8px;
      font-size: 0.95rem;
    }
    .nm {
      font-size: 1.02rem;
    }
    .name {
      grid-template-columns: 18px 1fr;
    }
    .c-act {
      width: 40px;
    }
  }
</style>
