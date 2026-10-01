<!--
  Sticky time bar. Desktop: one row with date, time, time-of-day slider and the
  simulation controls. Phone: play, speed, Now and a date/time readout that
  opens a drawer with the date and time pickers, slider and direction.
-->
<script lang="ts">
  import { app, SPEEDS } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { addDays, dateKey, minutesOfDay } from '$core/time/timescale';
  import { formatClock, formatOffset } from '$core/time/format';
  import { TIME_SCALE_LABELS } from '$core/time/timescale';
  import { shortDate, zoneName } from '../almanac.svelte';

  let open = $state(false);

  const minutes = $derived(minutesOfDay(app.time, app.date, app.scale));
  const speedIndex = $derived(Math.max(0, SPEEDS.findIndex((s) => s.value === Math.abs(app.speed))));
  const reverse = $derived(app.speed < 0);
  const clock = $derived(formatClock(app.time, app.scale, settings.hourCycle));
  const zone = $derived(
    settings.timeScale === 'local' && app.selected ? zoneName(app.time, app.selected.tz) : settings.timeScale === 'utc' ? 'UTC' : formatOffset(app.time, app.scale),
  );
  const timeValue = $derived(`${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`);
  const status = $derived(app.live ? 'Live' : app.playing ? `Running ${reverse ? 'backwards' : 'forwards'}, ${SPEEDS[speedIndex].label}` : 'Paused');

  function onDate(e: Event) {
    const m = (e.target as HTMLInputElement).value.match(/^(\d{4,})-(\d{2})-(\d{2})$/);
    if (m) app.setDate({ year: +m[1], month: +m[2], day: +m[3] });
  }

  function onTime(e: Event) {
    const m = (e.target as HTMLInputElement).value.match(/^(\d{2}):(\d{2})/);
    if (m) app.setMinutesOfDay(+m[1] * 60 + +m[2]);
  }

  function setSpeed(i: number) {
    app.setSpeed(SPEEDS[i].value * (reverse ? -1 : 1));
    if (!app.playing) app.play();
  }
</script>

