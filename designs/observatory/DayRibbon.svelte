<!--
  The time-of-day scrubber: a ribbon painted with the selected day's real light
  (night, the three twilights, daylight), sunrise/sunset ticks, and a sun knob.
  Drag or tap anywhere on it; arrow keys step 15 min (Shift: 1 h).
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { currentMinutes } from '$core/state/views';
  import { Light, type DayLight } from '$core/astro/daylight';
  import { visibleLevel } from '$core/charts/palette';
  import { formatMinutes } from '$core/time/format';
  import { LIGHT_COLORS } from './palette';

  interface Props {
    day: DayLight | null;
    /** Light level at the current instant (sun vs. moon-like knob). */
    lightNow: Light;
  }
  let { day, lightNow }: Props = $props();

  let track: HTMLDivElement;
  let dragging = $state(false);
  let focused = $state(false);
  let resumeAfterDrag = false;

  const hc = $derived(settings.hourCycle);
  const minutes = $derived(Math.max(0, Math.min(1439.99, currentMinutes())));
  const pct = (m: number) => `${((Math.max(0, Math.min(1440, m)) / 1440) * 100).toFixed(3)}%`;
  /** Label position kept inside the ribbon. */
  const labelAt = (m: number) => `clamp(30px, ${pct(m)}, calc(100% - 30px))`;

  const gradient = $derived.by(() => {
    if (!day) return 'none';
    const stops = day.segments.map((s) => {
      const c = LIGHT_COLORS[visibleLevel(s.light, settings.twilight)];
      return `${c} ${pct(s.startMin)} ${pct(s.endMin)}`;
    });
    return stops.length ? `linear-gradient(90deg, ${stops.join(', ')})` : 'none';
  });

  const rise = $derived(day?.sunrise?.minutes ?? null);
  const set = $derived(day?.sunset?.minutes ?? null);
  // Keep the two labels apart when sunrise and sunset are close (near polar night).
  const labelsClash = $derived(rise != null && set != null && Math.abs(set - rise) < 200);

  function minutesAt(clientX: number): number {
    const r = track.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 1439);
  }

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    // Don't let the mobile sheet treat this as a drag of the sheet.
    e.stopPropagation();
    track.setPointerCapture(e.pointerId);
    dragging = true;
    resumeAfterDrag = app.playing;
    if (app.playing) app.pause();
    app.setMinutesOfDay(minutesAt(e.clientX));
  }
  function move(e: PointerEvent) {
    if (dragging) app.setMinutesOfDay(minutesAt(e.clientX));
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    if (resumeAfterDrag) app.play();
  }

  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 60 : 15;
    let m: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') m = minutes + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') m = minutes - step;
    else if (e.key === 'PageUp') m = minutes + 60;
    else if (e.key === 'PageDown') m = minutes - 60;
    else if (e.key === 'Home') m = 0;
    else if (e.key === 'End') m = 1439;
    if (m == null) return;
    e.preventDefault();
    e.stopPropagation();
    app.setMinutesOfDay(Math.max(0, Math.min(1439, Math.round(m))));
  }
</script>

<div class="ribbon">
  <div
    class="track"
    bind:this={track}
    role="slider"
    tabindex="0"
    aria-label="Time of day"
    aria-valuemin={0}
    aria-valuemax={1439}
    aria-valuenow={Math.round(minutes)}
    aria-valuetext={formatMinutes(minutes, hc)}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={key}
    onfocus={(e) => (focused = (e.currentTarget as HTMLElement).matches(':focus-visible'))}
    onblur={() => (focused = false)}
  >
    <div class="sky" style:background={gradient}>
      {#each [3, 6, 9, 12, 15, 18, 21] as h (h)}
        <span class="tick" class:tick--noon={h === 12} style:left={pct(h * 60)}></span>
      {/each}
      {#if rise != null}<span class="event" style:left={pct(rise)}></span>{/if}
      {#if set != null}<span class="event" style:left={pct(set)}></span>{/if}
    </div>
    <div class="knob" class:knob--day={lightNow === Light.Day} class:knob--active={dragging} style:left={pct(minutes)}>
      {#if dragging || focused}<span class="bubble">{formatMinutes(minutes, hc)}</span>{/if}
    </div>
  </div>

  <div class="labels" aria-hidden="true">
    {#if rise != null}
      <span class="lab lab--rise" class:lab--clash={labelsClash} style:left={labelAt(rise)}>↑ {formatMinutes(rise, hc)}</span>
    {/if}
    {#if set != null}
      <span class="lab lab--set" class:lab--clash={labelsClash} style:left={labelAt(set)}>↓ {formatMinutes(set, hc)}</span>
    {/if}
    {#if day?.polarDay}<span class="lab lab--mid" style:left="50%">Sun up all day</span>{/if}
    {#if day?.polarNight}<span class="lab lab--mid" style:left="50%">Sun below the horizon all day</span>{/if}
  </div>
</div>

<style>
  .ribbon {
    position: relative;
    padding: 6px 0 0;
    user-select: none;
    -webkit-user-select: none;
  }
  .track {
    position: relative;
    height: 30px;
    cursor: ew-resize;
    touch-action: none;
    border-radius: 10px;
  }
  .track:focus-visible {
    outline-offset: 4px;
  }
  .sky {
    position: absolute;
    left: 0;
    right: 0;
    top: 7px;
    height: 16px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow:
      inset 0 0 0 1px rgb(255 240 210 / 0.12),
      0 0 24px rgb(242 196 109 / 0.08);
  }
  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgb(255 255 255 / 0.14);
  }
  .tick--noon {
    background: rgb(255 255 255 / 0.28);
  }
  .event {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: #fff4d8;
    box-shadow: 0 0 6px rgb(255 220 150 / 0.9);
  }
  .knob {
    position: absolute;
    top: 50%;
    width: 22px;
    height: 22px;
    margin: -11px 0 0 -11px;
    border-radius: 50%;
    pointer-events: none;
    background: radial-gradient(circle at 40% 35%, #f3f1ea, #b8bfd3 60%, #7d86a3);
    box-shadow:
      0 0 0 2px #060a17,
      0 0 0 3px rgb(255 255 255 / 0.5),
      0 2px 10px rgb(0 0 0 / 0.6);
    transition: transform 0.12s;
  }
  .knob--day {
    background: radial-gradient(circle at 40% 35%, #fffbe8, var(--gold-hot) 45%, var(--gold));
    box-shadow:
      0 0 0 2px #060a17,
      0 0 0 3px rgb(255 230 170 / 0.7),
      0 0 22px 6px rgb(255 200 90 / 0.45);
  }
  .knob--active {
    transform: scale(1.18);
  }
  .bubble {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    padding: 3px 9px;
    border-radius: 8px;
    background: #fff4d8;
    color: var(--on-gold);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }
  .labels {
    position: relative;
    height: 20px;
    margin-top: 2px;
    font-size: 12.5px;
    color: var(--ink-2);
  }
  .lab {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .lab {
    color: #f6e6c3;
  }
  .lab--clash.lab--rise {
    transform: translateX(-100%);
  }
  .lab--clash.lab--set {
    transform: translateX(0);
  }
  .lab--mid {
    color: var(--ink-2);
  }
  @media (prefers-reduced-motion: reduce) {
    .knob {
      transition: none;
    }
  }
</style>
