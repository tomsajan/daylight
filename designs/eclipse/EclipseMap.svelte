<!--
  The zoomable map: a background map (see basemaps.ts) with the eclipse drawn
  over it by EclipseLayer, a marker for the chosen place, and a readout of the
  eclipse under the pointer.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Map as MapLibreMap, Marker, NavigationControl, ScaleControl, setWorkerUrl, type LngLatBoundsLike } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import { localCircumstances, type SolarEclipse } from '$core/eclipse';
  import { EclipseLayer, type EclipseLayerOptions } from './eclipseLayer';
  import { BASEMAPS, mapyKey } from './basemaps';
  import { describeLocal } from './describe';

  setWorkerUrl(workerUrl);

  interface Props {
    eclipse: SolarEclipse | null;
    time: number;
    place: { lat: number; lon: number } | null;
    placeColor?: string;
    basemap: string;
    /** Changes when the Mapy.com key does, to reload its tiles. */
    keyVersion?: number;
    layers: Omit<EclipseLayerOptions, 'dark'>;
    onpick?: (lat: number, lon: number) => void;
  }
  let { eclipse, time, place, placeColor = '#f2a516', basemap, keyVersion = 0, layers, onpick }: Props = $props();

  let container: HTMLDivElement;
  let map: MapLibreMap | undefined = $state();
  const layer = new EclipseLayer();
  let marker: Marker | undefined;
  let hover = $state<{ x: number; y: number; text: string } | null>(null);

  const base = $derived(BASEMAPS.find((b) => b.id === basemap) ?? BASEMAPS[0]);

  /** Under the map's labels, so place names stay readable. */
  function addLayer(m: MapLibreMap) {
    if (m.getLayer(layer.id)) return;
    const firstLabel = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    m.addLayer(layer, firstLabel);
  }

  onMount(() => {
    const m = new MapLibreMap({
      container,
      style: base.style(mapyKey()),
      center: [place?.lon ?? 0, place?.lat ?? 20],
      zoom: 1.6,
      attributionControl: { compact: true },
      maxPitch: 60,
    });
    m.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    m.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
    m.on('style.load', () => {
      m.setProjection({ type: 'globe' });
      addLayer(m);
    });
    m.on('click', (ev) => onpick?.(ev.lngLat.lat, ev.lngLat.lng));
    let pending = 0;
    m.on('mousemove', (ev) => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        if (!eclipse) return (hover = null);
        const local = localCircumstances(eclipse, { lat: ev.lngLat.lat, lon: ev.lngLat.lng });
        hover = { x: ev.point.x, y: ev.point.y, text: describeLocal(local).short };
      });
    });
    m.on('mouseout', () => {
      cancelAnimationFrame(pending);
      hover = null;
    });
    map = m;
    pendingView?.(m);
    pendingView = null;
    return () => {
      m.remove();
      map = undefined;
    };
  });

  // A new background map: the style is replaced, and style.load puts the eclipse back.
  let shownStyle = '';
  $effect(() => {
    const key = `${base.id}|${keyVersion}`;
    if (!map || key === shownStyle) return;
    const first = !shownStyle;
    shownStyle = key;
    // A full load rather than a diff, so style.load fires and the eclipse goes back on.
    if (!first) map.setStyle(base.style(mapyKey()), { diff: false });
  });

  $effect(() => layer.setOptions({ ...layers, dark: base.dark }));
  $effect(() => layer.setEclipse(eclipse));
  $effect(() => layer.setTime(time));

  $effect(() => {
    if (!map) return;
    if (!place) {
      marker?.remove();
      marker = undefined;
      return;
    }
    if (!marker) marker = new Marker({ color: placeColor }).setLngLat([place.lon, place.lat]).addTo(map);
    else marker.setLngLat([place.lon, place.lat]);
  });

  // A view asked for before the map exists is applied once it does.
  let pendingView: ((m: MapLibreMap) => void) | null = null;
  function whenReady(view: (m: MapLibreMap) => void) {
    if (map) view(map);
    else pendingView = view;
  }

  export function flyTo(lat: number, lon: number, zoom?: number) {
    whenReady((m) => m.flyTo({ center: [lon, lat], zoom: zoom ?? m.getZoom(), essential: true }));
  }

  export function fitBounds(bounds: LngLatBoundsLike) {
    whenReady((m) => m.fitBounds(bounds, { padding: 40, maxZoom: 6, essential: true }));
  }

  export function panTo(lat: number, lon: number) {
    map?.jumpTo({ center: [lon, lat] });
  }
</script>

<div class="map" bind:this={container}>
  {#if base.mapy}
    <a class="mapy-logo" href="https://mapy.com/" target="_blank" rel="noopener">
      <img src="https://api.mapy.com/img/api/logo.svg" alt="Mapy.com" />
    </a>
  {/if}
</div>
{#if hover}
  <div class="hover" style:left="{hover.x}px" style:top="{hover.y}px">{hover.text}</div>
{/if}

<style>
  .map {
    position: absolute;
    inset: 0;
  }
  .mapy-logo {
    position: absolute;
    left: 10px;
    bottom: 10px;
    z-index: 2;
  }
  .mapy-logo img {
    display: block;
    height: 28px;
  }
  .hover {
    position: absolute;
    transform: translate(14px, 14px);
    pointer-events: none;
    background: rgb(10 14 28 / 0.85);
    color: #fff;
    font-size: 12px;
    line-height: 1.3;
    padding: 4px 8px;
    border-radius: 6px;
    white-space: nowrap;
    z-index: 3;
  }
</style>
