<!--
  The view towards the Sun or the Moon over the eclipse: its path across the
  sky, the skyline of the ground it has to clear, and in words whether and when
  the ground hides it. Directions run left to right, the same scale both ways.

  The picture can be dragged about, zoomed with the wheel, and enlarged to fill
  the window. Zoomed in, the skyline is worked out again with the rays
  closer together.
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { compassPoint, formatClock } from '$core/time/format';
  import {
    TERRAIN_CREDIT,
    coverOf,
    reachFor,
    seenAltitude,
    sightAt,
    skylineAt,
    terrainVisibility,
    type Sight,
    type Skyline,
    type SkyPosition,
    type SkylineRequest,
  } from '$core/terrain';
  import { ground } from './ground.svelte';
  import { terrain } from './terrain.svelte';
  import Timeline from './Timeline.svelte';

  interface Props {
    place: { lat: number; lon: number };
    body: 'Sun' | 'Moon';
    /** The body's angular radius, degrees. */
    radius: number;
    /** The eclipse at the place, first to last contact (Unix ms). */
    start: number;
    end: number;
    /** While the time is in here the body is drawn where it is now; the enlarged picture has a slider over it. */
    live: { start: number; end: number };
    /** The marks on that slider. */
    timeMarks: { time: number; label: string; short: string }[];
    /** Where the body is at a moment, without refraction. */
    position: (ms: number) => SkyPosition;
    marks: { time: number; label: string; short: string }[];
    /** What matters most: totality, or the moment of the maximum (start and end the same). */
    main: { start: number; end: number; name: string };
    /** The Moon over the Sun, in solar radii from its centre, zenith up. */
    bite?: { x: number; y: number; ratio: number } | null;
    fill?: string;
  }
  let { place, body, radius, start, end, live, timeMarks, position, marks, main, bite = null, fill = '#ffd76a' }: Props = $props();

  const W = 400;
  /** The picture is half as high as wide, and up to this high where the ground stands higher than that shows. */
  const ASPECT = 0.5;
  const MAX_HEIGHT = 440;
  const SAMPLES = 96;
  const CLOSE_WIDTH = 12;

  /** The narrowest view, degrees across; the data shows nothing finer. */
  const MIN_WIDTH = 1;

  let close = $state(false);
  let enlarged = $state(false);
  /** The view after dragging or zooming; its shape (height over width) is kept from when that began. */
  let custom = $state<{ centre: number; width: number; bottom: number; aspect: number } | null>(null);
  /** Where the pointer is in the picture, as fractions from the left and from the top. */
  let pointer = $state<{ x: number; y: number } | null>(null);
  let svg: SVGSVGElement | undefined = $state();
  /** The room the enlarged picture has, pixels. */
  let box = $state({ width: 0, height: 0 });
  const boxAspect = $derived(box.width > 0 && box.height > 0 ? box.height / box.width : ASPECT);

  const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;
  const clock = (ms: number) => formatClock(ms, app.scale, settings.hourCycle, true);

  const track = $derived(
    Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const time = start + ((end - start) * i) / SAMPLES;
      const p = position(time);
      return { time, azimuth: p.azimuth, altitude: seenAltitude(p.altitude), geometric: p.altitude };
    }),
  );

  /** The stretch of sky that holds the whole path while the body is up: directions across, and how high. */
  const whole = $derived.by(() => {
    const up = track.filter((p) => p.geometric > -1.5);
    if (!up.length) return null;
    // Directions followed along the path, so one that swings through north stays in one piece.
    let a = up[0].azimuth;
    const az = up.map((p) => (a += wrap(p.azimuth - a)));
    const lo = Math.min(...az);
    const hi = Math.max(...az);
    const top = Math.min(60, Math.max(...up.map((p) => p.altitude)) + 2);
    const width = Math.min(360, Math.max(hi - lo + 8, 30, (top + 2.5) / ASPECT));
    const height = width * ASPECT;
    return { centre: (lo + hi) / 2, width, bottom: -Math.min(2.5, height * 0.15), lowest: Math.min(...up.map((p) => p.altitude)) };
  });

  const request = $derived.by((): SkylineRequest | null => {
    if (!whole) return null;
    const step = Math.max(0.2, whole.width / 400);
    const from = whole.centre - whole.width / 2 - 1;
    return {
      lat: place.lat,
      lon: place.lon,
      from,
      to: Math.min(from + 360 - step, from + whole.width + 2),
      step,
      reach: reachFor(whole.lowest - 1),
    };
  });

  // Once the place has stayed put for a moment: not for every step of a marker being dragged.
  $effect(() => {
    const req = request;
    if (!req || !terrain.on) return;
    const timer = setTimeout(() => terrain.request(req), 350);
    return () => clearTimeout(timer);
  });

  const sky = $derived(terrain.at(place));
  const now = $derived.by(() => {
    if (app.time < live.start || app.time > live.end) return null;
    const p = position(app.time);
    return { ...p, seen: seenAltitude(p.altitude) };
  });

  const view = $derived.by(() => {
    if (!whole) return null;
    if (custom) return { ...custom, top: custom.bottom + custom.width * (enlarged ? boxAspect : custom.aspect) };
    const shape = enlarged ? boxAspect : ASPECT;
    const frame =
      close && now
        ? { centre: now.azimuth, width: CLOSE_WIDTH, bottom: Math.max(-1.5, now.seen - (CLOSE_WIDTH * shape) / 2) }
        : { centre: whole.centre, width: whole.width, bottom: whole.bottom };
    // Room for the skyline where it stands higher than the path.
    let top = frame.bottom + frame.width * ASPECT;
    if (sky) {
      for (let i = 0; i < sky.angle.length; i++) {
        if (Math.abs(wrap(sky.from + i * sky.step - frame.centre)) <= frame.width / 2) top = Math.max(top, sky.angle[i] + 1);
      }
    }
    // Enlarged, the window sets the shape, and the view widens until it all fits.
    if (enlarged) {
      const width = close && now ? frame.width : Math.min(360, Math.max(frame.width, (top - frame.bottom) / shape));
      return { ...frame, width, top: frame.bottom + width * shape };
    }
    // In the panel the picture grows taller instead, as far as it may.
    return { ...frame, top: Math.min(top, frame.bottom + (MAX_HEIGHT * frame.width) / W) };
  });

  // Zoomed in, the rays of the place's skyline are too far apart: one for what is in view, once the view rests.
  let fine = $state.raw<Skyline | null>(null);
  $effect(() => {
    const v = view;
    const s = sky;
    if (!s) return void (fine = null);
    if (!v || v.width / 400 > s.step * 0.7) return;
    const edges = fine && fine.lat === s.lat && fine.lon === s.lon && skylineAt(fine, v.centre - v.width / 2) && skylineAt(fine, v.centre + v.width / 2);
    // The one at hand will do: it spans the view and is fine enough for it.
    if (edges && fine!.step <= Math.max(0.02, v.width / 160)) return;
    const req: SkylineRequest = {
      lat: s.lat,
      lon: s.lon,
      from: v.centre - v.width,
      to: v.centre + v.width,
      step: Math.max(0.02, v.width / 240),
      reach: s.reach,
    };
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await terrain.detail(req);
      if (!stale && result) fine = result;
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });
  /** The skyline to draw and to read from: the finer one where it spans the view and is finer than the view needs. */
  const shown = $derived.by(() => {
    if (!sky || !view || !fine || fine.lat !== sky.lat || fine.lon !== sky.lon || fine.step >= sky.step) return sky;
    const spans = skylineAt(fine, view.centre - view.width / 2) && skylineAt(fine, view.centre + view.width / 2);
    return spans && view.width / 400 < sky.step ? fine : sky;
  });

  const scale = $derived(view ? W / view.width : 1);
  const H = $derived(view ? (view.top - view.bottom) * scale : W * ASPECT);
  const x = (azimuth: number) => (wrap(azimuth - view!.centre) + view!.width / 2) * scale;
  const y = (altitude: number) => H - (altitude - view!.bottom) * scale;

  /** The skyline across the view, left to right; level ground without the terrain. */
  const outline = $derived.by(() => {
    if (!view) return '';
    const s = shown;
    if (!s) return `M0,${y(0).toFixed(1)} L${W},${y(0).toFixed(1)}`;
    const pts: [number, number][] = [];
    for (let i = 0; i < s.angle.length; i++) {
      const off = wrap(s.from + i * s.step - view.centre);
      if (Math.abs(off) <= view.width / 2 + s.step) pts.push([(off + view.width / 2) * scale, y(s.angle[i])]);
    }
    pts.sort((p, q) => p[0] - q[0]);
    return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  });
  const groundShape = $derived.by(() => {
    const m = outline.match(/^M([-\d.]+),.*L([-\d.]+),[-\d.]+$/);
    return m ? `${outline} L${m[2]},${H + 2} L${m[1]},${H + 2} Z` : '';
  });

  const showing = (s: Sight | null) => !!s && s.clearance > -radius;
  /** The path, and the parts of it in which the body shows over the skyline. */
  const paths = $derived.by(() => {
    if (!view) return { all: '', seen: '' };
    let all = '';
    let seen = '';
    let prevX = NaN;
    let drawing = false;
    for (const p of track) {
      const px = x(p.azimuth);
      const point = `${px.toFixed(1)},${y(p.altitude).toFixed(1)}`;
      // A jump across the view is the path leaving on one side and coming back on the other.
      const joined = Math.abs(px - prevX) < W / 2;
      all += `${joined ? 'L' : 'M'}${point} `;
      const visible = sky ? showing(sightAt(sky, p.time, { altitude: p.geometric, azimuth: p.azimuth })) : p.altitude > -radius;
      if (visible) seen += `${joined && drawing ? 'L' : 'M'}${point} `;
      drawing = visible;
      prevX = px;
    }
    return { all, seen };
  });

  const disc = $derived(Math.max(2.5, radius * scale));
  const dots = $derived(
    view
      ? marks.map((m) => {
          const p = position(m.time);
          const hidden = sky ? !showing(sightAt(sky, m.time, p)) : seenAltitude(p.altitude) < -radius;
          return { ...m, x: x(p.azimuth), y: y(seenAltitude(p.altitude)), hidden };
        })
      : [],
  );

  const tick = (span: number, most: number, steps: number[]) => steps.find((s) => span / s <= most) ?? steps.at(-1)!;
  const azTicks = $derived.by(() => {
    if (!view) return [];
    const step = tick(view.width, 7, [1, 2, 5, 10, 15, 30, 45, 90]);
    const first = Math.ceil((view.centre - view.width / 2) / step) * step;
    return Array.from({ length: Math.floor((view.centre + view.width / 2 - first) / step) + 1 }, (_, i) => {
      const az = first + i * step;
      const shown = ((az % 360) + 360) % 360;
      return { x: x(az), label: `${shown}°${shown % 45 === 0 ? ` ${compassPoint(shown)}` : ''}` };
    }).filter((t) => t.x > 12 && t.x < W - 12);
  });
  const altTicks = $derived.by(() => {
    if (!view) return [];
    const height = view.top - view.bottom;
    const step = tick(height, H / 40, [0.5, 1, 2, 5, 10, 20]);
    const first = Math.ceil(view.bottom / step) * step;
    return Array.from({ length: Math.floor((view.bottom + height - first) / step) + 1 }, (_, i) => first + i * step)
      .map((alt) => ({ alt, y: y(alt) }))
      .filter((t) => t.y > 10 && t.y < H - 14);
  });

  // --- In words ----------------------------------------------------------------

  const km = (m: number) => (m < 950 ? `${Math.round(m / 10) * 10} m` : m < 9500 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`);
  const where = (s: { distance: number; height: number }) =>
    s.distance < 150 ? 'the ground close by' : `ground ${km(s.distance)} away, ${Math.round(s.height)} m above sea level`;

  const visibility = $derived(sky ? terrainVisibility(sky, position, start, end, radius) : null);

  const verdict = $derived.by(() => {
    if (!sky || !visibility) return null;
    const v = visibility;
    if (!v.spans.length) return { headline: `The ${body} stays below the skyline for the whole eclipse.`, events: [] };
    const instant = main.end <= main.start;
    const sights = Array.from({ length: instant ? 1 : 9 }, (_, i) => {
      const t = main.start + ((main.end - main.start) * i) / 8;
      return sightAt(sky, t, position(t));
    });
    const covers = new Set(sights.map((s) => coverOf(s, radius)));
    const lowest = sights.filter((s) => !!s).sort((a, b) => a.clearance - b.clearance)[0] as Sight | undefined;
    const open = !v.crossings.length && v.tightest && v.tightest.clearance > 0;
    let headline: string;
    if (open) headline = `Nothing in the way: the ${body} stays ${v.tightest!.clearance.toFixed(1)}° or more above the skyline.`;
    else if (covers.size === 1 && covers.has('clear'))
      headline = `${main.name} is in the clear, the ${body} ${(lowest!.clearance - radius).toFixed(1)}° above the skyline.`;
    else if (covers.size === 1 && covers.has('hidden'))
      headline = `${main.name} is hidden below the skyline${lowest ? `, which is ${lowest.skyline.toFixed(1)}° high there (${where(lowest)})` : ''}.`;
    else headline = `The skyline cuts across the ${body} ${instant ? 'at' : 'during'} ${main.name.toLowerCase()}.`;
    const events = v.crossings.map((c) => ({
      time: c.time,
      text: `${clock(c.time)}: the ${body} ${c.rising ? 'comes over' : 'goes behind'} the skyline towards ${c.azimuth.toFixed(0)}° (${where(c)})`,
    }));
    return { headline, events };
  });

  /** When the body is in a direction during the eclipse, if it gets there. */
  function passing(azimuth: number): number | null {
    for (let i = 1; i < track.length; i++) {
      const before = wrap(track[i - 1].azimuth - azimuth);
      const after = wrap(track[i].azimuth - azimuth);
      if (before === 0) return track[i - 1].time;
      if (before > 0 !== after > 0 && Math.abs(after - before) < 90) {
        return track[i - 1].time + ((track[i].time - track[i - 1].time) * before) / (before - after);
      }
    }
    return null;
  }

  const signed = (deg: number, over: string) => `${Math.abs(deg).toFixed(1)}° ${deg < 0 ? 'below' : 'above'} ${over}`;

  /** What is under the pointer, or else where the body is now. */
  const readout = $derived.by((): string[] => {
    if (!view) return [];
    const s = shown;
    if (pointer) {
      const az = (((view.centre - view.width / 2 + pointer.x * view.width) % 360) + 360) % 360;
      const alt = view.top - pointer.y * (view.top - view.bottom);
      const lines = [`Pointer: towards ${az.toFixed(1)}° ${compassPoint(az)}, ${signed(alt, 'the level horizon')}`];
      const ground = s && skylineAt(s, az);
      if (ground) lines.push(`Skyline there: ${signed(ground.angle, 'the level horizon')}, ${where(ground)}`);
      const t = passing(az);
      if (t !== null) {
        const p = position(t);
        const sight = s && sightAt(s, t, p);
        const high = signed(seenAltitude(p.altitude), 'the level horizon');
        lines.push(`${body} there at ${clock(t)}: ${high}${sight ? `, ${signed(sight.clearance, 'the skyline')}` : ''}`);
      }
      return lines;
    }
    if (!now) return [];
    const sight = s && sightAt(s, app.time, now);
    if (!sight) return [`Now: ${body} ${signed(now.seen, 'the level horizon')}, towards ${now.azimuth.toFixed(1)}°`];
    return [
      `Now: ${body} ${signed(sight.altitude, 'the level horizon')} towards ${sight.azimuth.toFixed(1)}°, ${signed(sight.clearance, 'the skyline')}`,
      `Skyline there: ${signed(sight.skyline, 'the level horizon')}, ${where(sight)}`,
    ];
  });

  // --- Moving the view ---------------------------------------------------------

  /** The view as it is, taken over for dragging and zooming. */
  function hold() {
    const v = view!;
    custom ??= { centre: v.centre, width: v.width, bottom: v.bottom, aspect: (v.top - v.bottom) / v.width };
    return custom;
  }

  let drag: { x: number; y: number; centre: number; bottom: number; moved: boolean } | null = null;

  function down(ev: PointerEvent) {
    if (ev.button !== 0 || !view) return;
    drag = { x: ev.clientX, y: ev.clientY, centre: view.centre, bottom: view.bottom, moved: false };
  }

  function move(ev: PointerEvent) {
    const rect = svg!.getBoundingClientRect();
    pointer = { x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)) };
    if (!drag || !view) return;
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    // A click on a mark is not a drag.
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) svg!.setPointerCapture(ev.pointerId);
    drag.moved = true;
    const perPixel = view.width / rect.width;
    const v = hold();
    v.centre = drag.centre - dx * perPixel;
    v.bottom = Math.min(80, Math.max(-20, drag.bottom + dy * perPixel));
  }

  function up() {
    drag = null;
  }

  /** Zooms by a factor about a point of the picture, which stays where it is. */
  function zoom(factor: number, fx = 0.5, fy = 0.5) {
    if (!view) return;
    const before = view;
    const azimuth = before.centre - before.width / 2 + fx * before.width;
    const altitude = before.top - fy * (before.top - before.bottom);
    const v = hold();
    const shape = (before.top - before.bottom) / before.width;
    v.width = Math.min(360, Math.max(MIN_WIDTH, before.width * factor));
    v.centre = azimuth - (fx - 0.5) * v.width;
    v.bottom = Math.min(80, Math.max(-20, altitude - (1 - fy) * v.width * shape));
  }

  // The wheel zooms the picture, about the pointer; beside the picture it scrolls the panel as ever.
  $effect(() => {
    const el = svg;
    if (!el) return;
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      zoom(Math.exp(ev.deltaY * (ev.deltaMode ? 0.05 : 0.0015)), (ev.clientX - rect.left) / rect.width, (ev.clientY - rect.top) / rect.height);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  function preset(closeUp: boolean) {
    close = closeUp;
    custom = null;
  }

  // A new place or eclipse: back to the whole of it.
  $effect(() => {
    void [place.lat, place.lon, start, end];
    custom = null;
  });
</script>

<svelte:window onkeydown={(ev) => enlarged && ev.key === 'Escape' && (enlarged = false)} />

{#if view}
  <figure class="horizon" class:enlarged>
    <div class="bar">
      <strong>
        Towards the {body}
        {#if sky}<small>from {Math.round(sky.ground)} m above sea level</small>{/if}
      </strong>
      <span class="modes">
        <button class:on={!custom && !close} onclick={() => preset(false)}>Whole eclipse</button>
        <button class:on={!custom && close} disabled={!now} onclick={() => preset(true)} title={now ? `Around the ${body} as the time goes` : 'Move the time into the eclipse first'}>Close-up</button>
      </span>
      <span class="modes">
        <button onclick={() => zoom(1 / 1.6)} title="Zoom in" aria-label="Zoom in">+</button>
        <button onclick={() => zoom(1.6)} title="Zoom out" aria-label="Zoom out">−</button>
        <button
          class="icon"
          class:on={enlarged}
          onclick={() => (enlarged = !enlarged)}
          title={enlarged ? 'Back into the panel (Esc)' : 'Fill the window, to look closely'}
          aria-label={enlarged ? 'Back into the panel' : 'Fill the window'}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            {#if enlarged}
              <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
            {:else}
              <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
            {/if}
          </svg>
        </button>
      </span>
      <label title="The skyline of the ground around the place, from elevation data">
        <input type="checkbox" autocomplete="off" checked={terrain.on} onchange={(ev) => terrain.setOn(ev.currentTarget.checked)} /> Terrain
      </label>
    </div>
    {#if enlarged}
      <div class="time"><Timeline start={live.start} end={live.end} marks={timeMarks} /></div>
    {/if}
    <div class="stage" bind:clientWidth={box.width} bind:clientHeight={box.height}>
    <svg
      bind:this={svg}
      viewBox="0 0 {W} {H}"
      role="img"
      aria-label="The {body}'s path over the skyline during the eclipse"
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onpointerleave={() => (pointer = null)}
    >
      <defs>
        <linearGradient id="horizon-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0b1020" />
          <stop offset="1" stop-color="#22304f" />
        </linearGradient>
        {#if now && bite}
          <mask id="horizon-bite">
            <rect width={W} height={H} fill="white" />
            <circle cx={x(now.azimuth) + bite.x * disc} cy={y(now.seen) - bite.y * disc} r={bite.ratio * disc} fill="black" />
          </mask>
        {/if}
      </defs>
      <rect width={W} height={H} fill="url(#horizon-sky)" />
      <path d={paths.seen} class="path seen" />
      {#if now}
        <circle cx={x(now.azimuth)} cy={y(now.seen)} r={disc} {fill} mask={bite ? 'url(#horizon-bite)' : undefined} class="body" />
      {/if}
      <path d={groundShape} fill="#1c2a1f" opacity={ground.opacity} />
      <path d={outline} class="skyline" />
      <!-- Over the ground, so the path can be followed behind it. -->
      {#each altTicks as t (t.alt)}
        <line x1="0" x2={W} y1={t.y} y2={t.y} class="grid" class:level={t.alt === 0} />
        <text x="4" y={t.y - 2} class="tick">{t.alt}°</text>
      {/each}
      <path d={paths.all} class="path" />
      {#each dots as d (d.short)}
        <circle cx={d.x} cy={d.y} r={disc} class="mark" class:hidden={d.hidden} />
      {/each}
      {#each dots as d (d.short)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <text x={d.x} y={d.y - disc - 4} class="name" class:hidden={d.hidden} onclick={() => app.setTime(d.time)}>
          {d.short}<title>{d.label}, {clock(d.time)}{d.hidden ? ': below the skyline' : ''}</title>
        </text>
      {/each}
      {#each azTicks as t (t.label)}
        <line x1={t.x} x2={t.x} y1={H - 4} y2={H} class="grid level" />
        <text x={t.x} y={H - 6} class="tick" text-anchor="middle">{t.label}</text>
      {/each}
      {#if pointer}
        <line x1={pointer.x * W} x2={pointer.x * W} y1="0" y2={H} class="cursor" />
        <line x1="0" x2={W} y1={pointer.y * H} y2={pointer.y * H} class="cursor" />
      {/if}
    </svg>
    </div>
    <figcaption>
      <!-- Room for three lines, so the page does not jump as the pointer moves. -->
      <div class="readout">
        {#each readout as line (line)}<p>{line}</p>{/each}
      </div>
      {#if !terrain.on}
        Level ground: the terrain is switched off.
      {:else if sky && verdict}
        <p class="headline">{verdict.headline}</p>
        {#each verdict.events as e (e.time)}
          <p><button class="link" onclick={() => app.setTime(e.time)}>{e.text}</button></p>
        {/each}
        <p class="small">
          Drag the picture to move it, zoom with the wheel. Seen from {Math.round(sky.ground)} m above sea level, eyes 2 m up, looking out to {km(sky.reach)}. Bare ground only: trees and buildings
          are not in the data, sharp peaks come out a little low, and ground within a few hundred metres is rough. Heights here are as seen,
          lifted by refraction: up to half a degree at the horizon. {TERRAIN_CREDIT}.
        </p>
      {:else if terrain.status === 'error'}
        The terrain could not be loaded.
        <button class="link" onclick={() => request && terrain.request(request, true)}>Try again</button>
      {:else}
        Reading the terrain…
      {/if}
    </figcaption>
  </figure>
{/if}

<style>
  .horizon {
    margin: 0;
  }
  /* Over the whole window, the picture taking the room the words leave. */
  .horizon.enlarged {
    position: fixed;
    inset: 12px;
    z-index: 50;
    display: flex;
    flex-direction: column;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    box-shadow: 0 10px 40px rgb(0 0 0 / 0.5);
  }
  .enlarged .stage {
    flex: 1;
    min-height: 0;
  }
  .enlarged .stage svg {
    height: 100%;
    touch-action: none;
  }
  .enlarged .small {
    display: none;
  }
  .bar small {
    margin-left: 6px;
    font-weight: normal;
    color: var(--muted);
  }
  .readout {
    min-height: 4.4em;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    margin-bottom: 6px;
    font-size: 13px;
  }
  .bar strong {
    margin-right: auto;
    font-size: 14px;
  }
  .bar label {
    color: var(--muted);
  }
  .modes {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .modes button {
    font: inherit;
    padding: 2px 8px;
    border: 0;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
  }
  .modes button + button {
    border-left: 1px solid var(--border);
  }
  .modes button.on {
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
    color: var(--fg);
  }
  .modes .icon {
    display: grid;
    place-items: center;
    padding: 2px 7px;
  }
  .modes .icon svg {
    width: 14px;
    height: 14px;
    border-radius: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    cursor: pointer;
  }
  .time {
    margin-bottom: 8px;
  }
  .modes button:disabled {
    cursor: default;
    opacity: 0.5;
  }
  svg {
    display: block;
    width: 100%;
    border-radius: 10px;
    touch-action: pan-y;
    cursor: grab;
    user-select: none;
  }
  svg:active {
    cursor: grabbing;
  }
  .grid {
    stroke: rgb(255 255 255 / 0.08);
    stroke-width: 1;
  }
  .grid.level {
    stroke: rgb(255 255 255 / 0.3);
    stroke-dasharray: 3 3;
  }
  .tick {
    fill: rgb(255 255 255 / 0.6);
    font-size: 9px;
  }
  .path {
    fill: none;
    stroke: rgb(255 255 255 / 0.35);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }
  .path.seen {
    stroke: #ffd76a;
    stroke-width: 1.5;
    stroke-dasharray: none;
  }
  .mark {
    fill: none;
    stroke: #ffd76a;
    stroke-width: 1;
  }
  .mark.hidden {
    stroke: rgb(255 255 255 / 0.4);
  }
  .skyline {
    fill: none;
    stroke: #9fb29a;
    stroke-width: 1;
    stroke-linejoin: round;
  }
  .name {
    fill: #fff;
    font-size: 9px;
    text-anchor: middle;
    cursor: pointer;
    paint-order: stroke;
    stroke: rgb(11 16 32 / 0.8);
    stroke-width: 2.5px;
  }
  .name.hidden {
    fill: rgb(255 255 255 / 0.55);
  }
  .cursor {
    stroke: rgb(255 255 255 / 0.35);
    stroke-width: 1;
    pointer-events: none;
  }
  figcaption {
    font-size: 13px;
    color: var(--muted);
    margin-top: 6px;
  }
  figcaption p {
    margin: 0 0 3px;
  }
  figcaption .headline {
    color: var(--fg);
  }
  figcaption .small {
    font-size: 12px;
    margin-top: 6px;
  }
</style>
