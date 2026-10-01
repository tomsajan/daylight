<!--
  Simulation controls: the core speed control (− / play-pause / + side by side,
  a continuous speed slider below) dressed in Observatory's glass and gold,
  plus "Now" to jump back to the real time.
  `compact` is the phone peek: smaller readout, everything on two rows.
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import SpeedControl from '$core/components/SpeedControl.svelte';

  interface Props {
    compact?: boolean;
  }
  let { compact = false }: Props = $props();

  let root: HTMLDivElement;

  // The phone sheet drags on any vertical move over its header; keep slider
  // drags to the slider. A native listener stops the event before it reaches
  // Svelte's delegated handlers.
  $effect(() => {
    const guard = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest('input[type="range"]')) e.stopPropagation();
    };
    root.addEventListener('pointerdown', guard);
    return () => root.removeEventListener('pointerdown', guard);
  });
</script>

<div class="transport" class:transport--compact={compact} bind:this={root}>
  <SpeedControl>
    <button type="button" class="o-btn now" class:now--live={app.live} onclick={() => app.goLive()} title="Jump to the current time and follow the clock">
      <span class="dot" aria-hidden="true"></span>{app.live ? 'Live' : 'Now'}
    </button>
  </SpeedControl>
</div>

<style>
  .transport {
    min-width: 0;
    --dl-border: rgb(255 236 200 / 0.14);
    --dl-accent: var(--gold);
    --dl-muted: var(--ink-3);
  }

  /* Rows: buttons + readout + Now, then the slider. */
  .transport :global(div.dl-speed) {
    gap: 2px;
  }
  .transport :global(.dl-speed .dl-speed__row) {
    flex-wrap: nowrap;
    gap: 10px;
  }
  .transport :global(.dl-speed .dl-speed__buttons) {
    align-items: center;
    gap: 6px;
  }
  .transport :global(.dl-speed .dl-speed__label) {
    min-width: 7.5em;
    font-size: 13.5px;
    color: var(--ink-2);
    font-variant-emoji: text;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* − and + : round glass buttons with line icons (same strokes as Icon). */
  .transport :global(.dl-speed .dl-speed__buttons .dl-btn) {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    min-width: 0;
    padding: 0;
    border: 1px solid var(--hair);
    border-radius: 50%;
    background: rgb(255 255 255 / 0.04);
    color: var(--ink);
    font-size: 0;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      opacity 0.15s;
  }
  .transport :global(.dl-speed .dl-speed__buttons .dl-btn:hover:not(:disabled)) {
    background: var(--glass-hover);
    border-color: var(--hair-strong);
  }
  .transport :global(.dl-speed .dl-speed__buttons .dl-btn:disabled) {
    opacity: 0.35;
    cursor: default;
  }
  .transport :global(.dl-speed .dl-speed__buttons .dl-btn::before) {
    content: '';
    width: 20px;
    height: 20px;
    background: currentColor;
    -webkit-mask: var(--icon) center / contain no-repeat;
    mask: var(--icon) center / contain no-repeat;
  }
  .transport :global(.dl-speed .dl-speed__buttons .dl-btn:first-child) {
    --icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.9' stroke-linecap='round'%3E%3Cpath d='M5 12h14'/%3E%3C/svg%3E");
  }
  .transport :global(.dl-speed .dl-speed__buttons .dl-btn:last-child) {
    --icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.9' stroke-linecap='round'%3E%3Cpath d='M12 5v14M5 12h14'/%3E%3C/svg%3E");
  }

  /* Play / pause: the gold sun. */
  .transport :global(.dl-speed .dl-speed__buttons .dl-btn.dl-btn--primary) {
    width: 48px;
    height: 48px;
    border: 0;
    background: radial-gradient(circle at 35% 30%, var(--gold-hot), var(--gold) 55%, var(--gold-deep));
    color: var(--on-gold);
    box-shadow:
      0 0 0 1px rgb(255 220 150 / 0.4),
      0 0 26px rgb(242 196 109 / 0.35);
    --icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M8 5.5v13l10.5-6.5z'/%3E%3C/svg%3E");
  }
  .transport :global(.dl-speed .dl-speed__buttons .dl-btn.dl-btn--primary:hover:not(:disabled)) {
    background: radial-gradient(circle at 35% 30%, #fff0c4, var(--gold-hot) 55%, var(--gold));
  }
  .transport :global(.dl-speed .dl-speed__buttons .dl-btn.dl-btn--primary::before) {
    width: 22px;
    height: 22px;
  }
  .transport :global(.dl-speed .dl-speed__buttons .dl-btn.dl-btn--primary[aria-label='Pause']) {
    --icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 5h3.6v14H7zM13.4 5H17v14h-3.6z'/%3E%3C/svg%3E");
  }

  /* Slider: hairline track, gold fill from "paused", a small sun for a thumb. */
  .transport :global(.dl-speed .dl-speed__track) {
    --thumb: 18px;
  }
  .transport :global(.dl-speed .dl-speed__track::before) {
    height: 4px;
    border-radius: 2px;
  }
  .transport :global(.dl-speed .dl-speed__track input) {
    height: 28px;
  }
  .transport :global(.dl-speed .dl-speed__track input::-webkit-slider-thumb) {
    border: 0;
    background: radial-gradient(circle at 35% 30%, #fff3d0, var(--gold) 60%, var(--gold-deep));
    box-shadow:
      0 0 0 1px rgb(255 220 150 / 0.5),
      0 0 12px rgb(242 196 109 / 0.55);
  }
  .transport :global(.dl-speed .dl-speed__track input::-moz-range-thumb) {
    border: 0;
    background: radial-gradient(circle at 35% 30%, #fff3d0, var(--gold) 60%, var(--gold-deep));
    box-shadow:
      0 0 0 1px rgb(255 220 150 / 0.5),
      0 0 12px rgb(242 196 109 / 0.55);
  }
  .transport :global(.dl-speed .dl-speed__track input:focus-visible) {
    outline: none;
  }
  .transport :global(.dl-speed .dl-speed__track input:focus-visible::-webkit-slider-thumb) {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .transport :global(.dl-speed .dl-speed__track input:focus-visible::-moz-range-thumb) {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }

  .now {
    flex: none;
    padding: 0 12px 0 10px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ink-3);
  }
  .now--live {
    color: var(--gold-hot);
    border-color: color-mix(in srgb, var(--gold) 40%, transparent);
  }
  .now--live .dot {
    background: var(--gold);
    box-shadow: 0 0 8px var(--gold);
  }

  /* Phone peek: tighter readout, bigger thumb for fingers. */
  .transport--compact :global(.dl-speed .dl-speed__row) {
    gap: 8px;
  }
  .transport--compact :global(.dl-speed .dl-speed__label) {
    min-width: 0;
    font-size: 12.5px;
  }
  .transport--compact :global(.dl-speed .dl-speed__track) {
    --thumb: 24px;
  }
  .transport--compact :global(.dl-speed .dl-speed__track input) {
    height: 34px;
  }
</style>
