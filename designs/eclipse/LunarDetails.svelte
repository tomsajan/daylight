<!--
  A lunar eclipse in the panel: its facts, the time with the Moon in the
  Earth's shadow, and the contacts with the Moon's height at the place.
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import {
    ECLIPSE_CREDIT,
    LUNAR_CONTACT_LABELS,
    deltaTMeasured,
    eclipseDeltaT,
    greatestEclipseMs,
    lunarContacts,
    lunarLocalCircumstances,
    lunarSpan,
    moonPlace,
    shadowView,
    subLunarPoint,
    type LocalLunarEclipse,
    type LunarEclipse,
    type MoonPlace,
  } from '$core/eclipse';
  import { formatClock, formatDate } from '$core/time/format';
  import { formatCoordinates } from '$core/geo/place';
  import LunarSky from './LunarSky.svelte';
  import Horizon from './Horizon.svelte';
  import Timeline from './Timeline.svelte';
  import { LUNAR_TYPE_NAMES, describeLunar } from './describe';

  interface Props {
    eclipse: LunarEclipse;
    place: { name: string; lat: number; lon: number } | null;
    /** The place's circumstances, if already worked out. */
    known?: LocalLunarEclipse;
    onfly: (lat: number, lon: number, zoom: number) => void;
  }
  let { eclipse, place, known, onfly }: Props = $props();

  const dT = $derived(eclipseDeltaT(eclipse));
  const span = $derived(lunarSpan(eclipse, dT));
  const contacts = $derived(lunarContacts(eclipse, dT));
  const greatest = $derived(greatestEclipseMs(eclipse, dT));
  const overhead = $derived(subLunarPoint(eclipse, greatest, dT));
  const local = $derived(place ? (known ?? lunarLocalCircumstances(eclipse, place)) : null);
  const measured = $derived(deltaTMeasured(greatest));

  const at = (name: string) => contacts.find((c) => c.name === name)?.time;
  /** "1h 05m" between two contacts, if the eclipse has them. */
  function length(from: string, to: string): string | undefined {
    const a = at(from);
    const b = at(to);
    if (a === undefined || b === undefined) return undefined;
    const minutes = Math.round((b - a) / 60_000);
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  }
  const durations = $derived(
    [
      ['totality', length('U2', 'U3')],
      ['partial', length('U1', 'U4')],
      ['penumbral', length('P1', 'P4')],
    ].filter((d): d is [string, string] => !!d[1]),
  );

  interface Row {
    label: string;
    time: number;
    moon?: MoonPlace;
  }
  const rows = $derived.by(() => {
    const r: Row[] = contacts.map((c) => ({
      label: LUNAR_CONTACT_LABELS[c.name],
      time: c.time,
      moon: local?.contacts.find((l) => l.name === c.name),
    }));
    if (local?.moonrise) r.push({ label: 'Moonrise', time: local.moonrise.time, moon: local.moonrise });
    if (local?.moonset) r.push({ label: 'Moonset', time: local.moonset.time, moon: local.moonset });
    return r.sort((a, b) => a.time - b.time);
  });

  const marks = $derived.by(() => {
    const all = contacts.map((c) => ({ time: c.time, label: LUNAR_CONTACT_LABELS[c.name], short: c.name === 'Greatest' ? 'Max' : c.name }));
    if (local?.moonrise) all.push({ time: local.moonrise.time, label: 'Moonrise here', short: 'Rise' });
    if (local?.moonset) all.push({ time: local.moonset.time, label: 'Moonset here', short: 'Set' });
    // The most telling marks first; one too close to a mark already kept is left out.
    const order = ['Max', 'Rise', 'Set', 'U1', 'U4', 'U2', 'U3', 'P1', 'P4'];
    const kept: typeof all = [];
    for (const m of all.sort((a, b) => order.indexOf(a.short) - order.indexOf(b.short))) {
      if (!kept.some((k) => Math.abs(k.time - m.time) < (span.end - span.start) * 0.06)) kept.push(m);
    }
    return kept;
  });

  const horizonMarks = $derived.by(() => {
    const names = at('U1') === undefined ? ['P1', 'Greatest', 'P4'] : ['U1', 'Greatest', 'U4'];
    return contacts
      .filter((c) => names.includes(c.name))
      .map((c) => ({ time: c.time, label: LUNAR_CONTACT_LABELS[c.name], short: c.name === 'Greatest' ? 'Max' : c.name }));
  });
  const totality = $derived.by(() => {
    const [a, b] = [at('U2'), at('U3')];
    return a !== undefined && b !== undefined ? { start: a, end: b, name: 'Totality' } : { start: greatest, end: greatest, name: 'Greatest eclipse' };
  });
  /** The Moon's colour at the time: bright, part in the umbra, or red in totality. */
  const moonFill = $derived.by(() => {
    const m = shadowView(eclipse, app.time, dT).umbralMagnitude;
    return m >= 1 ? '#a8401c' : m > 0 ? '#c9997e' : '#dedcd6';
  });

  const utc = (ms: number) => new Date(Math.round(ms / 1000) * 1000).toISOString().slice(11, 19);
  const clock = (ms: number) => formatClock(ms, app.scale, settings.hourCycle, true);
  const moonNow = $derived(place ? moonPlace(eclipse, place, app.time, dT) : null);
