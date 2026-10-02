<!--
  The eclipse from first to last contact anywhere on Earth: a slider for the
  time with the place's own contacts marked, and play controls.
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { formatSpeed } from '$core/time/format';

  interface Mark {
    time: number;
    label: string;
    short: string;
  }

  interface Props {
    start: number;
    end: number;
    marks: Mark[];
  }
  let { start, end, marks }: Props = $props();

  const SPEED_CHOICES = [1, 10, 60, 300, 600, 1800];

  const pos = (t: number) => `${(((t - start) / (end - start)) * 100).toFixed(3)}%`;
  const inside = $derived(app.time >= start && app.time <= end);

  function toggle() {
    if (!app.playing && (app.time < start || app.time >= end)) app.setTime(start);
    if (!app.playing && app.speed === 1) app.setSpeed(60);
    app.toggle();
  }
</script>

<div class="timeline">
  <div class="track">
    <input
      type="range"
      min={start}
      max={end}
      step="1000"
      value={Math.min(end, Math.max(start, app.time))}
      class:outside={!inside}
      oninput={(ev) => app.setTime(Number(ev.currentTarget.value))}
      onpointerdown={() => app.beginScrub()}
      onpointerup={() => app.endScrub()}
      aria-label="Time during the eclipse"
    />
    {#each marks as m (m.short)}
      <button class="mark" style:left={pos(m.time)} title={m.label} onclick={() => app.setTime(m.time)}>{m.short}</button>
    {/each}
  </div>
  <div class="controls">
    <button class="dl-btn" onclick={toggle}>{app.playing ? 'Pause' : 'Play'}</button>
    <label>
      Speed
      <select class="dl-input" value={app.speed} onchange={(ev) => app.setSpeed(Number(ev.currentTarget.value))}>
        {#each SPEED_CHOICES.includes(app.speed) ? SPEED_CHOICES : [...SPEED_CHOICES, app.speed].sort((a, b) => a - b) as s (s)}
          <option value={s}>{formatSpeed(s)}</option>
        {/each}
      </select>
    </label>
  </div>
</div>

<style>
  .timeline {
    display: grid;
    gap: 6px;
  }
  .track {
    position: relative;
    padding-bottom: 22px;
  }
  input[type='range'] {
    width: 100%;
    margin: 0;
    accent-color: var(--accent);
  }
  input.outside {
    opacity: 0.5;
  }
  .mark {
    position: absolute;
    top: 22px;
    transform: translateX(-50%);
    font: inherit;
    font-size: 11px;
    padding: 0 3px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .mark::before {
    content: '';
    position: absolute;
    left: 50%;
    top: -6px;
    height: 5px;
    border-left: 1px solid currentColor;
  }
  .mark:hover {
    color: var(--fg);
  }
  .controls {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  label {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--muted);
    font-size: 13px;
  }
</style>
