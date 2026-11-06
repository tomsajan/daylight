<!--
  The sky from the place at the chosen time, as if lying on the ground looking up: drag to look
  around, scroll or pinch to zoom, click a target to choose it. The selected target is ringed,
  with the camera's frame around it.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { skyFrame, toHorizontal, type Site, type Vec3 } from '$core/sky/frame';
  import { toAzAlt, type View } from '$core/sky/projection';
  import { compassPoint } from '$core/time/format';
  import { drawSky, Projector, type FrameSpec, type Pickable, type SkyLayers } from './draw';

  interface Props {
    site: Site;
    time: number;
    layers: SkyLayers;
    view: View;
    selected: { id: string; v: Vec3; label: string } | null;
    camera: FrameSpec | null;
    onpick?: (id: string) => void;
  }
  let { site, time, layers, view = $bindable(), selected, camera, onpick }: Props = $props();

  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);
  let picks: Pickable[] = [];
  let hover = $state<{ x: number; y: number; text: string } | null>(null);

  // Redrawn once per frame at most, whatever changed.
  let queued = 0;
  function schedule() {
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      draw();
    });
  }

  function draw() {
    if (!canvas || !width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    picks = drawSky(ctx, width, height, { ms: time, site, frame: skyFrame(time, site), view, layers, selected, camera });
  }

  $effect(() => {
    // Everything the picture depends on.
    void [time, site.lat, site.lon, view.az, view.alt, view.fov, width, height, selected, camera, { ...layers }];
    schedule();
  });

  onMount(() => {
    const ro = new ResizeObserver(() => {
      width = wrap.clientWidth;
      height = wrap.clientHeight;
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(queued);
    };
  });

  // --- Looking around ---------------------------------------------------------------------

  const clampView = (v: View): View => {
    let alt = Math.max(-20, Math.min(90, v.alt));
    if (Math.abs(alt) < 0.05) alt = 0.05;
    return { az: ((v.az % 360) + 360) % 360, alt, fov: Math.max(0.5, Math.min(200, v.fov)) };
  };

  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinch = 0;

  function down(e: PointerEvent) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  function move(e: PointerEvent) {
    const last = pointers.get(e.pointerId);
    if (!last) return showHover(e.offsetX, e.offsetY);
    const dx = e.offsetX - last.x;
    const dy = e.offsetY - last.y;
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    moved += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) view = clampView({ ...view, fov: (view.fov * pinch) / d });
      pinch = d;
      return;
    }
    // The sky follows the pointer: degrees per pixel at the middle of the chart.
    const p = new Projector(view, width, height);
    const deg = 1 / p.pxPerDegree;
    const az = view.alt > 80 ? view.az : view.az - (dx * deg) / Math.max(0.25, Math.cos((view.alt * Math.PI) / 180));
    view = clampView({ az: view.alt > 80 ? view.az - dx * deg : az, alt: view.alt + dy * deg, fov: view.fov });
    hover = null;
  }

  function up(e: PointerEvent) {
    pointers.delete(e.pointerId);
    pinch = 0;
    if (moved < 6 && pointers.size === 0) pick(e.offsetX, e.offsetY);
  }

  function nearest(x: number, y: number): Pickable | null {
    let best: Pickable | null = null;
    let bd = 16;
    for (const p of picks) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  function pick(x: number, y: number) {
    const p = nearest(x, y);
    if (p) onpick?.(p.id);
  }

  function showHover(x: number, y: number) {
    const p = nearest(x, y);
    const proj = new Projector(view, width, height);
    const { az, alt } = toAzAlt(proj.unproject(x, y));
    const where = `${alt.toFixed(0)}° high, ${az.toFixed(0)}° ${compassPoint(az)}`;
    hover = { x, y, text: p ? `${p.label} · ${where}` : where };
  }

  function wheel(e: WheelEvent) {
    e.preventDefault();
    view = clampView({ ...view, fov: view.fov * Math.exp(e.deltaY * 0.0015) });
  }

  /** The whole sky, the zenith in the middle and north at the top. */
  export function wholeSky() {
    view = { az: 180, alt: 90, fov: 186 };
  }

  /** Turn towards a J2000 direction, with an angle across the chart. */
  export function lookAt(v: Vec3, fov: number) {
    const h = toHorizontal(skyFrame(time, site), v[0], v[1], v[2]);
    const { az, alt } = toAzAlt(h);
    view = clampView({ az, alt: Math.max(alt, Math.min(fov / 3, 25)), fov });
  }

  export function zoom(factor: number) {
    view = clampView({ ...view, fov: view.fov * factor });
  }
</script>

<div class="sky" bind:this={wrap}>
  <canvas
    bind:this={canvas}
    style:width="{width}px"
    style:height="{height}px"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={(e) => pointers.delete(e.pointerId)}
    onpointerleave={() => (hover = null)}
    onwheel={wheel}
    ondblclick={wholeSky}
    aria-label="Sky chart: drag to look around, scroll to zoom, click a target to choose it, double-click for the whole sky"
  ></canvas>
  {#if hover}
    <div class="hover" style:left="{Math.min(hover.x + 14, width - 220)}px" style:top="{hover.y + 16}px">{hover.text}</div>
  {/if}
</div>

<style>
  .sky {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #03050c;
  }
  canvas {
    display: block;
    touch-action: none;
    cursor: grab;
  }
  canvas:active {
    cursor: grabbing;
  }
  .hover {
    position: absolute;
    pointer-events: none;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgb(8 12 26 / 0.85);
    color: #e6e9f2;
    font-size: 12px;
    white-space: nowrap;
  }
</style>
