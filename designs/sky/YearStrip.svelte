<!--
  A target through the year: for every night, the hours it is above the chosen altitude in the
  dark, the moonless part of them brighter. Click a night to go to it.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { YearVisibility } from '$core/sky/targets';
  import type { CivilDate } from '$core/time/timescale';

  interface Props {
    data: YearVisibility;
    dates: CivilDate[];
    /** Index of the night shown. */
    current: number;
    onpick: (date: CivilDate) => void;
  }
  let { data, dates, current, onpick }: Props = $props();

  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = $state(0);
  const height = 92;
  const PAD = { left: 24, right: 4, top: 6, bottom: 16 };
  const MONTHS = 'JFMAMJJASOND';

  const most = $derived(Math.max(4, Math.ceil(Math.max(...data.dark))));

  function draw() {
    if (!canvas || !width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const n = dates.length;
    const w = (width - PAD.left - PAD.right) / n;
    const base = height - PAD.bottom;
    const scaleY = (h: number) => (h / most) * (base - PAD.top);
    ctx.fillStyle = 'rgb(255 255 255 / 0.04)';
    ctx.fillRect(PAD.left, PAD.top, width - PAD.left - PAD.right, base - PAD.top);
    for (let i = 0; i < n; i++) {
      const x = PAD.left + i * w;
      ctx.fillStyle = 'rgb(150 160 190 / 0.55)';
      ctx.fillRect(x, base - scaleY(data.dark[i]), Math.max(1, w), scaleY(data.dark[i]));
      ctx.fillStyle = '#62d394';
      ctx.fillRect(x, base - scaleY(data.moonless[i]), Math.max(1, w), scaleY(data.moonless[i]));
    }
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = 'rgb(190 198 220 / 0.8)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let hh = 0; hh <= most; hh += most > 8 ? 4 : 2) ctx.fillText(`${hh}h`, PAD.left - 4, base - scaleY(hh));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    dates.forEach((d, i) => {
      if (d.day !== 1) return;
      const x = PAD.left + i * w;
      ctx.fillStyle = 'rgb(255 255 255 / 0.12)';
      ctx.fillRect(x, PAD.top, 1, base - PAD.top);
      ctx.fillStyle = 'rgb(190 198 220 / 0.8)';
      ctx.fillText(MONTHS[d.month - 1], x + 15 * w, base + 3);
    });
    if (current >= 0) {
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(PAD.left + current * w - 0.5, PAD.top - 2, 2, base - PAD.top + 2);
    }
  }

  $effect(() => {
    void [data, current, width, most];
    draw();
  });

  onMount(() => {
    const ro = new ResizeObserver(() => (width = wrap.clientWidth));
    ro.observe(wrap);
    return () => ro.disconnect();
  });

  function click(e: MouseEvent) {
    const i = Math.floor(((e.offsetX - PAD.left) / (width - PAD.left - PAD.right)) * dates.length);
    if (i >= 0 && i < dates.length) onpick(dates[i]);
  }
</script>

<div class="year" bind:this={wrap}>
  <canvas bind:this={canvas} style:width="{width}px" style:height="{height}px" onclick={click} aria-label="Hours the target is up in the dark, night by night through the year; click to go to a night"></canvas>
</div>

<style>
  canvas {
    display: block;
    cursor: pointer;
  }
</style>
