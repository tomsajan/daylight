<!--
  The core speed control in console dress: − / play-pause / + joined into one
  segmented group, a monospace readout, and the continuous speed slider below
  with a Back / Paused / Fwd scale, so it never reads as a time-of-day slider.
  `large` sizes everything for touch (the phone sheet).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import SpeedControl from '$core/components/SpeedControl.svelte';

  interface Props {
    large?: boolean;
    /** Extra controls on the button row (e.g. Now). */
    children?: Snippet;
  }
  let { large = false, children }: Props = $props();
</script>

<div class="speed" class:large>
  <SpeedControl>{@render children?.()}</SpeedControl>
  <div class="scale" aria-hidden="true">
    <span>◀ Back</span>
    <span>Paused</span>
    <span>Fwd ▶</span>
  </div>
</div>

<style>
  .speed {
    display: flex;
    flex-direction: column;
    min-width: 0;
    --dl-fg: var(--ink);
    --dl-surface: var(--panel);
    --dl-muted: var(--muted);
    --dl-border: var(--rule-strong);
    --dl-accent: var(--accent);
    --dl-on-accent: var(--accent-ink);
    --dl-radius: var(--r);
    --btn-h: 28px;
    --btn-w: 32px;
  }
  .speed.large {
    --btn-h: 44px;
    --btn-w: 56px;
  }
  .speed :global(div.dl-speed) {
    gap: 0;
  }
  .speed :global(.dl-speed .dl-speed__row) {
    gap: 6px;
  }

  /* − ▶ + as one segmented control: no gaps, shared borders. */
  .speed :global(.dl-speed .dl-speed__buttons) {
    gap: 0;
  }
  .speed :global(.dl-speed__buttons > .dl-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--btn-w);
    min-width: 0;
    height: var(--btn-h);
    padding: 0;
    margin-left: -1px;
    border: 1px solid var(--rule-strong);
    border-radius: 0;
    background: var(--panel);
    color: var(--ink);
    font: 600 13px/1 var(--mono);
    cursor: pointer;
    user-select: none;
    touch-action: manipulation;
  }
  .speed :global(.dl-speed__buttons > .dl-btn:first-child) {
    margin-left: 0;
    border-radius: var(--r) 0 0 var(--r);
  }
  .speed :global(.dl-speed__buttons > .dl-btn:last-child) {
    border-radius: 0 var(--r) var(--r) 0;
  }
  .speed :global(.dl-speed__buttons > .dl-btn:hover:not(:disabled)) {
    position: relative;
    z-index: 1;
    border-color: var(--accent);
  }
  .speed :global(.dl-speed__buttons > .dl-btn:active:not(:disabled)) {
    background: var(--accent-soft);
  }
  .speed :global(.dl-speed__buttons > .dl-btn:disabled) {
    opacity: 0.4;
    cursor: default;
  }
  .speed :global(.dl-speed__buttons > .dl-btn--primary) {
    position: relative;
    z-index: 1;
    width: calc(var(--btn-w) + 8px);
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
    font-size: 11px;
  }
  .speed :global(.dl-speed__buttons > .dl-btn--primary:active) {
    background: var(--accent);
    filter: brightness(1.1);
  }

  .speed :global(.dl-speed .dl-speed__label) {
    min-width: 9.5em;
    overflow: hidden;
    text-overflow: ellipsis;
    font: 500 11.5px var(--mono);
    font-feature-settings: 'zero' 1;
    color: var(--ink);
  }
  .speed.large :global(.dl-speed .dl-speed__label) {
    min-width: 8em;
    font-size: 13px;
  }

  /* Slider: a thin rail with a rectangular cursor, like the time scrubber's needle. */
  .speed :global(.dl-speed .dl-speed__track) {
    --thumb: 12px;
  }
  .speed.large :global(.dl-speed .dl-speed__track) {
    --thumb: 18px;
  }
  .speed :global(.dl-speed__track::before) {
    height: 4px;
    border-radius: 1px;
  }
  .speed :global(.dl-speed__track input) {
    height: 24px;
    touch-action: pan-y;
  }
  .speed.large :global(.dl-speed__track input) {
    height: 40px;
  }
  .speed :global(.dl-speed__track input::-webkit-slider-thumb) {
    width: var(--thumb);
    height: calc(var(--thumb) * 1.5);
    border-radius: 2px;
    background: var(--panel);
    border: 2px solid var(--accent);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.35);
  }
  .speed :global(.dl-speed__track input::-moz-range-thumb) {
    width: var(--thumb);
    height: calc(var(--thumb) * 1.5);
    border-radius: 2px;
    background: var(--panel);
    border: 2px solid var(--accent);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.35);
  }
  .speed :global(.dl-speed__track input:focus-visible) {
    outline: none;
  }
  .speed :global(.dl-speed__track input:focus-visible::-webkit-slider-thumb) {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .speed :global(.dl-speed__track input:focus-visible::-moz-range-thumb) {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .scale {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    margin-top: -3px;
    font: 600 9px/11px var(--sans);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .scale span:last-child {
    text-align: right;
  }
  .speed.large .scale {
    margin-top: -6px;
    font-size: 10px;
    line-height: 12px;
  }
</style>
