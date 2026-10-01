<!--
  Simulation and date/time controls.
  Full: one dense row (wraps on narrower screens).
  Compact (phones): scrubber + day stepping + play/reverse/now; the date/time
  readout opens a sheet with everything else.
-->
<script lang="ts">
  import { app, SPEEDS } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { currentMinutes } from '$core/state/views';
  import { dateKey } from '$core/time/timescale';
  import { formatClock, formatDate } from '$core/time/format';
  import Scrubber from './Scrubber.svelte';
  import Icon from './Icon.svelte';
  import { ICON } from './icons';
  import { setSpeedIndex, simState, speedIndex, SPEED_SHORT, stepDays, stepMonths } from './lib';
  import { ui } from './ui.svelte';

  let { compact = false }: { compact?: boolean } = $props();

  const reverse = $derived(app.speed < 0);
  const sim = $derived(simState());
  const minutes = $derived(currentMinutes());
  const timeValue = $derived(
    `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`,
  );

  function onDate(e: Event) {
    const m = (e.target as HTMLInputElement).value.match(/^(\d{4,})-(\d{2})-(\d{2})$/);
    if (m) app.setDate({ year: +m[1], month: +m[2], day: +m[3] });
  }
  function onTime(e: Event) {
    const m = (e.target as HTMLInputElement).value.match(/^(\d{2}):(\d{2})/);
    if (m) app.setMinutesOfDay(+m[1] * 60 + +m[2]);
  }

  const STEPS: { label: string; title: string; run: () => void }[] = [
    { label: '−1M', title: 'Back one month', run: () => stepMonths(-1) },
    { label: '−1W', title: 'Back one week', run: () => stepDays(-7) },
    { label: '−1D', title: 'Back one day', run: () => stepDays(-1) },
  ];
  const STEPS_FWD: { label: string; title: string; run: () => void }[] = [
    { label: '+1D', title: 'Forward one day', run: () => stepDays(1) },
    { label: '+1W', title: 'Forward one week', run: () => stepDays(7) },
    { label: '+1M', title: 'Forward one month', run: () => stepMonths(1) },
  ];
</script>

