<!--
  One control for direction and speed: a slider with "paused" in the middle,
  faster forward to the right and faster backward to the left, with −/+
  buttons that step one notch (so − from 1× forward goes to paused, then to
  1× backward). Themable via --dl-* custom properties.
-->
<script lang="ts">
  import { app, SPEEDS } from '../state/app.svelte';

  interface Props {
    /** Show the text readout ("▶ 1 day/s"). */
    showLabel?: boolean;
  }
  let { showLabel = true }: Props = $props();

  const max = SPEEDS.length;

  /** Slider position: 0 = paused, ±k = SPEEDS[k-1] forward/backward. */
  const position = $derived.by(() => {
    if (!app.playing) return 0;
    const i = SPEEDS.findIndex((s) => s.value === Math.abs(app.speed));
    return Math.sign(app.speed) * ((i < 0 ? 0 : i) + 1);
  });

  const label = $derived.by(() => {
    if (position === 0) return 'Paused';
    const s = SPEEDS[Math.abs(position) - 1].label;
    return position > 0 ? `▶ ${s}` : `◀ ${s} back`;
  });

  function setPosition(pos: number) {
    const p = Math.max(-max, Math.min(max, Math.round(pos)));
    if (p === 0) {
      app.pause();
      return;
    }
    app.setSpeed(Math.sign(p) * SPEEDS[Math.abs(p) - 1].value);
    app.play();
  }

  // Percent of the track the centre mark sits at, for the filled part.
  const fill = $derived.by(() => {
    const mid = 50;
    const at = ((position + max) / (2 * max)) * 100;
    return { from: Math.min(mid, at), to: Math.max(mid, at) };
  });
</script>

<div class="dl-speed">
  <button type="button" class="dl-btn dl-btn--icon" onclick={() => setPosition(position - 1)} disabled={position <= -max} aria-label="Slower / backwards">−</button>
  <div class="dl-speed__track" style="--from: {fill.from}%; --to: {fill.to}%">
    <input
      type="range"
      min={-max}
      max={max}
      step="1"
      value={position}
      oninput={(e) => setPosition(+(e.target as HTMLInputElement).value)}
      aria-label="Simulation speed and direction"
      aria-valuetext={label}
    />
    <span class="dl-speed__centre" aria-hidden="true"></span>
  </div>
  <button type="button" class="dl-btn dl-btn--icon" onclick={() => setPosition(position + 1)} disabled={position >= max} aria-label="Faster / forwards">+</button>
  {#if showLabel}<span class="dl-speed__label">{label}</span>{/if}
</div>

<style>
  .dl-speed {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .dl-speed__track {
    position: relative;
    flex: 1;
    min-width: 120px;
    display: flex;
    align-items: center;
  }
  .dl-speed__track::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(
      to right,
      var(--dl-border, #d0d5dd) var(--from),
      var(--dl-accent, #3d8bfd) var(--from) var(--to),
      var(--dl-border, #d0d5dd) var(--to)
    );
  }
  .dl-speed__centre {
    position: absolute;
    left: 50%;
    width: 2px;
    height: 14px;
    margin-left: -1px;
    background: var(--dl-muted, #667);
    pointer-events: none;
  }
  input {
    position: relative;
    z-index: 1;
    width: 100%;
    margin: 0;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    height: 28px;
  }
  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--dl-surface, #fff);
    border: 2px solid var(--dl-accent, #3d8bfd);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
  }
  input::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--dl-surface, #fff);
    border: 2px solid var(--dl-accent, #3d8bfd);
  }
  input::-moz-range-track {
    background: transparent;
  }
  .dl-speed__label {
    min-width: 8.5em;
    font-size: 0.9em;
    font-variant-numeric: tabular-nums;
    color: var(--dl-muted, #667);
    white-space: nowrap;
  }
</style>
