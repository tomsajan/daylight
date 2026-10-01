<!--
  Key facts for the selected place on the selected date. Split into parts so the
  mobile sheet can show the header and the big three in its peek, the rest lower down.
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import type { DaySummary } from '$core/state/views';
  import { Light, LIGHT_NAMES } from '$core/astro/daylight';
  import { compassPoint, formatClock, formatDate, formatDelta, formatDuration, formatMinutes, timeZoneName } from '$core/time/format';
  import { TIME_SCALE_LABELS } from '$core/time/timescale';
  import { formatCoordinates } from '$core/geo/place';
  import { LIGHT_COLORS } from './palette';
  import Icon from './Icon.svelte';

  interface Props {
    summary: DaySummary;
    sun: { altitude: number; azimuth: number } | null;
    header?: boolean;
    trio?: boolean;
    rows?: boolean;
    /** Smaller header for the mobile sheet. */
    compact?: boolean;
  }
  let { summary, sun, header = true, trio = true, rows = true, compact = false }: Props = $props();

  const hc = $derived(settings.hourCycle);
  const day = $derived(summary.day);
  // The zone name only changes at DST transitions; avoid building an Intl formatter every frame.
  const hourBucket = $derived(Math.floor(app.time / 3_600_000));
  const zone = $derived(settings.timeScale === 'local' ? timeZoneName(hourBucket * 3_600_000, summary.place.tz) : TIME_SCALE_LABELS[settings.timeScale]);
  const sunText = $derived.by(() => {
    if (!sun) return '';
    const dir = `${Math.round(sun.azimuth)}° ${compassPoint(sun.azimuth)}`;
    const alt = Math.abs(sun.altitude).toFixed(1);
    return sun.altitude >= 0 ? `Sun ${alt}° above the horizon, bearing ${dir}` : `Sun ${alt}° below the horizon, bearing ${dir}`;
  });
  const changeText = $derived(Math.abs(summary.change) < 1 / 120 ? 'Same as yesterday' : `${formatDelta(summary.change)} vs yesterday`);
</script>

