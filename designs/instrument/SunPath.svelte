<!--
  Sun-path compass: a polar plot of the sun's azimuth (angle, north up, east
  right as on a map) and altitude (zenith in the centre, horizon on the solid
  ring) across the selected day, with the twilight zones outside the horizon,
  solstice/equinox reference paths and the sun's current position.
-->
<script lang="ts">
  import { altitudeCurve, horizonAltitude, Light, LIGHT_NAMES, lightLevel, TWILIGHT_ALTITUDES } from '$core/astro/daylight';
  import { sunPosition } from '$core/astro/sun';
  import { visibleLevel } from '$core/charts/palette';
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { selectedDayIndex } from '$core/state/views';
  import { compassPoint, formatMinutes } from '$core/time/format';
  import { dayBounds, minutesOfDay, type CivilDate } from '$core/time/timescale';
  import { deg } from './lib';

  const R = 92;
  const MIN_ALT = -18;
  const STEP = 5 * 60_000;

  const place = $derived(app.selected);
  // app.date keeps its identity within a day, so the paths only rebuild when the date changes.
  const date = $derived(app.date);
  const horizon = $derived(horizonAltitude(app.daylightOptions));

  function rad(alt: number): number {
    return ((90 - Math.max(alt, MIN_ALT)) / 90) * R;
  }
  function xy(alt: number, az: number): [number, number] {
    const r = rad(alt);
    const a = (az * Math.PI) / 180;
    return [r * Math.sin(a), -r * Math.cos(a)];
  }
  const f = (n: number) => n.toFixed(1);

  interface Path {
    above: string;
    below: string;
    hours: { x: number; y: number; lx: number; ly: number; label: string | null }[];
    peak: { x: number; y: number } | null;
  }

  function buildPath(d: CivilDate, withHours: boolean): Path {
    const out: Path = { above: '', below: '', hours: [], peak: null };
    if (!place) return out;
    const scale = app.scale;
    const { start, end } = dayBounds(d, scale);
    const pts = altitudeCurve(place, start, end, STEP);
    let prevKind: 'above' | 'below' | null = null;
    let prev: [number, number] | null = null;
    let peakAlt = -Infinity;
    for (const pt of pts) {
      const kind = pt.altitude >= horizon ? 'above' : pt.altitude > MIN_ALT ? 'below' : null;
      const p = xy(pt.altitude, pt.azimuth);
      if (kind) {
        // Start each run at the previous point so above/below join without a gap.
        const startAt = kind !== prevKind ? (prevKind && prev ? prev : p) : null;
        if (startAt) out[kind] += `M${f(startAt[0])},${f(startAt[1])}`;
        out[kind] += `L${f(p[0])},${f(p[1])}`;
      }
      if (pt.altitude > peakAlt && pt.altitude > horizon) {
        peakAlt = pt.altitude;
        out.peak = { x: p[0], y: p[1] };
      }
      if (withHours && pt.altitude > MIN_ALT) {
        const m = Math.round(minutesOfDay(pt.time, d, scale));
        if (m % 60 === 0 && m < 1440) {
          const h = m / 60;
          const r = Math.hypot(p[0], p[1]) || 1;
          const off = r < 12 ? 0 : 10;
          out.hours.push({
            x: p[0],
            y: p[1],
            lx: p[0] + (p[0] / r) * off,
            ly: p[1] + (p[1] / r) * off + (r < 12 ? -8 : 0),
            label: h % 3 === 0 && pt.altitude > MIN_ALT + 4 ? hourLabel(h) : null,
          });
        }
      }
      prevKind = kind;
      prev = p;
    }
    return out;
  }

  function hourLabel(h: number): string {
    if (settings.hourCycle === '12') return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
    return String(h).padStart(2, '0');
  }

  const today = $derived(buildPath(date, true));
  const refs = $derived(
    [
      { label: 'Jun 21', path: buildPath({ year: date.year, month: 6, day: 21 }, false) },
      { label: 'Mar 20', path: buildPath({ year: date.year, month: 3, day: 20 }, false) },
      { label: 'Dec 21', path: buildPath({ year: date.year, month: 12, day: 21 }, false) },
    ].filter((r) => r.path.above),
  );

  const day = $derived(place ? (app.yearFor(place)[selectedDayIndex()] ?? app.dayFor(place)) : null);
  const sun = $derived(place ? sunPosition(app.time, place.lat, place.lon) : null);
  const sunXY = $derived(sun ? xy(sun.altitude, sun.azimuth) : null);
  const phase = $derived(sun ? lightLevel(sun.altitude, app.daylightOptions) : Light.Night);

  const events = $derived.by(() => {
    if (!place || !day) return [];
    return [day.sunrise, day.sunset]
      .filter((e) => e != null)
      .map((e) => {
        const az = sunPosition(e.time, place.lat, place.lon).azimuth;
        const a = (az * Math.PI) / 180;
        return {
          rising: e.rising,
          az,
          minutes: e.minutes,
          x1: (R - 5) * Math.sin(a),
          y1: -(R - 5) * Math.cos(a),
          x2: (R + 5) * Math.sin(a),
          y2: -(R + 5) * Math.cos(a),
          lx: (R - 15) * Math.sin(a),
          ly: -(R - 15) * Math.cos(a),
        };
      });
  });

  const BAND_VAR: Record<Light, string> = {
    [Light.Night]: 'var(--ph-night)',
    [Light.Astronomical]: 'var(--ph-astro)',
    [Light.Nautical]: 'var(--ph-naut)',
    [Light.Civil]: 'var(--ph-civil)',
    [Light.Day]: 'var(--ph-day)',
  };
  const bandFill = (l: Light) => BAND_VAR[visibleLevel(l, settings.twilight)];

  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  const OUT = rad(MIN_ALT);
  const shadow = $derived(sun && sun.altitude > 0.5 ? 1 / Math.tan((sun.altitude * Math.PI) / 180) : null);
