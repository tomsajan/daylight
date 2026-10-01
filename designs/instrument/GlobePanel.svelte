<!--
  The globe on a dark "screen" inset (in both themes), with the tap mode
  switch, zoom buttons and a subsolar-point readout.
-->
<script lang="ts">
  import Globe from '$core/globe/Globe.svelte';
  import { FIT_DISTANCE } from '$core/globe/GlobeRenderer';
  import { subsolarPoint } from '$core/astro/sun';
  import { app, MAX_PLACES } from '$core/state/app.svelte';
  import { globeMarkers, globeOptions } from '$core/state/views';
  import { formatCoordinates } from '$core/geo/place';
  import Panel from './Panel.svelte';
  import Icon from './Icon.svelte';
  import { ICON } from './icons';
  import { ui } from './ui.svelte';

  let globe: Globe | undefined = $state();
  const DIST = FIT_DISTANCE * 1.22;
  const subsolar = $derived(subsolarPoint(app.time));
  const full = $derived(app.places.length >= MAX_PLACES);

  function fit() {
    const p = app.selected;
    if (p) globe?.flyTo(p.lat, p.lon, DIST);
  }
</script>

<Panel title="Globe" flush class="globe-panel">
  {#snippet tools()}
    <span class="lbl">Tap</span>
    <div class="seg" role="radiogroup" aria-label="What tapping the globe does">
      <button type="button" class="btn" role="radio" aria-checked={ui.pickMode === 'replace'} class:on={ui.pickMode === 'replace'} onclick={() => (ui.pickMode = 'replace')} title="Tapping the globe replaces the selected place (A to switch)">Replace</button>
      <button type="button" class="btn" role="radio" aria-checked={ui.pickMode === 'add'} class:on={ui.pickMode === 'add'} onclick={() => (ui.pickMode = 'add')} title="Tapping the globe adds a place to compare (A to switch)">+ Add</button>
    </div>
  {/snippet}

  <div class="screen">
    <Globe
      bind:this={globe}
      time={app.time}
      markers={globeMarkers()}
      selectedId={app.selected?.id}
      options={globeOptions()}
      focus={app.selected}
      focusDistance={DIST}
      onpick={(lat, lon) => app.pickPoint(lat, lon, ui.pickMode === 'add')}
      onmarker={(id) => app.select(id)}
    />
    <div class="zoom">
      <button type="button" class="sbtn" onclick={() => globe?.zoomIn()} aria-label="Zoom in" title="Zoom in"><Icon d={ICON.plus} /></button>
      <button type="button" class="sbtn" onclick={() => globe?.zoomOut()} aria-label="Zoom out" title="Zoom out"><Icon d={ICON.minus} /></button>
      <button type="button" class="sbtn" onclick={fit} aria-label="Centre on the selected place" title="Centre on the selected place"><Icon d={ICON.fit} /></button>
    </div>
    <div class="hud num">
      <span class="k">Sun overhead</span>
      <span>{formatCoordinates(subsolar.lat, subsolar.lon, 1)}</span>
    </div>
    <div class="mode" class:add={ui.pickMode === 'add'}>
      {#if ui.pickMode === 'add'}
        {full ? 'Tap replaces the selected place (6 max)' : `Tap adds a place · ${app.places.length}/${MAX_PLACES}`}
      {:else}
        Tap replaces {app.selected?.name ?? 'the selected place'}
      {/if}
    </div>
  </div>
</Panel>

<style>
  .screen {
    position: relative;
    height: 100%;
    min-height: 200px;
    background:
      radial-gradient(circle at 50% 50%, #0d1522 0%, var(--screen) 70%),
      var(--screen);
    color: var(--screen-ink);
  }
  .zoom {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sbtn {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid rgb(201 211 225 / 0.28);
    border-radius: var(--r);
    background: rgb(5 8 13 / 0.6);
    color: var(--screen-ink);
    cursor: pointer;
    touch-action: manipulation;
  }
  .sbtn:hover {
    border-color: rgb(201 211 225 / 0.7);
  }
  .hud {
    position: absolute;
    left: 8px;
    bottom: 8px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px 7px;
    font-size: 11px;
    background: rgb(5 8 13 / 0.6);
    border-left: 2px solid #ffc23c;
    pointer-events: none;
  }
  .k {
    font: 600 9.5px var(--sans);
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: rgb(201 211 225 / 0.65);
  }
  .mode {
    position: absolute;
    left: 8px;
    top: 8px;
    max-width: calc(100% - 60px);
    padding: 3px 7px;
    font: 500 11px var(--sans);
    color: rgb(201 211 225 / 0.85);
    background: rgb(5 8 13 / 0.6);
    border-left: 2px solid rgb(201 211 225 / 0.4);
    pointer-events: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mode.add {
    border-left-color: var(--led-live);
    color: #fff;
  }
</style>
