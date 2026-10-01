<!--
  Date, time of day and simulation controls bound to the shared app state.
  `compact` hides the date/time inputs (for a slim bar on phones).
-->
<script lang="ts">
  import { app, SPEEDS } from '../state/app.svelte';
  import { settings } from '../state/settings.svelte';
  import { addDays, dateKey, minutesOfDay, type CivilDate } from '../time/timescale';
  import { formatClock, formatDate, formatOffset } from '../time/format';

  interface Props {
    compact?: boolean;
    showSlider?: boolean;
  }
  let { compact = false, showSlider = true }: Props = $props();

  const minutes = $derived(minutesOfDay(app.time, app.date, app.scale));
  const speedIndex = $derived(Math.max(0, SPEEDS.findIndex((s) => s.value === Math.abs(app.speed))));
  const reverse = $derived(app.speed < 0);

  function onDate(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    const m = v.match(/^(\d{4,})-(\d{2})-(\d{2})$/);
    if (m) app.setDate({ year: +m[1], month: +m[2], day: +m[3] });
  }

  function onTime(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    const m = v.match(/^(\d{2}):(\d{2})/);
    if (m) app.setMinutesOfDay(+m[1] * 60 + +m[2]);
  }

  function step(days: number) {
    const d: CivilDate = addDays(app.date, days);
    app.setDate(d);
  }

  function setSpeed(i: number) {
    app.setSpeed(SPEEDS[i].value * (reverse ? -1 : 1));
    if (!app.playing) app.play();
  }

  const timeValue = $derived(
    `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`,
  );
</script>

<div class="dl-time" class:dl-time--compact={compact}>
  {#if !compact}
    <div class="dl-time__row">
      <button type="button" class="dl-btn dl-btn--icon" onclick={() => step(-1)} title="Previous day" aria-label="Previous day">‹</button>
      <input class="dl-input" type="date" value={dateKey(app.date)} onchange={onDate} aria-label="Date" />
      <button type="button" class="dl-btn dl-btn--icon" onclick={() => step(1)} title="Next day" aria-label="Next day">›</button>
      <input class="dl-input" type="time" value={timeValue} onchange={onTime} aria-label="Time of day" />
      <span class="dl-time__zone" title={app.selected?.tz}>{formatOffset(app.time, app.scale)}</span>
    </div>
  {/if}

  {#if showSlider}
    <input
      class="dl-time__slider"
      type="range"
      min="0"
      max="1439"
      step="1"
      value={Math.floor(minutes)}
      oninput={(e) => app.setMinutesOfDay(+(e.target as HTMLInputElement).value)}
      aria-label="Time of day"
    />
  {/if}

  <div class="dl-time__row">
    <button
      type="button"
      class="dl-btn dl-btn--icon"
      onclick={() => app.setSpeed(-app.speed)}
      aria-pressed={reverse}
      title={reverse ? 'Running backwards' : 'Running forwards'}
      aria-label="Reverse direction">{reverse ? '◀' : '▶'}</button
    >
    <button type="button" class="dl-btn dl-btn--primary" onclick={() => app.toggle()} aria-label={app.playing ? 'Pause' : 'Play'}>
      {app.playing ? '❚❚' : '▶'}
    </button>
    <select class="dl-input" value={speedIndex} onchange={(e) => setSpeed(+(e.target as HTMLSelectElement).value)} aria-label="Speed">
      {#each SPEEDS as s, i (s.value)}
        <option value={i}>{s.label}</option>
      {/each}
    </select>
    <button type="button" class="dl-btn" class:dl-btn--active={app.live} onclick={() => app.goLive()} title="Jump to the current time">Now</button>
    {#if compact}
      <span class="dl-time__readout">{formatDate(app.date, 'short')} · {formatClock(app.time, app.scale, settings.hourCycle)}</span>
    {/if}
  </div>
</div>

<style>
  .dl-time {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--dl-fg, #111);
  }
  .dl-time__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .dl-time__zone,
  .dl-time__readout {
    font-size: 0.85em;
    color: var(--dl-muted, #667);
    font-variant-numeric: tabular-nums;
  }
  .dl-time__slider {
    width: 100%;
    accent-color: var(--dl-accent, #3d8bfd);
  }
  :global(.dl-btn) {
    min-width: 38px;
    height: 38px;
    padding: 0 12px;
    border: 1px solid var(--dl-border, #d0d5dd);
    border-radius: var(--dl-radius, 10px);
    background: var(--dl-surface, #fff);
    color: var(--dl-fg, #111);
    font: inherit;
    cursor: pointer;
  }
  :global(.dl-btn:hover) {
    border-color: var(--dl-accent, #3d8bfd);
  }
  :global(.dl-btn--icon) {
    padding: 0;
    width: 38px;
  }
  :global(.dl-btn--primary) {
    background: var(--dl-accent, #3d8bfd);
    border-color: var(--dl-accent, #3d8bfd);
    color: var(--dl-on-accent, #fff);
  }
  :global(.dl-btn--active),
  :global(.dl-btn[aria-pressed='true']) {
    background: color-mix(in srgb, var(--dl-accent, #3d8bfd) 18%, var(--dl-surface, #fff));
    border-color: var(--dl-accent, #3d8bfd);
  }
  :global(.dl-input) {
    height: 38px;
    padding: 0 8px;
    border: 1px solid var(--dl-border, #d0d5dd);
    border-radius: var(--dl-radius, 10px);
    background: var(--dl-surface, #fff);
    color: var(--dl-fg, #111);
    font: inherit;
    color-scheme: var(--dl-color-scheme, light);
  }
</style>
