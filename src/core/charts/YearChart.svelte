<!--
  Year at a glance: one column per day.
  - mode "bands": the day split into night / twilights / daylight (time of day
    on the vertical axis); compared places appear as sunrise/sunset lines.
  - mode "daylength": hours of daylight per day, one curve per place.
  - mode "change": minutes of daylight gained or lost since the day before,
    split into the morning part (sunrise earlier/later) and the evening part
    (sunset later/earlier) for the primary place; totals for compared places.
  - `annotations`: labelled marks along the top (see core/state/seasons.ts).
  Zoom: wheel or horizontal pinch = dates, Shift+wheel or vertical pinch = hours,
  drag to pan, double-click/double-tap to reset, click/tap to pick a day.
  Dragging: the sun dot moves date and time together (Shift locks to one axis);
  the selected-day line moves only the date. Both report through `onpick`.
  While zoomed, the view follows the selected day when it leaves the view.
-->
<script lang="ts" module>
  export interface YearSeries {
    id: string;
    name: string;
    color: string;
    days: import('../astro/daylight').DayLight[];
    /** The day before the first one (Dec 31 of the year before), for the change on Jan 1. */
    previous?: import('../astro/daylight').DayLight;
  }

  export interface YearAnnotation {
    /** Day index in the year. */
    index: number;
    label: string;
    /** Shorter label used when the long one doesn't fit. */
    short: string;
    /** season: drawn as dashes in both modes; clock: dotted, bands mode only. */
    kind: 'season' | 'clock';
  }
