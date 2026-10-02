<!--
  Eclipses: one solar or lunar eclipse at a time on a zoomable map, with what
  it looks like from the chosen place. Pick a place by searching or by clicking
  the map.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '$core/state/app.svelte';
  import { settings, resolvedTheme } from '$core/state/settings.svelte';
  import PlaceSearch from '$core/components/PlaceSearch.svelte';
  import DesignSwitcher from '$core/components/DesignSwitcher.svelte';
  import '$core/components/controls.css';
  import './panel.css';
  import {
    LUNAR_ECLIPSES,
    SOLAR_ECLIPSES,
    eclipseDeltaT,
    elementsAt,
    greatestEclipse,
    greatestEclipseMs,
    localCircumstances,
    lunarLocalCircumstances,
    msToElementTime,
    subLunarPoint,
    toGround,
    type EclipseType,
    type LocalLunarEclipse,
    type LocalSolarEclipse,
    type LunarEclipse,
    type LunarEclipseType,
    type SolarEclipse,
  } from '$core/eclipse';
  import EclipseMap from './EclipseMap.svelte';
  import SolarDetails from './SolarDetails.svelte';
  import LunarDetails from './LunarDetails.svelte';
  import { BASEMAPS, mapyKey, saveMapyKey } from './basemaps';
  import { LUNAR_TYPE_NAMES, TYPE_NAMES, coverage } from './describe';

  type Eclipse = SolarEclipse | LunarEclipse;
  const isLunar = (e: Eclipse): e is LunarEclipse => 'umbra' in e;

  const theme = $derived(resolvedTheme());
  const place = $derived(app.selected);

  // --- Which eclipse -----------------------------------------------------------

  // Solar and lunar eclipses are listed apart, each side keeping its own choice. Their dates never
  // coincide, so a date in the URL names one eclipse and with it the side.
  type Kind = 'solar' | 'lunar';
  const LISTS: Record<Kind, readonly Eclipse[]> = { solar: SOLAR_ECLIPSES, lunar: LUNAR_ECLIPSES };
  const byId = (id: string) => SOLAR_ECLIPSES.find((e) => e.id === id) ?? LUNAR_ECLIPSES.find((e) => e.id === id);
  /** The first eclipse of a kind not yet over at an instant. */
  const nextAfter = (kind: Kind, ms: number) =>
    LISTS[kind].find((e) => greatestEclipseMs(e) + 3 * 3_600_000 > ms) ?? LISTS[kind].at(-1)!;

  const linked = byId(location.hash.slice(1));
  let kind = $state<Kind>(linked && isLunar(linked) ? 'lunar' : 'solar');
  let chosen = $state<Record<Kind, string>>({
    solar: linked && !isLunar(linked) ? linked.id : nextAfter('solar', Date.now()).id,
    lunar: linked && isLunar(linked) ? linked.id : nextAfter('lunar', Date.now()).id,
  });
  const chosenId = $derived(chosen[kind]);
  const eclipse = $derived(byId(chosenId)!);
  const lunar = $derived(kind === 'lunar');
  const choose = (id: string) => (chosen[kind] = id);

  let onlyVisible = $state(false);
  let solarTypes = $state<Record<EclipseType, boolean>>({ T: true, A: true, H: true, P: true });
  let lunarTypes = $state<Record<LunarEclipseType, boolean>>({ T: true, P: true, N: true });

  /** Every eclipse of the side as seen from the place, for the list; about a millisecond each. */
  const seen = $derived(
    place
      ? new Map<string, LocalSolarEclipse | LocalLunarEclipse>(
          LISTS[kind].map((e) => [e.id, isLunar(e) ? lunarLocalCircumstances(e, place) : localCircumstances(e, place)]),
        )
      : null,
  );
  const listed = $derived(
    LISTS[kind].filter(
      (e) =>
        e.id === chosenId ||
        ((isLunar(e) ? lunarTypes[e.type] : solarTypes[e.type]) && (!onlyVisible || seen?.get(e.id)?.visible)),
    ),
  );
  const index = $derived(listed.findIndex((e) => e.id === chosenId));

  function optionLabel(e: Eclipse): string {
    const l = seen?.get(e.id);
    if (isLunar(e)) {
      const here = l?.visible ? ` · here ${(l as LocalLunarEclipse).seen >= 1 ? 'all of it' : 'in part'}` : '';
      return `${e.id} · ${LUNAR_TYPE_NAMES[e.type]}${here}`;
    }
    const s = l as LocalSolarEclipse | undefined;
    const here = s?.visible ? ` · here ${s.kind === 'partial' || !s.max?.visible ? coverage(s.visibleMax?.obscuration ?? 0) : s.kind}` : '';
    return `${e.id} · ${TYPE_NAMES[e.type]}${here}`;
  }

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

  /** What follows the time: where the shadow axis meets the ground, or where the Moon is overhead. */
  function followPoint(e: Eclipse, ms: number) {
    if (isLunar(e)) return subLunarPoint(e, ms);
    const dT = eclipseDeltaT(e);
    const el = elementsAt(e, msToElementTime(e, ms, dT));
    return toGround(el, el.x, el.y, dT);
  }

  /**
   * The whole central line in view, or the region of a partial eclipse. A lunar eclipse covers
   * half the Earth: the place in the middle, so the curves that matter to it show, or else the
   * point under the Moon.
   */
  function frame(e: Eclipse) {
    if (isLunar(e)) {
      const p = place ?? subLunarPoint(e, greatestEclipseMs(e));
      return mapView?.flyTo(p.lat, p.lon, 1.5);
    }
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

  /** The moment to show first: the greatest eclipse as seen from the place if it is seen there, else anywhere. */
  function startTime(e: Eclipse): number {
    if (isLunar(e)) {
      const l = place ? lunarLocalCircumstances(e, place) : null;
      const greatest = l?.contacts.find((c) => c.name === 'Greatest');
      if (l?.visible && greatest && !greatest.visible) return (l.moonrise ?? l.moonset)!.time;
      return greatestEclipseMs(e);
    }
    const l = place ? localCircumstances(e, place) : null;
    return l?.visible && l.max?.visible ? l.max.time : greatestEclipseMs(e);
  }

  // A new eclipse: into the URL, onto the map, and the time to its greatest moment.
  let firstPick = true;
  $effect(() => {
    const e = eclipse;
    untrack(() => {
      history.replaceState(null, '', `${location.pathname}${location.search}#${e.id}`);
      const keepTime = firstPick && new URLSearchParams(location.search).has('t');
      if (!keepTime) {
        app.setTime(startTime(e));
        app.pause();
      }
      frame(e);
      firstPick = false;
    });
  });

  $effect(() => {
    if (!follow || !app.playing) return;
    const p = followPoint(eclipse, app.time);
    if (p) untrack(() => mapView?.panTo(p.lat, p.lon));
  });

  function saveKey() {
    saveMapyKey(keyInput.trim());
    keyInput = '';
    keyVersion++;
  }

  const fly = (lat: number, lon: number, zoom: number) => mapView?.flyTo(lat, lon, zoom);
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
      <div class="kinds" role="tablist" aria-label="Kind of eclipse">
        <button role="tab" aria-selected={kind === 'solar'} class:on={kind === 'solar'} onclick={() => (kind = 'solar')}>☀ Solar eclipses</button>
        <button role="tab" aria-selected={kind === 'lunar'} class:on={kind === 'lunar'} onclick={() => (kind = 'lunar')}>☾ Lunar eclipses</button>
      </div>
      <div class="row">
        <button class="dl-btn dl-btn--icon" disabled={index <= 0} onclick={() => choose(listed[index - 1].id)} aria-label="Previous eclipse">‹</button>
        <select class="dl-input" value={chosenId} onchange={(ev) => choose(ev.currentTarget.value)} aria-label="Eclipse">
          {#each listed as e (e.id)}
            <option value={e.id}>{optionLabel(e)}</option>
          {/each}
        </select>
        <button class="dl-btn dl-btn--icon" disabled={index >= listed.length - 1} onclick={() => choose(listed[index + 1].id)} aria-label="Next eclipse">›</button>
      </div>
      <div class="filters">
        {#if lunar}
          {#each Object.entries(LUNAR_TYPE_NAMES) as [code, name] (code)}
            <label><input type="checkbox" autocomplete="off" bind:checked={lunarTypes[code as LunarEclipseType]} /> {name}</label>
          {/each}
        {:else}
          {#each Object.entries(TYPE_NAMES) as [code, name] (code)}
            <label><input type="checkbox" autocomplete="off" bind:checked={solarTypes[code as EclipseType]} /> {name}</label>
          {/each}
        {/if}
        <label><input type="checkbox" autocomplete="off" bind:checked={onlyVisible} disabled={!place} /> Seen from {place?.name ?? 'the place'}</label>
      </div>
    </section>

    {#if isLunar(eclipse)}
      <LunarDetails {eclipse} {place} known={seen?.get(eclipse.id) as LocalLunarEclipse | undefined} onfly={fly} />
    {:else}
      <SolarDetails {eclipse} {place} known={seen?.get(eclipse.id) as LocalSolarEclipse | undefined} onfly={fly} />
    {/if}
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
      <label><input type="checkbox" autocomplete="off" bind:checked={layers.path} /> {lunar ? 'Visibility' : 'Path'}</label>
      <label><input type="checkbox" autocomplete="off" bind:checked={layers.shadow} /> {lunar ? 'Moon now' : 'Shadow now'}</label>
      <select class="dl-input" bind:value={night.get, night.set} aria-label="Night shading">
        <option value="bands">Night: twilight bands</option>
        <option value="smooth">Night: smooth</option>
        <option value="off">No night</option>
      </select>
      <label><input type="checkbox" autocomplete="off" bind:checked={follow} /> Follow the {lunar ? 'Moon' : 'shadow'}</label>
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
      {#if lunar}
        <span><i class="horizon"></i>Moon on the horizon now</span>
        <span><i class="shade"></i>Less of the eclipse seen</span>
        <span><i class="line"></i>Moon rising or setting at a contact</span>
      {:else}
        <span><i class="band"></i>Path of {eclipse.type === 'A' ? 'annularity' : 'totality'}</span>
        <span><i class="line"></i>Limits, central line</span>
        <span><i class="thin"></i>Partial: every 10% of the Sun's diameter</span>
      {/if}
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
    grid-template-columns: minmax(0, 1fr);
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
  .row {
    display: flex;
    gap: 6px;
  }
  .row select {
    flex: 1;
    min-width: 0;
  }
  .kinds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-bottom: 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  .kinds button {
    font: inherit;
    font-size: 14px;
    padding: 7px 8px;
    border: 0;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
  }
  .kinds button + button {
    border-left: 1px solid var(--border);
  }
  .kinds button.on {
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
    color: var(--fg);
    font-weight: 600;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin-top: 8px;
    font-size: 13px;
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
  .legend .horizon {
    height: 3px;
    vertical-align: 3px;
    background: #f08a3a;
  }
  .legend .shade {
    background: rgb(20 20 26 / 0.45);
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
