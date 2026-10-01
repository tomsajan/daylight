<!--
  Sticky time bar, in two labelled parts.
  - When: the date and time pickers over a "Time of day" slider whose track
    shows the selected day's light (night, twilights, daylight).
  - Speed: the core SpeedControl (− / play-pause / + side by side, readout,
    "Now") over its continuous "Speed" slider.
  Desktop: both parts side by side. Phone: one slim row with − / play / +,
  "Now" and a date/time readout that opens a drawer with the pickers and both
  sliders. The drawer has its own SpeedControl showing just the readout and
  the slider; CSS shows whichever copy fits the width.
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { visibleLevel } from '$core/charts/palette';
  import { selectedDayIndex } from '$core/state/views';
  import { addDays, dateKey, minutesOfDay } from '$core/time/timescale';
  import { formatClock, formatOffset, formatSpeed } from '$core/time/format';
  import { TIME_SCALE_LABELS } from '$core/time/timescale';
  import SpeedControl from '$core/components/SpeedControl.svelte';
  import { almanacPalette, shortDate, zoneName } from '../almanac.svelte';

  let open = $state(false);

  const minutes = $derived(minutesOfDay(app.time, app.date, app.scale));
  const clock = $derived(formatClock(app.time, app.scale, settings.hourCycle));
  const zone = $derived(
    settings.timeScale === 'local' && app.selected ? zoneName(app.time, app.selected.tz) : settings.timeScale === 'utc' ? 'UTC' : formatOffset(app.time, app.scale),
  );
  const timeValue = $derived(`${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`);
  const speedText = $derived(
    app.live ? 'Live' : !app.playing ? 'Paused' : `${app.speed > 0 ? '▶' : '◀'} ${formatSpeed(Math.abs(app.speed))}${app.speed < 0 ? ' back' : ''}`,
  );

  // The time-of-day track is painted with the selected day's light, in the chart colours.
  const dayTrack = $derived.by(() => {
    if (!app.selected) return 'var(--rule)';
    const palette = almanacPalette();
    // The cached year, so this costs nothing while the simulation runs.
    const day = app.yearFor(app.selected)[selectedDayIndex()];
    const stops = (day?.segments ?? []).map((s) => {
      const c = palette.light[visibleLevel(s.light, settings.twilight)];
      return `${c} ${((s.startMin / 1440) * 100).toFixed(2)}% ${((s.endMin / 1440) * 100).toFixed(2)}%`;
    });
    return stops.length ? `linear-gradient(to right, ${stops.join(', ')})` : 'var(--rule)';
  });

  function onDate(e: Event) {
    const m = (e.target as HTMLInputElement).value.match(/^(\d{4,})-(\d{2})-(\d{2})$/);
    if (m) app.setDate({ year: +m[1], month: +m[2], day: +m[3] });
  }

  function onTime(e: Event) {
    const m = (e.target as HTMLInputElement).value.match(/^(\d{2}):(\d{2})/);
    if (m) app.setMinutesOfDay(+m[1] * 60 + +m[2]);
  }
</script>