{#if header}
  <div class="head" class:head--compact={compact}>
    <h1 class="name">{summary.place.name}</h1>
    {#if !compact}
      <p class="where">{summary.place.detail ? `${summary.place.detail}, ` : ''}{formatCoordinates(summary.place.lat, summary.place.lon)}</p>
      <p class="clock">
        <span class="time">{formatClock(app.time, app.scale, hc)}</span>
        <span class="zone">{zone}</span>
      </p>
      <p class="date">{formatDate(app.date, 'long')}</p>
    {/if}
    <p class="phase" style:--lc={LIGHT_COLORS[summary.lightNow]}>
      <span class="badge" class:badge--day={summary.lightNow === Light.Day}></span>
      <span><strong>{LIGHT_NAMES[summary.lightNow]}</strong>{#if !compact}<br /><span class="sun">{sunText}</span>{/if}</span>
    </p>
  </div>
{/if}

{#if trio}
  <div class="trio" class:trio--compact={compact}>
    <div>
      <span class="lbl"><Icon name="sunrise" size={15} /> Sunrise</span>
      <span class="big">{day.sunrise ? formatMinutes(day.sunrise.minutes, hc) : '—'}</span>
    </div>
    <div>
      <span class="lbl"><Icon name="sunset" size={15} /> Sunset</span>
      <span class="big">{day.sunset ? formatMinutes(day.sunset.minutes, hc) : '—'}</span>
    </div>
    <div>
      <span class="lbl">Daylight</span>
      <span class="big">{formatDuration(day.daylightMin, compact)}{#if compact}<small> h</small>{/if}</span>
      <span class="delta" class:delta--up={summary.change > 0} class:delta--down={summary.change < 0}>{changeText}</span>
    </div>
  </div>
  {#if day.polarDay}
    <p class="polar polar--day"><strong>Midnight sun.</strong> The sun doesn’t set on this day.</p>
  {:else if day.polarNight}
    <p class="polar polar--night"><strong>Polar night.</strong> The sun doesn’t rise on this day.</p>
  {/if}
{/if}

{#if rows}
  <dl class="rows">
    {#if compact}
      <dt>Sun now</dt>
      <dd>{sunText.replace(/^Sun /, '')}</dd>
    {/if}
    <dt>Solar noon</dt>
    <dd>{formatMinutes(day.solarNoon.minutes, hc)}, sun {day.solarNoon.altitude.toFixed(1)}° high</dd>
    <dt>Longest day</dt>
    <dd>{formatDate(summary.longest.date, 'short')}, {formatDuration(summary.longest.daylightMin)}</dd>
    <dt>Shortest day</dt>
    <dd>{formatDate(summary.shortest.date, 'short')}, {formatDuration(summary.shortest.daylightMin)}</dd>
    {#if compact}
      <dt>Location</dt>
      <dd>{formatCoordinates(summary.place.lat, summary.place.lon)}</dd>
    {/if}
    <dt>Time zone</dt>
    <dd>{summary.place.tz}</dd>
  </dl>
{/if}

<style>
  .head p {
    margin: 0;
  }
  .name {
    margin: 0;
    font-size: 34px;
    line-height: 1.1;
    font-weight: 300;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  .head--compact .name {
    font-size: 22px;
    font-weight: 400;
  }
  .head .where {
    margin-top: 4px;
    font-size: 13px;
    color: var(--ink-3);
  }
  .head .clock {
    margin-top: 14px;
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .time {
    font-size: 44px;
    font-weight: 300;
    line-height: 1;
    letter-spacing: -0.01em;
    color: #fff8ea;
  }
  .zone {
    font-size: 14px;
    color: var(--ink-2);
  }
  .head .date {
    margin-top: 6px;
    color: var(--ink-2);
  }
  .head .phase {
    margin-top: 14px;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 14px;
  }
  .head--compact .phase {
    margin-top: 2px;
    font-size: 13px;
    color: var(--ink-2);
    align-items: center;
  }
  .head--compact .phase strong {
    font-weight: 400;
  }
  .phase strong {
    font-weight: 500;
  }
  .sun {
    color: var(--ink-2);
    font-size: 13px;
  }
  .badge {
    flex: none;
    width: 12px;
    height: 12px;
    margin-top: 3px;
    border-radius: 50%;
    background: var(--lc);
    box-shadow: 0 0 0 1px rgb(255 255 255 / 0.35);
  }
  .head--compact .badge {
    width: 9px;
    height: 9px;
    margin-top: 0;
  }
  .badge--day {
    box-shadow: 0 0 10px 2px rgb(242 196 109 / 0.55);
  }

  .trio {
    display: grid;
    grid-template-columns: 1fr 1fr 1.25fr;
    gap: 12px;
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px solid var(--hair);
  }
  .trio > div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .trio--compact {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
    gap: 8px;
  }
  .lbl {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    color: var(--ink-2);
  }
  .lbl :global(svg) {
    color: var(--gold);
  }
  .big {
    margin-top: 2px;
    font-size: 26px;
    font-weight: 300;
    line-height: 1.15;
    white-space: nowrap;
  }
  .trio--compact .big {
    font-size: 21px;
  }
  .big small {
    font-size: 13px;
    color: var(--ink-2);
  }
  .delta {
    margin-top: 2px;
    font-size: 12px;
    color: var(--ink-3);
  }
  .delta--up {
    color: var(--gold);
  }
  .delta--down {
    color: #8fa6e0;
  }

  .polar {
    margin: 14px 0 0;
    padding: 10px 12px;
    border-radius: 12px;
    font-size: 13.5px;
  }
  .polar--day {
    background: rgb(242 196 109 / 0.12);
    border: 1px solid rgb(242 196 109 / 0.35);
    color: #fbe6bb;
  }
  .polar--night {
    background: rgb(64 89 154 / 0.2);
    border: 1px solid rgb(120 150 220 / 0.35);
    color: #cdd8f5;
  }

  .rows {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 9px 16px;
    margin: 18px 0 0;
    padding-top: 16px;
    border-top: 1px solid var(--hair);
    font-size: 14px;
  }
  dt {
    color: var(--ink-2);
  }
  dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
</style>
