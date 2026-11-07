<!--
  Night Sky: planning astrophotography for a place and a night. How dark it gets and when, the
  Moon, what is up and for how long, the sky itself with the camera's frame on the chosen
  target, and a map of the lights on the ground to find a dark spot.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '$core/state/app.svelte';
  import { settings, resolvedTheme } from '$core/state/settings.svelte';
  import PlaceSearch from '$core/components/PlaceSearch.svelte';
  import AppSwitch from '$core/components/AppSwitch.svelte';
  import OfflineStorage from '$core/components/OfflineStorage.svelte';
  import Splitter from '$core/components/Splitter.svelte';
  import { clamp, panelSizes } from '$core/state/layout.svelte';
  import '$core/components/controls.css';
  import { BASEMAPS } from '$core/map/basemaps';
  import { nightOf, nextMoons, totalMs, type Night } from '$core/sky/night';
  import { TARGETS, findTarget, targetNow, targetVector, visibility, yearNights, yearVisibility, type Target, type YearNights } from '$core/sky/targets';
  import { field } from '$core/sky/camera';
  import { CONSTELLATION_CREDIT, DSO_CREDIT, MILKY_WAY_CREDIT, STAR_CREDIT } from '$core/sky/catalog';
  import type { View } from '$core/sky/projection';
  import { sunAltitude } from '$core/astro/sun';
  import { addDays, civilDateOf, dateKey, sameDate, toWall, type CivilDate } from '$core/time/timescale';
  import { formatClock, formatDate, formatDuration } from '$core/time/format';
  import { prefs, persistPrefs } from './prefs.svelte';
  import SkyChart from './SkyChart.svelte';
  import NightTimeline from './NightTimeline.svelte';
  import TargetList from './TargetList.svelte';
  import TargetDetails from './TargetDetails.svelte';
  import CameraPanel from './CameraPanel.svelte';
  import LightMap from './LightMap.svelte';

  persistPrefs();

  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  // Night vision needs the dark theme: a light page in red is a red lamp.
  const theme = $derived(prefs.nightVision ? 'dark' : resolvedTheme());
  const place = $derived(app.selected);
  const site = $derived(place ? { lat: place.lat, lon: place.lon } : { lat: 50, lon: 14 });
  /** The place for the night's sums, once it stops moving: a marker being dragged only moves the sky. */
  let planSite = $state(untrack(() => site));
  $effect(() => {
    const s = site;
    if (untrack(() => s.lat === planSite.lat && s.lon === planSite.lon)) return;
    const timer = setTimeout(() => (planSite = s), 250);
    return () => clearTimeout(timer);
  });
  const scale = $derived(app.scale);
  const hc = $derived(settings.hourCycle);
  const clock = (ms: number) => formatClock(ms, scale, hc);

  // The panel's width, dragged.
  const sizes = panelSizes('sky');
  let panelEl: HTMLElement | undefined = $state();
  let startWidth = 0;
  const panelWidth = $derived(sizes.get('panel'));

  // --- The night -----------------------------------------------------------------------------

  /**
   * The evening the shown time belongs to: before noon it is still the night before. Keeps its
   * identity while the night stays the same, so what hangs on it is not redone every second.
   */
  let lastNight: CivilDate = { year: 0, month: 0, day: 0 };
  const nightDate = $derived.by((): CivilDate => {
    const d = civilDateOf(app.time, scale);
    const hour = (((toWall(app.time, scale) % DAY) + DAY) % DAY) / HOUR;
    const n = hour < 12 ? addDays(d, -1) : d;
    if (!sameDate(n, lastNight)) lastNight = n;
    return lastNight;
  });
  const nightKey = $derived(`${planSite.lat},${planSite.lon}|${dateKey(nightDate)}|${scale.kind}|${place?.tz}`);
  const night: Night = $derived.by(() => {
    void nightKey;
    return untrack(() => nightOf(planSite, nightDate, scale));
  });
  const moons = $derived.by(() => {
    void nightKey;
    return untrack(() => nextMoons(night.start));
  });

  /** When a night's sky is at its best to look at: the start of the dark, or its darkest moment. */
  const nightStart = (n: Night) => n.dark[0]?.start ?? n.darkest.time;

  // Opened in daylight without a time in the link: tonight once it is dark.
  let started = false;
  $effect(() => {
    if (!app.ready || started) return;
    started = true;
    untrack(() => {
      if (new URLSearchParams(location.search).has('t') || !place) return;
      if (sunAltitude(app.time, place.lat, place.lon) > -6) {
        const today = civilDateOf(app.time, scale);
        const hour = (((toWall(app.time, scale) % DAY) + DAY) % DAY) / HOUR;
        app.setTime(nightStart(nightOf(site, hour < 12 && sunAltitude(app.time, place.lat, place.lon) < 0 ? addDays(today, -1) : today, scale)));
        app.pause();
      }
    });
  });

  function setTime(ms: number) {
    app.setTime(ms);
    app.pause();
  }
  /** Another night, at the same moment of it. */
  const shiftNight = (days: number) => setTime(app.time + days * DAY);
  function goToDate(date: CivilDate) {
    setTime(nightStart(nightOf(site, date, scale)));
  }
  function onDateInput(e: Event) {
    const [y, m, d] = (e.currentTarget as HTMLInputElement).value.split('-').map(Number);
    if (y && m && d) goToDate({ year: y, month: m, day: d });
  }
  const isoDate = (d: CivilDate) => `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

  // --- Targets ---------------------------------------------------------------------------------

  let selectedId = $state<string | null>(findTarget(decodeURIComponent(location.hash.slice(1)))?.id ?? null);
  $effect(() => {
    const id = selectedId;
    untrack(() => history.replaceState(null, '', `${location.pathname}${location.search}${id ? `#${id}` : ''}`));
  });

  /**
   * The lowest altitude that counts for a target: the one chosen, but at most 10° for the core of
   * the Milky Way, which is photographed low over the landscape and from mid-northern latitudes
   * never gets much higher.
   */
  const minAltFor = (t: Target | null) => (t?.kind === 'core' ? Math.min(prefs.minAlt, 10) : prefs.minAlt);

  const rows = $derived.by(() => {
    const n = night;
    void prefs.minAlt;
    return untrack(() =>
      TARGETS.map((t) => {
        const target = targetNow(t, n.darkest.time, planSite);
        return { target, vis: visibility(target, n, planSite, minAltFor(t)) };
      }).sort((a, b) => b.vis.moonlessMs - a.vis.moonlessMs || b.vis.darkMs - a.vis.darkMs || b.vis.best.alt - a.vis.best.alt),
    );
  });
  const selectedRow = $derived(selectedId ? rows.find((r) => r.target.id === selectedId) ?? null : null);
  const target: Target | null = $derived(selectedRow?.target ?? null);
  /** The target's direction now (planets and the Moon move). */
  const targetV = $derived(target ? targetVector(target, app.time, site) : null);
  const targetDec = $derived(targetV ? (Math.asin(targetV[2]) * 180) / Math.PI : 0);

  // The year of nights, worked out when a target needs it and kept per place and year.
  let yearCache: { key: string; data: YearNights } | null = null;
  const year = $derived.by(() => {
    const t = target;
    if (!t || t.kind === 'planet' || t.kind === 'moon') return null;
    const y = nightDate.year;
    const key = `${planSite.lat},${planSite.lon}|${y}|${scale.kind}|${place?.tz}`;
    const min = minAltFor(t);
    return untrack(() => {
      if (yearCache?.key !== key) yearCache = { key, data: yearNights(planSite, y, scale) };
      const nights = yearCache.data.nights;
      return {
        data: yearVisibility(t, yearCache.data, min),
        dates: nights.map((n) => n.date),
        current: nights.findIndex((n) => n.date.month === nightDate.month && n.date.day === nightDate.day),
      };
    });
  });

  // --- The chart --------------------------------------------------------------------------------

  let tab = $state<'sky' | 'map'>('sky');
  let view = $state<View>({ az: 180, alt: 90, fov: 186 });
  let chart: SkyChart | undefined = $state();
  let lightMap: LightMap | undefined = $state();
  const fieldNow = $derived(field(prefs.camera));
  const cameraFrame = $derived(
    targetV
      ? {
          centre: targetV,
          width: fieldNow.width,
          height: fieldNow.height,
          rotation: prefs.camera.rotation,
          label: `${prefs.camera.focal} mm · ${fieldNow.width.toFixed(1)}° × ${fieldNow.height.toFixed(1)}°`,
        }
      : null,
  );

  function select(id: string) {
    selectedId = id;
  }
  function look() {
    if (!targetV) return;
    tab = 'sky';
    chart?.lookAt(targetV, Math.max(1, Math.min(120, fieldNow.diagonal * 2.4)));
  }

  /** "sets 15:54 · rises 08:44", in the order they happen. */
  const moonEvents = $derived(
    [...night.moon.rises.map((t) => ({ t, w: 'rises' })), ...night.moon.sets.map((t) => ({ t, w: 'sets' }))]
      .sort((a, b) => a.t - b.t)
      .map((e) => `${e.w} ${clock(e.t)}`)
      .join(' · '),
  );
  const darkMs = $derived(totalMs(night.dark));
  const moonlessMs = $derived(totalMs(night.moonless));

  // Light, dark or following the system; shared with the other apps.
  const THEME_ORDER = ['auto', 'light', 'dark'] as const;
  const THEME_TITLES = {
    auto: 'Theme: following the system (click for light)',
    light: 'Theme: light (click for dark)',
    dark: 'Theme: dark (click to follow the system)',
  };
  const cycleTheme = () => (settings.theme = THEME_ORDER[(THEME_ORDER.indexOf(settings.theme) + 1) % 3]);
</script>

<div class="app" data-theme={theme} style:--panel-width={panelWidth ? `${panelWidth}px` : undefined}>
  <aside class="panel" bind:this={panelEl}>
    <header>
      <h1>Night Sky</h1>
      <button
        class="icon"
        class:on={prefs.nightVision}
        onclick={() => (prefs.nightVision = !prefs.nightVision)}
        title={prefs.nightVision ? 'Night vision on: everything in red (click for normal colours)' : 'Night vision: everything in red, to keep your eyes used to the dark'}
        aria-pressed={prefs.nightVision}
        aria-label="Night vision"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" fill="none" stroke="currentColor" stroke-width="1.5" /><circle cx="10" cy="10" r="2.6" fill="currentColor" /></svg>
      </button>
      <button class="icon" onclick={cycleTheme} title={THEME_TITLES[settings.theme]} aria-label={THEME_TITLES[settings.theme]}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          {#if settings.theme === 'light'}
            <circle cx="10" cy="10" r="3.6" fill="currentColor" />
            <path d="M10 2v2.4M10 15.6V18M2 10h2.4M15.6 10H18M4.3 4.3l1.7 1.7M14 14l1.7 1.7M4.3 15.7 6 14M14 6l1.7-1.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          {:else if settings.theme === 'dark'}
            <path d="M15.5 12.6A6.5 6.5 0 0 1 7.4 4.5a6.5 6.5 0 1 0 8.1 8.1z" fill="currentColor" />
          {:else}
            <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
          {/if}
        </svg>
      </button>
      <AppSwitch compact />
    </header>
    <PlaceSearch
      onselect={(p) => {
        app.replaceSelected(p);
        lightMap?.flyTo(p.lat, p.lon);
      }}
    />

    <section class="night">
      <div class="row">
        <button class="dl-btn dl-btn--icon" onclick={() => shiftNight(-1)} aria-label="Night before" title="Night before">‹</button>
        <label class="date">
          <span>Night of</span>
          <input class="dl-input" type="date" value={isoDate(nightDate)} onchange={onDateInput} aria-label="Night of" />
        </label>
        <button class="dl-btn dl-btn--icon" onclick={() => shiftNight(1)} aria-label="Night after" title="Night after">›</button>
        <button class="dl-btn" onclick={() => app.goLive()} title="Back to the real time">Now</button>
      </div>
      <h2>{formatDate(nightDate, 'long')}{place ? ` · ${place.name}` : ''}</h2>
      <dl>
        <dt>Sunset</dt>
        <dd>
          {#if night.sunset || night.sunrise}
            {night.sunset ? clock(night.sunset) : 'none'}{night.sunrise ? ` · sunrise ${clock(night.sunrise)}` : ' · no sunrise'}
          {:else if night.sunAlt[0] < 0}
            Polar night: the Sun stays below the horizon
          {:else}
            Midnight sun: the Sun stays up
          {/if}
        </dd>
        <dt>Dark</dt>
        <dd>
          {#if night.darkness === 'astronomical'}
            {clock(night.dusk.astronomical!)}–{clock(night.dawn.astronomical!)} ({formatDuration(darkMs / 60000)}), the Sun 18° or more below the horizon
          {:else if night.darkness === 'nautical'}
            <span class="warn">No full darkness tonight</span>: the Sun gets only {Math.abs(night.darkest.sunAlt).toFixed(1)}° below the horizon (at {clock(night.darkest.time)}); nautical twilight
            {clock(night.dark[0].start)}–{clock(night.dark[0].end)}
          {:else if night.darkness === 'civil'}
            <span class="warn">Bright all night</span>: the Sun gets only {Math.abs(night.darkest.sunAlt).toFixed(1)}° below the horizon
          {:else}
            <span class="warn">The Sun does not set</span>
          {/if}
        </dd>
        <dt>Moon</dt>
        <dd>
          {night.moon.name}, {Math.round(night.moon.fraction * 100)}% lit{moonEvents ? ` · ${moonEvents}` : night.moon.upAtStart ? ' · up all night' : ' · down all night'}
        </dd>
        <dt>No Moon</dt>
        <dd>
          {#if moonlessMs > 0}
            <b class="good">{formatDuration(moonlessMs / 60000)}</b> of dark with the Moon down: {night.moonless.map((i) => `${clock(i.start)}–${clock(i.end)}`).join(' and ')}
          {:else if darkMs > 0}
            <span class="warn">none</span>: the Moon is up all through the dark
          {:else}
            –
          {/if}
        </dd>
        <dt>Next</dt>
        <dd>
          {#if moons.newMoon}new Moon {formatDate(civilDateOf(moons.newMoon, scale), 'short')}{/if}{#if moons.fullMoon}, full Moon {formatDate(civilDateOf(moons.fullMoon, scale), 'short')}{/if}
        </dd>
      </dl>
    </section>

    {#if target && selectedRow}
      <TargetDetails
        {target}
        dec={targetDec}
        vis={selectedRow.vis}
        {night}
        minAlt={minAltFor(target)}
        camera={prefs.camera}
        {year}
        {scale}
        hourCycle={hc}
        onlook={look}
        onframe={(focal) => (prefs.camera.focal = focal)}
        onpickdate={(d) => setTime(app.time + (Date.UTC(d.year, d.month - 1, d.day) - Date.UTC(nightDate.year, nightDate.month - 1, nightDate.day)))}
        onclose={() => (selectedId = null)}
      />
    {/if}

    <CameraPanel />

    <TargetList {rows} darkMs={Math.max(darkMs, 1)} {selectedId} noDark={darkMs === 0} {scale} hourCycle={hc} onselect={select} />

    <footer class="credits">
      <p>
        Sun, Moon and planets: <a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener">astronomy-engine</a>. {STAR_CREDIT}
        {CONSTELLATION_CREDIT}
        {MILKY_WAY_CREDIT}
        {DSO_CREDIT} Night lights: NASA GIBS, VIIRS 2016.
      </p>
      <OfflineStorage />
    </footer>
  </aside>

  <main class="main">
    <div class="grip">
      <Splitter
        axis="x"
        label="Panel width"
        onstart={() => (startWidth = panelEl?.offsetWidth ?? 0)}
        onmove={(d) => sizes.set('panel', clamp(startWidth + d, 300, Math.min(720, window.innerWidth - 320)))}
        onreset={() => sizes.clear('panel')}
      />
    </div>
    <div class="toolbar">
      <div class="tabs" role="tablist" aria-label="View">
        <button role="tab" aria-selected={tab === 'sky'} class:on={tab === 'sky'} onclick={() => (tab = 'sky')}>Sky</button>
        <button
          role="tab"
          aria-selected={tab === 'map'}
          class:on={tab === 'map'}
          onclick={() => {
            tab = 'map';
            requestAnimationFrame(() => lightMap?.resize());
          }}>Dark sites map</button
        >
      </div>
      {#if tab === 'sky'}
        <div class="layers">
          <label><input type="checkbox" autocomplete="off" bind:checked={prefs.layers.constellations} /> Constellations</label>
          <label><input type="checkbox" autocomplete="off" bind:checked={prefs.layers.names} /> Names</label>
          <label><input type="checkbox" autocomplete="off" bind:checked={prefs.layers.milkyWay} /> Milky Way</label>
          <label><input type="checkbox" autocomplete="off" bind:checked={prefs.layers.deepSky} /> Deep sky</label>
          <label><input type="checkbox" autocomplete="off" bind:checked={prefs.layers.frame} /> Frame</label>
          <label><input type="checkbox" autocomplete="off" bind:checked={prefs.layers.grid} /> Grid</label>
          <label title="Off: see through the ground to what is below the horizon"><input type="checkbox" autocomplete="off" bind:checked={prefs.layers.ground} /> Ground</label>
          <label title="Off: a dark sky whatever the Sun and the Moon do, to see what is about to rise"><input type="checkbox" autocomplete="off" bind:checked={prefs.layers.atmosphere} /> Atmosphere</label>
        </div>
        <div class="zoom">
          <button class="dl-btn" onclick={() => chart?.wholeSky()} title="The whole sky, the zenith in the middle">Whole sky</button>
          {#if targetV}<button class="dl-btn" onclick={look} title="Turn to the selected target">Target</button>{/if}
          <button class="dl-btn dl-btn--icon" onclick={() => chart?.zoom(1 / 1.5)} aria-label="Zoom in">+</button>
          <button class="dl-btn dl-btn--icon" onclick={() => chart?.zoom(1.5)} aria-label="Zoom out">−</button>
        </div>
      {:else}
        <div class="layers">
          <select class="dl-input" bind:value={prefs.basemap} aria-label="Background map">
            {#each BASEMAPS.filter((b) => !b.mapy) as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
          </select>
          <label>Lights <input type="range" min="0" max="1" step="0.05" bind:value={prefs.lightsOpacity} aria-label="Night lights opacity" /></label>
        </div>
        {#if place}
          <a
            class="dl-btn external"
            href="https://www.lightpollutionmap.info/#zoom=10.00&lat={place.lat.toFixed(4)}&lon={place.lon.toFixed(4)}"
            target="_blank"
            rel="noopener"
            title="The sky's brightness and the Bortle class at the place, from more sources, on lightpollutionmap.info">Light pollution map ↗</a
          >
        {/if}
      {/if}
    </div>
    <div class="stage">
      <div class="pane" hidden={tab !== 'sky'}>
        <SkyChart
          bind:this={chart}
          bind:view
          {site}
          time={app.time}
          layers={prefs.layers}
          selected={target && targetV ? { id: target.id, v: targetV, label: target.title } : null}
          camera={cameraFrame}
          onpick={select}
        />
        <p class="when">{formatDate(civilDateOf(app.time, scale), 'medium')} {clock(app.time)}{app.live ? ' · now' : ''}</p>
      </div>
      <div class="pane" hidden={tab !== 'map'}>
        <LightMap
          bind:this={lightMap}
          place={place ? { lat: place.lat, lon: place.lon } : null}
          basemap={prefs.basemap}
          lightsOpacity={prefs.lightsOpacity}
          onpick={(lat, lon) => app.pickPoint(lat, lon)}
          onmove={(lat, lon) => app.movePoint(lat, lon)}
        />
        <p class="maplegend">
          Lights of the Earth at night seen from space (NASA, VIIRS 2016): the light that brightens the sky. Look for a spot far from the bright patches, and
          with the brightest towns away from the part of the sky to photograph. Click the map to move the place.
        </p>
      </div>
    </div>
    <div class="timeline">
      <NightTimeline
        {night}
        {scale}
        hourCycle={hc}
        time={app.time}
        target={selectedRow?.vis.alt ?? null}
        targetName={target?.title ?? ''}
        windows={selectedRow?.vis.moonlessWindows ?? []}
        minAlt={minAltFor(target)}
        onpick={setTime}
      />
    </div>
  </main>
  {#if prefs.nightVision}<div class="red" aria-hidden="true"></div>{/if}
</div>

<style>
  :global(body) {
    margin: 0;
    font: 15px/1.45 system-ui, sans-serif;
    background: #090c16;
  }
  .app {
    --bg: #0a0e1a;
    --surface: #131a2b;
    --fg: #e6e9f2;
    --muted: #98a1ba;
    --border: #273149;
    --accent: #ffc247;
    --dl-bg: var(--bg);
    --dl-surface: var(--surface);
    --dl-fg: var(--fg);
    --dl-muted: var(--muted);
    --dl-border: var(--border);
    --dl-accent: var(--accent);
    --dl-color-scheme: dark;
    color-scheme: var(--dl-color-scheme);
    display: grid;
    grid-template-columns: var(--panel-width, minmax(320px, 410px)) minmax(0, 1fr);
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
    --accent: #b86e00;
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
    gap: 8px;
  }
  h1 {
    margin: 0 auto 0 0;
    font-size: 1.35rem;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--fg);
    cursor: pointer;
  }
  .icon:hover,
  .icon.on {
    border-color: var(--accent);
  }
  .icon.on {
    color: #ff5a5a;
  }
  .icon svg {
    width: 17px;
    height: 17px;
  }
  .panel :global(section) {
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
  .panel :global(h2) {
    margin: 0 0 6px;
    font-size: 1.1rem;
  }
  .panel :global(h3) {
    font-size: 1rem;
  }
  .panel :global(h3 small) {
    font-weight: normal;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .panel :global(dl) {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
    font-size: 14px;
  }
  .panel :global(dt) {
    color: var(--muted);
  }
  .panel :global(dd) {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .panel :global(.link) {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
    text-align: left;
  }
  .night h2 {
    margin-top: 10px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: end;
  }
  .date {
    flex: 1;
    display: grid;
    min-width: 0;
  }
  .date span {
    font-size: 12px;
    color: var(--muted);
  }
  .date input {
    width: 100%;
    box-sizing: border-box;
  }
  .good {
    color: #62d394;
  }
  .warn {
    color: #ffb347;
  }
  .credits {
    font-size: 12px;
    color: var(--muted);
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }
  .credits a {
    color: var(--accent);
  }
  .main {
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-height: 0;
    min-width: 0;
    background: #03050c;
  }
  .grip {
    position: absolute;
    left: -5px;
    top: 0;
    bottom: 0;
    width: 10px;
    z-index: 5;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    padding: 8px 10px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .tabs {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  .tabs button {
    font: inherit;
    padding: 6px 12px;
    border: 0;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
  }
  .tabs button + button {
    border-left: 1px solid var(--border);
  }
  .tabs button.on {
    background: color-mix(in srgb, var(--accent) 20%, var(--surface));
    color: var(--fg);
    font-weight: 600;
  }
  .layers {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: center;
    color: var(--muted);
  }
  .layers select {
    height: 32px;
  }
  .zoom {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }
  .zoom .dl-btn {
    height: 32px;
    min-width: 32px;
  }
  .external {
    height: 32px;
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
  .zoom .dl-btn--icon {
    width: 32px;
  }
  .stage {
    position: relative;
    min-height: 0;
  }
  .pane {
    position: absolute;
    inset: 0;
  }
  .pane[hidden] {
    display: none;
  }
  .when {
    position: absolute;
    left: 10px;
    bottom: 8px;
    margin: 0;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgb(8 12 26 / 0.7);
    color: #e6e9f2;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .maplegend {
    position: absolute;
    left: 10px;
    bottom: 30px;
    max-width: 460px;
    margin: 0;
    padding: 6px 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    font-size: 12px;
    pointer-events: none;
  }
  .timeline {
    padding: 4px 6px 2px;
    background: #070a14;
    border-top: 1px solid var(--border);
  }
  /* Night vision: everything multiplied by red, so only red light is left. */
  .red {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: #c80000;
    mix-blend-mode: multiply;
    pointer-events: none;
  }
  @media (max-width: 760px) {
    .app {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto;
      height: auto;
    }
    .main {
      grid-row: 1;
      grid-template-rows: auto 62dvh auto;
    }
    .grip {
      display: none;
    }
    .panel {
      grid-row: 2;
      overflow: visible;
      border-right: 0;
    }
    .zoom {
      margin-left: 0;
    }
  }
</style>
