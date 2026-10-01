<!--
  A drag handle between two panels. It fills its parent, which the design
  positions over the gap; a thin line shows on hover, focus and drag.
  axis 'x' drags sideways (a vertical bar), 'y' up and down.
  The parent gets the drag distance from where it started and turns it into
  a size. Arrow keys nudge it (Shift: further); double-click or Enter resets.
  Themes: --dl-split-color (line), --dl-split-width (line thickness).
-->
<script lang="ts">
  interface Props {
    axis: 'x' | 'y';
    label: string;
    onstart?: () => void;
    /** Pixels moved since the drag (or key press) started; right and down are positive. */
    onmove: (delta: number) => void;
    onend?: () => void;
    onreset?: () => void;
  }
  let { axis, label, onstart, onmove, onend, onreset }: Props = $props();

  let dragging = $state(false);
  let origin = 0;

  const pos = (e: PointerEvent) => (axis === 'x' ? e.clientX : e.clientY);

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    origin = pos(e);
    dragging = true;
    document.documentElement.classList.add(`dl-resizing-${axis}`);
    onstart?.();
  }

  function move(e: PointerEvent) {
    if (dragging) onmove(pos(e) - origin);
  }

  function up() {
    if (!dragging) return;
    dragging = false;
    document.documentElement.classList.remove(`dl-resizing-${axis}`);
    onend?.();
  }

  function key(e: KeyboardEvent) {
    const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const fwd = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    if (e.key === back || e.key === fwd) {
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 80 : 20;
      onstart?.();
      onmove(e.key === fwd ? step : -step);
      onend?.();
    } else if (e.key === 'Enter' && onreset) {
      e.preventDefault();
      onreset();
    }
  }
</script>

<!-- A focusable separator is an interactive widget in ARIA; Svelte's a11y rules treat it as static. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="dl-split dl-split--{axis}"
  class:dl-split--drag={dragging}
  role="separator"
  aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
  aria-label={label}
  title="{label}. Drag to resize{onreset ? ', double-click to reset' : ''}."
  tabindex="0"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onlostpointercapture={up}
  ondblclick={() => onreset?.()}
  onkeydown={key}
></div>

<style>
  .dl-split {
    position: relative;
    width: 100%;
    height: 100%;
    touch-action: none;
    outline: none;
  }
  .dl-split--x {
    cursor: col-resize;
  }
  .dl-split--y {
    cursor: row-resize;
  }
  .dl-split::after {
    content: '';
    position: absolute;
    border-radius: 999px;
    background: var(--dl-split-color, #6b8cff);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .dl-split--x::after {
    top: 0;
    bottom: 0;
    left: 50%;
    width: var(--dl-split-width, 3px);
    transform: translateX(-50%);
  }
  .dl-split--y::after {
    left: 0;
    right: 0;
    top: 50%;
    height: var(--dl-split-width, 3px);
    transform: translateY(-50%);
  }
  .dl-split:hover::after,
  .dl-split:focus-visible::after {
    opacity: 0.7;
  }
  .dl-split--drag::after {
    opacity: 1;
  }
  /* While dragging, keep the cursor and stop text selection everywhere. */
  :global(html.dl-resizing-x),
  :global(html.dl-resizing-x *) {
    cursor: col-resize !important;
    user-select: none !important;
  }
  :global(html.dl-resizing-y),
  :global(html.dl-resizing-y *) {
    cursor: row-resize !important;
    user-select: none !important;
  }
</style>