</script>

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app } from '../state/app.svelte';
  import { daylightChange, Light, type DaylightChange } from '../astro/daylight';
  import type { ChartMode } from '../state/settings.svelte';
  import { formatMinutes, formatDuration, type HourCycle } from '../time/format';
  import { ChartZoom, type Domain } from './zoom';
  import { LIGHT_PALETTE, visibleLevel, type ChartPalette } from './palette';

  interface Props {
    /** First series is the primary place (drawn as bands). */
    series: YearSeries[];
    year: number;
    mode?: ChartMode;
    /** Index of the selected day in `days`. */
    selectedIndex?: number | null;
    /** Current time of day (minutes) for the marker dot in bands mode. */
    currentMinutes?: number | null;
    twilight?: { civil: boolean; nautical: boolean; astronomical: boolean };
    hourCycle?: HourCycle;
    palette?: ChartPalette;
    /** Dashed solar-noon line for the primary place. */
    showNoon?: boolean;
    /** Show compared places' sunrise/sunset lines in bands mode. */
    showCompare?: boolean;
    /** Midnight at the top (true) or bottom. */
    midnightTop?: boolean;
    /** Labelled marks along the top edge. */
    annotations?: YearAnnotation[];
    /** One-finger vertical swipes scroll the page (for charts in scrolling layouts). */
    touchScroll?: boolean;
    /** Tap, or each step of dragging the sun / selected-day line. */
    onpick?: (dayIndex: number, minutes: number) => void;
    /** Let the sun dot and selected-day line be dragged. */
    draggable?: boolean;
    /** Pause the simulation while dragging (resumes afterwards). */
    pauseWhileDragging?: boolean;
    onhover?: (info: { dayIndex: number; minutes: number } | null) => void;
    onviewchange?: (zoomed: { x: boolean; y: boolean }) => void;
  }

  let {
    annotations = [],
    touchScroll = false,
    onviewchange,
    series,
    year,
    mode = 'bands',
    selectedIndex = null,
    currentMinutes = null,
    twilight = { civil: true, nautical: true, astronomical: true },
    hourCycle = '24',
    palette = LIGHT_PALETTE,
    showNoon = true,
    showCompare = true,
    midnightTop = true,
    onpick,
    onhover,
    draggable = true,
    pauseWhileDragging = true,
  }: Props = $props();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);
  let hover = $state<{ x: number; y: number } | null>(null);
  let zoom: ChartZoom | null = null;

  const dayCount = $derived(series[0]?.days.length ?? 365);

  /** Day-to-day change per series and day (null for Jan 1 without `previous`). */
  const changes = $derived(
    mode === 'change'
      ? series.map((s) =>
          s.days.map((d, i) => {
            const prev = i > 0 ? s.days[i - 1] : s.previous;
            return prev ? daylightChange(prev, d) : null;
          }),
        )
      : [],
  );

  /** Symmetric vertical range for the change chart, minutes per day. */
  const changeLimit = $derived.by(() => {
    if (mode !== 'change') return 0;
    // Near the polar circles a few days around the start and end of polar day or
    // night jump by tens of minutes; scale to the bulk of each year (97th
    // percentile) so those spikes run off the chart instead of flattening the rest.
    let v = 0;
    for (const list of changes) {
      const values: number[] = [];
      for (const c of list) {
        if (!c) continue;
        values.push(Math.abs(c.total));
        if (c.morning != null && c.evening != null) values.push(Math.abs(c.morning), Math.abs(c.evening));
      }
      values.sort((a, b) => a - b);
      v = Math.max(v, values[Math.floor((values.length - 1) * 0.97)] ?? 0);
    }
    v *= 1.12;
    for (const step of [0.5, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 720, 1440]) if (step >= v) return step;
    return 1440;
  });

  const extent = $derived<Domain>({ x: [0, dayCount], y: mode === 'change' ? [-changeLimit, changeLimit] : [0, 1440] });
  const minSpanY = $derived(mode === 'change' ? changeLimit / 10 : 60);
  let view = $state<Domain>({ x: [0, 365], y: [0, 1440] });

  // --- Dragging the sun / selected day ------------------------------------------

  let dragStart = { x: 0, y: 0 };
  let lastPick = '';

  /** Data coordinates to element pixels (same mapping as draw()). */
  function toPx(dx: number, dy: number) {
    const p = plot();
    const fy = (dy - view.y[0]) / (view.y[1] - view.y[0]);
    return {
      x: p.left + ((dx - view.x[0]) / (view.x[1] - view.x[0])) * p.width,
      y: yDown ? p.top + fy * p.height : p.top + (1 - fy) * p.height,
    };
  }

  function hitTest(px: number, py: number, pointerType: string): string | null {
    if (!draggable || selectedIndex == null || !onpick) return null;
    const touch = pointerType !== 'mouse';
    const p = plot();
    if (py < p.top || py > p.top + p.height) return null;
    const cx = toPx(selectedIndex + 0.5, 0).x;
    if (mode === 'bands' && currentMinutes != null) {
      const sun = toPx(selectedIndex + 0.5, currentMinutes);
      if (Math.hypot(px - sun.x, py - sun.y) <= (touch ? 24 : 11)) return 'sun';
    }
    return Math.abs(px - cx) <= (touch ? 14 : 5) ? 'day' : null;
  }

  function dragTo(handle: string, x: number, y: number, e: PointerEvent) {
    let dx = x;
    let dy = handle === 'sun' ? y : dragStart.y;
    if (handle === 'sun' && e.shiftKey) {
      // Lock to the axis the pointer has moved along most.
      const a = toPx(x, y);
      const b = toPx(dragStart.x, dragStart.y);
      if (Math.abs(a.x - b.x) > Math.abs(a.y - b.y)) dy = dragStart.y;
      else dx = dragStart.x;
    }
    const i = Math.max(0, Math.min(dayCount - 1, Math.floor(dx)));
    const m = Math.max(0, Math.min(1439.99, dy));
    const key = `${i}|${m.toFixed(1)}`;
    if (key === lastPick) return;
    lastPick = key;
    onpick?.(i, m);
  }

  // Extra room at the top for annotation labels, when there are any.
  const margin = $derived({ left: mode === 'change' ? 56 : 44, right: 10, top: annotations.length ? 24 : 10, bottom: 24 });
  const plot = () => ({
    left: margin.left,
    top: margin.top,
    width: Math.max(1, width - margin.left - margin.right),
    height: Math.max(1, height - margin.top - margin.bottom),
  });
  const yDown = $derived(mode === 'bands' && midnightTop);

  export function resetZoom() {
    zoom?.reset();
  }
  export function zoomIn() {
    zoom?.zoomBy(0.6, 1, selectedIndex != null ? selectedIndex + 0.5 : undefined);
  }
  export function zoomOut() {
    zoom?.zoomBy(1 / 0.6, 1);
  }
  export function zoomTimeIn() {
    zoom?.zoomBy(1, 0.6);
  }
  export function zoomTimeOut() {
    zoom?.zoomBy(1, 1 / 0.6);
  }
  export function isZoomed() {
    return zoom?.zoomed ?? false;
  }

  onMount(() => {
    zoom = new ChartZoom(canvas, {
      extent: $state.snapshot(extent),
      minSpan: { x: 7, y: untrack(() => minSpanY) },
      plot,
      touchScroll: untrack(() => touchScroll),
      yDown: yDown,
      onChange: (v) => {
        view = { x: [...v.x], y: [...v.y] };
        reportZoom();
      },
      onTap: (x, y) => onpick?.(Math.max(0, Math.min(dayCount - 1, Math.floor(x))), y),
      hitTest,
      onDragStart: () => {
        dragStart = { x: (selectedIndex ?? 0) + 0.5, y: currentMinutes ?? 0 };
        lastPick = '';
        if (pauseWhileDragging) app.beginScrub();
      },
      onDrag: dragTo,
      onDragEnd: () => {
        if (pauseWhileDragging) app.endScrub();
      },
      onHover: (x, y) => {
        hover = { x, y };
        onhover?.({ dayIndex: Math.floor(x), minutes: y });
      },
      onLeave: () => {
        hover = null;
        onhover?.(null);
      },
    });
    view = structuredClone($state.snapshot(extent));
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

  // New year length or mode: keep the date zoom; a mode change resets the vertical axis,
  // and so does a new range in the change chart (another place, another year).
  let lastMode: string | null = null;
  let lastY = '';
  $effect(() => {
    const e = $state.snapshot(extent) as Domain;
    const down = yDown;
    const m = mode;
    untrack(() => {
      if (!zoom) return;
      zoom.setYDown(down);
      zoom.setMinSpan({ x: 7, y: minSpanY });
      zoom.setExtent(e, true);
      const y = e.y.join();
      if ((lastMode !== null && m !== lastMode) || (m === 'change' && y !== lastY)) zoom.resetY();
      lastMode = m;
      lastY = y;
    });
  });

  let lastZoom = '';
  function reportZoom() {
    const e = extent;
    const z = { x: view.x[0] > e.x[0] || view.x[1] < e.x[1], y: view.y[0] > e.y[0] || view.y[1] < e.y[1] };
    const key = `${z.x}${z.y}`;
    if (key !== lastZoom) {
      lastZoom = key;
      onviewchange?.(z);
    }
  }

  // Keep the selected day in sight while zoomed, e.g. while the simulation runs.
  $effect(() => {
    const i = selectedIndex;
    untrack(() => {
      if (i == null || !zoom || !zoom.zoomed) return;
      if (i < view.x[0] || i + 1 > view.x[1]) zoom.panTo(i + 0.5);
    });
  });

  $effect(() => {
    zoom?.setTouchScroll(touchScroll);
  });

  $effect(() => {
    draw(series, mode, view, width, height, selectedIndex, currentMinutes, twilight, hourCycle, palette, hover, showNoon, showCompare, yDown, annotations, changes);
  });

  function draw(
    series: YearSeries[],
    mode: ChartMode,
    view: Domain,
    width: number,
    height: number,
    selectedIndex: number | null,
    currentMinutes: number | null,
    twilight: { civil: boolean; nautical: boolean; astronomical: boolean },
    hourCycle: HourCycle,
    pal: ChartPalette,
    hover: { x: number; y: number } | null,
    showNoon: boolean,
    showCompare: boolean,
    yDown: boolean,
    annotations: YearAnnotation[],
    changes: (DaylightChange | null)[][],
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
    const X = (d: number) => p.left + ((d - view.x[0]) / (view.x[1] - view.x[0])) * p.width;
    const Y = (m: number) => {
      const f = (m - view.y[0]) / (view.y[1] - view.y[0]);
      return yDown ? p.top + f * p.height : p.top + (1 - f) * p.height;
    };

    ctx.fillStyle = pal.background;
    ctx.fillRect(p.left, p.top, p.width, p.height);

    const primary = series[0];
    const first = Math.max(0, Math.floor(view.x[0]));
    const last = Math.min((primary?.days.length ?? 0) - 1, Math.ceil(view.x[1]));

    ctx.save();
    ctx.beginPath();
    ctx.rect(p.left, p.top, p.width, p.height);
    ctx.clip();

    if (primary && mode === 'bands') {
      for (let i = first; i <= last; i++) {
        const day = primary.days[i];
        const x0 = Math.floor(X(i));
        const x1 = Math.ceil(X(i + 1));
        for (const seg of day.segments) {
          const ya = Y(seg.startMin);
          const yb = Y(seg.endMin);
          ctx.fillStyle = pal.light[visibleLevel(seg.light, twilight)];
          ctx.fillRect(x0, Math.min(ya, yb), Math.max(1, x1 - x0), Math.abs(yb - ya) + 0.5);
        }
      }
    }

    if (primary && mode === 'daylength') {
      // Areas for the primary place: daylight and daylight + civil twilight.
      const area = (value: (i: number) => number, color: string) => {
        ctx.beginPath();
        ctx.moveTo(X(first), Y(0));
        for (let i = first; i <= last; i++) {
          ctx.lineTo(X(i), Y(value(i)));
          ctx.lineTo(X(i + 1), Y(value(i)));
        }
        ctx.lineTo(X(last + 1), Y(0));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };
      const minutesAt = (i: number, levels: Light[]) => {
        const d = primary.days[i];
        const total = levels.reduce((s, l) => s + d.durations[l], 0);
        return total;
      };
      ctx.globalAlpha = 0.55;
      if (twilight.civil) area((i) => minutesAt(i, [Light.Day, Light.Civil]), pal.light[Light.Civil]);
      ctx.globalAlpha = 0.8;
      area((i) => minutesAt(i, [Light.Day]), pal.light[Light.Day]);
      ctx.globalAlpha = 1;
    }

    if (primary && mode === 'change') {
      // Area between zero and the total change: daylight colour above (gains), twilight below (losses).
      const list = changes[0] ?? [];
      const y0 = Y(0);
      const from = Math.max(0, first - 1);
      const to = Math.min(list.length - 1, last + 1);
      const area = new Path2D();
      area.moveTo(X(from + 0.5), y0);
      for (let i = from; i <= to; i++) area.lineTo(X(i + 0.5), Y(list[i]?.total ?? 0));
      area.lineTo(X(to + 0.5), y0);
      area.closePath();
      ctx.globalAlpha = 0.5;
      for (const [top, bottom, color] of [
        [p.top, y0, pal.light[Light.Day]],
        [y0, p.top + p.height, pal.light[Light.Civil]],
      ] as const) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(p.left, Math.min(top, bottom), p.width, Math.abs(bottom - top));
        ctx.clip();
        ctx.fillStyle = color;
        ctx.fill(area);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // Grid.
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.grid;
    const yStep = mode === 'change' ? changeStep(view.y[1] - view.y[0], p.height) : timeStep(view.y[1] - view.y[0], p.height);
    for (let m = Math.ceil(view.y[0] / yStep) * yStep; m <= view.y[1]; m += yStep) {
      const y = Math.round(Y(m)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(p.left, y);
      ctx.lineTo(p.left + p.width, y);
      ctx.stroke();
    }
    const xTicks = dateTicks(year, view, p.width);
    for (const t of xTicks) {
      const x = Math.round(X(t.index)) + 0.5;
      ctx.strokeStyle = t.major ? pal.axis : pal.grid;
      ctx.beginPath();
      ctx.moveTo(x, p.top);
      ctx.lineTo(x, p.top + p.height);
      ctx.stroke();
    }

    // Annotation rules: seasons as fine dashes, clock changes as dots (bands mode only).
    const marks = annotations.filter((a) => a.kind === 'season' || mode === 'bands');
    for (const a of marks) {
      const x = Math.round(X(a.index + 0.5)) + 0.5;
      ctx.strokeStyle = pal.text;
      ctx.globalAlpha = a.kind === 'season' ? 0.55 : 0.7;
      ctx.setLineDash(a.kind === 'season' ? [4, 3] : [1, 3]);
      ctx.beginPath();
      ctx.moveTo(x, p.top);
      ctx.lineTo(x, p.top + p.height);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Lines: solar noon, compared places, day length curves.
    const curve = (
      days: YearSeries['days'],
      value: (d: YearSeries['days'][number], i: number) => number | null,
      color: string,
      lw: number,
      dash: number[] = [],
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let pen = false;
      let prev: number | null = null;
      for (let i = Math.max(0, first - 1); i <= Math.min(days.length - 1, last + 1); i++) {
        const v = value(days[i], i);
        // Break the line at gaps and at jumps (DST, wrap past midnight).
        if (v == null || (prev != null && Math.abs(v - prev) > 45)) {
          pen = false;
        }
        if (v != null) {
          const x = X(i + 0.5);
          const y = Y(v);
          if (pen) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
          pen = true;
        }
        prev = v;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    if (mode === 'bands') {
      if (primary && showNoon) curve(primary.days, (d) => d.solarNoon.minutes, pal.axis, 1, [3, 3]);
      if (showCompare) {
        for (const s of series.slice(1)) {
          // Outline so lines stay visible on both daylight and night fills.
          for (const [color, lw] of [[pal.background, 4], [s.color, 2]] as const) {
            curve(s.days, (d) => d.sunrise?.minutes ?? null, color, lw);
            curve(s.days, (d) => d.sunset?.minutes ?? null, color, lw);
          }
        }
      }
    } else if (mode === 'daylength') {
      for (const s of [...series].reverse()) {
        const isPrimary = s === primary;
        for (const [color, lw] of [[pal.background, isPrimary ? 5 : 4], [s.color, isPrimary ? 2.5 : 2]] as const) {
          curve(s.days, (d) => d.daylightMin, color, lw);
        }
      }
    } else {
      // Zero line, then morning and evening parts of the primary place, then totals on top.
      ctx.strokeStyle = pal.axis;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.left, Math.round(Y(0)) + 0.5);
      ctx.lineTo(p.left + p.width, Math.round(Y(0)) + 0.5);
      ctx.stroke();
      if (primary) {
        const list = changes[0] ?? [];
        ctx.lineCap = 'round';
        curve(primary.days, (_, i) => list[i]?.morning ?? null, pal.morning ?? pal.text, 1.75, MORNING_DASH);
        curve(primary.days, (_, i) => list[i]?.evening ?? null, pal.evening ?? pal.text, 2, EVENING_DASH);
        ctx.lineCap = 'butt';
      }
      series.forEach((s, k) => {
        if (k > 0 && !showCompare) return;
        const list = changes[k] ?? [];
        for (const [color, lw] of [[pal.background, k === 0 ? 5 : 4], [s.color, k === 0 ? 2.5 : 2]] as const) curve(s.days, (_, i) => list[i]?.total ?? null, color, lw);
      });
    }

    // Selected day and current time.
    if (selectedIndex != null && selectedIndex >= first - 1 && selectedIndex <= last + 1) {
      const xa = X(selectedIndex);
      const xb = X(selectedIndex + 1);
      ctx.strokeStyle = pal.marker;
      ctx.lineWidth = 1.5;
      if (xb - xa > 4) {
        ctx.strokeRect(xa + 0.75, p.top + 0.75, xb - xa - 1.5, p.height - 1.5);
      } else {
        const x = Math.round((xa + xb) / 2) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, p.top);
        ctx.lineTo(x, p.top + p.height);
        ctx.stroke();
      }
      const changeAt = mode === 'change' ? changes[0]?.[selectedIndex]?.total : undefined;
      if (changeAt != null) {
        ctx.fillStyle = pal.marker;
        ctx.strokeStyle = pal.background;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc((xa + xb) / 2, Y(changeAt), 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (mode === 'bands' && currentMinutes != null) {
        ctx.fillStyle = pal.marker;
        ctx.strokeStyle = pal.background;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc((xa + xb) / 2, Y(currentMinutes), 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Hover crosshair.
    if (hover) {
      ctx.strokeStyle = pal.text;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(X(Math.floor(hover.x) + 0.5), p.top);
      ctx.lineTo(X(Math.floor(hover.x) + 0.5), p.top + p.height);
      ctx.moveTo(p.left, Y(hover.y));
      ctx.lineTo(p.left + p.width, Y(hover.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    if (mode === 'change' && primary) drawChangeLegend(ctx, p, pal, primary.color);
    ctx.restore();

    // Annotation labels in the top margin, longest form that fits, never overlapping.
    ctx.font = pal.font;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';
    const placed: [number, number][] = [];
    const sorted = [...marks].sort((a, b) => (a.kind === b.kind ? a.index - b.index : a.kind === 'season' ? -1 : 1));
    for (const a of sorted) {
      const cx = X(a.index + 0.5);
      if (cx < p.left - 1 || cx > p.left + p.width + 1) continue;
      for (const text of [a.label, a.short]) {
        const w = ctx.measureText(text).width;
        const l = Math.max(p.left, Math.min(cx - w / 2, p.left + p.width - w));
        if (placed.some(([pl, pr]) => l < pr + 6 && l + w > pl - 6)) continue;
        ctx.fillStyle = pal.text;
        ctx.textAlign = 'left';
        ctx.fillText(text, l, p.top - 6);
        placed.push([l, l + w]);
        break;
      }
    }

    // Axes labels.
    ctx.font = pal.font;
    ctx.fillStyle = pal.text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let m = Math.ceil(view.y[0] / yStep - 1e-9) * yStep; m <= view.y[1] + 0.01; m += yStep) {
      if (mode === 'change') {
        ctx.fillText(formatChangeTick(m, yStep), p.left - 6, Y(m));
        continue;
      }
      const label = mode === 'bands' ? (m >= 1440 ? formatMinutes(0, hourCycle).replace(/^0?0/, '24') : formatMinutes(m, hourCycle)) : m % 60 === 0 ? `${m / 60} h` : formatDuration(m);
      ctx.fillText(hourCycle === '12' && mode === 'bands' ? label.replace(':00 ', ' ') : label, p.left - 6, Y(m));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let lastRight = -Infinity;
    for (const t of xTicks) {
      if (!t.label) continue;
      const cx = t.centerLabel ? X(t.index + t.span / 2) : X(t.index);
      if (cx < p.left - 2 || cx > p.left + p.width + 2) continue;
      const w = ctx.measureText(t.label).width;
      if (cx - w / 2 < lastRight + 4) continue;
      ctx.fillText(t.label, cx, p.top + p.height + 6);
      lastRight = cx + w / 2;
    }
  }

  // Morning and evening parts are told apart by line style (place colours use up the hues);
  // palettes may also give them colours.
  const MORNING_DASH = [7, 4];
  const EVENING_DASH = [0.5, 4];

  function drawChangeLegend(ctx: CanvasRenderingContext2D, p: { left: number; top: number; width: number }, pal: ChartPalette, totalColor: string) {
    ctx.font = pal.font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    // Long labels when they fit, short ones on narrow charts.
    const layout = (labels: string[]) => {
      const widths = labels.map((t) => ctx.measureText(t).width + 30);
      return { labels, widths, w: widths.reduce((a, b) => a + b, 0) + 8 };
    };
    let fit = layout(['Total', 'Morning (sunrise)', 'Evening (sunset)']);
    if (fit.w > p.width - 12) fit = layout(['Total', 'Morning', 'Evening']);
    const { widths, w } = fit;
    const items: [string, string, number[], number][] = [
      [totalColor, fit.labels[0], [], 2.5],
      [pal.morning ?? pal.text, fit.labels[1], MORNING_DASH, 1.75],
      [pal.evening ?? pal.text, fit.labels[2], EVENING_DASH, 2],
    ];
    const x = p.left + 6;
    const y = p.top + 6;
    ctx.fillStyle = pal.background;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y, w, 18);
    ctx.globalAlpha = 1;
    let cx = x + 6;
    ctx.lineCap = 'round';
    items.forEach(([color, text, dash, lw], i) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(cx, y + 9);
      ctx.lineTo(cx + 20, y + 9);
      ctx.stroke();
      ctx.fillStyle = pal.text;
      ctx.fillText(text, cx + 24, y + 9.5);
      cx += widths[i];
    });
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
  }

  /** Grid step for the change chart, minutes (from a few seconds up). */
  function changeStep(span: number, px: number): number {
    const target = span / Math.max(2, px / 32);
    for (const s of [1 / 12, 1 / 6, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 240, 480]) if (s >= target) return s;
    return 480;
  }

  /** "+2 min", "−30 s", "0". */
  function formatChangeTick(m: number, step: number): string {
    if (Math.abs(m) < step / 100) return '0';
    const sign = m > 0 ? '+' : '−';
    const a = Math.abs(m);
    if (step < 1) return `${sign}${Math.round(a * 60)} s`;
    return a >= 60 && a % 60 === 0 ? `${sign}${a / 60} h` : `${sign}${Math.round(a)} min`;
  }

  /** Grid step in minutes for a visible span. */
  function timeStep(span: number, px: number): number {
    const target = span / Math.max(2, px / 36);
    for (const s of [5, 10, 15, 30, 60, 120, 180, 240, 360]) if (s >= target) return s;
    return 360;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function dateTicks(year: number, view: Domain, px: number) {
    const ticks: { index: number; label: string; major: boolean; centerLabel: boolean; span: number }[] = [];
    const span = view.x[1] - view.x[0];
    const pxPerDay = px / span;
    const start = Date.UTC(year, 0, 1);
    const indexOf = (m: number, d: number) => Math.round((Date.UTC(year, m, d) - start) / 86_400_000);
    if (pxPerDay < 6) {
      for (let m = 0; m < 12; m++) {
        const i = indexOf(m, 1);
        const len = indexOf(m + 1, 1) - i;
        ticks.push({ index: i, label: pxPerDay * len > 22 ? MONTHS[m] : MONTHS[m][0], major: m === 0, centerLabel: true, span: len });
      }
    } else {
      const step = pxPerDay > 30 ? 1 : pxPerDay > 14 ? 2 : 7;
      for (let i = Math.max(0, Math.floor(view.x[0])); i <= Math.ceil(view.x[1]); i++) {
        const d = new Date(start + i * 86_400_000);
        const dom = d.getUTCDate();
        const isMonth = dom === 1;
        const show = step === 7 ? d.getUTCDay() === 1 || isMonth : (dom - 1) % step === 0;
        if (!show && !isMonth) continue;
        ticks.push({
          index: i,
          label: isMonth ? `${MONTHS[d.getUTCMonth()]}` : show ? String(dom) : '',
          major: isMonth,
          centerLabel: false,
          span: 1,
        });
      }
    }
    return ticks;
  }
</script>

<div class="year-chart" bind:this={container}>
  <canvas bind:this={canvas} style="width: {width}px; height: {height}px"></canvas>
</div>

<style>
  .year-chart {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 160px;
    overflow: hidden;
  }
  canvas {
    position: absolute;
    inset: 0;
    display: block;
    cursor: crosshair;
  }
</style>
