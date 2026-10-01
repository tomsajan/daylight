<!-- Phone sheet with every date, time and speed control that doesn't fit the compact strip. -->
<script lang="ts">
  import { app, SPEEDS } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { currentMinutes } from '$core/state/views';
  import { formatClock, formatDate, formatOffset } from '$core/time/format';
  import { dateKey } from '$core/time/timescale';
  import Icon from './Icon.svelte';
  import Scrubber from './Scrubber.svelte';
  import { ICON } from './icons';
  import { setSpeedIndex, speedIndex, stepDays, stepMinutes, stepMonths } from './lib';
  import { ui } from './ui.svelte';

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
</script>

<div class="backdrop" role="presentation" onclick={() => (ui.timeSheetOpen = false)}></div>
<div class="sheet" role="dialog" aria-label="Date, time and speed" aria-modal="true">
  <header>
    <h2 class="lbl">Date &amp; time</h2>
    <span class="now num">{formatDate(app.date, 'medium')} {formatClock(app.time, app.scale, settings.hourCycle, true)} {formatOffset(app.time, app.scale)}</span>
    <button type="button" class="btn" onclick={() => (ui.timeSheetOpen = false)}><Icon d={ICON.close} /> Done</button>
  </header>

  <div class="body">
    <div class="pair">
      <label>
        <span class="lbl">Date</span>
        <input class="field" type="date" value={dateKey(app.date)} onchange={onDate} />
      </label>
      <label>
        <span class="lbl">Time</span>
        <input class="field" type="time" value={timeValue} onchange={onTime} />
      </label>
    </div>

    <div class="steps">
      <button type="button" class="btn num" onclick={() => stepMonths(-1)}>−1M</button>
      <button type="button" class="btn num" onclick={() => stepDays(-7)}>−1W</button>
      <button type="button" class="btn num" onclick={() => stepDays(-1)}>−1D</button>
      <button type="button" class="btn num" onclick={() => stepDays(1)}>+1D</button>
      <button type="button" class="btn num" onclick={() => stepDays(7)}>+1W</button>
      <button type="button" class="btn num" onclick={() => stepMonths(1)}>+1M</button>
      <button type="button" class="btn num" onclick={() => stepMinutes(-60)}>−1h</button>
      <button type="button" class="btn num" onclick={() => stepMinutes(-15)}>−15m</button>
      <button type="button" class="btn num" onclick={() => stepMinutes(15)}>+15m</button>
      <button type="button" class="btn num" onclick={() => stepMinutes(60)}>+1h</button>
    </div>

    <div class="scrub"><Scrubber /></div>

    <div class="row">
      <span class="lbl">Speed</span>
      <div class="seg dirseg" role="radiogroup" aria-label="Direction">
        <button type="button" class="btn" role="radio" aria-checked={app.speed < 0} class:on={app.speed < 0} onclick={() => app.speed > 0 && app.setSpeed(-app.speed)}>
          <Icon d={ICON.backward} /> Back
        </button>
        <button type="button" class="btn" role="radio" aria-checked={app.speed > 0} class:on={app.speed > 0} onclick={() => app.speed < 0 && app.setSpeed(-app.speed)}>
          Fwd <Icon d={ICON.forward} />
        </button>
      </div>
    </div>
    <div class="speeds" role="radiogroup" aria-label="Simulation speed">
      {#each SPEEDS as s, i (s.value)}
        <button type="button" class="btn num" role="radio" aria-checked={i === speedIndex()} class:on={i === speedIndex()} onclick={() => setSpeedIndex(i)}>{s.label}</button>
      {/each}
    </div>
    <div class="row actions">
      <button type="button" class="btn grow" class:primary={!app.playing} onclick={() => app.toggle()}>
        <Icon d={app.playing ? ICON.pause : ICON.play} />{app.playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" class="btn grow" class:on={app.live} onclick={() => app.goLive()}>Now (real time)</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgb(0 0 0 / 0.4);
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 101;
    max-height: 88dvh;
    overflow-y: auto;
    background: var(--panel);
    border-top: 1px solid var(--rule-strong);
    box-shadow: 0 -16px 40px rgb(0 0 0 / 0.3);
    padding-bottom: calc(14px + env(safe-area-inset-bottom));
    animation: up 0.18s ease-out;
  }
  @keyframes up {
    from {
      transform: translateY(30px);
      opacity: 0;
    }
  }
  header {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 0 8px 0 14px;
    border-bottom: 1px solid var(--rule);
    background: var(--panel-2);
  }
  h2 {
    margin: 0;
  }
  .now {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 14px 0;
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field {
    height: 42px;
    width: 100%;
    font-size: 15px;
  }
  .steps {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
  }
  .steps .btn:nth-child(n + 7) {
    grid-column: span 1;
  }
  .steps .btn:nth-child(7) {
    grid-column: 2;
  }
  .btn {
    height: 40px;
  }
  .btn.num {
    font: 500 12px var(--mono);
    letter-spacing: 0;
    text-transform: none;
  }
  .scrub {
    padding: 0 7px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .speeds {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }
  .actions {
    padding-top: 4px;
  }
  .grow {
    flex: 1;
  }
</style>
