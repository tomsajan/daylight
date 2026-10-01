<!--
  One day: the sun's altitude through the day for each place, drawn over
  horizontal bands for daylight and the twilight zones.
  Zoom & pan like YearChart; click/tap picks a time of day.
-->
<script lang="ts" module>
  export interface DaySeries {
    id: string;
    name: string;
    color: string;
    lat: number;
    lon: number;
    day: import('../astro/daylight').DayLight;
    scale: import('../time/timescale').TimeScale;
  }
</script>

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { altitudeCurve, horizonAltitude, Light, TWILIGHT_ALTITUDES, type DaylightOptions } from '../astro/daylight';
  import { sunAltitude } from '../astro/sun';
  import { minutesOfDay } from '../time/timescale';
  import { formatMinutes, type HourCycle } from '../time/format';
  import { ChartZoom, type Domain } from './zoom';
  import { LIGHT_PALETTE, visibleLevel, type ChartPalette } from './palette';

  interface Props {
    series: DaySeries[];
    /** Current instant (UTC ms) for the marker. */
    time?: number | null;
    options: DaylightOptions;
    twilight?: { civil: boolean; nautical: boolean; astronomical: boolean };
    hourCycle?: HourCycle;
    palette?: ChartPalette;
    /** Label sunrise/sunset times on the horizon line. */
    showEventLabels?: boolean;
    onpick?: (minutes: number) => void;
  }

  let {
    series,
    time = null,
    options,
    twilight = { civil: true, nautical: true, astronomical: true },
    hourCycle = '24',
    palette = LIGHT_PALETTE,
    showEventLabels = true,
    onpick,
  }: Props = $props();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);
  let zoom: ChartZoom | null = null;

  const margin = { left: 36, right: 10, top: 10, bottom: 24 };
  const plot = () => ({
    left: margin.left,
    top: margin.top,
    width: Math.max(1, width - margin.left - margin.right),
    height: Math.max(1, height - margin.top - margin.bottom),
  });

  const curves = $derived(
    series.map((s) =>
      altitudeCurve(s, s.day.start, s.day.end, 5 * 60_000).map((pt) => ({ m: minutesOfDay(pt.time, s.day.date, s.scale), alt: pt.altitude })),
    ),
  );

  const extent = $derived.by<Domain>(() => {
    let lo = -20;
    let hi = 20;
    for (const c of curves) for (const pt of c) (lo = Math.min(lo, pt.alt)), (hi = Math.max(hi, pt.alt));
    const pad = 6;
    return { x: [0, 1440], y: [Math.max(-90, Math.floor((lo - pad) / 10) * 10), Math.min(90, Math.ceil((hi + pad) / 10) * 10)] };
  });
  let view = $state<Domain>({ x: [0, 1440], y: [-30, 70] });

  export function resetZoom() {
    zoom?.reset();
  }

  onMount(() => {
    zoom = new ChartZoom(canvas, {
      extent: $state.snapshot(extent) as Domain,
      minSpan: { x: 30, y: 5 },
      plot,
      onChange: (v) => (view = { x: [...v.x], y: [...v.y] }),
      onTap: (x) => onpick?.(Math.max(0, Math.min(1439, x))),
    });
    view = structuredClone($state.snapshot(extent) as Domain);
    const ro = new ResizeObserver(() => {
      width = container.clientWidth;
      height = container.clientHeight;
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      zoom?.destroy();
    };
  });

  $effect(() => {
    const e = $state.snapshot(extent) as Domain;
    untrack(() => {
      if (!zoom) return;
      const wasZoomed = zoom.zoomed;
      zoom.setExtent(e, true);
      if (!wasZoomed) zoom.reset();
    });
  });

  $effect(() => {
    draw(series, curves, view, width, height, time, options, twilight, hourCycle, palette, showEventLabels);
  });

  function draw(
    series: DaySeries[],
    curves: { m: number; alt: number }[][],
    view: Domain,
    width: number,
    height: number,
    time: number | null,
    options: DaylightOptions,
    twilight: { civil: boolean; nautical: boolean; astronomical: boolean },
    hourCycle: HourCycle,
    pal: ChartPalette,
    showEventLabels: boolean,
  ) {
    if (!canvas || !width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const p = plot();
    const X = (m: number) => p.left + ((m - view.x[0]) / (view.x[1] - view.x[0])) * p.width;
    const Y = (a: number) => p.top + (1 - (a - view.y[0]) / (view.y[1] - view.y[0])) * p.height;

    ctx.save();
    ctx.beginPath();
    ctx.rect(p.left, p.top, p.width, p.height);
    ctx.clip();

    // Light bands by altitude.
    const horizon = horizonAltitude(options);
    const bands: [number, number, Light][] = [
      [horizon, 90, Light.Day],
      [TWILIGHT_ALTITUDES.civil, horizon, Light.Civil],
      [TWILIGHT_ALTITUDES.nautical, TWILIGHT_ALTITUDES.civil, Light.Nautical],
      [TWILIGHT_ALTITUDES.astronomical, TWILIGHT_ALTITUDES.nautical, Light.Astronomical],
      [-90, TWILIGHT_ALTITUDES.astronomical, Light.Night],
    ];
    for (const [lo, hi, light] of bands) {
      ctx.fillStyle = pal.light[visibleLevel(light, twilight)];
      ctx.globalAlpha = light === Light.Day ? 0.55 : 0.9;
      ctx.fillRect(p.left, Y(hi), p.width, Y(lo) - Y(hi));
    }
    ctx.globalAlpha = 1;

    // Grid.
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    const xStep = step(view.x[1] - view.x[0], p.width / 60, [15, 30, 60, 120, 180, 360]);
    for (let m = Math.ceil(view.x[0] / xStep) * xStep; m <= view.x[1]; m += xStep) {
      ctx.beginPath();
      ctx.moveTo(Math.round(X(m)) + 0.5, p.top);
      ctx.lineTo(Math.round(X(m)) + 0.5, p.top + p.height);
      ctx.stroke();
    }
    const yStep = step(view.y[1] - view.y[0], p.height / 30, [1, 2, 5, 10, 15, 30]);
    for (let a = Math.ceil(view.y[0] / yStep) * yStep; a <= view.y[1]; a += yStep) {
      ctx.strokeStyle = a === 0 ? pal.axis : pal.grid;
      ctx.beginPath();
      ctx.moveTo(p.left, Math.round(Y(a)) + 0.5);
      ctx.lineTo(p.left + p.width, Math.round(Y(a)) + 0.5);
      ctx.stroke();
    }

    // Altitude curves (primary last, on top).
    for (let k = series.length - 1; k >= 0; k--) {
      const c = curves[k];
      for (const [color, lw] of [[pal.background, k === 0 ? 5 : 4], [series[k].color, k === 0 ? 2.5 : 1.75]] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        let prev = -Infinity;
        for (const pt of c) {
          // Lift the pen where the clock jumps (DST): backwards, or a skipped hour.
          if (pt.m < prev || pt.m - prev > 10) ctx.moveTo(X(pt.m), Y(pt.alt));
          else ctx.lineTo(X(pt.m), Y(pt.alt));
          prev = pt.m;
        }
        ctx.stroke();
      }
    }

    // Sunrise / sunset labels for the primary place.
    const primary = series[0];
    ctx.font = pal.font;
    if (primary && showEventLabels) {
      ctx.fillStyle = pal.text;
      ctx.textBaseline = 'bottom';
      for (const e of [primary.day.sunrise, primary.day.sunset]) {
        if (!e) continue;
        const x = X(e.minutes);
        ctx.fillStyle = pal.text;
        ctx.beginPath();
        ctx.arc(x, Y(horizon), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.textAlign = e.rising ? 'right' : 'left';
        ctx.fillText(formatMinutes(e.minutes, hourCycle), x + (e.rising ? -6 : 6), Y(horizon) - 3);
      }
    }

    // Now marker.
    if (time != null && primary && time >= primary.day.start && time < primary.day.end) {
      const m = minutesOfDay(time, primary.day.date, primary.scale);
      const x = X(m);
      ctx.strokeStyle = pal.marker;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, p.top);
      ctx.lineTo(x, p.top + p.height);
      ctx.stroke();
      const alt = sunAltitude(time, primary.lat, primary.lon);
      ctx.fillStyle = '#ffd34d';
      ctx.strokeStyle = pal.marker;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, Y(alt), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Axis labels.
    ctx.fillStyle = pal.text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let a = Math.ceil(view.y[0] / yStep) * yStep; a <= view.y[1]; a += yStep) ctx.fillText(`${a}°`, p.left - 6, Y(a));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let m = Math.ceil(view.x[0] / xStep) * xStep; m <= view.x[1]; m += xStep) {
      const label = m >= 1440 ? (hourCycle === '12' ? '12 AM' : '24:00') : formatMinutes(m, hourCycle).replace(':00 ', ' ');
      ctx.fillText(label, X(m), p.top + p.height + 6);
    }
  }

  function step(span: number, count: number, options: number[]): number {
    const target = span / Math.max(1, count);
    return options.find((s) => s >= target) ?? options[options.length - 1];
  }
</script>

<div class="day-chart" bind:this={container}>
  <canvas bind:this={canvas} style="width: {width}px; height: {height}px"></canvas>
</div>

<style>
  .day-chart {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 140px;
    overflow: hidden;
  }
  canvas {
    position: absolute;
    inset: 0;
    display: block;
    cursor: crosshair;
  }
</style>
