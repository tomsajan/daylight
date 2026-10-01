<!-- Bottom status line: simulation state, simulated time in local and UTC, rate, clock, place count. -->
<script lang="ts">
  import { app, MAX_PLACES, SPEEDS } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { formatClock, formatDate, formatOffset } from '$core/time/format';
  import { makeTimeScale, TIME_SCALE_LABELS } from '$core/time/timescale';
  import { simState, speedIndex, zoneAbbr } from './lib';
  import { ui } from './ui.svelte';

  const UTC = makeTimeScale('utc', { lon: 0, tz: 'UTC' });
  const sim = $derived(simState());
  const LABEL = { live: 'Live', run: 'Simulating', hold: 'Paused' } as const;
  const offset = $derived(formatOffset(app.time, app.scale));
  const zone = $derived(settings.timeScale === 'local' && app.selected ? zoneAbbr(app.time, app.selected.tz) : TIME_SCALE_LABELS[settings.timeScale]);
</script>

<footer class="status num">
  <span class="cell state" data-state={sim}><i class="led"></i>{LABEL[sim]}</span>
  <span class="cell">
    <b class="lbl">Time</b>{formatDate(app.date, 'long')}
    <strong>{formatClock(app.time, app.scale, settings.hourCycle, true)}</strong>
    <span class="muted">{zone === offset ? offset : `${zone} ${offset}`}</span>
  </span>
  <span class="cell"><b class="lbl">UTC</b>{formatClock(app.time, UTC, '24', true)}</span>
  <span class="cell"><b class="lbl">Rate</b>{app.speed < 0 ? '−' : '+'}{SPEEDS[speedIndex()].label}</span>
  <span class="cell hide-md"><b class="lbl">Clock</b>{TIME_SCALE_LABELS[settings.timeScale]}</span>
  <span class="cell hide-md"><b class="lbl">Places</b>{app.places.length}/{MAX_PLACES}</span>
  <button type="button" class="keys" onclick={() => (ui.helpOpen = !ui.helpOpen)} aria-expanded={ui.helpOpen}>
    <kbd>?</kbd> Shortcuts
  </button>
</footer>

<style>
  .status {
    display: flex;
    align-items: stretch;
    height: 26px;
    background: var(--panel-2);
    border-top: 1px solid var(--rule);
    font-size: 11px;
    font-weight: 500;
    color: var(--ink-2);
    overflow: hidden;
    white-space: nowrap;
  }
  .cell {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border-right: 1px solid var(--rule);
  }
  .cell .lbl {
    font-size: 9.5px;
  }
  strong {
    font-weight: 600;
    color: var(--ink);
  }
  .muted {
    color: var(--muted);
  }
  .state {
    min-width: 108px;
    font: 600 10px var(--sans);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .led {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--faint);
  }
  .state[data-state='live'] {
    color: var(--led-live);
  }
  .state[data-state='live'] .led {
    background: var(--led-live);
    box-shadow: 0 0 6px var(--led-live);
  }
  .state[data-state='run'] {
    color: var(--led-run);
  }
  .state[data-state='run'] .led {
    background: var(--led-run);
  }
  .state[data-state='hold'] {
    color: var(--led-hold);
  }
  .state[data-state='hold'] .led {
    background: var(--led-hold);
  }
  .keys {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: 0;
    border-left: 1px solid var(--rule);
    background: none;
    font: 500 11px var(--sans);
    color: var(--muted);
    cursor: pointer;
  }
  .keys:hover {
    color: var(--accent);
  }
  kbd {
    font: 600 10px var(--mono);
    padding: 0 4px;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
  }
  @media (max-width: 1180px) {
    .hide-md {
      display: none;
    }
  }
</style>
