<!--
  Time-of-day scrubber. The track is painted with the selected day's light
  phases, so dragging shows exactly where sunrise, twilight and night fall.
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { currentMinutes, selectedDayIndex } from '$core/state/views';
  import { visibleLevel } from '$core/charts/palette';
  import { Light } from '$core/astro/daylight';
  import { formatMinutes } from '$core/time/format';

  interface Props {
    /** Hour labels under the track. */
    labels?: boolean;
  }
  let { labels = true }: Props = $props();

  const VAR: Record<Light, string> = {
    [Light.Night]: 'var(--ph-night)',
    [Light.Astronomical]: 'var(--ph-astro)',
    [Light.Nautical]: 'var(--ph-naut)',
    [Light.Civil]: 'var(--ph-civil)',
    [Light.Day]: 'var(--ph-day)',
  };

  const day = $derived(app.selected ? (app.yearFor(app.selected)[selectedDayIndex()] ?? app.dayFor(app.selected)) : null);
  const minutes = $derived(currentMinutes());

  const gradient = $derived.by(() => {
    if (!day) return 'var(--ph-night)';
    const stops: string[] = [];
    for (const s of day.segments) {
      const c = VAR[visibleLevel(s.light, settings.twilight)];
      stops.push(`${c} ${((s.startMin / 1440) * 100).toFixed(2)}%`, `${c} ${((s.endMin / 1440) * 100).toFixed(2)}%`);
    }
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  });

  const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24];
  const label = (h: number) => (settings.hourCycle === '12' ? formatMinutes((h % 24) * 60, '12').replace(':00 ', '') : String(h).padStart(2, '0'));
</script>

<div class="scrub" class:labels>
  <div class="track" style="background: {gradient}">
    {#each hours.slice(1, -1) as h (h)}<span class="tick" style="left: {(h / 24) * 100}%"></span>{/each}
  </div>
  <input
    type="range"
    min="0"
    max="1439"
    step="1"
    value={Math.max(0, Math.min(1439, Math.floor(minutes)))}
    oninput={(e) => app.setMinutesOfDay(+(e.target as HTMLInputElement).value)}
    aria-label="Time of day"
    aria-valuetext={formatMinutes(minutes, settings.hourCycle)}
  />
  {#if labels}
    <div class="hours num" aria-hidden="true">
      {#each hours as h (h)}<span style="left: {(h / 24) * 100}%">{label(h)}</span>{/each}
    </div>
  {/if}
</div>

<style>
  .scrub {
    position: relative;
    height: 28px;
    min-width: 120px;
    --thumb: var(--cursor);
  }
  .scrub.labels {
    height: 38px;
  }
  .track {
    position: absolute;
    left: 0;
    right: 0;
    top: 6px;
    height: 16px;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    overflow: hidden;
  }
  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgb(127 127 127 / 0.45);
  }
  input {
    position: absolute;
    left: -7px;
    right: -7px;
    top: 0;
    width: calc(100% + 14px);
    height: 28px;
    margin: 0;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
    cursor: ew-resize;
    touch-action: pan-y;
  }
  input:focus-visible {
    outline: none;
  }
  input::-webkit-slider-runnable-track {
    height: 28px;
    background: transparent;
  }
  input::-moz-range-track {
    height: 28px;
    background: transparent;
  }
  /* Thumb: a needle across the track with a cap, wide enough to grab by touch. */
  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 28px;
    border: 0;
    background:
      linear-gradient(var(--thumb), var(--thumb)) center / 3px 100% no-repeat,
      linear-gradient(var(--thumb), var(--thumb)) center top / 11px 4px no-repeat,
      linear-gradient(var(--thumb), var(--thumb)) center bottom / 11px 4px no-repeat;
    cursor: ew-resize;
  }
  input::-moz-range-thumb {
    width: 14px;
    height: 28px;
    border: 0;
    border-radius: 0;
    background:
      linear-gradient(var(--thumb), var(--thumb)) center / 3px 100% no-repeat,
      linear-gradient(var(--thumb), var(--thumb)) center top / 11px 4px no-repeat,
      linear-gradient(var(--thumb), var(--thumb)) center bottom / 11px 4px no-repeat;
    cursor: ew-resize;
  }
  input:focus-visible::-webkit-slider-thumb {
    outline: 2px solid var(--accent);
  }
  input:focus-visible::-moz-range-thumb {
    outline: 2px solid var(--accent);
  }
  .hours {
    position: absolute;
    left: 0;
    right: 0;
    top: 26px;
    height: 12px;
    font-size: 9.5px;
    color: var(--faint);
  }
  .hours span {
    position: absolute;
    transform: translateX(-50%);
    line-height: 12px;
  }
  .hours span:first-child {
    transform: none;
  }
  .hours span:last-child {
    transform: translateX(-100%);
  }
</style>
