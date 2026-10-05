<!--
  The zoomable map: a background map (see basemaps.ts) with the eclipse drawn
  over it by EclipseLayer, a marker for the chosen place that can be dragged,
  a line from the place towards the Sun or the Moon at the current time, and a
  readout of the eclipse under the pointer. For a lunar eclipse, labels name the
  curves where the Moon rises or sets at each contact.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Map as MapLibreMap, Marker, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { formatClock } from '$core/time/format';
  import {
    globalSpan,
    localCircumstances,
    lunarContacts,
    lunarLocalCircumstances,
    lunarSpan,
    moonPlace,
    phaseAt,
    shadowView,
    subLunarPoint,
    type LunarEclipse,
    type SolarEclipse,
  } from '$core/eclipse';
  import { destination } from '$core/terrain';
  import { EclipseLayer, type EclipseLayerOptions } from './eclipseLayer';
  import { BASEMAPS, mapyKey } from './basemaps';
  import { describeLocal, describeLunar } from './describe';

  setWorkerUrl(workerUrl);

  interface Props {
    eclipse: SolarEclipse | LunarEclipse | null;
    time: number;
    place: { lat: number; lon: number } | null;
    placeColor?: string;
    basemap: string;
    /** Changes when the Mapy.com key does, to reload its tiles. */
    keyVersion?: number;
    layers: Omit<EclipseLayerOptions, 'dark'>;
    /** Draw the line from the place towards the Sun or the Moon. */
    sightLine?: boolean;
    onpick?: (lat: number, lon: number) => void;
    /** The marker is being dragged; onpick follows when it is dropped. */
    onmove?: (lat: number, lon: number) => void;
  }
  let { eclipse, time, place, placeColor = '#f2a516', basemap, keyVersion = 0, layers, sightLine = true, onpick, onmove }: Props = $props();

  let container: HTMLDivElement;
  let map: MapLibreMap | undefined = $state();
  const layer = new EclipseLayer();
  let marker: Marker | undefined;
  /** While the marker is dragged it leads and the place follows, not the other way round. */
  let dragging = false;
  let hover = $state<{ x: number; y: number; text: string } | null>(null);

  const base = $derived(BASEMAPS.find((b) => b.id === basemap) ?? BASEMAPS[0]);

  /** Under the map's labels, so place names stay readable. */
  function addLayer(m: MapLibreMap) {
    if (m.getLayer(layer.id)) return;
    const firstLabel = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    m.addLayer(layer, firstLabel);
  }

  // The way to look: from the place towards the Sun or the Moon, as far as where it stands overhead.
  // Along the ground that is a great circle, 90° less its altitude long.
  const sight = $derived.by(() => {
    if (!eclipse || !place || !sightLine) return null;
    const lunar = 'umbra' in eclipse;
    const span = lunar ? lunarSpan(eclipse) : globalSpan(eclipse);
    if (time < span.start || time > span.end) return null;
    const at = lunar ? moonPlace(eclipse, place, time) : phaseAt(eclipse, place, time);
    const length = (90 - at.altitude) * 111_195;
    let lon = place.lon;
    const line = Array.from({ length: 65 }, (_, i) => {
      const p = destination(place.lat, place.lon, at.azimuth, (length * i) / 64);
      // Longitudes carried on past the date line, so the line stays in one piece.
      lon += ((p.lon - lon + 540) % 360) - 180;
      return [lon, p.lat];
    });
    return { line, lunar, up: at.altitude > -0.8 };
  });

  function sightData() {
    return {
      type: 'Feature' as const,
      properties: { body: sight?.lunar ? 'moon' : 'sun', up: sight?.up ?? true },
      geometry: { type: 'LineString' as const, coordinates: sight?.line ?? [] },
    };
  }

  /** Over everything, labels included: it is what one looks for. */
  function addSight(m: MapLibreMap) {
    if (m.getSource('sight')) return;
    m.addSource('sight', { type: 'geojson', data: sightData() });
    m.addLayer({
      id: 'sight-casing',
      type: 'line',
      source: 'sight',
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#1a1305', 'line-width': 5, 'line-opacity': ['case', ['get', 'up'], 0.55, 0.25] },
    });
    m.addLayer({
      id: 'sight',
      type: 'line',
      source: 'sight',
      layout: { 'line-cap': 'round' },
      paint: {
        'line-color': ['match', ['get', 'body'], 'moon', '#e8e6df', '#ffc531'],
        'line-width': 2.5,
        // Fainter while the Sun or the Moon is below the horizon.
        'line-opacity': ['case', ['get', 'up'], 1, 0.4],
      },
    });
  }
  $effect(() => {
    const data = sightData();
    (map?.getSource('sight') as GeoJSONSource | undefined)?.setData(data);
  });

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
      addSight(m);
    });
    m.on('click', (ev) => onpick?.(ev.lngLat.lat, ev.lngLat.lng));
    let pending = 0;
    m.on('mousemove', (ev) => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        if (!eclipse) return (hover = null);
        const where = { lat: ev.lngLat.lat, lon: ev.lngLat.lng };
        const text =
          'umbra' in eclipse
            ? describeLunar(lunarLocalCircumstances(eclipse, where), (ms) => formatClock(ms, app.scale, settings.hourCycle)).short
            : describeLocal(localCircumstances(eclipse, where)).short;
        hover = { x: ev.point.x, y: ev.point.y, text };
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
    if (!marker) {
      const mk = new Marker({ color: placeColor, draggable: true }).setLngLat([place.lon, place.lat]).addTo(map);
      mk.getElement().title = 'Drag to move';
      let pending = 0;
      mk.on('dragstart', () => (dragging = true));
      mk.on('drag', () => {
        cancelAnimationFrame(pending);
        pending = requestAnimationFrame(() => {
          const at = mk.getLngLat();
          onmove?.(at.lat, at.lng);
        });
      });
      mk.on('dragend', () => {
        cancelAnimationFrame(pending);
        dragging = false;
        const at = mk.getLngLat();
        onpick?.(at.lat, at.lng);
      });
      marker = mk;
    } else if (!dragging) marker.setLngLat([place.lon, place.lat]);
  });

  // Lunar eclipse: each contact's curve is the Moon's horizon at that instant, a circle 90° from
  // where the Moon is overhead; labelled where it crosses the equator, on the rising and setting side.
  let labels: Marker[] = [];
  $effect(() => {
    for (const l of labels) l.remove();
    labels = [];
    if (!map || !eclipse || !('umbra' in eclipse) || !layers.path) return;
    for (const c of lunarContacts(eclipse)) {
      if (c.name === 'Greatest') continue;
      const p = subLunarPoint(eclipse, c.time);
      for (const side of [-90, 90]) {
        const el = document.createElement('div');
        el.className = 'contact-label';
        el.textContent = c.name;
        el.title = `The Moon ${side < 0 ? 'rises' : 'sets'} along this line at ${c.name}`;
        labels.push(new Marker({ element: el, opacityWhenCovered: '0' }).setLngLat([p.lon + side, 0]).addTo(map));
      }
    }
  });

  // Lunar eclipse: the Moon where it is overhead, coloured as it looks.
  let moonMarker: Marker | undefined;
  $effect(() => {
    const lunar = eclipse && 'umbra' in eclipse ? eclipse : null;
    const span = lunar ? lunarSpan(lunar) : null;
    if (!map || !lunar || !span || !layers.shadow || time < span.start || time > span.end) {
      moonMarker?.remove();
      moonMarker = undefined;
      return;
    }
    const p = subLunarPoint(lunar, time);
    const v = shadowView(lunar, time);
    if (!moonMarker) {
      const el = document.createElement('div');
      el.className = 'moon-marker';
      el.title = 'The Moon is overhead here';
      moonMarker = new Marker({ element: el, opacityWhenCovered: '0' }).setLngLat([p.lon, p.lat]).addTo(map);
    }
    moonMarker.getElement().dataset.phase = v.umbralMagnitude >= 1 ? 'total' : v.umbralMagnitude > 0 ? 'partial' : 'penumbral';
    moonMarker.setLngLat([p.lon, p.lat]);
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
  /* A crosshair to place the point with; the hand only while the map is being moved. */
  .map :global(.maplibregl-canvas-container.maplibregl-interactive) {
    cursor: crosshair;
  }
  .map :global(.maplibregl-canvas-container.maplibregl-interactive:active) {
    cursor: grabbing;
  }
  .map :global(.maplibregl-marker[aria-label='Map marker']) {
    cursor: move;
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
  :global(.moon-marker) {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #f1ead8;
    border: 2px solid rgb(255 255 255 / 0.85);
    box-shadow: 0 0 8px rgb(0 0 0 / 0.5);
  }
  :global(.moon-marker[data-phase='partial']) {
    background: linear-gradient(110deg, #f1ead8 45%, #9a3a18 55%);
  }
  :global(.moon-marker[data-phase='total']) {
    background: #a8401c;
    box-shadow: 0 0 10px rgb(220 90 40 / 0.8);
  }
  :global(.contact-label) {
    font: 600 11px/1 system-ui, sans-serif;
    color: #fff;
    background: rgb(150 50 15 / 0.85);
    padding: 2px 4px;
    border-radius: 4px;
    pointer-events: auto;
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