</script>

<div class="sunpath">
  <div class="lay">
    {#if place}
      <svg viewBox="-130 -130 260 260" role="img" aria-label="Sun path for {place.name}: the sun is at {deg(sun?.altitude ?? 0)} altitude, azimuth {deg(sun?.azimuth ?? 0, 0)}">
        <!-- Twilight bands outside the horizon, sky inside. -->
        <circle r={OUT} fill={bandFill(Light.Astronomical)} />
        <circle r={rad(TWILIGHT_ALTITUDES.nautical)} fill={bandFill(Light.Nautical)} />
        <circle r={rad(TWILIGHT_ALTITUDES.civil)} fill={bandFill(Light.Civil)} />
        <circle r={rad(horizon)} class="sky" />

        <!-- Altitude rings. -->
        {#each [30, 60] as a (a)}
          <circle r={rad(a)} class="ring" />
          <text x="2" y={-rad(a) + 8} class="ringlbl">{a}°</text>
        {/each}
        <line x1={-R} y1="0" x2={R} y2="0" class="axis" />
        <line x1="0" y1={-R} x2="0" y2={R} class="axis" />
        <circle r={rad(horizon)} class="horizon" />

        <!-- Azimuth ticks and compass letters. -->
        {#each ticks as t (t)}
          {@const a = (t * Math.PI) / 180}
          {@const len = t % 90 === 0 ? 7 : t % 30 === 0 ? 5 : 3}
          <line x1={OUT * Math.sin(a)} y1={-OUT * Math.cos(a)} x2={(OUT + len) * Math.sin(a)} y2={-(OUT + len) * Math.cos(a)} class="tick" />
        {/each}
        <text x="0" y={-OUT - 10} class="cardinal">N</text>
        <text x={OUT + 12} y="0" class="cardinal">E</text>
        <text x="0" y={OUT + 11} class="cardinal">S</text>
        <text x={-OUT - 12} y="0" class="cardinal">W</text>

        <!-- Reference paths: solstices and equinox. -->
        {#each refs as r (r.label)}
          <path d={r.path.above} class="ref" />
          {#if r.path.peak}
            <text x={r.path.peak.x} y={r.path.peak.y - 3} class="reflbl">{r.label}</text>
          {/if}
        {/each}

        <!-- Today's path. -->
        <path d={today.below} class="below" />
        <path d={today.above} class="above" />
        {#each today.hours as h, i (i)}
          <circle cx={h.x} cy={h.y} r="1.6" class="hour" />
          {#if h.label}<text x={h.lx} y={h.ly} class="hourlbl">{h.label}</text>{/if}
        {/each}

        <!-- Sunrise / sunset bearings. -->
        {#each events as e (e.rising)}
          <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} class="event" />
          <text x={e.lx} y={e.ly} class="eventlbl">{e.rising ? '↑' : '↓'}{formatMinutes(e.minutes, settings.hourCycle)}</text>
        {/each}

        <!-- Current sun. -->
        {#if sun && sunXY}
          <line x1="0" y1="0" x2={sunXY[0]} y2={sunXY[1]} class="needle" />
          <circle cx={sunXY[0]} cy={sunXY[1]} r="6.5" class="sun" class:down={sun.altitude < horizon} />
        {/if}
      </svg>

      {#if sun}
        <dl class="read">
          <div><dt class="lbl">Altitude</dt><dd class="num">{deg(sun.altitude)}</dd></div>
          <div><dt class="lbl">Azimuth</dt><dd class="num">{deg(sun.azimuth)} <small>{compassPoint(sun.azimuth)}</small></dd></div>
          <div class="wide"><dt class="lbl">Light now</dt><dd class="phase" data-phase={phase}>{LIGHT_NAMES[phase]}</dd></div>
          {#each events as e (e.rising)}
            <div>
              <dt class="lbl">{e.rising ? 'Rise bearing' : 'Set bearing'}</dt>
              <dd class="num">{deg(e.az, 0)} <small>{compassPoint(e.az)}</small></dd>
            </div>
          {/each}
          {#if day}
            <div><dt class="lbl">Noon altitude</dt><dd class="num">{deg(day.solarNoon.altitude)}</dd></div>
          {/if}
          <div>
            <dt class="lbl" title="Length of the shadow of a 1 m stick">Shadow / 1 m</dt>
            <dd class="num">{shadow == null ? '—' : shadow > 99 ? '>99 m' : `${shadow.toFixed(2)} m`}</dd>
          </div>
        </dl>
      {/if}
    {/if}
  </div>
</div>

<style>
  .sunpath {
    container-type: inline-size;
    height: 100%;
    min-height: 0;
  }
  .lay {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    min-height: 0;
  }
  svg {
    display: block;
    width: 100%;
    flex: 1 1 auto;
    min-height: 160px;
    max-height: 340px;
    overflow: visible;
  }
  .sky {
    fill: color-mix(in srgb, var(--ph-day) 22%, var(--panel));
  }
  .ring {
    fill: none;
    stroke: var(--rule-strong);
    stroke-width: 0.6;
    stroke-dasharray: 2 2;
  }
  .ringlbl {
    font: 500 6.5px var(--mono);
    fill: var(--faint);
  }
  .axis {
    stroke: var(--rule-strong);
    stroke-width: 0.5;
    opacity: 0.7;
  }
  .horizon {
    fill: none;
    stroke: var(--ink-2);
    stroke-width: 1.2;
  }
  .tick {
    stroke: var(--muted);
    stroke-width: 0.8;
  }
  .cardinal {
    font: 600 9px var(--sans);
    letter-spacing: 0.05em;
    fill: var(--ink-2);
    text-anchor: middle;
    dominant-baseline: central;
  }
  .ref {
    fill: none;
    stroke: var(--muted);
    stroke-width: 0.8;
    stroke-dasharray: 1 2.5;
    stroke-linecap: round;
  }
  .reflbl {
    font: 500 6px var(--mono);
    fill: var(--muted);
    text-anchor: middle;
  }
  .above {
    fill: none;
    stroke: var(--sun);
    stroke-width: 2.6;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .below {
    fill: none;
    stroke: var(--screen-ink);
    stroke-width: 1.2;
    stroke-dasharray: 3 2;
    opacity: 0.85;
  }
  .hour {
    fill: var(--panel);
    stroke: var(--ink-2);
    stroke-width: 0.7;
  }
  .hourlbl {
    font: 500 6.5px var(--mono);
    fill: var(--ink-2);
    text-anchor: middle;
    dominant-baseline: central;
    paint-order: stroke;
    stroke: var(--panel);
    stroke-width: 2px;
  }
  .event {
    stroke: var(--sun);
    stroke-width: 2;
  }
  .eventlbl {
    font: 600 6.5px var(--mono);
    fill: var(--ink);
    text-anchor: middle;
    dominant-baseline: central;
    paint-order: stroke;
    stroke: color-mix(in srgb, var(--ph-day) 22%, var(--panel));
    stroke-width: 2px;
  }
  .needle {
    stroke: var(--cursor);
    stroke-width: 1;
    stroke-dasharray: 2 1.5;
  }
  .sun {
    fill: #ffd34d;
    stroke: var(--cursor);
    stroke-width: 2;
  }
  .sun.down {
    fill: var(--panel);
  }

  .read {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 10px;
    margin: 0;
    flex: none;
  }
  .read > div {
    min-width: 0;
  }
  .read .wide {
    grid-column: 1 / -1;
  }
  dt {
    margin-bottom: 1px;
  }
  dd {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }
  dd small {
    font-size: 10.5px;
    color: var(--muted);
  }
  .phase {
    font-weight: 600;
    font-size: 13px;
  }
  .phase::before {
    content: '';
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 6px;
    border: 1px solid var(--rule-strong);
    vertical-align: -1px;
  }
  .phase[data-phase='0']::before {
    background: var(--ph-night);
  }
  .phase[data-phase='1']::before {
    background: var(--ph-astro);
  }
  .phase[data-phase='2']::before {
    background: var(--ph-naut);
  }
  .phase[data-phase='3']::before {
    background: var(--ph-civil);
  }
  .phase[data-phase='4']::before {
    background: var(--ph-day);
  }

  /* Wide container (phone landscape, tablet): plot and readouts side by side. */
  @container (min-width: 460px) {
    .lay {
      flex-direction: row;
      align-items: center;
    }
    svg {
      flex: 1 1 60%;
      height: 100%;
      max-height: none;
    }
    .read {
      flex: 1 1 40%;
      grid-template-columns: 1fr;
    }
  }
</style>