{#snippet direction(where: string)}
  <button
    type="button"
    class="dir {where}"
    onclick={() => app.setSpeed(-app.speed)}
    aria-pressed={reverse}
    aria-label="Run time backwards"
    title={reverse ? 'Time runs backwards; press to run forwards again' : 'Run time backwards'}
  >
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14 8H4M7.5 4.5 4 8l3.5 3.5" /></svg>
    <span class="dir-label">Reverse</span>
  </button>
{/snippet}

<div class="timebar" class:open>
  <div class="row">
    <span class="place" aria-hidden="true">{app.selected?.name ?? ''}</span>

    <div class="sim" role="group" aria-label="Time simulation">
      <button type="button" class="play" onclick={() => app.toggle()} aria-label={app.playing ? 'Pause' : 'Play'} title={app.playing ? 'Pause' : 'Play'}>
        {#if app.playing}
          <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" /><rect x="9.5" y="2.5" width="3" height="11" /></svg>
        {:else}
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" /></svg>
        {/if}
      </button>
      <label class="speed">
        <span class="sr">Speed</span>
        <select value={speedIndex} onchange={(e) => setSpeed(+(e.target as HTMLSelectElement).value)}>
          {#each SPEEDS as s, i (s.value)}
            <option value={i}>{s.label}</option>
          {/each}
        </select>
      </label>
      {@render direction("in-sim")}
      <button type="button" class="now" class:live={app.live} onclick={() => app.goLive()} title="Jump to the current time and follow the clock">
        <span class="dot" aria-hidden="true"></span>Now
      </button>
    </div>

    <button type="button" class="readout" onclick={() => (open = !open)} aria-expanded={open} aria-controls="alm-time-detail">
      <span class="r-date">{shortDate(app.date)}</span>
      <span class="r-time">{clock}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      <span class="sr">{open ? 'Hide' : 'Show'} date and time controls</span>
    </button>

    <div class="detail" id="alm-time-detail">
      <div class="date" role="group" aria-label="Date">
        <button type="button" class="step" onclick={() => app.setDate(addDays(app.date, -1))} aria-label="Previous day" title="Previous day">‹</button>
        <input type="date" value={dateKey(app.date)} onchange={onDate} aria-label="Date" />
        <button type="button" class="step" onclick={() => app.setDate(addDays(app.date, 1))} aria-label="Next day" title="Next day">›</button>
      </div>
      <div class="time">
        <input type="time" value={timeValue} onchange={onTime} aria-label="Time of day" />
        <span class="zone" title={settings.timeScale === 'local' ? app.selected?.tz : TIME_SCALE_LABELS[settings.timeScale]}>{zone}</span>
      </div>
      {@render direction("in-detail")}
      <input
        class="slider"
        type="range"
        min="0"
        max="1439"
        step="1"
        value={Math.floor(minutes)}
        oninput={(e) => app.setMinutesOfDay(+(e.target as HTMLInputElement).value)}
        aria-label="Time of day slider"
        aria-valuetext={clock}
      />
    </div>
  </div>
  <p class="sr" aria-live="polite">{status}</p>
</div>

<style>
  .timebar {
    position: sticky;
    top: 0;
    z-index: 40;
    background: color-mix(in srgb, var(--paper) 94%, transparent);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border-top: 1px solid var(--ink);
    border-bottom: 1px solid var(--rule-strong);
    padding-top: env(safe-area-inset-top);
    font-family: var(--sans);
    font-size: 0.875rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 18px;
    max-width: var(--page);
    margin: 0 auto;
    padding: 8px var(--gutter);
    box-sizing: border-box;
  }
  .place {
    font: 500 1.05rem/1 var(--serif);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 14ch;
  }
  .sim {
    display: flex;
    align-items: center;
    gap: 6px;
    order: 3;
  }
  .detail {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 1;
    min-width: 0;
    order: 2;
  }
  .date,
  .time {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .time {
    gap: 6px;
  }
  button,
  select,
  input[type='date'],
  input[type='time'] {
    font: inherit;
    color: var(--ink);
  }
  button {
    cursor: pointer;
  }
  .play {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 0;
    background: var(--ink);
    color: var(--paper);
  }
  .play svg {
    width: 15px;
    height: 15px;
    fill: currentColor;
  }
  .play:hover {
    background: var(--accent);
  }
  select,
  input[type='date'],
  input[type='time'] {
    height: 36px;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    background: var(--sheet);
    padding: 0 8px;
    color-scheme: var(--scheme);
    font-variant-numeric: tabular-nums;
  }
  select {
    padding-right: 4px;
  }
  .step {
    width: 32px;
    height: 36px;
    border: 0;
    background: none;
    font: 400 1.5rem/1 var(--serif);
  }
  .step:hover,
  .dir:hover,
  .now:hover {
    color: var(--accent);
  }
  .dir,
  .now {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    background: transparent;
  }
  .dir svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
  }
  .dir[aria-pressed='true'] {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
  }
  .now {
    font-weight: 600;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    box-sizing: border-box;
  }
  .now.live .dot {
    background: var(--now);
    border-color: var(--now);
  }
  .zone {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .slider {
    flex: 1;
    min-width: 80px;
    accent-color: var(--ink);
  }
  .readout,
  .dir.in-detail {
    display: none;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    margin: 0;
  }

  @media (max-width: 1099px) {
    .place,
    .in-sim .dir-label {
      display: none;
    }
    .in-sim {
      width: 36px;
      padding: 0;
      justify-content: center;
    }
  }

  /* Phones and narrow tablets: compact bar plus a drawer. */
  @media (max-width: 899px) {
    .row {
      flex-wrap: wrap;
      gap: 8px;
      padding-top: 6px;
      padding-bottom: 6px;
    }
    .sim {
      order: 1;
      gap: 6px;
    }
    .dir.in-sim {
      display: none;
    }
    .readout {
      order: 2;
      margin-left: auto;
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      height: 40px;
      align-items: center;
      padding: 0 4px 0 8px;
      border: 0;
      background: none;
      font-variant-numeric: tabular-nums;
    }
    .r-date {
      font: 500 1rem/1 var(--serif);
    }
    .r-time {
      font-weight: 600;
    }
    .readout svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      transition: transform 0.2s;
    }
    .open .readout svg {
      transform: rotate(180deg);
    }
    .detail {
      order: 3;
      flex-basis: 100%;
      display: none;
      flex-wrap: wrap;
      gap: 10px 14px;
      padding: 6px 0 4px;
      border-top: 1px solid var(--rule);
    }
    .open .detail {
      display: flex;
    }
    .date input,
    .time input {
      height: 40px;
    }
    .dir.in-detail {
      display: inline-flex;
      height: 40px;
    }
    .slider {
      flex-basis: 100%;
      height: 32px;
    }
  }
</style>