{#snippet playButtons()}
  <button
    type="button"
    class="btn dir"
    aria-pressed={reverse}
    onclick={() => app.setSpeed(-app.speed)}
    title={reverse ? 'Running backwards. Click to run forwards (R)' : 'Running forwards. Click to run backwards (R)'}
    aria-label="Run backwards"
  >
    <Icon d={reverse ? ICON.backward : ICON.forward} />
  </button>
  <button
    type="button"
    class="btn play"
    class:playing={app.playing}
    onclick={() => app.toggle()}
    aria-label={app.playing ? 'Pause' : 'Play'}
    title={app.playing ? 'Pause (Space)' : 'Play (Space)'}
  >
    <Icon d={app.playing ? ICON.pause : ICON.play} />
    {#if !compact}<span>{app.playing ? 'Pause' : 'Play'}</span>{/if}
  </button>
{/snippet}

{#snippet nowButton()}
  <button type="button" class="btn now" class:on={app.live} onclick={() => app.goLive()} title="Jump to the real current time (N)">
    <span class="led" data-state={app.live ? 'live' : 'off'}></span>Now
  </button>
{/snippet}

{#if compact}
  <div class="strip compact">
    <Scrubber labels={false} />
    <div class="row">
      <button type="button" class="btn step" onclick={() => stepDays(-1)} aria-label="Previous day">−1D</button>
      <button type="button" class="readout" onclick={() => (ui.timeSheetOpen = true)} aria-label="Change date, time and speed">
        <span class="num big">{formatDate(app.date, 'short')} {formatClock(app.time, app.scale, settings.hourCycle)}</span>
        <span class="num small">
          <span class="led" data-state={sim}></span>{sim === 'live' ? 'LIVE' : sim === 'hold' ? 'PAUSED' : `${reverse ? '−' : '+'}${SPEEDS[speedIndex()].label}`}
          <span class="edit">Edit</span>
        </span>
      </button>
      <button type="button" class="btn step" onclick={() => stepDays(1)} aria-label="Next day">+1D</button>
      {@render playButtons()}
      {@render nowButton()}
    </div>
  </div>
{:else}
  <div class="strip full">
    <div class="group">
      <span class="lbl">Sim</span>
      {@render playButtons()}
      <div class="seg" role="radiogroup" aria-label="Simulation speed">
        {#each SPEEDS as s, i (s.value)}
          <button
            type="button"
            class="btn sp num"
            role="radio"
            aria-checked={i === speedIndex()}
            class:on={i === speedIndex()}
            onclick={() => setSpeedIndex(i)}
            title="{s.label} of simulated time per second">{SPEED_SHORT[i]}</button
          >
        {/each}
      </div>
      {@render nowButton()}
    </div>

    <div class="group">
      <span class="lbl">Date</span>
      <div class="seg">
        {#each STEPS as s (s.label)}<button type="button" class="btn num" title={s.title} onclick={s.run}>{s.label}</button>{/each}
      </div>
      <input class="field" type="date" value={dateKey(app.date)} onchange={onDate} aria-label="Date" />
      <div class="seg">
        {#each STEPS_FWD as s (s.label)}<button type="button" class="btn num" title={s.title} onclick={s.run}>{s.label}</button>{/each}
      </div>
    </div>

    <div class="group grow">
      <span class="lbl">Time</span>
      <input class="field" type="time" value={timeValue} onchange={onTime} aria-label="Time of day" />
      <div class="scrubber"><Scrubber /></div>
    </div>
  </div>
{/if}

<style>
  .strip {
    background: var(--panel);
    border-top: 1px solid var(--rule);
  }
  .full {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
    padding: 6px 10px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .group > .lbl {
    margin-right: 3px;
  }
  .grow {
    flex: 1 1 260px;
    min-width: 0;
  }
  .scrubber {
    flex: 1;
    min-width: 0;
    padding: 0 7px;
  }
  .sp {
    min-width: 0;
    padding: 0 6px;
    font: 500 11px var(--mono);
    letter-spacing: 0;
    text-transform: none;
  }
  .seg .btn.num {
    font: 500 11px var(--mono);
    letter-spacing: 0;
    padding: 0 6px;
  }
  .play {
    min-width: 76px;
  }
  .play.playing {
    color: var(--ink);
  }
  .play:not(.playing) {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  .now {
    gap: 6px;
  }
  .led {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
    background: var(--faint);
  }
  .led[data-state='live'] {
    background: var(--led-live);
    box-shadow: 0 0 6px var(--led-live);
  }
  .led[data-state='run'] {
    background: var(--led-run);
  }
  .led[data-state='hold'] {
    background: var(--led-hold);
  }

  /* --- Compact ---------------------------------------------------------- */
  .compact {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 10px 6px;
  }
  .compact .row {
    display: flex;
    align-items: stretch;
    gap: 4px;
  }
  .compact .btn {
    height: 42px;
    min-width: 42px;
  }
  .compact .play {
    min-width: 46px;
  }
  .compact .step {
    padding: 0 5px;
    font: 500 11px var(--mono);
    letter-spacing: 0;
  }
  .compact .now {
    padding: 0 7px;
  }
  .readout {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    gap: 2px;
    padding: 0 8px;
    border: 1px solid var(--rule-strong);
    border-radius: var(--r);
    background: var(--panel-2);
    cursor: pointer;
    text-align: left;
    overflow: hidden;
  }
  .big {
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
  }
  .small {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    font-size: 10px;
    color: var(--muted);
    white-space: nowrap;
  }
  .edit {
    margin-left: auto;
    font: 600 9.5px var(--sans);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }
</style>
