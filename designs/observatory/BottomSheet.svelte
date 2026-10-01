<!--
  Phone bottom sheet with three snap points: peek (just the header snippet),
  half and full. Drag anywhere on the header, or tap the handle to step
  through the snaps. The body scrolls inside whatever height is visible.
-->
<script lang="ts" module>
  export type Snap = 'peek' | 'half' | 'full';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    header: Snippet;
    children: Snippet;
    snap?: Snap;
    /** Out: on-screen height of the sheet when peeking (for laying out what's behind it). */
    peekHeight?: number;
    /** Space kept free above the fully open sheet (for the top bar). */
    topGap?: number;
  }
  let { header, children, snap = $bindable('peek'), peekHeight = $bindable(0), topGap = 72 }: Props = $props();

  let vh = $state(window.innerHeight);
  let headH = $state(0);
  let safeB = $state(0);
  let safeT = $state(0);
  let dragH = $state<number | null>(null);
  let headEl: HTMLDivElement;

  const heights = $derived.by(() => {
    const peek = headH + safeB;
    const full = Math.max(peek, vh - topGap - safeT);
    // Half: enough room below the peek for one chart.
    const half = Math.min(full, Math.max(peek + 300, Math.round(vh * 0.62)));
    return { peek, half, full };
  });
  const visible = $derived(dragH ?? heights[snap]);

  $effect(() => {
    peekHeight = heights.peek;
  });

  // --- Dragging ----------------------------------------------------------------

  let start: { y: number; h: number; id: number } | null = null;
  let moved = false;
  let suppressClick = false;
  let samples: { y: number; t: number }[] = [];

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    start = { y: e.clientY, h: visible, id: e.pointerId };
    moved = false;
    samples = [{ y: e.clientY, t: e.timeStamp }];
  }

  function move(e: PointerEvent) {
    if (!start || e.pointerId !== start.id) return;
    const dy = e.clientY - start.y;
    if (!moved) {
      if (Math.abs(dy) < 8) return;
      moved = true;
      headEl.setPointerCapture(e.pointerId);
    }
    dragH = Math.max(heights.peek, Math.min(heights.full, start.h - dy));
    samples.push({ y: e.clientY, t: e.timeStamp });
    if (samples.length > 5) samples.shift();
  }

  function up(e: PointerEvent) {
    if (!start || e.pointerId !== start.id) return;
    if (moved && dragH != null) {
      const a = samples[0];
      const b = samples[samples.length - 1];
      // Upward velocity in px/ms; a flick carries the sheet to the next snap.
      const v = b.t > a.t ? (a.y - b.y) / (b.t - a.t) : 0;
      const projected = dragH + v * 220;
      const order: Snap[] = ['peek', 'half', 'full'];
      snap = order.reduce((best, s) => (Math.abs(heights[s] - projected) < Math.abs(heights[best] - projected) ? s : best), snap);
      suppressClick = true;
    }
    dragH = null;
    start = null;
  }

  function cycle() {
    snap = snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek';
  }
</script>

<svelte:window bind:innerHeight={vh} />

<div
  class="sheet o-glass"
  class:sheet--dragging={dragH != null}
  style:height="{heights.full}px"
  style:transform="translateY({heights.full - visible}px)"
>
  <div
    class="head"
    bind:this={headEl}
    bind:offsetHeight={headH}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onclickcapture={(e) => {
      if (suppressClick) {
        e.stopPropagation();
        e.preventDefault();
        suppressClick = false;
      }
    }}
    role="presentation"
  >
    <button
      type="button"
      class="handle"
      onclick={cycle}
      aria-label={snap === 'full' ? 'Collapse panel' : 'Expand panel'}
      aria-expanded={snap !== 'peek'}
    >
      <span></span>
    </button>
    {@render header()}
  </div>
  <div class="body o-scroll" style:height="{Math.max(0, heights[snap] - headH)}px" inert={snap === 'peek'}>
    {@render children()}
  </div>
  <div class="probe probe--b" bind:offsetHeight={safeB}></div>
  <div class="probe probe--t" bind:offsetHeight={safeT}></div>
</div>

<style>
  .sheet {
    position: fixed;
    z-index: 30;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    border-radius: 24px 24px 0 0;
    border-bottom: 0;
    background: rgb(8 13 29 / 0.72);
    transition: transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
    will-change: transform;
  }
  .sheet--dragging {
    transition: none;
  }
  .head {
    flex: none;
    padding: 0 16px 12px;
    padding-left: max(16px, var(--safe-left));
    padding-right: max(16px, var(--safe-right));
    touch-action: none;
  }
  .handle {
    display: block;
    width: 100%;
    height: 22px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: grab;
  }
  .handle span {
    display: block;
    width: 40px;
    height: 4px;
    margin: 0 auto;
    border-radius: 2px;
    background: rgb(255 240 210 / 0.3);
  }
  .body {
    flex: none;
    box-sizing: border-box;
    padding: 4px 16px calc(20px + var(--safe-bottom));
    padding-left: max(16px, var(--safe-left));
    padding-right: max(16px, var(--safe-right));
    overscroll-behavior: contain;
    border-top: 1px solid var(--hair);
  }
  .probe {
    position: absolute;
    width: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .probe--b {
    height: env(safe-area-inset-bottom, 0px);
  }
  .probe--t {
    height: env(safe-area-inset-top, 0px);
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet {
      transition: none;
    }
  }
</style>
