<!--
  The selected target: what it is, when it is best placed tonight, its best months, how it fits
  the camera's frame and how long an exposure can be without tracking.
-->
<script lang="ts">
  import type { Interval, Night } from '$core/sky/night';
  import { monthSpan, type Target, type Visibility, type YearVisibility } from '$core/sky/targets';
  import { field, focalToFrame, rule500, ruleNpf, sensorOf, type CameraSettings } from '$core/sky/camera';
  import { formatClock, formatDuration, type HourCycle } from '$core/time/format';
  import type { CivilDate, TimeScale } from '$core/time/timescale';
  import YearStrip from './YearStrip.svelte';

  interface Props {
    target: Target;
    /** Declination, degrees, for the exposure rules. */
    dec: number;
    vis: Visibility;
    night: Night;
    minAlt: number;
    camera: CameraSettings;
    year: { data: YearVisibility; dates: CivilDate[]; current: number } | null;
    scale: TimeScale;
    hourCycle: HourCycle;
    onlook: () => void;
    onframe: (focal: number) => void;
    onpickdate: (date: CivilDate) => void;
    onclose: () => void;
  }
  let { target: t, dec, vis, night, minAlt, camera, year, scale, hourCycle, onlook, onframe, onpickdate, onclose }: Props = $props();

  const clock = (ms: number) => formatClock(ms, scale, hourCycle);
  const spans = (list: Interval[]) => list.map((i) => `${clock(i.start)}–${clock(i.end)}`).join(' and ');
  const arcmin = (m: number) => (m >= 120 ? `${(m / 60).toFixed(1)}°` : `${m < 10 ? m.toFixed(1) : Math.round(m)}′`);

  const size = $derived(t.size[0] ? (t.size[1] && Math.abs(t.size[1] - t.size[0]) > 0.05 ? `${arcmin(t.size[0])} × ${arcmin(t.size[1])}` : arcmin(t.size[0])) : null);
  const f = $derived(field(camera));
  const sensor = $derived(sensorOf(camera));
  /** How much of the frame's shorter side the object's long axis takes. */
  const fill = $derived(t.size[0] ? t.size[0] / 60 / Math.min(f.width, f.height) : null);
  const snug = $derived(t.size[0] && t.kind !== 'core' ? Math.round(focalToFrame(camera, t.size[0]) / 5) * 5 : null);
  const neverSets = $derived(vis.rises.length === 0 && vis.sets.length === 0 && vis.culmination.alt > 0);
  const neverRises = $derived(vis.culmination.alt < 0);
</script>

<section class="details">
  <header>
    <div>
      <h2>{t.title}</h2>
      <p class="sub">
        {t.typeName}{t.constellation ? ` in ${t.constellation}` : ''}{t.mag !== null ? ` · magnitude ${t.mag.toFixed(1)}` : ''}{size ? ` · ${size}` : ''}
      </p>
    </div>
    <button class="dl-btn dl-btn--icon close" onclick={onclose} aria-label="Close" title="Close">×</button>
  </header>

  <div class="actions">
    <button class="dl-btn" onclick={onlook}>Show in the sky</button>
  </div>

  <dl>
    {#if neverRises}
      <dt>Tonight</dt>
      <dd>Stays below the horizon all night from here.</dd>
    {:else}
      <dt>Highest</dt>
      <dd>{Math.round(vis.culmination.alt)}° at {clock(vis.culmination.time)}{vis.best.time !== vis.culmination.time && night.dark.length ? `; in the dark ${Math.round(vis.best.alt)}° at ${clock(vis.best.time)}` : ''}</dd>
      <dt>Rises, sets</dt>
      <dd>
        {#if neverSets}Never sets{:else}
          {vis.rises.length ? `Rises ${vis.rises.map(clock).join(', ')}` : ''}{vis.rises.length && vis.sets.length ? ' · ' : ''}{vis.sets.length ? `sets ${vis.sets.map(clock).join(', ')}` : ''}
        {/if}
      </dd>
      <dt>Above {minAlt}°</dt>
      <dd>
        {#if vis.darkMs > 0}
          in the dark {spans(vis.darkWindows)} ({formatDuration(vis.darkMs / 60000)}){#if vis.moonlessMs > 0}; with the Moon down <b>{formatDuration(vis.moonlessMs / 60000)}</b>{#if vis.moonlessMs < vis.darkMs}, {spans(vis.moonlessWindows)}{/if}{:else}; the Moon is up all that time{/if}
        {:else}
          not in the dark tonight
        {/if}
      </dd>
      {#if t.kind !== 'moon'}
        <dt>Moon</dt>
        <dd>{Math.round(vis.moonDistance)}° away, {Math.round(night.moon.fraction * 100)}% lit</dd>
      {/if}
    {/if}
  </dl>

  {#if year}
    <h3>Through the year <small>hours above {minAlt}° in the dark</small></h3>
    <p class="best">
      {#if year.data.bestMonths.length}Best {monthSpan(year.data.bestMonths)}.{:else}Never above {minAlt}° in the dark from here.{/if}
    </p>
    <YearStrip data={year.data} dates={year.dates} current={year.current} onpick={onpickdate} />
  {/if}

  <h3>In your frame <small>{camera.focal} mm on {sensor.id === 'custom' ? 'your sensor' : sensor.name.replace(/ \(.*/, '')}</small></h3>
  <dl>
    <dt>Frame</dt>
    <dd>{f.width.toFixed(f.width < 10 ? 2 : 1)}° × {f.height.toFixed(f.height < 10 ? 2 : 1)}°</dd>
    {#if fill !== null}
      <dt>Fills</dt>
      <dd>
        {fill >= 1 ? `${fill.toFixed(1)}× the frame's height: it does not fit, a mosaic or a shorter lens` : `${Math.round(fill * 100)}% of the frame's height`}
      </dd>
    {/if}
    {#if snug}
      <dt>Snug fit</dt>
      <dd><button class="link" onclick={() => onframe(snug!)} title="Use this focal length">about {snug} mm</button></dd>
    {/if}
    <dt>Untracked</dt>
    <dd>
      up to {rule500(camera).toFixed(1)} s by the 500 rule, {ruleNpf(camera, dec).toFixed(1)} s by the NPF rule at this declination
    </dd>
  </dl>
</section>

<style>
  header {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
  }
  .sub {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 13px;
  }
  .close {
    flex: none;
    width: 30px;
    min-width: 30px;
    height: 30px;
    font-size: 18px;
  }
  .actions {
    margin: 8px 0 10px;
  }
  h3 {
    margin: 14px 0 6px;
  }
  .best {
    margin: 0 0 6px;
    font-size: 14px;
  }
  dd b {
    color: #62d394;
    font-weight: 600;
  }
</style>
