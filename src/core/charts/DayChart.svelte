<!--
  One day: the sun's altitude through the day for each place, drawn over
  horizontal bands for daylight and the twilight zones.
  The horizontal axis is elapsed time since the day began (so a 25-hour DST
  day is 25 hours wide); tick labels show what the clock reads, and a marker
  shows where the clocks change.
  Zoom & pan like YearChart; click/tap picks a time of day, and the sun (or the
  "now" line) can be dragged along the day.
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
  import { app } from '../state/app.svelte';
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
    /** One-finger vertical swipes scroll the page (for charts in scrolling layouts). */
    touchScroll?: boolean;
    /** Picked time of day as clock minutes (ambiguous in a repeated DST hour). */
    onpick?: (minutes: number) => void;
    /** Picked instant, UTC ms (exact; prefer this). */
    onpicktime?: (utcMs: number) => void;
    /** Let the sun / "now" line be dragged. */
    draggable?: boolean;
    /** Pause the simulation while dragging (resumes afterwards). */
    pauseWhileDragging?: boolean;
  }

  let {
    series,
    time = null,
    options,
    twilight = { civil: true, nautical: true, astronomical: true },
    hourCycle = '24',
    palette = LIGHT_PALETTE,
    showEventLabels = true,
    touchScroll = false,
    onpick,
    onpicktime,
    draggable = true,
    pauseWhileDragging = true,
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
      altitudeCurve(s, s.day.start, s.day.end, 5 * 60_000).map((pt) => ({ m: (pt.time - s.day.start) / 60_000, alt: pt.altitude })),
    ),
  );

  const extent = $derived.by<Domain>(() => {
    let lo = -20;
    let hi = 20;
    for (const c of curves) for (const pt of c) (lo = Math.min(lo, pt.alt)), (hi = Math.max(hi, pt.alt));
    const pad = 6;
    return { x: [0, series[0]?.day.lengthMin ?? 1440], y: [Math.max(-90, Math.floor((lo - pad) / 10) * 10), Math.min(90, Math.ceil((hi + pad) / 10) * 10)] };
  });
  let view = $state<Domain>({ x: [0, 1440], y: [-30, 70] });

  let lastPick = NaN;

  /** Report the instant at elapsed minute x of the primary place's day. */
  function pickAt(x: number) {
    const s = series[0];
    if (!s) return;
    const t = s.day.start + Math.round(Math.max(0, Math.min(s.day.lengthMin - 1, x))) * 60_000;
    if (t === lastPick) return;
    lastPick = t;
    onpicktime?.(t);
    onpick?.(minutesOfDay(t, s.day.date, s.scale));
  }

  function hitTest(px: number, py: number, pointerType: string): string | null {
    const s = series[0];
    if (!draggable || !s || time == null || time < s.day.start || time >= s.day.end || (!onpick && !onpicktime)) return null;
    const p = plot();
    if (py < p.top || py > p.top + p.height) return null;
    const x = p.left + (((time - s.day.start) / 60_000 - view.x[0]) / (view.x[1] - view.x[0])) * p.width;
    const alt = sunAltitude(time, s.lat, s.lon);
    const y = p.top + (1 - (alt - view.y[0]) / (view.y[1] - view.y[0])) * p.height;
    const touch = pointerType !== 'mouse';
    if (Math.hypot(px - x, py - y) <= (touch ? 24 : 12)) return 'sun';
    return Math.abs(px - x) <= (touch ? 14 : 5) ? 'line' : null;
  }

  export function resetZoom() {
    zoom?.reset();
  }
  export function zoomIn() {
    zoom?.zoomBy(0.6, 1);
  }
  export function zoomOut() {
    zoom?.zoomBy(1 / 0.6, 1);
  }
  export function isZoomed() {
    return zoom?.zoomed ?? false;
  }

  onMount(() => {
    zoom = new ChartZoom(canvas, {
      extent: $state.snapshot(extent) as Domain,
      minSpan: { x: 30, y: 5 },
      plot,
      touchScroll: untrack(() => touchScroll),
      onChange: (v) => (view = { x: [...v.x], y: [...v.y] }),
      onTap: pickAt,
      hitTest,
      onDragStart: () => {
        lastPick = NaN;
        if (pauseWhileDragging) app.beginScrub();
      },
      onDrag: (_handle, x) => pickAt(x),
      onDragEnd: () => {
        if (pauseWhileDragging) app.endScrub();
      },
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
    zoom?.setTouchScroll(touchScroll);
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
    const primary = series[0];
    const { ticks, jumps } = primary ? clockTicks(primary, xStep, view.x[0], view.x[1]) : { ticks: [], jumps: [] };
    for (const t of ticks) {
      ctx.beginPath();
      ctx.moveTo(Math.round(X(t.x)) + 0.5, p.top);
      ctx.lineTo(Math.round(X(t.x)) + 0.5, p.top + p.height);
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
        c.forEach((pt, i) => (i ? ctx.lineTo(X(pt.m), Y(pt.alt)) : ctx.moveTo(X(pt.m), Y(pt.alt))));
        ctx.stroke();
      }
    }

    // Where the clocks change (DST): a dashed line and how far they jump.
    ctx.font = pal.font;
    for (const j of jumps) {
      const x = Math.round(X(j.x)) + 0.5;
      ctx.strokeStyle = pal.text;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, p.top);
      ctx.lineTo(x, p.top + p.height);
      ctx.stroke();
      ctx.setLineDash([]);
      const h = Math.round(j.shift / 60);
      ctx.fillStyle = pal.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`Clocks ${h > 0 ? '+' : '−'}${Math.abs(h)} h`, x + 4, p.top + 4);
    }

    // Sunrise / sunset labels for the primary place.
    if (primary && showEventLabels) {
      ctx.fillStyle = pal.text;
      ctx.textBaseline = 'bottom';
      for (const e of [primary.day.sunrise, primary.day.sunset]) {
        if (!e) continue;
        const x = X((e.time - primary.day.start) / 60_000);
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
      const x = X((time - primary.day.start) / 60_000);
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
    let lastRight = -Infinity;
    for (const t of ticks) {
      const label = t.m >= 1440 ? (hourCycle === '12' ? '12 AM' : '24:00') : formatMinutes(t.m, hourCycle).replace(':00 ', ' ');
      const w = ctx.measureText(label).width;
      // Around a DST change two ticks can sit close together; skip overlapping labels.
      if (X(t.x) - w / 2 < lastRight + 4) continue;
      ctx.fillText(label, X(t.x), p.top + p.height + 6);
      lastRight = X(t.x) + w / 2;
    }
  }

  /**
   * Positions (elapsed minutes) where the series' clock shows a multiple of
   * `stepMin`, plus the places where the clock jumps. Works for any time scale,
   * including sundial time whose offset drifts slowly through the day.
   */
  function clockTicks(s: DaySeries, stepMin: number, x0: number, x1: number) {
    const ticks: { x: number; m: number }[] = [];
    const jumps: { x: number; shift: number }[] = [];
    const length = s.day.lengthMin;
    const clock = (e: number) => (e <= 0 ? 0 : e >= length ? 1440 : minutesOfDay(s.day.start + e * 60_000, s.day.date, s.scale));
    const from = Math.max(0, Math.floor(x0 / 5) * 5);
    const to = Math.min(length, Math.ceil(x1 / 5) * 5);
    if (from === 0) ticks.push({ x: 0, m: 0 });
    let e0 = from;
    let m0 = clock(e0);
    while (e0 < to) {
      const e1 = Math.min(e0 + 5, to);
      const m1 = clock(e1);
      const dm = m1 - m0;
      if (Math.abs(dm - (e1 - e0)) > 1) {
        // The clock jumped (DST): no interpolation across it.
        jumps.push({ x: e1, shift: dm - (e1 - e0) });
        if (Math.abs(m1 / stepMin - Math.round(m1 / stepMin)) < 1e-6) ticks.push({ x: e1, m: m1 });
      } else {
        for (let k = Math.floor(m0 / stepMin) + 1; k * stepMin <= m1 + 1e-9; k++) {
          ticks.push({ x: e0 + ((k * stepMin - m0) * (e1 - e0)) / dm, m: k * stepMin });
        }
      }
      e0 = e1;
      m0 = m1;
    }
    return { ticks, jumps };
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
