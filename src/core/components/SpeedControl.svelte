<!--
  Direction and speed in one control.
  - Buttons (grouped so switching is a short move): − / play-pause / +.
    − and + jump between the preset speeds, passing through "paused":
    … 10× back, 1× back, paused, 1×, 10× …
  - Slider below: continuous and logarithmic, paused in the middle, forward to
    the right, backward to the left, for picking any speed precisely.
  Extra controls (e.g. a "Now" button) can be passed as children and sit
  next to the buttons. Themable via --dl-* custom properties.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { app, SPEEDS } from '../state/app.svelte';
  import { formatSpeed } from '../time/format';

  interface Props {
    /** Show the text readout ("▶ 2.5 h/s"). */
    showLabel?: boolean;
    children?: Snippet;
  }
  let { showLabel = true, children }: Props = $props();

  const MAX = SPEEDS[SPEEDS.length - 1].value;
  const LOG_MAX = Math.log(MAX);
  /** Half-width of the "paused" zone around the centre of the slider. */
  const DEAD = 0.04;

  /** Signed speed currently in effect; 0 when paused. */
  const current = $derived(app.playing ? app.speed : 0);

  // Slider position in [-1, 1]: |p| ≤ DEAD is paused, beyond it log(speed) maps linearly.
  function toPosition(speed: number): number {
    if (speed === 0) return 0;
    const f = Math.log(Math.min(MAX, Math.max(1, Math.abs(speed)))) / LOG_MAX;
    return Math.sign(speed) * (DEAD + f * (1 - DEAD));
  }

  function fromPosition(p: number): number {
    if (Math.abs(p) <= DEAD) return 0;
    const f = (Math.abs(p) - DEAD) / (1 - DEAD);
    return Math.sign(p) * Math.exp(f * LOG_MAX);
  }

  function apply(speed: number) {
    if (speed === 0) {
      app.pause();
      return;
    }
    app.setSpeed(speed);
    app.play();
  }

  /** Presets in signed order, paused in the middle (tick marks). */
  const presets = [...SPEEDS.map((s) => -s.value).reverse(), 0, ...SPEEDS.map((s) => s.value)];

  const label = $derived(current === 0 ? 'Paused' : `${current > 0 ? '▶\uFE0E' : '◀\uFE0E'} ${formatSpeed(Math.abs(current))}${current < 0 ? ' back' : ''}`);
  const position = $derived(toPosition(current));
  // Filled part of the track, from the centre to the thumb (percent).
  const at = $derived(((position + 1) / 2) * 100);
</script>

<div class="dl-speed">
  <div class="dl-speed__row">
    <div class="dl-speed__buttons" role="group" aria-label="Speed">
      <button type="button" class="dl-btn dl-btn--icon" onclick={() => app.stepSpeed(-1)} disabled={current <= -MAX} title="Slower / backwards" aria-label="Slower / backwards">−</button>
      <button
        type="button"
        class="dl-btn dl-btn--primary dl-btn--icon"
        onclick={() => app.toggle()}
        title={app.playing ? 'Pause' : 'Play'}
        aria-label={app.playing ? 'Pause' : 'Play'}>{app.playing ? '❚❚' : '▶\uFE0E'}</button
      >
      <button type="button" class="dl-btn dl-btn--icon" onclick={() => app.stepSpeed(1)} disabled={current >= MAX} title="Faster / forwards" aria-label="Faster / forwards">+</button>
    </div>
    {#if showLabel}<span class="dl-speed__label" aria-live="polite">{label}</span>{/if}
    {@render children?.()}
  </div>
  <div class="dl-speed__track" style="--from: {Math.min(50, at)}%; --to: {Math.max(50, at)}%">
    <input
      type="range"
      min="-1"
      max="1"
      step="0.001"
      value={position}
      oninput={(e) => apply(fromPosition(+(e.target as HTMLInputElement).value))}
      aria-label="Simulation speed and direction"
      aria-valuetext={label}
    />
    <span class="dl-speed__ticks" aria-hidden="true">
      {#each presets as v (v)}
        <span style="left: {((toPosition(v) + 1) / 2) * 100}%" class:centre={v === 0}></span>
      {/each}
    </span>
  </div>
</div>

<style>
  .dl-speed {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .dl-speed__row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .dl-speed__buttons {
    display: inline-flex;
    gap: 4px;
  }
  .dl-speed__label {
    flex: 1;
    min-width: 8.5em;
    font-size: 0.9em;
    font-variant-numeric: tabular-nums;
    color: var(--dl-muted, #667);
    white-space: nowrap;
  }
  .dl-speed__track {
    position: relative;
    display: flex;
    align-items: center;
    /* Inset by half a thumb so ticks line up with thumb centres. */
    --thumb: 18px;
  }
  .dl-speed__track::before {
    content: '';
    position: absolute;
    left: calc(var(--thumb) / 2);
    right: calc(var(--thumb) / 2);
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(
      to right,
      var(--dl-border, #d0d5dd) var(--from),
      var(--dl-accent, #3d8bfd) var(--from) var(--to),
      var(--dl-border, #d0d5dd) var(--to)
    );
  }
  .dl-speed__ticks {
    position: absolute;
    left: calc(var(--thumb) / 2);
    right: calc(var(--thumb) / 2);
    top: 50%;
    height: 0;
    pointer-events: none;
  }
  .dl-speed__ticks span {
    position: absolute;
    top: 5px;
    width: 1px;
    height: 5px;
    margin-left: -0.5px;
    background: var(--dl-muted, #667);
    opacity: 0.6;
  }
  .dl-speed__ticks span.centre {
    top: -8px;
    height: 16px;
    width: 2px;
    margin-left: -1px;
    opacity: 1;
  }
  input {
    position: relative;
    z-index: 1;
    width: 100%;
    margin: 0;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    height: 30px;
    cursor: pointer;
  }
  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: var(--thumb);
    height: var(--thumb);
    border-radius: 50%;
    background: var(--dl-surface, #fff);
    border: 2px solid var(--dl-accent, #3d8bfd);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
    box-sizing: border-box;
  }
  input::-moz-range-thumb {
    width: var(--thumb);
    height: var(--thumb);
    border-radius: 50%;
    background: var(--dl-surface, #fff);
    border: 2px solid var(--dl-accent, #3d8bfd);
    box-sizing: border-box;
  }
  input::-moz-range-track {
    background: transparent;
  }
</style>
