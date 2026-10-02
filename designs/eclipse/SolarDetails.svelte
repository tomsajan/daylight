<!--
  A solar eclipse in the panel: its facts, the time with the Sun as seen from
  the place, and the place's contacts.
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import {
    ECLIPSE_CREDIT,
    deltaTMeasured,
    globalSpan,
    greatestEclipse,
    localCircumstances,
    pathDistances,
    skyView,
    type Contact,
    type LocalSolarEclipse,
    type PathDistances,
    type SolarEclipse,
  } from '$core/eclipse';
  import { formatClock, formatDate } from '$core/time/format';
  import { formatCoordinates } from '$core/geo/place';
  import SkyView from './SkyView.svelte';
  import Timeline from './Timeline.svelte';
  import { TYPE_NAMES, coverage, describeLocal, formatSeconds } from './describe';

  interface Props {
    eclipse: SolarEclipse;
    place: { name: string; lat: number; lon: number } | null;
    /** The place's circumstances, if already worked out. */
    known?: LocalSolarEclipse;
    onfly: (lat: number, lon: number, zoom: number) => void;
  }
  let { eclipse, place, known, onfly }: Props = $props();

  const greatest = $derived(greatestEclipse(eclipse));
  const span = $derived(globalSpan(eclipse));
  const local = $derived(place ? (known ?? localCircumstances(eclipse, place)) : null);
  const distances = $derived(place && local && local.kind !== 'none' && eclipse.type !== 'P' ? pathDistances(eclipse, place) : undefined);
  const during = $derived(app.time >= span.start && app.time <= span.end);
  const sky = $derived(place && local?.visible && during ? skyView(eclipse, place, app.time) : null);
  const measured = $derived(deltaTMeasured(greatest.time));

  const rows = $derived.by(() => {
    if (!local) return [];
    const r: [string, Contact][] = [];
    const central = local.kind === 'total' ? 'Totality' : 'Annularity';
    if (local.c1) r.push(['Partial eclipse begins', local.c1]);
    if (local.sunrise) r.push(['Sunrise', local.sunrise]);
    if (local.c2) r.push([`${central} begins`, local.c2]);
    if (local.max) r.push(['Maximum', local.max]);
    if (local.c3) r.push([`${central} ends`, local.c3]);
    if (local.sunset) r.push(['Sunset', local.sunset]);
    if (local.c4) r.push(['Partial eclipse ends', local.c4]);
    return r.sort((a, b) => a[1].time - b[1].time);
  });

  const marks = $derived.by(() => {
    const m = [{ time: greatest.time, label: 'Greatest eclipse (anywhere)', short: 'G' }];
    if (local?.visible) {
      if (local.c1) m.push({ time: local.c1.time, label: 'Partial eclipse begins here', short: 'C1' });
      if (local.max) m.push({ time: local.max.time, label: 'Maximum here', short: 'Max' });
      if (local.c4) m.push({ time: local.c4.time, label: 'Partial eclipse ends here', short: 'C4' });
    }
    // The greatest eclipse gives way to the place's own marks when they would overlap.
    const near = (a: number, b: number) => Math.abs(a - b) < (span.end - span.start) * 0.05;
    return m.filter((x, i) => x.time >= span.start && x.time <= span.end && !(i === 0 && m.some((y, j) => j > 0 && near(x.time, y.time))));
  });

  function distanceText(d: PathDistances): string {
    const centre = `${d.centre.toFixed(1)} km from the central line`;
    if (d.north === undefined || d.south === undefined) return centre;
    const north = d.north < d.south;
    const limit = `${Math.min(d.north, d.south).toFixed(1)} km from its ${north ? 'northern' : 'southern'} limit`;
    return `${centre} · ${d.inside ? 'inside' : 'outside'} the path, ${limit}`;
  }

  const utc = (ms: number) => new Date(Math.round(ms / 1000) * 1000).toISOString().slice(11, 19);
  const clock = (ms: number) => formatClock(ms, app.scale, settings.hourCycle, true);
</script>

<section class="facts">
  <h2>{TYPE_NAMES[eclipse.type]} solar eclipse <span>{formatDate({ year: +eclipse.id.slice(0, 4), month: +eclipse.id.slice(5, 7), day: +eclipse.id.slice(8, 10) }, 'long')}</span></h2>
  <dl>
    <dt>Greatest eclipse</dt>
    <dd>
      <button class="link" onclick={() => (app.setTime(greatest.time), onfly(greatest.lat, greatest.lon, 4))}>
        {utc(greatest.time)} UT, {formatCoordinates(greatest.lat, greatest.lon, 1)}
      </button>
    </dd>
    {#if greatest.duration}
      <dt>{eclipse.type === 'A' ? 'Annularity' : 'Totality'}</dt>
      <dd>up to {formatSeconds(greatest.duration)}, path {greatest.pathWidth?.toFixed(0)} km wide</dd>
    {/if}
    <dt>Magnitude</dt>
    <dd>{eclipse.magnitude.toFixed(4)} · gamma {greatest.gamma.toFixed(4)} · Saros {eclipse.saros}</dd>
    <dt>Anywhere on Earth</dt>
    <dd>{utc(span.start)}–{utc(span.end)} UT</dd>
  </dl>
</section>

<section class="now">
  <Timeline start={span.start} end={span.end} {marks} />
  {#if sky}
    <SkyView {sky} />
  {:else if place && local?.visible && !during}
    <p class="muted">Outside the eclipse. Move the time into it to see the Sun from {place.name}.</p>
  {/if}
</section>

<section class="local">
  {#if !place}
    <p class="muted">Search for a place or click the map.</p>
  {:else if local}
    <h3>{place.name} <small>{formatCoordinates(place.lat, place.lon, 3)}</small></h3>
    <p class="headline">{describeLocal(local).headline}</p>
    {#if distances}
      <p class="distances">{distanceText(distances)}</p>
    {/if}
    {#if rows.length}
      <table>
        <thead><tr><th></th><th>{app.scale.kind === 'utc' ? 'UT' : 'Local'}</th><th>Sun</th><th>Covered</th></tr></thead>
        <tbody>
          {#each rows as [label, c] (label)}
            <tr class:below={!c.visible} class:current={Math.abs(app.time - c.time) < 1000} onclick={() => app.setTime(c.time)}>
              <td>{label}</td>
              <td>{clock(c.time)}</td>
              <td>{c.altitude.toFixed(1)}° {c.azimuth.toFixed(0)}°</td>
              <td>{coverage(c.obscuration)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="note">Click a row to go to that moment. Greyed: the Sun is below the horizon.</p>
    {/if}
  {/if}
</section>

<footer>
  <p>
    {ECLIPSE_CREDIT}. ΔT from the IERS{measured ? '' : '. For this eclipse ΔT is extrapolated, so its times may shift by seconds or more, moving the path east or west by about half a kilometre per second'}.
    The Moon's mountains and valleys are not modelled: contact times can differ by a second or two, and the path limits by up to a kilometre or two.
  </p>
</footer>
