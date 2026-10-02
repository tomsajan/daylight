<!--
  Svelte wrapper around GlobeRenderer. Fills its parent.
  Marker styling: see globe.css (override `.globe-marker` etc. in a design).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { GlobeRenderer, type GlobeMarker, type GlobeOptions } from './GlobeRenderer';
  import type { SolarEclipse } from '../eclipse/elements';
  import './globe.css';

  interface Props {
    time: number;
    markers?: GlobeMarker[];
    selectedId?: string | null;
    options?: Partial<GlobeOptions>;
    /** Fly to this point whenever it changes. */
    focus?: { lat: number; lon: number } | null;
    /** Camera distance in Earth radii when flying to `focus`. */
    focusDistance?: number;
    /** A solar eclipse to draw: its path, and the Moon's shadow while it is under way. */
    eclipse?: SolarEclipse | null;
    /** ΔT for the eclipse, seconds; measured or extrapolated by default. */
    eclipseDeltaT?: number;
    onpick?: (lat: number, lon: number) => void;
    onmarker?: (id: string) => void;
  }

  let {
    time,
    markers = [],
    selectedId = null,
    options = {},
    focus = null,
    focusDistance,
    eclipse = null,
    eclipseDeltaT,
    onpick,
    onmarker,
  }: Props = $props();

  let container: HTMLDivElement;
  let globe = $state<GlobeRenderer | null>(null);

  export function flyTo(lat: number, lon: number, distance?: number) {
    globe?.flyTo(lat, lon, distance);
  }
  export function zoomIn() {
    globe?.zoom(0.7);
  }
  export function zoomOut() {
    globe?.zoom(1 / 0.7);
  }
  export function renderer() {
    return globe;
  }

  onMount(() => {
    const g = new GlobeRenderer(container, $state.snapshot(options) as Partial<GlobeOptions>);
    globe = g;
    return () => {
      g.dispose();
      globe = null;
    };
  });

  $effect(() => {
    if (!globe) return;
    globe.onPick = onpick ?? null;
    globe.onMarkerClick = onmarker ?? null;
  });
  $effect(() => {
    globe?.setTime(time);
  });
  $effect(() => {
    globe?.setMarkers($state.snapshot(markers) as GlobeMarker[], selectedId);
  });
  $effect(() => {
    globe?.setOptions($state.snapshot(options) as Partial<GlobeOptions>);
  });
  $effect(() => {
    globe?.setEclipse(eclipse, eclipseDeltaT);
  });

  let lastFocus = '';
  $effect(() => {
    if (!globe || !focus) return;
    const key = `${focus.lat.toFixed(4)},${focus.lon.toFixed(4)}`;
    if (key === lastFocus) return;
    // The first focus jumps without animation.
    globe.flyTo(focus.lat, focus.lon, focusDistance, lastFocus ? 1200 : 1);
    lastFocus = key;
  });
</script>

<div class="globe" bind:this={container}></div>

<style>
  .globe {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
</style>
