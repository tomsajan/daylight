<!--
  Short notes that explain what the charts show: twilight, clock changes and
  the turning points of the year, with figures for the selected place.
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { TIME_SCALE_LABELS } from '$core/time/timescale';
  import { clockChanges, dayMonth, longDay, polarStats, SEASON_NAMES, seasonDates, shiftLabel, solsticeDrift } from '../almanac.svelte';

  const place = $derived(app.selected);
  const changes = $derived(place ? clockChanges(place) : []);
  const seasonList = $derived(place ? seasonDates(place) : []);
  const drift = $derived(place ? solsticeDrift(place) : null);
  const polar = $derived(place ? polarStats(place) : null);
  const year = $derived(app.date.year);
</script>

{#if place}
  <section class="notes" aria-labelledby="alm-notes-title">
    <h2 id="alm-notes-title">Notes for the reader</h2>
    <div class="cols">
      <article>
        <h3>Twilight, in three depths</h3>
        <p>Sunrise and sunset are not the edges of light. Twilight is named for how far the sun has sunk below the horizon:</p>
        <dl>
          <dt>Civil, 0–6°</dt>
          <dd>Bright enough to read outdoors without a lamp. Streetlights come on near its end.</dd>
          <dt>Nautical, 6–12°</dt>
          <dd>Sailors can still see the horizon to take a star sight; the land turns to silhouette.</dd>
          <dt>Astronomical, 12–18°</dt>
          <dd>The sky looks dark to most eyes, but faint stars and galaxies are still washed out.</dd>
        </dl>
        {#if polar?.polarDays}
          <p>Near midsummer {place.name} never reaches full darkness: the sun skims below the horizon or does not set at all.</p>
        {/if}
      </article>

      <article>
        <h3>Why sunrise jumps</h3>
        {#if settings.timeScale !== 'local'}
          <p>
            Times here are shown in {TIME_SCALE_LABELS[settings.timeScale].toLowerCase()}, which has no daylight saving time, so the curves run smoothly
            through the year. Switch to local time in Preferences to see the clock changes.
          </p>
        {:else if changes.length}
          <p>
            In {year} the clocks in {place.name}
            {#each changes as c, i (c.index)}{i > 0 ? (i === changes.length - 1 ? ' and ' : ', ') : ''}go {c.shift > 0 ? 'forward' : 'back'}
              {shiftLabel(c.shift)} on {dayMonth(c.date)}{/each}.
          </p>
          <p>
            The sun keeps its steady pace; only the clock moves. That is why sunrise and sunset leap by an hour in Figure 1, and why the dotted rules sit
            exactly on those breaks. The length of the day does not change at all.
          </p>
        {:else}
          <p>
            {place.name} does not change its clocks in {year}, so sunrise and sunset drift smoothly in Figure 1. Where daylight saving time is used, both
            leap by an hour on the night the clocks change, though the sun itself has not moved.
          </p>
        {/if}
      </article>

      <article>
        <h3>The turning points of {year}</h3>
        {#if seasonList.length}
          <ul class="seasons">
            {#each seasonList as s (s.kind)}
              <li><span>{SEASON_NAMES[s.kind]}</span> <span class="when">{longDay(s.date)}</span></li>
            {/each}
          </ul>
        {/if}
        <p>At the solstices the sun reaches its furthest north or south and the change in day length pauses. At the equinoxes it crosses the equator and the days change fastest.</p>
        {#if drift}
          <p>
            The shortest day in {place.name} is {dayMonth(drift.shortest)}, yet the earliest sunset comes on {dayMonth(drift.earliestSunset)} and the latest
            sunrise on {dayMonth(drift.latestSunrise)}. Around the solstice, solar noon drifts later each day (the equation of time), so the evenings start
            to lengthen before the mornings do.
          </p>
        {:else if Math.abs(place.lat) < 15}
          <p>Near the equator the length of the day hardly changes. Sunrise and sunset still wander by a quarter of an hour through the year, because the sun runs a little fast or slow against the clock (the equation of time).</p>
        {/if}
      </article>
    </div>
  </section>
{/if}

<style>
  .notes {
    border-top: 1px solid var(--ink);
    padding-top: 14px;
  }
  h2 {
    margin: 0;
    font: 500 1.6rem/1.15 var(--serif);
  }
  .cols {
    margin-top: 18px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  article {
    padding: 0 28px;
  }
  article:first-child {
    padding-left: 0;
  }
  article:last-child {
    padding-right: 0;
  }
  article + article {
    border-left: 1px solid var(--rule);
  }
  h3 {
    margin: 0 0 6px;
    font: italic 500 1.15rem/1.25 var(--serif);
  }
  p {
    margin: 0 0 10px;
    font-size: 0.98rem;
    line-height: 1.55;
  }
  dl {
    margin: 0 0 10px;
  }
  dt {
    font: 600 0.82rem/1.3 var(--sans);
    margin-top: 8px;
  }
  dd {
    margin: 2px 0 0;
    font-size: 0.95rem;
    line-height: 1.5;
  }
  .seasons {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    border-top: 1px solid var(--rule);
  }
  .seasons li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid var(--rule);
    font-size: 0.92rem;
  }
  .when {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    text-align: right;
  }
  @media (max-width: 1099px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
      max-width: 40em;
    }
    article {
      padding: 0;
    }
    article + article {
      border-left: 0;
      border-top: 1px solid var(--rule);
      margin-top: 8px;
      padding-top: 18px;
    }
  }
</style>
