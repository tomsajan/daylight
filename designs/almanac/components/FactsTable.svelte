<!-- The almanac entry for the selected place and date: a ruled table of facts. -->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { daySummary, sunNow } from '$core/state/views';
  import { Light, LIGHT_NAMES, type SunEvent } from '$core/astro/daylight';
  import { sunPosition } from '$core/astro/sun';
  import { formatClock, formatDelta, formatDuration, formatMinutes, formatOffset } from '$core/time/format';
  import { formatCoordinates } from '$core/geo/place';
  import { TIME_SCALE_LABELS } from '$core/time/timescale';
  import { dayMonth, direction, polarStats, zoneName } from '../almanac.svelte';

  const s = $derived(daySummary());
  const sun = $derived(sunNow());
  const hc = $derived(settings.hourCycle);
  const polar = $derived(app.selected ? polarStats(app.selected) : null);

  function bearing(e: SunEvent | null): string {
    if (!e || !app.selected) return '';
    return `in the ${direction(sunPosition(e.time, app.selected.lat, app.selected.lon).azimuth)}`;
  }
  function eventTime(e: SunEvent | undefined | null): string {
    return e ? formatMinutes(e.minutes, hc) : '—';
  }

  const dawn = $derived(s?.day.events.find((e) => e.boundary === 'civil' && e.rising));
  const dusk = $derived(s && [...s.day.events].reverse().find((e) => e.boundary === 'civil' && !e.rising));
  // Why there is no civil dawn or dusk: the sun never dips 6° below, or never comes within 6°.
  const noTwilight = $derived(
    !s ? '' : s.day.minAltitude > -6 ? (s.day.polarDay ? 'the sun never sets' : 'bright twilight all night') : 'the sun stays more than 6° below',
  );
  const zone = $derived(
    !app.selected
      ? ''
      : settings.timeScale === 'local'
        ? `${zoneName(app.time, app.selected.tz)}, ${formatOffset(app.time, app.scale)}`
        : `${TIME_SCALE_LABELS[settings.timeScale]}, ${formatOffset(app.time, app.scale)}`,
  );
</script>