<div class="timebar" class:open>
  <div class="row">
    <span class="place" aria-hidden="true">{app.selected?.name ?? ''}</span>

    <button type="button" class="readout" onclick={() => (open = !open)} aria-expanded={open} aria-controls="alm-time-detail">
      <span class="r-lines">
        <span class="r-main"><span class="r-date">{shortDate(app.date)}</span> <span class="r-time">{clock}</span></span>
        <span class="r-speed" class:live={app.live}>{speedText}</span>
      </span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      <span class="sr">{open ? 'Hide' : 'Show'} date, time and speed controls</span>
    </button>

    <div class="when" id="alm-time-detail">
      <div class="pickers">
        <div class="date" role="group" aria-label="Date">
          <button type="button" class="step" onclick={() => app.setDate(addDays(app.date, -1))} aria-label="Previous day" title="Previous day">‹</button>
          <input type="date" value={dateKey(app.date)} onchange={onDate} aria-label="Date" />
          <button type="button" class="step" onclick={() => app.setDate(addDays(app.date, 1))} aria-label="Next day" title="Next day">›</button>
        </div>
        <div class="time">
          <input type="time" value={timeValue} onchange={onTime} aria-label="Time of day" />
          <span class="zone" title={settings.timeScale === 'local' ? app.selected?.tz : TIME_SCALE_LABELS[settings.timeScale]}>{zone}</span>
        </div>
      </div>
      <div class="slide">
        <span class="tag" aria-hidden="true">Time of day</span>
        <div class="tod" style="--day: {dayTrack}">
          <input
            type="range"
            min="0"
            max="1439"
            step="1"
            value={Math.floor(minutes)}
            oninput={(e) => app.setMinutesOfDay(+(e.target as HTMLInputElement).value)}
            aria-label="Time of day"
            aria-valuetext={clock}
          />
        </div>
      </div>
      <div class="speed drawer-speed">
        <span class="tag" aria-hidden="true">Speed</span>
        <SpeedControl />
      </div>
    </div>

    <div class="speed bar-speed">
      <span class="tag" aria-hidden="true">Speed</span>
      <SpeedControl>
        <button
          type="button"
          class="now"
          class:live={app.live}
          aria-pressed={app.live}
          onclick={() => app.goLive()}
          title="Jump to the current time and follow the clock"
        >
          <span class="dot" aria-hidden="true"></span>Now
        </button>
      </SpeedControl>
    </div>
  </div>
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
    gap: 28px;
    max-width: var(--page);
    margin: 0 auto;
    padding: 8px var(--gutter) 6px;
    box-sizing: border-box;
  }
  .place {
    font: 500 1.05rem/1 var(--serif);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 14ch;
  }
  button,
  input[type='date'],
  input[type='time'] {
    font: inherit;
    color: var(--ink);
  }
  button {
    cursor: pointer;
  }

  /* --- When: pickers over the time-of-day slider ---------------------------------- */
  .when {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .pickers {
    display: flex;
    align-items: center;
    /* Same height as the speed buttons, so the two sliders line up. */
    min-height: 40px;
    flex-wrap: wrap;
    gap: 4px 14px;
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
  .step {
    width: 32px;
    height: 36px;
    border: 0;
    background: none;
    font: 400 1.5rem/1 var(--serif);
  }
  .step:hover,
  .now:hover {
    color: var(--accent);
  }
  .zone {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* Small-caps labels that tell the two sliders apart. */
  .tag {
    font: 600 0.68rem/1 var(--sans);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
  .slide {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* Time-of-day slider: a strip of the day's light with a red needle for the time. */
  .tod {
    --thumb: 8px;
    position: relative;
    flex: 1;
    min-width: 120px;
    display: flex;
    align-items: center;
  }
  .tod::before {
    content: '';
    position: absolute;
    left: calc(var(--thumb) / 2);
    right: calc(var(--thumb) / 2);
    height: 10px;
    box-sizing: border-box;
    border: 1px solid var(--rule-strong);
    background: var(--day);
  }
  .tod input {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 30px;
    margin: 0;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }
  .tod input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: var(--thumb);
    height: 24px;
    border-radius: 1px;
    background: var(--now);
    border: 2px solid var(--paper);
    box-shadow: 0 0 0 1px var(--now);
    box-sizing: border-box;
  }
  .tod input::-moz-range-thumb {
    width: var(--thumb);
    height: 24px;
    border-radius: 1px;
    background: var(--now);
    border: 2px solid var(--paper);
    box-shadow: 0 0 0 1px var(--now);
    box-sizing: border-box;
  }
  .tod input::-moz-range-track {
    background: transparent;
  }

  /* --- Speed: the core control in Almanac type ------------------------------------- */
  .speed {
    --dl-fg: var(--ink);
    --dl-muted: var(--muted);
    --dl-border: var(--rule-strong);
    --dl-surface: var(--sheet);
    --dl-accent: var(--accent);
    --dl-on-accent: var(--paper);
    --dl-radius: 2px;
    --tag-w: 3.8rem;
    position: relative;
    min-width: 0;
  }
  .bar-speed {
    flex: 0 1 400px;
  }
  /* Desktop: the "Speed" label sits to the left of the slider, like "Time of day". */
  .bar-speed > .tag {
    position: absolute;
    left: 0;
    bottom: 15px;
    transform: translateY(50%);
  }
  .bar-speed :global(.dl-speed__track) {
    margin-left: var(--tag-w);
  }
  .speed :global(.dl-speed__row) {
    gap: 6px 10px;
  }
  .speed :global(.dl-speed__buttons) {
    align-items: center;
    gap: 4px;
  }
  .speed :global(.dl-btn) {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    background: transparent;
    color: var(--ink);
    font: 500 1.15rem/1 var(--sans);
    font-variant-emoji: text;
  }
  .speed :global(.dl-btn:hover:not(:disabled)) {
    border-color: var(--ink);
    color: var(--accent);
  }
  .speed :global(.dl-btn:disabled) {
    opacity: 0.35;
  }
  .speed :global(.dl-btn--primary) {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
    font-size: 0.8rem;
  }
  .speed :global(.dl-btn--primary:hover:not(:disabled)) {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--paper);
  }
  .speed :global(.dl-speed__label) {
    min-width: 8em;
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--muted);
    font-variant-emoji: text;
  }
  .now {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    background: transparent;
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

  .readout,
  .drawer-speed {
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
    .place {
      display: none;
    }
    .row {
      gap: 22px;
    }
  }

  /* Phones and narrow tablets: a slim row plus a drawer. */
  @media (max-width: 899px) {
    .row {
      flex-wrap: wrap;
      gap: 6px;
      padding-top: 6px;
      padding-bottom: 6px;
    }
    .bar-speed {
      order: 1;
      flex: 0 1 auto;
    }
    .bar-speed > .tag,
    .bar-speed :global(.dl-speed__label),
    .bar-speed :global(.dl-speed__track) {
      display: none;
    }
    .readout {
      order: 2;
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      height: 42px;
      padding: 0 2px 0 6px;
      border: 0;
      background: none;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .r-lines {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 3px;
      min-width: 0;
    }
    .r-main {
      white-space: nowrap;
    }
    .r-date {
      font: 500 1rem/1 var(--serif);
    }
    .r-time {
      font-weight: 600;
    }
    .r-speed {
      font-size: 0.72rem;
      line-height: 1;
      color: var(--muted);
      white-space: nowrap;
      font-variant-emoji: text;
    }
    .r-speed.live {
      color: var(--now);
      font-weight: 600;
    }
    .readout svg {
      flex: none;
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

    .when {
      order: 3;
      flex-basis: 100%;
      display: none;
      gap: 12px;
      padding: 10px 0 6px;
      border-top: 1px solid var(--rule);
    }
    .open .when {
      display: flex;
    }
    .pickers {
      gap: 10px 14px;
    }
    .date input,
    .time input {
      height: 40px;
    }
    /* In the drawer each slider gets its label on a line above it. */
    .slide {
      flex-direction: column;
      align-items: stretch;
      gap: 2px;
    }
    .tod {
      --thumb: 10px;
    }
    .tod input {
      height: 36px;
    }
    .drawer-speed {
      display: block;
    }
    .drawer-speed > .tag {
      position: absolute;
      left: 0;
      top: 0.5em;
    }
    .drawer-speed :global(.dl-speed__buttons) {
      display: none;
    }
    .drawer-speed :global(.dl-speed__row) {
      padding-left: var(--tag-w);
      min-height: 1.6em;
    }
    .drawer-speed :global(.dl-speed__label) {
      text-align: left;
    }
    .drawer-speed :global(.dl-speed__track input) {
      height: 36px;
    }
  }
</style>
