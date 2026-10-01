<!--
  The places being compared: colour, name, local clock and today's daylight.
  Tap a row to select it; × removes it (the last place can't be removed).
-->
<script lang="ts">
  import { app, MAX_PLACES } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { selectedDayIndex } from '$core/state/views';
  import { formatClock, formatDuration, formatMinutes } from '$core/time/format';
  import Icon from './Icon.svelte';

  interface Props {
    compare: boolean;
    oncompare: (on: boolean) => void;
  }
  let { compare, oncompare }: Props = $props();

  const hc = $derived(settings.hourCycle);
  const rows = $derived(
    app.places.map((p) => {
      const day = app.yearFor(p)[selectedDayIndex()] ?? app.dayFor(p);
      return { place: p, day, color: app.colorOf(p), clock: formatClock(app.time, app.scaleFor(p), hc) };
    }),
  );
  const full = $derived(app.places.length >= MAX_PLACES);
</script>

<section class="places" aria-label="Places">
  <header>
    <h2>Places</h2>
    <span class="count">{app.places.length} of {MAX_PLACES}</span>
  </header>
  <ul>
    {#each rows as r (r.place.id)}
      {@const selected = r.place.id === app.selected?.id}
      <li class:selected style:--c={r.color}>
        <button type="button" class="row" onclick={() => app.select(r.place.id)} aria-current={selected ? 'true' : undefined}>
          <span class="dot" aria-hidden="true"></span>
          <span class="who">
            <span class="name">{r.place.name}</span>
            <span class="detail">{r.clock} local{r.place.detail ? `, ${r.place.detail}` : ''}</span>
          </span>
          <span class="len">
            <span class="hours">{r.day.polarNight ? 'No sunrise' : r.day.polarDay ? 'Midnight sun' : formatDuration(r.day.daylightMin)}</span>
            {#if r.day.sunrise && r.day.sunset}
              <span class="span">{formatMinutes(r.day.sunrise.minutes, hc)} – {formatMinutes(r.day.sunset.minutes, hc)}</span>
            {/if}
          </span>
        </button>
        {#if app.places.length > 1}
          <button type="button" class="remove" onclick={() => app.removePlace(r.place.id)} aria-label="Remove {r.place.name}" title="Remove {r.place.name}">
            <Icon name="close" size={14} />
          </button>
        {/if}
      </li>
    {/each}
  </ul>
  <button type="button" class="o-btn o-btn--sm add" aria-pressed={compare && !full} disabled={full} onclick={() => oncompare(!compare)}>
    <Icon name={compare && !full ? 'close' : 'plus'} />
    {full ? `Comparing the maximum of ${MAX_PLACES}` : compare ? 'Stop adding places' : 'Compare another place'}
  </button>
  {#if compare && !full}
    <p class="hint">Tap the globe or pick a search result to add it.</p>
  {/if}
</section>

<style>
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-2);
  }
  .count {
    font-size: 12.5px;
    color: var(--ink-3);
  }
  ul {
    list-style: none;
    margin: 0 -8px;
    padding: 0;
  }
  li {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: 12px;
  }
  li.selected {
    background: linear-gradient(90deg, color-mix(in srgb, var(--c) 16%, transparent), transparent 85%);
  }
  li.selected::before {
    content: '';
    position: absolute;
    left: 0;
    top: 10px;
    bottom: 10px;
    width: 2px;
    border-radius: 2px;
    background: var(--c);
  }
  .row {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 6px 4px 6px 12px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    background: var(--glass-hover);
  }
  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 10px color-mix(in srgb, var(--c) 70%, transparent);
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detail {
    font-size: 12.5px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .len {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .hours {
    font-size: 14px;
  }
  .span {
    font-size: 12px;
    color: var(--ink-3);
  }
  .remove {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    margin-right: 4px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink-3);
    cursor: pointer;
  }
  .remove:hover {
    color: var(--ink);
    background: var(--glass-hover);
  }
  .add {
    margin-top: 8px;
  }
  .hint {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--gold-hot);
  }
  @media (pointer: coarse) {
    .remove {
      width: 40px;
      height: 40px;
    }
    .row {
      min-height: 54px;
    }
  }
</style>