{#if s}
  <section class="facts" aria-labelledby="alm-facts-title">
    <header class="fig-head">
      <p class="fig-no">The almanac</p>
      <h2 id="alm-facts-title">{s.place.name} on {dayMonth(s.day.date)}</h2>
    </header>

    {#if s.day.polarDay}
      <p class="notice"><strong>Midnight sun.</strong> The sun stays above the horizon all day and night.</p>
    {:else if s.day.polarNight}
      <p class="notice"><strong>Polar night.</strong> The sun stays below the horizon all day{s.day.durations[Light.Civil] > 0
          ? ', though twilight brightens the middle of the day'
          : ''}.</p>
    {/if}

    <table>
      <tbody>
        <tr>
          <th scope="row">Sunrise</th>
          <td><span class="v">{eventTime(s.day.sunrise)}</span> <span class="n">{bearing(s.day.sunrise)}</span></td>
        </tr>
        <tr>
          <th scope="row">Sunset</th>
          <td><span class="v">{eventTime(s.day.sunset)}</span> <span class="n">{bearing(s.day.sunset)}</span></td>
        </tr>
        <tr>
          <th scope="row">Daylight</th>
          <td>
            <span class="v">{formatDuration(s.day.daylightMin)}</span>
            <span class="n">{Math.round(Math.abs(s.change) * 60) < 1 ? 'same as yesterday' : `${formatDelta(s.change)} on yesterday`}</span>
          </td>
        </tr>
        <tr>
          <th scope="row">Solar noon</th>
          <td>
            <span class="v">{formatMinutes(s.day.solarNoon.minutes, hc)}</span>
            <span class="n">sun {s.day.solarNoon.altitude.toFixed(1)}° {s.day.solarNoon.altitude >= 0 ? 'high' : 'below the horizon'}</span>
          </td>
        </tr>
        <tr>
          <th scope="row">First light <small>civil dawn</small></th>
          <td>
            <span class="v">{eventTime(dawn)}</span>
            {#if !dawn}<span class="n">{noTwilight}</span>{/if}
          </td>
        </tr>
        <tr>
          <th scope="row">Last light <small>civil dusk</small></th>
          <td>
            <span class="v">{eventTime(dusk)}</span>
            {#if !dusk}<span class="n">{noTwilight}</span>{/if}
          </td>
        </tr>
        <tr>
          <th scope="row">True darkness</th>
          <td>
            {#if s.day.durations[Light.Night] < 1}
              <span class="n">none: the sky never gets fully dark</span>
            {:else}
              <span class="v">{formatDuration(s.day.durations[Light.Night])}</span> <span class="n">of night</span>
            {/if}
          </td>
        </tr>
        <tr class="group">
          <th scope="row">Sun at {formatClock(app.time, app.scale, hc)}</th>
          <td>
            {#if sun}
              <span class="v">{Math.abs(sun.altitude).toFixed(1)}°</span>
              <span class="n">{sun.altitude >= 0 ? 'above' : 'below'} the horizon, {direction(sun.azimuth)}</span>
            {/if}
          </td>
        </tr>
        <tr>
          <th scope="row">Light now</th>
          <td><span class="phase phase-{s.lightNow}"></span><span class="v txt">{LIGHT_NAMES[s.lightNow]}</span></td>
        </tr>
        <tr class="group">
          <th scope="row">Longest day</th>
          <td><span class="v">{formatDuration(s.longest.daylightMin)}</span> <span class="n">{s.longest.polarDay ? 'midnight sun from' : 'on'} {dayMonth(s.longest.date)}</span></td>
        </tr>
        <tr>
          <th scope="row">Shortest day</th>
          <td><span class="v">{formatDuration(s.shortest.daylightMin)}</span> <span class="n">{s.shortest.polarNight ? 'polar night from' : 'on'} {dayMonth(s.shortest.date)}</span></td>
        </tr>
        {#if polar && (polar.polarDays || polar.polarNights)}
          <tr>
            <th scope="row">Polar days</th>
            <td>
              <span class="n">
                {#if polar.polarDays}{polar.polarDays} days of midnight sun{/if}{#if polar.polarDays && polar.polarNights}, {/if}{#if polar.polarNights}{polar.polarNights}
                  days of polar night{/if} in {app.date.year}
              </span>
            </td>
          </tr>
        {/if}
        <tr class="group">
          <th scope="row">Clock</th>
          <td><span class="n">{zone}</span></td>
        </tr>
        <tr>
          <th scope="row">Position</th>
          <td><span class="n">{formatCoordinates(s.place.lat, s.place.lon)}</span></td>
        </tr>
      </tbody>
    </table>
  </section>
{/if}

<style>
  table {
    width: 100%;
    margin-top: 12px;
    border-collapse: collapse;
    border-top: 1px solid var(--ink);
    font-variant-numeric: tabular-nums;
  }
  tr {
    border-bottom: 1px solid var(--rule);
  }
  tr.group {
    border-top: 1px solid var(--rule-strong);
  }
  th,
  td {
    padding: 7px 0;
    vertical-align: baseline;
    text-align: left;
  }
  th {
    width: 40%;
    padding-right: 12px;
    font: 400 0.84rem/1.3 var(--sans);
    color: var(--muted);
  }
  th small {
    display: block;
    font-size: 0.72rem;
    opacity: 0.85;
  }
  .v {
    font: 500 1.15rem/1.2 var(--serif);
    font-feature-settings: 'lnum', 'tnum';
  }
  .v.txt {
    font-size: 1.02rem;
  }
  .n {
    font-size: 0.84rem;
    color: var(--muted);
  }
  .notice {
    margin: 12px 0 0;
    padding: 10px 12px;
    border-left: 3px solid var(--accent);
    background: var(--wash);
    font-size: 0.92rem;
  }
  .phase {
    display: inline-block;
    width: 11px;
    height: 11px;
    margin-right: 7px;
    border: 1px solid var(--rule-strong);
    vertical-align: -1px;
  }
  .phase-0 {
    background: var(--l0);
  }
  .phase-1 {
    background: var(--l1);
  }
  .phase-2 {
    background: var(--l2);
  }
  .phase-3 {
    background: var(--l3);
  }
  .phase-4 {
    background: var(--l4);
  }
</style>
