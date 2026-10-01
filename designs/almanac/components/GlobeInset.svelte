<!--
  Figure 3: the globe as a framed plate. Tapping the globe shows that place,
  or adds it to the comparison when "Add to comparison" is chosen.
-->
<script lang="ts">
  import Globe from '$core/globe/Globe.svelte';
  import { FIT_DISTANCE } from '$core/globe/GlobeRenderer';
  import { app, MAX_PLACES } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { globeOptions } from '$core/state/views';
  import { formatClock } from '$core/time/format';
  import { almanacMarkers } from '../almanac.svelte';

  interface Props {
    /** Tapping the globe adds a place instead of replacing the selected one. */
    compare: boolean;
  }
  let { compare = $bindable() }: Props = $props();

  let globe: Globe | undefined = $state();
  const full = $derived(app.places.length >= MAX_PLACES);
</script>

<figure class="fig globe-fig">
  <header class="fig-head">
    <p class="fig-no">Figure 3</p>
    <h2>Earth at {formatClock(app.time, app.scale, settings.hourCycle)}</h2>
  </header>

  <div class="plate">
    <Globe
      bind:this={globe}
      time={app.time}
      markers={almanacMarkers()}
      selectedId={app.selected?.id}
      options={{ ...globeOptions(), atmosphereColor: '#9cc0f0', terminatorColor: '#f3d27a' }}
      focus={app.selected}
      focusDistance={FIT_DISTANCE * 1.12}
      onpick={(lat, lon) => app.pickPoint(lat, lon, compare)}
      onmarker={(id) => app.select(id)}
    />
    <div class="tools">
      <button type="button" onclick={() => globe?.zoomIn()} aria-label="Zoom in on the globe" title="Zoom in">+</button>
      <button type="button" onclick={() => globe?.zoomOut()} aria-label="Zoom out on the globe" title="Zoom out">−</button>
      {#if app.selected}
        <button
          type="button"
          class="centre"
          onclick={() => app.selected && globe?.flyTo(app.selected.lat, app.selected.lon, FIT_DISTANCE * 1.12)}
          title="Turn the globe back to {app.selected.name}">Centre</button
        >
      {/if}
    </div>
  </div>

  <fieldset class="tap">
    <legend>Tapping the globe</legend>
    <label><input type="radio" name="alm-tap" value={false} bind:group={compare} /> shows that place</label>
    <label><input type="radio" name="alm-tap" value={true} bind:group={compare} /> adds it to the comparison</label>
  </fieldset>
  {#if compare && full}
    <p class="warn">You are comparing {MAX_PLACES} places, the most there can be; a new one replaces the selected place.</p>
  {/if}

  <figcaption>
    The shaded side is in night. The soft edges around it are the twilight zones, and the small sun marks the point where the sun is overhead. Drag
    to turn the globe.
  </figcaption>
</figure>

<style>
  .plate {
    position: relative;
    margin-top: 14px;
    aspect-ratio: 1;
    max-height: 440px;
    width: 100%;
    background: radial-gradient(circle at 50% 45%, #1d2640 0%, #0e1322 70%);
    outline: 1px solid var(--ink);
    outline-offset: 4px;
  }
  .tools {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: flex;
    gap: 4px;
  }
  .tools button {
    min-width: 34px;
    height: 34px;
    padding: 0 8px;
    border: 1px solid rgb(255 255 255 / 0.35);
    border-radius: 2px;
    background: rgb(14 19 34 / 0.6);
    color: #f1ead6;
    font: 500 0.95rem/1 var(--sans);
    cursor: pointer;
  }
  .tools .centre {
    font-size: 0.78rem;
    font-weight: 600;
  }
  .tools button:hover {
    border-color: #f1ead6;
  }
  .tap {
    margin: 16px 0 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-family: var(--sans);
    font-size: 0.85rem;
  }
  .tap legend {
    float: left;
    padding: 0;
    margin-right: 4px;
    color: var(--muted);
  }
  .tap label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    cursor: pointer;
  }
  .tap input {
    accent-color: var(--ink);
    width: 16px;
    height: 16px;
    margin: 0;
  }
  .warn {
    margin: 6px 0 0;
    font-size: 0.82rem;
    color: var(--alert);
  }
  /* Phones: a little narrower than the column so a thumb can still scroll past the globe. */
  @media (max-width: 759px) {
    .plate {
      width: calc(100% - 40px);
      margin-left: auto;
      margin-right: auto;
    }
    .tap legend {
      float: none;
      width: 100%;
    }
  }
</style>
