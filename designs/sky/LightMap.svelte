<!--
  Where it is dark: the lights of the Earth at night as a satellite sees them (NASA's VIIRS
  Night Lights, 2016) over a background map, to find a spot far from towns. Click or drag the
  marker to move the place.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Map as MapLibreMap, Marker, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import { BASEMAPS, mapyKey, offlineStyle } from '$core/map/basemaps';

  setWorkerUrl(workerUrl);

  interface Props {
    place: { lat: number; lon: number } | null;
    basemap: string;
    /** 0-1. */
    lightsOpacity: number;
    onpick: (lat: number, lon: number) => void;
    onmove: (lat: number, lon: number) => void;
  }
  let { place, basemap, lightsOpacity, onpick, onmove }: Props = $props();

  /** NASA GIBS: night lights on a transparent background, 500 m, in web Mercator tiles to zoom 8. */
  const LIGHTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Night_Lights/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';

  let container: HTMLDivElement;
  let map: MapLibreMap | undefined = $state();
  let marker: Marker | undefined;
  let dragging = false;
  let failed = $state(false);
  const base = $derived(BASEMAPS.find((b) => b.id === basemap) ?? BASEMAPS[0]);
  let offline = $state(typeof navigator !== 'undefined' && !navigator.onLine);
  let styleFailed = $state(false);
  const useOffline = $derived(offline || styleFailed);

  function addLights(m: MapLibreMap) {
    if (m.getSource('lights')) return;
    m.addSource('lights', {
      type: 'raster',
      tiles: [LIGHTS],
      tileSize: 256,
      maxzoom: 8,
      attribution: '<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a>, VIIRS Night Lights 2016',
    });
    const firstLabel = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    m.addLayer(
      {
        id: 'lights',
        type: 'raster',
        source: 'lights',
        paint: { 'raster-opacity': lightsOpacity, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
      },
      firstLabel,
    );
  }

  onMount(() => {
    const onOnline = () => (offline = false);
    const onOffline = () => (offline = true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    let m: MapLibreMap;
    try {
      m = new MapLibreMap({
        container,
        style: useOffline ? { version: 8, sources: {}, layers: [] } : base.style(mapyKey()),
        center: [place?.lon ?? 0, place?.lat ?? 20],
        zoom: place ? 7 : 1.6,
        attributionControl: { compact: true },
        maxPitch: 0,
      });
    } catch {
      // No WebGL in this browser.
      failed = true;
      return;
    }
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
    m.on('style.load', () => addLights(m));
    m.on('error', () => {
      if (!m.isStyleLoaded()) styleFailed = true;
    });
    m.on('click', (ev) => onpick(ev.lngLat.lat, ev.lngLat.lng));
    map = m;
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      m.remove();
      map = undefined;
    };
  });

  let shownStyle = '';
  $effect(() => {
    const key = `${base.id}|${useOffline}`;
    const m = map;
    if (!m || key === shownStyle) return;
    const first = !shownStyle;
    shownStyle = key;
    if (useOffline) {
      offlineStyle(base, mapyKey()).then((style) => {
        if (shownStyle === key) m.setStyle(style, { diff: false });
      });
    } else if (!first) m.setStyle(base.style(mapyKey()), { diff: false });
  });

  $effect(() => {
    const o = lightsOpacity;
    if (map?.getLayer('lights')) map.setPaintProperty('lights', 'raster-opacity', o);
  });

  $effect(() => {
    if (!map || !place) return;
    if (!marker) {
      const mk = new Marker({ color: '#ffd25e', draggable: true }).setLngLat([place.lon, place.lat]).addTo(map);
      mk.getElement().title = 'Drag to move';
      let pending = 0;
      mk.on('dragstart', () => (dragging = true));
      mk.on('drag', () => {
        cancelAnimationFrame(pending);
        pending = requestAnimationFrame(() => {
          const at = mk.getLngLat();
          onmove(at.lat, at.lng);
        });
      });
      mk.on('dragend', () => {
        cancelAnimationFrame(pending);
        dragging = false;
        const at = mk.getLngLat();
        onpick(at.lat, at.lng);
      });
      marker = mk;
    } else if (!dragging) marker.setLngLat([place.lon, place.lat]);
  });

  export function flyTo(lat: number, lon: number, zoom = 8) {
    map?.flyTo({ center: [lon, lat], zoom, essential: true });
  }

  export function resize() {
    map?.resize();
  }
</script>

<div class="map" bind:this={container}>
  {#if failed}<p class="failed">The map needs WebGL, which this browser does not offer.</p>{/if}
</div>

<style>
  .map {
    position: absolute;
    inset: 0;
  }
  .failed {
    margin: 0;
    padding: 40px 20px;
    text-align: center;
    color: #98a1ba;
  }
</style>
