<!--
  Eclipses: one solar eclipse at a time on a zoomable map, with what it looks
  like from the chosen place. Pick a place by searching or by clicking the map.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '$core/state/app.svelte';
  import { settings, resolvedTheme } from '$core/state/settings.svelte';
  import PlaceSearch from '$core/components/PlaceSearch.svelte';
  import DesignSwitcher from '$core/components/DesignSwitcher.svelte';
  import '$core/components/controls.css';
  import {
    ECLIPSE_CREDIT,
    SOLAR_ECLIPSES,
    deltaTMeasured,
    eclipseDeltaT,
    elementsAt,
    globalSpan,
    greatestEclipse,
    greatestEclipseMs,
    localCircumstances,
    msToElementTime,
    pathDistances,
    skyView,
    toGround,
    type Contact,
    type PathDistances,
    type EclipseType,
    type SolarEclipse,
  } from '$core/eclipse';
  import { formatClock, formatDate } from '$core/time/format';
  import { formatCoordinates } from '$core/geo/place';
  import EclipseMap from './EclipseMap.svelte';
  import SkyView from './SkyView.svelte';
  import Timeline from './Timeline.svelte';
  import { BASEMAPS, mapyKey, saveMapyKey } from './basemaps';
  import { TYPE_NAMES, coverage, describeLocal, formatSeconds } from './describe';

  const theme = $derived(resolvedTheme());
  const hc = $derived(settings.hourCycle);
  const place = $derived(app.selected);

  // --- Which eclipse -----------------------------------------------------------

  const byId = (id: string) => SOLAR_ECLIPSES.find((e) => e.id === id);
  /** The first eclipse not yet over at an instant. */
  const nextAfter = (ms: number) => SOLAR_ECLIPSES.find((e) => greatestEclipseMs(e) + 3 * 3_600_000 > ms) ?? SOLAR_ECLIPSES.at(-1)!;

  let chosenId = $state(byId(location.hash.slice(1))?.id ?? nextAfter(Date.now()).id);
  const eclipse = $derived(byId(chosenId)!);

  let onlyVisible = $state(false);
  let types = $state<Record<EclipseType, boolean>>({ T: true, A: true, H: true, P: true });

  // Every eclipse as seen from the place, for the list; about a millisecond each.
  const seen = $derived(place ? new Map(SOLAR_ECLIPSES.map((e) => [e.id, localCircumstances(e, place)])) : null);
  const listed = $derived(
    SOLAR_ECLIPSES.filter((e) => e.id === chosenId || (types[e.type] && (!onlyVisible || seen?.get(e.id)?.visible))),
  );
  const index = $derived(listed.findIndex((e) => e.id === chosenId));

  const optionLabel = (e: SolarEclipse) => {
    const l = seen?.get(e.id);
    const here = l?.visible ? ` · here ${l.kind === 'partial' || !l.max?.visible ? coverage(l.visibleMax?.obscuration ?? 0) : l.kind}` : '';
    return `${e.id} · ${TYPE_NAMES[e.type]}${here}`;
  };

  // --- The eclipse and the place ------------------------------------------------

  const greatest = $derived(greatestEclipse(eclipse));
  const span = $derived(globalSpan(eclipse));
  const local = $derived(place ? (seen?.get(eclipse.id) ?? localCircumstances(eclipse, place)) : null);
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
  const clock = (ms: number) => formatClock(ms, app.scale, hc, true);

  // --- Map ---------------------------------------------------------------------

  let mapView: EclipseMap | undefined = $state();
  let basemap = $state(stored('daylight.eclipse.basemap') ?? 'streets');
  let layers = $state({ path: true, shadow: true, night: true });
  let follow = $state(false);
  // Night shading off, or on with its twilight in bands or smooth (the globe designs' setting).
  const night = {
    get: () => (layers.night ? settings.globe.twilightStyle : 'off'),
    set: (v: string) => {
      layers.night = v !== 'off';
      if (v === 'bands' || v === 'smooth') settings.globe.twilightStyle = v;
    },
  };
  let keyInput = $state('');
  let keyVersion = $state(0);
  const base = $derived(BASEMAPS.find((b) => b.id === basemap) ?? BASEMAPS[0]);
  const needsKey = $derived(!!base.mapy && keyVersion >= 0 && !mapyKey());

  function stored(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  $effect(() => {
    try {
      localStorage.setItem('daylight.eclipse.basemap', basemap);
    } catch {
      // Not remembered.
    }
  });

  /** Where the shadow axis meets the ground at an instant, if it does. */
  function axisPoint(e: SolarEclipse, ms: number) {
    const dT = eclipseDeltaT(e);
    const el = elementsAt(e, msToElementTime(e, ms, dT));
    return toGround(el, el.x, el.y, dT);
  }

  /** The whole central line in view, or the region of a partial eclipse. */
  function frame(e: SolarEclipse) {
    const dT = eclipseDeltaT(e);
    const points: { lat: number; lon: number }[] = [];
    for (let t = e.range[0]; t <= e.range[1]; t += 1 / 12) {
      const el = elementsAt(e, t);
      const g = toGround(el, el.x, el.y, dT);
      if (g) points.push(g);
    }
    if (points.length < 2) {
      const g = greatestEclipse(e);
      return mapView?.flyTo(g.lat, g.lon, 1.6);
    }
    // Longitudes unwrapped along the line, so a path across the date line stays in one piece.
    let lon = points[0].lon;
    const lons = points.map((p) => (lon += ((p.lon - lon + 540) % 360) - 180));
    const lats = points.map((p) => p.lat);
    mapView?.fitBounds([
      [Math.min(...lons), Math.max(-80, Math.min(...lats))],
      [Math.max(...lons), Math.min(80, Math.max(...lats))],
    ]);
  }

  // A new eclipse: into the URL, onto the map, and the time to its maximum here (or anywhere).
  let firstPick = true;
  $effect(() => {
    const e = eclipse;
    untrack(() => {
      history.replaceState(null, '', `${location.pathname}${location.search}#${e.id}`);
      const keepTime = firstPick && new URLSearchParams(location.search).has('t');
      if (!keepTime) {
        const l = place ? localCircumstances(e, place) : null;
        app.setTime(l?.visible && l.max?.visible ? l.max.time : greatestEclipseMs(e));
        app.pause();
      }
      frame(e);
      firstPick = false;
    });
  });

  $effect(() => {
    if (!follow || !app.playing) return;
    const p = axisPoint(eclipse, app.time);
    if (p) untrack(() => mapView?.panTo(p.lat, p.lon));
  });

  function saveKey() {
    saveMapyKey(keyInput.trim());
    keyInput = '';
    keyVersion++;
  }
</script>

<div class="app" data-theme={theme}>
  <aside class="panel">
    <header>
      <h1>Eclipses</h1>
      <DesignSwitcher />
    </header>
    <PlaceSearch
      onselect={(p) => {
        app.replaceSelected(p);
        mapView?.flyTo(p.lat, p.lon, 7);
      }}
    />

    <section class="picker">
      <div class="row">
        <button class="dl-btn dl-btn--icon" disabled={index <= 0} onclick={() => (chosenId = listed[index - 1].id)} aria-label="Previous eclipse">‹</button>
        <select class="dl-input" value={chosenId} onchange={(ev) => (chosenId = ev.currentTarget.value)} aria-label="Eclipse">
          {#each listed as e (e.id)}
            <option value={e.id}>{optionLabel(e)}</option>
          {/each}
        </select>
        <button class="dl-btn dl-btn--icon" disabled={index >= listed.length - 1} onclick={() => (chosenId = listed[index + 1].id)} aria-label="Next eclipse">›</button>
      </div>
      <div class="filters">
        {#each Object.entries(TYPE_NAMES) as [code, name] (code)}
          <label><input type="checkbox" autocomplete="off" bind:checked={types[code as EclipseType]} /> {name}</label>
        {/each}
        <label><input type="checkbox" autocomplete="off" bind:checked={onlyVisible} disabled={!place} /> Seen from {place?.name ?? 'the place'}</label>
      </div>
    </section>

    <section class="facts">
      <h2>{TYPE_NAMES[eclipse.type]} solar eclipse <span>{formatDate({ year: +eclipse.id.slice(0, 4), month: +eclipse.id.slice(5, 7), day: +eclipse.id.slice(8, 10) }, 'long')}</span></h2>
      <dl>
        <dt>Greatest eclipse</dt>
        <dd>
          <button class="link" onclick={() => (app.setTime(greatest.time), mapView?.flyTo(greatest.lat, greatest.lon, 4))}>
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
      <div class="clock">
        <strong>{clock(app.time)}</strong>
        <span>{formatDate(app.date, 'medium')} · {utc(app.time)} UT</span>
      </div>
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
  </aside>

  <main class="map-wrap">
    <EclipseMap
      bind:this={mapView}
      {eclipse}
      time={app.time}
      {place}
      placeColor={place ? app.colorOf(place) : undefined}
      {basemap}
      {keyVersion}
      layers={{ ...layers, smooth: settings.globe.twilightStyle === 'smooth' }}
      onpick={(lat, lon) => app.pickPoint(lat, lon)}
    />
    <div class="tools">
      <select class="dl-input" bind:value={basemap} aria-label="Background map">
        {#each BASEMAPS as b (b.id)}
          <option value={b.id}>{b.name}</option>
        {/each}
      </select>
      <label><input type="checkbox" autocomplete="off" bind:checked={layers.path} /> Path</label>
      <label><input type="checkbox" autocomplete="off" bind:checked={layers.shadow} /> Shadow now</label>
      <select class="dl-input" bind:value={night.get, night.set} aria-label="Night shading">
        <option value="bands">Night: twilight bands</option>
        <option value="smooth">Night: smooth</option>
        <option value="off">No night</option>
      </select>
      <label><input type="checkbox" autocomplete="off" bind:checked={follow} /> Follow the shadow</label>
      {#if needsKey}
        <form
          class="key"
          onsubmit={(ev) => {
            ev.preventDefault();
            saveKey();
          }}
        >
          <span>Mapy.com needs an API key (free at <a href="https://developer.mapy.com/" target="_blank" rel="noopener">developer.mapy.com</a>). It stays in this browser.</span>
          <input class="dl-input" bind:value={keyInput} placeholder="API key" aria-label="Mapy.com API key" />
          <button class="dl-btn" type="submit">Use</button>
        </form>
      {:else if base.mapy}
        <button class="link" onclick={() => (saveMapyKey(''), keyVersion++)}>Forget the Mapy.com key</button>
      {/if}
    </div>
    <div class="legend">
      <span><i class="band"></i>Path of {eclipse.type === 'A' ? 'annularity' : 'totality'}</span>
      <span><i class="line"></i>Limits, central line</span>
      <span><i class="thin"></i>Partial: every 10% of the Sun's diameter</span>
    </div>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    font: 15px/1.45 system-ui, sans-serif;
  }
  .app {
    --bg: #0d111c;
    --surface: #151b2b;
    --fg: #e8ecf5;
    --muted: #9aa3bb;
    --border: #2a3350;
    --accent: #ff8a3d;
    --dl-bg: var(--bg);
    --dl-surface: var(--surface);
    --dl-fg: var(--fg);
    --dl-muted: var(--muted);
    --dl-border: var(--border);
    --dl-accent: var(--accent);
    --dl-color-scheme: dark;
    display: grid;
    grid-template-columns: minmax(320px, 400px) 1fr;
    height: 100dvh;
    background: var(--bg);
    color: var(--fg);
  }
  .app[data-theme='light'] {
    --bg: #f5f6fa;
    --surface: #fff;
    --fg: #151a26;
    --muted: #5d6578;
    --border: #d6dae3;
    --accent: #d9480f;
    --dl-color-scheme: light;
  }
  .panel {
    overflow-y: auto;
    padding: 14px 16px 20px;
    display: grid;
    align-content: start;
    gap: 14px;
    border-right: 1px solid var(--border);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  h1 {
    margin: 0;
    font-size: 1.35rem;
  }
  h2 {
    margin: 0 0 6px;
    font-size: 1.1rem;
  }
  h2 span {
    display: block;
    font-weight: normal;
    color: var(--muted);
    font-size: 0.9rem;
  }
  h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  h3 small {
    font-weight: normal;
    color: var(--muted);
    font-size: 0.8rem;
  }
  section {
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .row select {
    flex: 1;
    min-width: 0;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin-top: 8px;
    font-size: 13px;
    color: var(--muted);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 3px 12px;
    margin: 0;
    font-size: 14px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
    text-align: left;
  }
  .now {
    display: grid;
    gap: 10px;
  }
  .clock strong {
    font-size: 1.6rem;
    font-variant-numeric: tabular-nums;
    margin-right: 8px;
  }
  .clock span {
    color: var(--muted);
    font-size: 13px;
  }
  .muted,
  .note {
    color: var(--muted);
    font-size: 13px;
    margin: 0;
  }
  .headline {
    margin: 4px 0;
    font-weight: 600;
  }
  .distances {
    margin: 0 0 8px;
    font-size: 14px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    text-align: right;
    padding: 3px 4px;
    border-bottom: 1px solid var(--border);
  }
  th:first-child,
  td:first-child {
    text-align: left;
    padding-left: 0;
  }
  th {
    color: var(--muted);
    font-weight: normal;
  }
  tbody tr {
    cursor: pointer;
  }
  tbody tr:hover,
  tr.current {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  tr.below {
    color: var(--muted);
  }
  footer p {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .map-wrap {
    position: relative;
    min-height: 0;
  }
  .tools {
    position: absolute;
    top: 10px;
    left: 10px;
    right: 60px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    align-items: center;
    pointer-events: none;
    font-size: 13px;
  }
  .tools > * {
    pointer-events: auto;
  }
  .tools label {
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    padding: 4px 8px;
    border-radius: 8px;
  }
  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    max-width: 460px;
    background: var(--surface);
    padding: 8px;
    border-radius: 8px;
  }
  .key a {
    color: var(--accent);
  }
  .tools .link {
    background: var(--surface);
    padding: 4px 8px;
    border-radius: 8px;
  }
  .legend {
    position: absolute;
    left: 10px;
    /* Clear of the Mapy.com logo, which must sit bottom left. */
    bottom: 46px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 12px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    padding: 4px 8px;
    border-radius: 8px;
    pointer-events: none;
  }
  .legend i {
    display: inline-block;
    width: 18px;
    height: 10px;
    margin-right: 5px;
    vertical-align: -1px;
  }
  .legend .band {
    background: rgb(242 89 26 / 0.35);
    border-top: 2px solid #bf330d;
    border-bottom: 2px solid #bf330d;
    box-sizing: border-box;
  }
  .legend .line {
    height: 2px;
    vertical-align: 3px;
    background: #bf330d;
  }
  .legend .thin {
    height: 1px;
    vertical-align: 3px;
    background: rgb(191 51 13 / 0.6);
  }
  @media (max-width: 760px) {
    .app {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 58dvh auto;
      height: auto;
    }
    .map-wrap {
      grid-row: 1;
    }
    .panel {
      grid-row: 2;
      overflow: visible;
      border-right: 0;
    }
    .tools {
      right: 50px;
    }
    .tools label:not(:first-of-type) {
      display: none;
    }
  }
</style>
