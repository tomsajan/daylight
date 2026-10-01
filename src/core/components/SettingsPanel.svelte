<!--
  Every user setting, bound to the persisted `settings` store.
  Sections can be hidden by a design that exposes them elsewhere.
-->
<script lang="ts">
  import { settings, resetSettings } from '../state/settings.svelte';
  import { TIME_SCALE_LABELS, type TimeScaleKind } from '../time/timescale';

  interface Props {
    sections?: { time?: boolean; sun?: boolean; chart?: boolean; globe?: boolean; appearance?: boolean };
  }
  let { sections = {} }: Props = $props();
  const show = $derived({ time: true, sun: true, chart: true, globe: true, appearance: true, ...sections });

  const SCALE_HELP: Record<TimeScaleKind, string> = {
    local: 'Clock time in the place’s time zone, including daylight saving time.',
    utc: 'Coordinated Universal Time, the same everywhere.',
    'solar-mean': 'Time set by longitude only: 15° per hour. No time zones, no DST.',
    'solar-apparent': 'Sundial time: the sun is highest at exactly 12:00.',
  };
</script>

<div class="dl-settings">
  {#if show.time}
    <fieldset>
      <legend>Time</legend>
      {#each Object.entries(TIME_SCALE_LABELS) as [kind, label] (kind)}
        <label class="dl-radio">
          <input type="radio" name="dl-scale" value={kind} bind:group={settings.timeScale} />
          <span>
            <strong>{label}</strong>
            <small>{SCALE_HELP[kind as TimeScaleKind]}</small>
          </span>
        </label>
      {/each}
      <div class="dl-row">
        <span>Clock</span>
        <div class="dl-segmented" role="radiogroup" aria-label="Clock format">
          <label><input type="radio" name="dl-hc" value="24" bind:group={settings.hourCycle} /><span>24 h</span></label>
          <label><input type="radio" name="dl-hc" value="12" bind:group={settings.hourCycle} /><span>12 h</span></label>
        </div>
      </div>
    </fieldset>
  {/if}

  {#if show.sun}
    <fieldset>
      <legend>Sunrise &amp; twilight</legend>
      <label class="dl-radio">
        <input type="radio" name="dl-sunrise" value="standard" bind:group={settings.sunrise} />
        <span><strong>Standard</strong><small>Top edge of the sun at the horizon, with atmospheric refraction (as in almanacs).</small></span>
      </label>
      <label class="dl-radio">
        <input type="radio" name="dl-sunrise" value="geometric" bind:group={settings.sunrise} />
        <span><strong>Geometric</strong><small>Centre of the sun on the mathematical horizon, no atmosphere.</small></span>
      </label>
      <label class="dl-row">
        <span>Eye height <small>(lowers the horizon)</small></span>
        <span class="dl-number"><input type="number" min="0" max="9000" step="10" bind:value={settings.observerHeight} /> m</span>
      </label>
      <div class="dl-checks">
        <label><input type="checkbox" bind:checked={settings.twilight.civil} /> Civil twilight <small>(sun 0–6° below)</small></label>
        <label><input type="checkbox" bind:checked={settings.twilight.nautical} /> Nautical twilight <small>(6–12°)</small></label>
        <label><input type="checkbox" bind:checked={settings.twilight.astronomical} /> Astronomical twilight <small>(12–18°)</small></label>
      </div>
    </fieldset>
  {/if}

  {#if show.chart}
    <fieldset>
      <legend>Year chart</legend>
      <div class="dl-segmented" role="radiogroup" aria-label="Year chart">
        <label><input type="radio" name="dl-chart" value="bands" bind:group={settings.chartMode} /><span>Sunrise &amp; sunset</span></label>
        <label><input type="radio" name="dl-chart" value="daylength" bind:group={settings.chartMode} /><span>Day length</span></label>
      </div>
    </fieldset>
  {/if}

  {#if show.globe}
    <fieldset>
      <legend>Globe</legend>
      <div class="dl-segmented" role="radiogroup" aria-label="Twilight on the globe">
        <label><input type="radio" name="dl-gtw" value="bands" bind:group={settings.globe.twilightStyle} /><span>Twilight bands</span></label>
        <label><input type="radio" name="dl-gtw" value="smooth" bind:group={settings.globe.twilightStyle} /><span>Smooth</span></label>
      </div>
      <label class="dl-slider">
        <span>Day brightness <small>{Math.round(settings.globeBrightness.day * 100)}%</small></span>
        <input type="range" min="0.5" max="2" step="0.05" bind:value={settings.globeBrightness.day} />
      </label>
      <label class="dl-slider">
        <span>Night brightness <small>{settings.globeBrightness.night === 0 ? 'black' : `${Math.round(settings.globeBrightness.night * 100)}%`}</small></span>
        <input type="range" min="0" max="0.4" step="0.01" bind:value={settings.globeBrightness.night} />
      </label>
      <div class="dl-checks">
        <label><input type="checkbox" bind:checked={settings.globe.terminatorLines} /> Sunrise &amp; twilight lines</label>
        <label><input type="checkbox" bind:checked={settings.globe.nightLights} /> City lights at night</label>
        <label><input type="checkbox" bind:checked={settings.globe.latitudeLines} /> Equator, tropics &amp; polar circles</label>
        <label><input type="checkbox" bind:checked={settings.globe.graticule} /> Latitude/longitude grid</label>
        <label><input type="checkbox" bind:checked={settings.globe.atmosphere} /> Atmosphere glow</label>
        <label><input type="checkbox" bind:checked={settings.globe.showLabels} /> Place names</label>
        <label><input type="checkbox" bind:checked={settings.globe.followSun} /> Follow the sun</label>
        <label><input type="checkbox" bind:checked={settings.globe.autoRotate} /> Spin slowly</label>
      </div>
    </fieldset>
  {/if}

  {#if show.appearance}
    <fieldset>
      <legend>Appearance</legend>
      <div class="dl-segmented" role="radiogroup" aria-label="Theme">
        <label><input type="radio" name="dl-theme" value="auto" bind:group={settings.theme} /><span>Auto</span></label>
        <label><input type="radio" name="dl-theme" value="light" bind:group={settings.theme} /><span>Light</span></label>
        <label><input type="radio" name="dl-theme" value="dark" bind:group={settings.theme} /><span>Dark</span></label>
      </div>
    </fieldset>
  {/if}

  <button type="button" class="dl-reset" onclick={resetSettings}>Reset to defaults</button>
</div>

<style>
  .dl-settings {
    display: flex;
    flex-direction: column;
    gap: 14px;
    color: var(--dl-fg, #111);
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  legend {
    padding: 0 0 6px;
    font-size: 0.75em;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dl-muted, #667);
  }
  small {
    color: var(--dl-muted, #667);
  }
  .dl-radio {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    cursor: pointer;
  }
  .dl-radio input {
    margin-top: 3px;
    accent-color: var(--dl-accent, #3d8bfd);
  }
  .dl-radio span {
    display: flex;
    flex-direction: column;
  }
  .dl-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .dl-number input {
    width: 80px;
    height: 32px;
    padding: 0 6px;
    border: 1px solid var(--dl-border, #d0d5dd);
    border-radius: calc(var(--dl-radius, 10px) - 2px);
    background: var(--dl-surface, #fff);
    color: inherit;
    font: inherit;
  }
  .dl-slider {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .dl-slider span {
    display: flex;
    justify-content: space-between;
  }
  .dl-slider input {
    accent-color: var(--dl-accent, #3d8bfd);
  }
  .dl-checks {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .dl-checks input {
    accent-color: var(--dl-accent, #3d8bfd);
  }
  .dl-segmented {
    display: inline-flex;
    flex-wrap: wrap;
    border: 1px solid var(--dl-border, #d0d5dd);
    border-radius: var(--dl-radius, 10px);
    overflow: hidden;
    align-self: flex-start;
  }
  .dl-segmented label {
    position: relative;
    cursor: pointer;
  }
  .dl-segmented input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .dl-segmented span {
    display: block;
    padding: 7px 12px;
  }
  .dl-segmented input:checked + span {
    background: var(--dl-accent, #3d8bfd);
    color: var(--dl-on-accent, #fff);
  }
  .dl-segmented input:focus-visible + span {
    outline: 2px solid var(--dl-accent, #3d8bfd);
    outline-offset: -2px;
  }
  .dl-reset {
    align-self: flex-start;
    border: 0;
    background: none;
    color: var(--dl-muted, #667);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
</style>
