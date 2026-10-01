<!--
  Every setting, in a glass slide-over from the right. Observatory is dark by
  design, so the light/dark theme choice is not offered here.
-->
<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { settings, resetSettings } from '$core/state/settings.svelte';
  import { TIME_SCALE_LABELS, type TimeScaleKind } from '$core/time/timescale';
  import Icon from './Icon.svelte';
  import DesignSwitcher from '$core/components/DesignSwitcher.svelte';

  interface Props {
    onclose: () => void;
  }
  let { onclose }: Props = $props();

  const SCALE_HELP: Record<TimeScaleKind, string> = {
    local: 'Clock time in the place’s time zone, including daylight saving time.',
    utc: 'Coordinated Universal Time, the same everywhere.',
    'solar-mean': 'Set by longitude only, 15° per hour. No time zones, no daylight saving.',
    'solar-apparent': 'Sundial time: the sun is highest at exactly 12:00.',
  };

  type GlobeToggle = Exclude<keyof typeof settings.globe, 'twilightStyle'>;
  const GLOBE_TOGGLES: { key: GlobeToggle; label: string }[] = [
    { key: 'terminatorLines', label: 'Sunrise and twilight lines' },
    { key: 'nightLights', label: 'City lights at night' },
    { key: 'latitudeLines', label: 'Equator, tropics and polar circles' },
    { key: 'graticule', label: 'Latitude and longitude grid' },
    { key: 'atmosphere', label: 'Atmosphere glow' },
    { key: 'showLabels', label: 'Place names' },
    { key: 'followSun', label: 'Follow the sun as time runs' },
    { key: 'autoRotate', label: 'Spin slowly' },
  ];

  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let closeBtn: HTMLButtonElement;

  $effect(() => {
    closeBtn?.focus();
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="scrim" transition:fade={{ duration: reduced ? 0 : 180 }} onclick={onclose} role="presentation"></div>
<div class="drawer o-glass o-scroll" role="dialog" aria-modal="true" aria-labelledby="obs-settings-title" transition:fly={{ x: 40, duration: reduced ? 0 : 260, opacity: 0 }}>
  <header>
    <h2 id="obs-settings-title">Settings</h2>
    <button bind:this={closeBtn} type="button" class="o-btn o-btn--icon o-btn--quiet" onclick={onclose} aria-label="Close settings"><Icon name="close" /></button>
  </header>

  <section>
    <h3>Design</h3>
    <div class="line">
      <span>Another look at the same thing <small>your places, time and settings come along</small></span>
      <div class="o-design"><DesignSwitcher /></div>
    </div>
  </section>

  <section>
    <h3>Clock</h3>
    <div class="choices">
      {#each Object.entries(TIME_SCALE_LABELS) as [kind, label] (kind)}
        <label class="choice">
          <input type="radio" name="obs-scale" value={kind} bind:group={settings.timeScale} />
          <span><strong>{label}</strong><small>{SCALE_HELP[kind as TimeScaleKind]}</small></span>
        </label>
      {/each}
    </div>
    <div class="line">
      <span>Time format</span>
      <div class="o-seg" role="group" aria-label="Time format">
        <button type="button" aria-pressed={settings.hourCycle === '24'} onclick={() => (settings.hourCycle = '24')}>24-hour</button>
        <button type="button" aria-pressed={settings.hourCycle === '12'} onclick={() => (settings.hourCycle = '12')}>12-hour</button>
      </div>
    </div>
  </section>

  <section>
    <h3>Sunrise and twilight</h3>
    <div class="choices">
      <label class="choice">
        <input type="radio" name="obs-sunrise" value="standard" bind:group={settings.sunrise} />
        <span><strong>Standard</strong><small>The sun’s top edge on the horizon, with the atmosphere bending the light, as in almanacs.</small></span>
      </label>
      <label class="choice">
        <input type="radio" name="obs-sunrise" value="geometric" bind:group={settings.sunrise} />
        <span><strong>Geometric</strong><small>The sun’s centre on the mathematical horizon, no atmosphere.</small></span>
      </label>
    </div>
    <label class="line">
      <span>Eye height <small>raises you above the horizon</small></span>
      <span class="num"><input class="o-input" type="number" min="0" max="9000" step="10" bind:value={settings.observerHeight} /> m</span>
    </label>
    <p class="sub">Twilight shown in the charts</p>
    <label class="switch"><input type="checkbox" role="switch" bind:checked={settings.twilight.civil} /><span class="track"></span><span>Civil <small>sun 0–6° below</small></span></label>
    <label class="switch"><input type="checkbox" role="switch" bind:checked={settings.twilight.nautical} /><span class="track"></span><span>Nautical <small>6–12° below</small></span></label>
    <label class="switch"><input type="checkbox" role="switch" bind:checked={settings.twilight.astronomical} /><span class="track"></span><span>Astronomical <small>12–18° below</small></span></label>
  </section>

  <section>
    <h3>Year chart</h3>
    <div class="o-seg" role="group" aria-label="Year chart shows">
      <button type="button" aria-pressed={settings.chartMode === 'bands'} onclick={() => (settings.chartMode = 'bands')}>Sunrise &amp; sunset</button>
      <button type="button" aria-pressed={settings.chartMode === 'daylength'} onclick={() => (settings.chartMode = 'daylength')}>Day length</button>
    </div>
  </section>

  <section>
    <h3>Globe</h3>
    <div class="line">
      <span>Twilight</span>
      <div class="o-seg" role="group" aria-label="Twilight on the globe">
        <button type="button" aria-pressed={settings.globe.twilightStyle === 'bands'} onclick={() => (settings.globe.twilightStyle = 'bands')}>Bands</button>
        <button type="button" aria-pressed={settings.globe.twilightStyle === 'smooth'} onclick={() => (settings.globe.twilightStyle = 'smooth')}>Smooth</button>
      </div>
    </div>
    {#each GLOBE_TOGGLES as t (t.key)}
      <label class="switch">
        <input type="checkbox" role="switch" bind:checked={settings.globe[t.key]} />
        <span class="track"></span><span>{t.label}</span>
      </label>
    {/each}
  </section>

  <button type="button" class="o-btn reset" onclick={resetSettings}><Icon name="reset" /> Reset all settings</button>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: rgb(1 3 10 / 0.45);
  }
  .drawer {
    position: fixed;
    z-index: 100;
    top: calc(12px + var(--safe-top));
    right: calc(12px + var(--safe-right));
    bottom: calc(12px + var(--safe-bottom));
    width: min(400px, calc(100vw - 24px));
    box-sizing: border-box;
    padding: 8px 22px 24px;
    border-radius: var(--r-panel);
    background: var(--glass-strong);
    display: flex;
    flex-direction: column;
    gap: 26px;
  }
  header {
    position: sticky;
    top: -8px;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 -10px;
    padding: 8px 0 8px 10px;
  }
  h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 300;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h3 {
    margin: 0 0 2px;
    font-size: 15px;
    font-weight: 500;
    color: var(--gold-hot);
  }
  .sub {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--ink-2);
  }
  small {
    color: var(--ink-3);
    font-size: 12.5px;
  }
  .choices {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .choice {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 8px 10px;
    margin: 0 -10px;
    border-radius: 12px;
    cursor: pointer;
  }
  .choice:hover {
    background: var(--glass-hover);
  }
  .choice input {
    margin: 4px 0 0;
    accent-color: var(--gold);
    width: 16px;
    height: 16px;
    flex: none;
  }
  .choice span {
    display: flex;
    flex-direction: column;
  }
  .choice strong {
    font-weight: 500;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .line > span:first-child {
    display: flex;
    flex-direction: column;
  }
  .num {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
  }
  .num input {
    width: 84px;
    height: 36px;
  }
  .switch {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 34px;
    cursor: pointer;
  }
  .switch input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .track {
    position: relative;
    flex: none;
    width: 36px;
    height: 20px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.1);
    box-shadow: inset 0 0 0 1px var(--hair-strong);
    transition: background 0.15s;
  }
  .track::after {
    content: '';
    position: absolute;
    left: 3px;
    top: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--ink-2);
    transition: transform 0.15s;
  }
  .switch input:checked + .track {
    background: color-mix(in srgb, var(--gold) 70%, transparent);
  }
  .switch input:checked + .track::after {
    transform: translateX(16px);
    background: #fff8e6;
  }
  .switch input:focus-visible + .track {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .reset {
    align-self: flex-start;
  }
  @media (max-width: 819px) {
    .drawer {
      top: calc(8px + var(--safe-top));
      right: 8px;
      bottom: calc(8px + var(--safe-bottom));
      width: calc(100vw - 16px);
    }
  }
</style>