</script>

<section class="facts">
  <h2>{LUNAR_TYPE_NAMES[eclipse.type]} lunar eclipse <span>{formatDate({ year: +eclipse.id.slice(0, 4), month: +eclipse.id.slice(5, 7), day: +eclipse.id.slice(8, 10) }, 'long')}</span></h2>
  <dl>
    <dt>Greatest eclipse</dt>
    <dd>
      <button class="link" onclick={() => (app.setTime(greatest), onfly(overhead.lat, overhead.lon, 1.6))}>
        {utc(greatest)} UT, Moon overhead at {formatCoordinates(overhead.lat, overhead.lon, 1)}
      </button>
    </dd>
    {#if durations.length}
      <dt>Lasts</dt>
      <dd>{durations.map(([what, d]) => `${d} ${what}`).join(' · ')}</dd>
    {/if}
    <dt>Magnitude</dt>
    <dd>
      umbral {eclipse.umbralMagnitude.toFixed(4)} · penumbral {eclipse.penumbralMagnitude.toFixed(4)}<br />
      gamma {eclipse.gamma.toFixed(4)} · Saros {eclipse.saros}
    </dd>
    <dt>Anywhere on Earth</dt>
    <dd>{utc(span.start)}–{utc(span.end)} UT, wherever the Moon is up</dd>
  </dl>
</section>

<section class="now">
  <Timeline start={span.start} end={span.end} {marks} />
  <LunarSky {eclipse} time={app.time} {place} />
  {#if place && local?.visible}
    <Horizon
      {place}
      body="Moon"
      radius={eclipse.semidiameter}
      start={span.start}
      end={span.end}
      live={span}
      timeMarks={marks}
      position={(ms) => moonPlace(eclipse, place, ms, dT)}
      marks={horizonMarks}
      main={totality}
      fill={moonFill}
    />
  {/if}
</section>

<section class="local">
  {#if place && local}
    <h3>{place.name} <small>{formatCoordinates(place.lat, place.lon, 3)}</small></h3>
    <p class="headline">{describeLunar(local, (ms) => formatClock(ms, app.scale, settings.hourCycle)).headline}</p>
  {:else}
    <p class="muted">Search for a place or click the map to see the eclipse from there.</p>
  {/if}
  <table>
    <thead>
      <tr><th></th><th>{place ? (app.scale.kind === 'utc' ? 'UT' : 'Local') : 'UT'}</th>{#if place}<th>Moon</th>{/if}</tr>
    </thead>
    <tbody>
      {#each rows as r (r.label)}
        <tr class:below={r.moon && !r.moon.visible} class:current={Math.abs(app.time - r.time) < 1000} onclick={() => app.setTime(r.time)}>
          <td>{r.label}</td>
          <td>{place ? clock(r.time) : utc(r.time)}</td>
          {#if place}
            <td>{r.moon ? `${r.moon.altitude.toFixed(1)}° ${r.moon.azimuth.toFixed(0)}°` : ''}</td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="note">
    Click a row to go to that moment.
    {#if place}
      Greyed: the Moon is below the horizon{moonNow ? (moonNow.visible ? '; now it is up' : '; now it is down') : ''}.
    {/if}
  </p>
</section>

<footer>
  <p>
    {ECLIPSE_CREDIT}, with Jean Meeus. ΔT from the IERS{measured ? '' : ' (extrapolated for this eclipse, so its times may shift by seconds or more)'}. The
    contacts are the same instant everywhere; the place only decides whether the Moon is up. The Earth's shadow is placed from
    the Sun's position (astronomy-engine) and sized to NASA's magnitudes.
  </p>
</footer>
