<!--
  The night from dusk to dawn: how dark the sky is through it, when the Moon is up, the
  selected target's altitude, and the hours that are dark, moonless and have it high enough.
  Click or drag to set the time.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { HORIZON, TWILIGHT, type Interval, type Night } from '$core/sky/night';
  import { formatClock, type HourCycle } from '$core/time/format';
  import { toWall, type TimeScale } from '$core/time/timescale';

  interface Props {
    night: Night;
    scale: TimeScale;
    hourCycle: HourCycle;
    time: number;
    /** The selected target's altitude at each of the night's samples. */
    target: Float32Array | null;
    targetName: string;
    /** The target's spans that are dark, moonless and above minAlt. */
    windows: Interval[];
    minAlt: number;
    onpick: (ms: number) => void;
  }
  let { night, scale, hourCycle, time, target, targetName, windows, minAlt, onpick }: Props = $props();

  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = $state(0);
  const height = 150;
  const PAD = { left: 34, right: 10, top: 18, bottom: 34 };
  const ALT_MIN = -15;
  const ALT_MAX = 90;
  const HOUR = 3_600_000;

  /** From an hour before sunset to an hour after sunrise, or the whole span when the Sun never sets or rises. */
  const span = $derived.by(() => {
    const a = night.sunset ? Math.max(night.start, night.sunset - HOUR) : night.start;
    const b = night.sunrise ? Math.min(night.end, night.sunrise + HOUR) : night.end;
    return b > a ? [a, b] : [night.start, night.end];
  });

  const x = (ms: number) => PAD.left + ((ms - span[0]) / (span[1] - span[0])) * (width - PAD.left - PAD.right);
  const y = (alt: number) => PAD.top + ((ALT_MAX - Math.max(ALT_MIN, Math.min(ALT_MAX, alt))) / (ALT_MAX - ALT_MIN)) * (height - PAD.top - PAD.bottom);
  const timeAt = (px: number) => span[0] + ((px - PAD.left) / (width - PAD.left - PAD.right)) * (span[1] - span[0]);

  function sky(sunAlt: number): string {
    if (sunAlt > HORIZON) return '#36507e';
    if (sunAlt > TWILIGHT.civil) return '#263a66';
    if (sunAlt > TWILIGHT.nautical) return '#18264a';
    if (sunAlt > TWILIGHT.astronomical) return '#0e1631';
    return '#060a18';
  }

  function curve(ctx: CanvasRenderingContext2D, values: Float32Array) {
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < night.times.length; i++) {
      const t = night.times[i];
      if (t < span[0] || t > span[1]) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(x(t), y(values[i]));
      else ctx.moveTo(x(t), y(values[i]));
      pen = true;
    }
  }

  function draw() {
    if (!canvas || !width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const top = PAD.top;
    const bottom = height - PAD.bottom;

    // How dark, column by column.
    for (let i = 0; i + 1 < night.times.length; i++) {
      const t0 = night.times[i];
      const t1 = night.times[i + 1];
      if (t1 < span[0] || t0 > span[1]) continue;
      ctx.fillStyle = sky(night.sunAlt[i]);
      ctx.fillRect(x(t0), top, x(t1) - x(t0) + 0.6, bottom - top);
    }
    // Ground.
    ctx.fillStyle = 'rgb(8 10 8 / 0.7)';
    ctx.fillRect(PAD.left, y(0), width - PAD.left - PAD.right, bottom - y(0));
    ctx.strokeStyle = 'rgb(150 170 150 / 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y(0));
    ctx.lineTo(width - PAD.right, y(0));
    ctx.stroke();

    // Altitude grid and the lowest altitude asked for.
    ctx.font = '10.5px system-ui, sans-serif';
    ctx.fillStyle = 'rgb(180 190 215 / 0.7)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const a of [0, 30, 60, 90]) ctx.fillText(`${a}°`, PAD.left - 5, y(a));
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgb(255 210 94 / 0.45)';
    ctx.beginPath();
    ctx.moveTo(PAD.left, y(minAlt));
    ctx.lineTo(width - PAD.right, y(minAlt));
    ctx.stroke();
    ctx.setLineDash([]);

    // Dark and moonless along the top; dark with the Moon up, fainter.
    for (const d of night.dark) {
      ctx.fillStyle = 'rgb(150 160 190 / 0.45)';
      ctx.fillRect(x(d.start), top - 7, x(d.end) - x(d.start), 4);
    }
    for (const d of night.moonless) {
      ctx.fillStyle = '#62d394';
      ctx.fillRect(x(d.start), top - 7, x(d.end) - x(d.start), 4);
    }

    // The Moon.
    ctx.strokeStyle = `rgb(235 235 225 / ${0.35 + 0.5 * night.moon.fraction})`;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    curve(ctx, night.moonAlt);
    ctx.stroke();
    ctx.setLineDash([]);

    // The target: thin all night, thick where it is worth photographing.
    if (target) {
      ctx.strokeStyle = 'rgb(255 210 94 / 0.55)';
      ctx.lineWidth = 1.5;
      curve(ctx, target);
      ctx.stroke();
      ctx.save();
      for (const w of windows) {
        ctx.beginPath();
        ctx.rect(x(w.start), 0, x(w.end) - x(w.start), height);
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = '#ffd25e';
        ctx.lineWidth = 3;
        curve(ctx, target);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // Hours on the clock.
    ctx.fillStyle = 'rgb(200 208 228 / 0.85)';
    ctx.strokeStyle = 'rgb(200 208 228 / 0.12)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const stepH = width < 420 ? 3 : width < 700 ? 2 : 1;
    let k = 0;
    // Ticks on whole hours of the place's clock, whose offset may be a half hour.
    const offset = toWall(span[0], scale) - span[0];
    for (let t = Math.ceil((span[0] + offset) / HOUR) * HOUR - offset; t <= span[1]; t += HOUR) {
      const label = formatClock(t, scale, hourCycle);
      if (k++ % stepH) continue;
      ctx.beginPath();
      ctx.moveTo(x(t), top);
      ctx.lineTo(x(t), bottom);
      ctx.stroke();
      ctx.fillText(label.replace(/:00(?=\s|$)/, ''), x(t), bottom + 4);
    }

    // Now.
    if (time >= span[0] && time <= span[1]) {
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x(time), top - 8);
      ctx.lineTo(x(time), bottom);
      ctx.stroke();
      ctx.fillStyle = '#ff8f8f';
      ctx.textAlign = 'center';
      ctx.fillText(formatClock(time, scale, hourCycle), Math.max(PAD.left + 16, Math.min(width - 24, x(time))), bottom + 18);
    }

    // Legend.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '10.5px system-ui, sans-serif';
    let lx = PAD.left;
    const item = (color: string, text: string, dash = false) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = dash ? 1.2 : 3;
      ctx.setLineDash(dash ? [3, 3] : []);
      ctx.beginPath();
      ctx.moveTo(lx, 6);
      ctx.lineTo(lx + 14, 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgb(200 208 228 / 0.85)';
      ctx.fillText(text, lx + 18, 6.5);
      lx += 24 + ctx.measureText(text).width;
    };
    item('#62d394', 'Dark, no Moon');
    item('rgb(150 160 190 / 0.8)', 'Dark, Moon up');
    item('rgb(235 235 225 / 0.8)', 'Moon', true);
    if (target) item('#ffd25e', targetName);
  }

  let queued = 0;
  $effect(() => {
    void [night, time, target, windows, minAlt, width, hourCycle, scale, targetName];
    if (!queued)
      queued = requestAnimationFrame(() => {
        queued = 0;
        draw();
      });
  });

  onMount(() => {
    const ro = new ResizeObserver(() => (width = wrap.clientWidth));
    ro.observe(wrap);
    return () => ro.disconnect();
  });

  let dragging = false;
  let hover = $state<{ x: number; text: string } | null>(null);

  /** What the chart says at a moment: the time, the Sun, the Moon and the target. */
  function showHover(e: PointerEvent) {
    const t = timeAt(e.offsetX);
    if (t < span[0] || t > span[1]) return (hover = null);
    const i = Math.max(0, Math.min(night.times.length - 1, Math.round((t - night.start) / (night.times[1] - night.times[0]))));
    const parts = [formatClock(t, scale, hourCycle), `Sun ${Math.round(night.sunAlt[i])}°`, `Moon ${Math.round(night.moonAlt[i])}°`];
    if (target) parts.push(`${targetName} ${Math.round(target[i])}°`);
    hover = { x: e.offsetX, text: parts.join(' · ') };
  }

  /** Arrow keys step ten minutes, an hour with Shift. */
  function key(e: KeyboardEvent) {
    const step = (e.shiftKey ? 60 : 10) * 60_000;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onpick(Math.max(span[0], time - step));
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onpick(Math.min(span[1], time + step));
    else return;
    e.preventDefault();
  }
  function at(e: PointerEvent) {
    const t = timeAt(e.offsetX);
    onpick(Math.max(span[0], Math.min(span[1], t)));
  }
</script>

<div class="timeline" bind:this={wrap}>
  <canvas
    bind:this={canvas}
    style:width="{width}px"
    style:height="{height}px"
    onpointerdown={(e) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      at(e);
    }}
    onpointermove={(e) => (dragging ? at(e) : showHover(e))}
    onpointerup={() => (dragging = false)}
    onpointerleave={() => (hover = null)}
    onkeydown={key}
    aria-label="The night: darkness, the Moon and the target's altitude; click to set the time, arrow keys to step"
    role="slider"
    aria-valuemin={span[0]}
    aria-valuemax={span[1]}
    aria-valuenow={time}
    aria-valuetext={formatClock(time, scale, hourCycle)}
    tabindex="0"
  ></canvas>
  {#if hover}
    <div class="hover" style:left="{Math.max(4, Math.min(hover.x - 70, width - 200))}px">{hover.text}</div>
  {/if}
</div>

<style>
  .timeline {
    position: relative;
    width: 100%;
  }
  .hover {
    position: absolute;
    top: 14px;
    pointer-events: none;
    padding: 2px 8px;
    border-radius: 6px;
    background: rgb(8 12 26 / 0.88);
    color: #e6e9f2;
    font-size: 12px;
    white-space: nowrap;
  }
  canvas {
    display: block;
    cursor: ew-resize;
    touch-action: pan-y;
  }
</style>
