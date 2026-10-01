<!-- Key figures for the selected place on the selected date. -->
<script lang="ts">
  import { nextEvents } from '$core/astro/daylight';
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { daySummary } from '$core/state/views';
  import { formatCoordinates } from '$core/geo/place';
  import { formatDate, formatMinutes, formatOffset } from '$core/time/format';
  import { deg, delta, dur } from './lib';

  const summary = $derived(daySummary());
  const hc = $derived(settings.hourCycle);

  // Recompute the next event once per simulated minute rather than every frame.
  const minuteKey = $derived(Math.floor(app.time / 60_000));
  const next = $derived.by(() => {
    const place = app.selected;
    if (!place) return null;
    const t = minuteKey * 60_000;
    const e = nextEvents(place, t, app.scale, app.daylightOptions, 2).find((x) => x.boundary === 'horizon');
    return e ?? null;
  });
  const countdown = $derived(next ? Math.max(0, (next.time - app.time) / 60_000) : null);
</script>

{#if summary}
  {@const d = summary.day}
  <div class="ro">
    <div class="id">
      <span class="sw big" style="--c: {app.colorOf(summary.place)}"></span>
      <div class="names">
        <div class="name">{summary.place.name}</div>
        <div class="meta num">
          {formatCoordinates(summary.place.lat, summary.place.lon)}
          <span>{summary.place.tz} {formatOffset(app.time, app.scale)}</span>
        </div>
        {#if summary.place.detail}<div class="detail">{summary.place.detail}</div>{/if}
      </div>
      {#if app.places.length > 1}
        <button type="button" class="btn ghost rm" onclick={() => app.removePlace(summary.place.id)} title="Remove {summary.place.name} from the comparison">Remove</button>
      {/if}
    </div>

    {#if d.polarDay || d.polarNight}
      <div class="flag" class:night={d.polarNight}>
        {d.polarDay ? 'Midnight sun: the sun does not set on this date.' : 'Polar night: the sun does not rise on this date.'}
      </div>
    {/if}

    <dl>
      <div><dt class="lbl">Sunrise</dt><dd class="num">{d.sunrise ? formatMinutes(d.sunrise.minutes, hc) : '—'}</dd></div>
      <div><dt class="lbl">Sunset</dt><dd class="num">{d.sunset ? formatMinutes(d.sunset.minutes, hc) : '—'}</dd></div>
      <div><dt class="lbl">Daylight</dt><dd class="num">{dur(d.daylightMin)}</dd></div>
      <div>
        <dt class="lbl">Since yesterday</dt>
        <dd class="num" class:up={summary.change > 0.004} class:down={summary.change < -0.004}>{delta(summary.change)}</dd>
      </div>
      <div><dt class="lbl">Solar noon</dt><dd class="num">{formatMinutes(d.solarNoon.minutes, hc)}</dd></div>
      <div><dt class="lbl">Noon altitude</dt><dd class="num">{deg(d.solarNoon.altitude)}</dd></div>
      <div>
        <dt class="lbl">Longest day</dt>
        <dd class="num">{dur(summary.longest.daylightMin)} <small>{formatDate(summary.longest.date, 'short')}</small></dd>
      </div>
      <div>
        <dt class="lbl">Shortest day</dt>
        <dd class="num">{dur(summary.shortest.daylightMin)} <small>{formatDate(summary.shortest.date, 'short')}</small></dd>
      </div>
      <div class="wide">
        <dt class="lbl">Next</dt>
        <dd class="num">
          {#if next && countdown != null}
            {next.rising ? 'Sunrise' : 'Sunset'} in {dur(countdown)} <small>at {formatMinutes(next.minutes, hc)}</small>
          {:else}
            <span class="muted">No sunrise or sunset in the next two days</span>
          {/if}
        </dd>
      </div>
    </dl>
  </div>
{:else}
  <p class="wait">Finding your location…</p>
{/if}

<style>
  .ro {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .id {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .sw.big {
    width: 10px;
    height: 34px;
    margin-top: 2px;
  }
  .names {
    min-width: 0;
    flex: 1;
  }
  .rm {
    flex: none;
    color: var(--muted);
  }
  .rm:hover {
    color: var(--danger);
  }
  .name {
    font: 600 19px/1.15 var(--sans);
    letter-spacing: -0.005em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 10px;
    font-size: 10.5px;
    color: var(--muted);
    margin-top: 2px;
  }
  .detail {
    font-size: 12px;
    color: var(--muted);
  }
  .flag {
    padding: 6px 8px;
    border: 1px solid var(--led-hold);
    border-left-width: 3px;
    font-size: 12px;
  }
  .flag.night {
    border-color: var(--ph-naut);
  }
  dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
    margin: 0;
  }
  dl > div {
    min-width: 0;
    border-top: 1px solid var(--rule);
    padding-top: 4px;
  }
  .wide {
    grid-column: 1 / -1;
  }
  dd {
    margin: 2px 0 0;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
  }
  dd small {
    font-size: 10.5px;
    color: var(--muted);
  }
  .up {
    color: var(--led-live);
  }
  .down {
    color: var(--danger);
  }
  .muted {
    color: var(--muted);
    font-size: 12px;
  }
  .wait {
    color: var(--muted);
  }
</style>
