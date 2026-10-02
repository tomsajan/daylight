<!--
  The Moon in the Earth's shadow at the current time: the penumbra and umbra,
  the Moon's track through them, and the Moon itself, red where the umbra
  covers it. Turned to the place's sky (zenith up), or north up without one.
-->
<script lang="ts">
  import { moonPlace, shadowView, eclipseDeltaT, lunarContacts, type LunarEclipse, type Observer } from '$core/eclipse';
  import { compassPoint } from '$core/time/format';
  import { lunarPhaseName } from './describe';

  interface Props {
    eclipse: LunarEclipse;
    time: number;
    place: Observer | null;
  }
  let { eclipse, time, place }: Props = $props();

  const SIZE = 220;
  const c = SIZE / 2;

  const dT = $derived(eclipseDeltaT(eclipse));
  const view = $derived(shadowView(eclipse, time, dT));
  const sky = $derived(place ? moonPlace(eclipse, place, time, dT) : null);
  const q = $derived(((sky?.parallactic ?? 0) * Math.PI) / 180);
  const contacts = $derived(lunarContacts(eclipse, dT));

  /** East and north on the sky (degrees) to the drawing: east is left with north up, then turned to the zenith. */
  function toScreen(x: number, y: number, scale: number): [number, number] {
    const right = -x;
    const up = y;
    return [c + (right * Math.cos(q) + up * Math.sin(q)) * scale, c - (up * Math.cos(q) - right * Math.sin(q)) * scale];
  }

  // The Moon's track from first to last contact, sampled.
  const track = $derived.by(() => {
    const start = contacts[0].time;
    const end = contacts.at(-1)!.time;
    return Array.from({ length: 33 }, (_, i) => shadowView(eclipse, start + ((end - start) * i) / 32, dT));
  });
  // Everything fits: the penumbra and the Moon anywhere on its track.
  const scale = $derived((c - 8) / Math.max(view.penumbra, ...track.map((v) => Math.hypot(v.x, v.y) + v.moon)));

  const trackPath = $derived(
    track
      .map((v, i) => {
        const [x, y] = toScreen(v.x, v.y, scale);
        return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' '),
  );
  const marks = $derived(
    contacts.map((ct) => {
      const v = shadowView(eclipse, ct.time, dT);
      const [x, y] = toScreen(v.x, v.y, scale);
      return { name: ct.name, x, y };
    }),
  );
  const moon = $derived(toScreen(view.x, view.y, scale));
  const moonR = $derived(view.moon * scale);
  const shadowCentre = $derived(toScreen(0, 0, scale));
  // The penumbra only dims the Moon, and only deep in it noticeably.
  const dim = $derived(1 - 0.45 * Math.min(1, Math.max(0, view.penumbralMagnitude)) ** 2);
  const total = $derived(view.umbralMagnitude >= 1);
  const phase = $derived(time < contacts[0].time || time > contacts.at(-1)!.time ? 'outside the eclipse' : lunarPhaseName(eclipse, time));
</script>

<figure class="sky">
  <svg viewBox="0 0 {SIZE} {SIZE}" role="img" aria-label="The Moon in the Earth's shadow, {phase}">
    <defs>
      <clipPath id="lunar-moon-clip">
        <circle cx={moon[0]} cy={moon[1]} r={moonR} />
      </clipPath>
      <radialGradient id="lunar-penumbra">
        <stop offset="0.5" stop-color="#000" stop-opacity="0.35" />
        <stop offset="1" stop-color="#000" stop-opacity="0.05" />
      </radialGradient>
      <radialGradient id="lunar-umbra-moon">
        <stop offset="0.6" stop-color="#5a1a0e" />
        <stop offset="1" stop-color="#a8401c" />
      </radialGradient>
    </defs>
    <rect width={SIZE} height={SIZE} fill="#0b1020" />
    <circle cx={shadowCentre[0]} cy={shadowCentre[1]} r={view.penumbra * scale} fill="url(#lunar-penumbra)" stroke="#8c94b0" stroke-opacity="0.45" stroke-dasharray="3 3" />
    <circle cx={shadowCentre[0]} cy={shadowCentre[1]} r={view.umbra * scale} fill="#2a0d08" fill-opacity="0.55" stroke="#c0583a" stroke-opacity="0.7" />
    <path d={trackPath} fill="none" stroke="#c9cfe0" stroke-opacity="0.35" stroke-dasharray="2 3" />
    {#each marks as m (m.name)}
      {#if m.name !== 'Greatest'}
        <circle cx={m.x} cy={m.y} r="1.6" fill="#c9cfe0" fill-opacity="0.6"><title>{m.name}</title></circle>
      {/if}
    {/each}
    <g class:total>
      <circle cx={moon[0]} cy={moon[1]} r={moonR} fill="rgb({Math.round(222 * dim)} {Math.round(222 * dim)} {Math.round(214 * dim)})" />
      <circle
        cx={shadowCentre[0]}
        cy={shadowCentre[1]}
        r={view.umbra * scale}
        fill="url(#lunar-umbra-moon)"
        clip-path="url(#lunar-moon-clip)"
        opacity={total ? 1 : 0.92}
      />
    </g>
    <text x="8" y="16" class="label">↑ {place ? 'zenith' : 'north'}</text>
  </svg>
  <figcaption>
    {#if view.umbralMagnitude > 0}
      Umbral magnitude {view.umbralMagnitude.toFixed(3)} · {phase}
    {:else if view.penumbralMagnitude > 0}
      In the penumbra ({(view.penumbralMagnitude * 100).toFixed(0)}% of the Moon) · {phase}
    {:else}
      The Moon is {phase}
    {/if}
    {#if sky}
      <br />
      {#if sky.visible && sky.altitude < 0.5}
        The Moon is on the horizon, {compassPoint(sky.azimuth)} ({sky.azimuth.toFixed(0)}°)
      {:else if sky.visible}
        Moon {sky.altitude.toFixed(1)}° up, {compassPoint(sky.azimuth)} ({sky.azimuth.toFixed(0)}°)
      {:else}
        The Moon is below the horizon ({sky.altitude.toFixed(1)}°)
      {/if}
    {/if}
  </figcaption>
</figure>

<style>
  .sky {
    margin: 0;
  }
  svg {
    display: block;
    width: 100%;
    max-width: 260px;
    border-radius: 10px;
  }
  .total {
    filter: drop-shadow(0 0 5px rgb(200 80 40 / 0.6));
  }
  .label {
    fill: rgb(255 255 255 / 0.6);
    font-size: 11px;
  }
  figcaption {
    font-size: 13px;
    color: var(--muted);
    margin-top: 6px;
  }
</style>
