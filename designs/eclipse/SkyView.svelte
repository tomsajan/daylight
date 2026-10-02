<!--
  The Sun and the Moon as seen from the place at the current time, zenith up,
  with the horizon when the Sun is near it.
-->
<script lang="ts">
  import type { SkyView } from '$core/eclipse';
  import { compassPoint } from '$core/time/format';
  import { coverage } from './describe';
  import { ground } from './ground.svelte';
  import GroundSlider from './GroundSlider.svelte';

  interface Props {
    sky: SkyView;
  }
  let { sky }: Props = $props();

  const SIZE = 220;
  const R = 52;
  /** The Sun's angular radius, roughly; it only places the horizon. */
  const SUN_RADIUS_DEG = 0.267;

  const c = SIZE / 2;
  const total = $derived(sky.obscuration >= 0.9999 && sky.moonSunRatio >= 1);
  const up = $derived(sky.altitude > -SUN_RADIUS_DEG);
  // Light falls with the hidden part of the Sun: blue sky to deep dusk.
  const light = $derived(up ? Math.pow(1 - sky.obscuration, 0.5) : 0);
  const sky1 = $derived(`hsl(212 ${30 + 40 * light}% ${6 + 46 * light}%)`);
  const sky2 = $derived(`hsl(205 ${30 + 30 * light}% ${10 + 55 * light}%)`);
  // Horizon, in the drawing's units: the Sun's altitude measured in solar radii below its centre.
  const horizonY = $derived(c + (sky.altitude / SUN_RADIUS_DEG) * R);
</script>

<figure class="sky">
  <svg viewBox="0 0 {SIZE} {SIZE}" role="img" aria-label="The Sun {coverage(sky.obscuration)} covered by the Moon">
    <defs>
      <linearGradient id="sky-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color={sky1} />
        <stop offset="1" stop-color={sky2} />
      </linearGradient>
      <radialGradient id="corona">
        <stop offset="0.45" stop-color="#fff" stop-opacity="0.9" />
        <stop offset="0.6" stop-color="#cfe0ff" stop-opacity="0.35" />
        <stop offset="1" stop-color="#cfe0ff" stop-opacity="0" />
      </radialGradient>
      <mask id="sun-mask">
        <rect width={SIZE} height={SIZE} fill="white" />
        <circle cx={c + sky.moonX * R} cy={c - sky.moonY * R} r={sky.moonSunRatio * R} fill="black" />
      </mask>
    </defs>
    <rect width={SIZE} height={SIZE} fill="url(#sky-bg)" />
    {#if total}
      <circle cx={c} cy={c} r={R * 2.6} fill="url(#corona)" />
    {/if}
    <circle cx={c} cy={c} r={R} fill="#ffd76a" mask="url(#sun-mask)" class="sun" />
    <circle cx={c + sky.moonX * R} cy={c - sky.moonY * R} r={sky.moonSunRatio * R} fill="#11131c" opacity={sky.magnitude > 0 ? 1 : 0} />
    {#if horizonY < SIZE}
      <rect x="0" y={Math.max(0, horizonY)} width={SIZE} height={SIZE} fill="#1c2a1f" opacity={ground.opacity} />
      <line x1="0" x2={SIZE} y1={horizonY} y2={horizonY} stroke="#9fb29a" stroke-width="1" />
    {/if}
    <text x="8" y="16" class="zenith">↑ zenith</text>
  </svg>
  <figcaption>
    {#if up}
      {coverage(sky.obscuration)} covered · Sun {sky.altitude.toFixed(1)}° up, {compassPoint(sky.azimuth)} ({sky.azimuth.toFixed(0)}°)
    {:else}
      The Sun is below the horizon ({sky.altitude.toFixed(1)}°)
    {/if}
  </figcaption>
</figure>
<GroundSlider />

<style>
  .sky {
    margin: 0;
  }
  svg {
    display: block;
    width: 100%;
    max-width: 380px;
    border-radius: 10px;
  }
  .sun {
    filter: drop-shadow(0 0 6px rgb(255 215 106 / 0.6));
  }
  .zenith {
    fill: rgb(255 255 255 / 0.6);
    font-size: 11px;
  }
  figcaption {
    font-size: 13px;
    color: var(--muted);
    margin-top: 6px;
  }
</style>
