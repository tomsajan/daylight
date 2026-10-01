<!--
  Preferences as a modal sheet (full screen on phones). Every setting is bound
  directly to the persisted `settings` store, so changes apply immediately.
-->
<script lang="ts">
  import { settings, resetSettings, type Settings } from '$core/state/settings.svelte';
  import { TIME_SCALE_LABELS, type TimeScaleKind } from '$core/time/timescale';

  let dialog: HTMLDialogElement;

  export function open() {
    dialog.showModal();
  }

  const SCALE_HELP: Record<TimeScaleKind, string> = {
    local: 'The time on clocks at the place, with daylight saving time.',
    utc: 'Coordinated Universal Time, the same everywhere on Earth.',
    'solar-mean': 'Time from longitude alone, 15° to the hour. No time zones and no daylight saving.',
    'solar-apparent': 'Sundial time: the sun is highest at exactly 12:00 every day.',
  };

  type GlobeSwitch = { [K in keyof Settings['globe']]: Settings['globe'][K] extends boolean ? K : never }[keyof Settings['globe']];
  const GLOBE_CHECKS: { key: GlobeSwitch; label: string }[] = [
    { key: 'terminatorLines', label: 'Lines for sunrise and each twilight' },
    { key: 'nightLights', label: 'City lights on the night side' },
    { key: 'latitudeLines', label: 'Equator, tropics and polar circles' },
    { key: 'graticule', label: 'Latitude and longitude grid' },
    { key: 'atmosphere', label: 'Atmosphere glow' },
    { key: 'showLabels', label: 'Place names' },
    { key: 'followSun', label: 'Keep the sunlit side facing you' },
    { key: 'autoRotate', label: 'Turn slowly' },
  ];
</script>

<dialog bind:this={dialog} class="prefs" aria-labelledby="alm-prefs-title" onclick={(e) => e.target === dialog && dialog.close()}>
  <div class="sheet">
    <header>
      <h2 id="alm-prefs-title">Preferences</h2>
      <button type="button" class="close" onclick={() => dialog.close()}>Done</button>
    </header>

    <fieldset>
      <legend>Clock</legend>
      <p class="help">Which clock every time on the page is read from.</p>
      {#each Object.entries(TIME_SCALE_LABELS) as [kind, label] (kind)}
        <label class="choice">
          <input type="radio" name="alm-scale" value={kind} bind:group={settings.timeScale} />
          <span><strong>{label}</strong><small>{SCALE_HELP[kind as TimeScaleKind]}</small></span>
        </label>
      {/each}
      <div class="inline" role="radiogroup" aria-label="Clock format">
        <span class="lbl">Format</span>
        <label class="pill"><input type="radio" name="alm-hc" value="24" bind:group={settings.hourCycle} /><span>24-hour, 18:30</span></label>
        <label class="pill"><input type="radio" name="alm-hc" value="12" bind:group={settings.hourCycle} /><span>12-hour, 6:30 PM</span></label>
      </div>
    </fieldset>

    <fieldset>
      <legend>Sunrise and sunset</legend>
      <label class="choice">
        <input type="radio" name="alm-sunrise" value="standard" bind:group={settings.sunrise} />
        <span><strong>As in almanacs</strong><small>The top edge of the sun meets the horizon, with the air’s refraction lifting it slightly. Matches published tables.</small></span>
      </label>
      <label class="choice">
        <input type="radio" name="alm-sunrise" value="geometric" bind:group={settings.sunrise} />
        <span><strong>Geometric</strong><small>The centre of the sun on a mathematical horizon, with no atmosphere. Days come out a few minutes shorter.</small></span>
      </label>
      <label class="inline">
        <span class="lbl">Eye height</span>
        <input class="num" type="number" min="0" max="9000" step="10" bind:value={settings.observerHeight} />
        <span>metres above the surroundings <small>(higher sees the sun earlier and later)</small></span>
      </label>
    </fieldset>

    <fieldset>
      <legend>Twilight in the charts</legend>
      <p class="help">A hidden twilight is drawn in the colour of the next darker one.</p>
      <label class="check"><input type="checkbox" bind:checked={settings.twilight.civil} /> Civil twilight <small>sun 0–6° below</small></label>
      <label class="check"><input type="checkbox" bind:checked={settings.twilight.nautical} /> Nautical twilight <small>6–12° below</small></label>
      <label class="check"><input type="checkbox" bind:checked={settings.twilight.astronomical} /> Astronomical twilight <small>12–18° below</small></label>
    </fieldset>

    <fieldset>
      <legend>Year chart</legend>
      <div class="inline" role="radiogroup" aria-label="Year chart">
        <label class="pill"><input type="radio" name="alm-chart" value="bands" bind:group={settings.chartMode} /><span>Sunrise &amp; sunset</span></label>
        <label class="pill"><input type="radio" name="alm-chart" value="daylength" bind:group={settings.chartMode} /><span>Day length</span></label>
      </div>
    </fieldset>

    <fieldset>
      <legend>Globe</legend>
      <div class="inline" role="radiogroup" aria-label="Twilight on the globe">
        <span class="lbl">Twilight</span>
        <label class="pill"><input type="radio" name="alm-gtw" value="bands" bind:group={settings.globe.twilightStyle} /><span>In steps</span></label>
        <label class="pill"><input type="radio" name="alm-gtw" value="smooth" bind:group={settings.globe.twilightStyle} /><span>Smooth</span></label>
      </div>
      {#each GLOBE_CHECKS as c (c.key)}
        <label class="check"><input type="checkbox" bind:checked={settings.globe[c.key]} /> {c.label}</label>
      {/each}
    </fieldset>

    <fieldset>
      <legend>Edition</legend>
      <div class="inline" role="radiogroup" aria-label="Colour theme">
        <label class="pill"><input type="radio" name="alm-theme" value="auto" bind:group={settings.theme} /><span>Match this device</span></label>
        <label class="pill"><input type="radio" name="alm-theme" value="light" bind:group={settings.theme} /><span>Paper (light)</span></label>
        <label class="pill"><input type="radio" name="alm-theme" value="dark" bind:group={settings.theme} /><span>Night (dark)</span></label>
      </div>
    </fieldset>

    <footer>
      <button type="button" class="reset" onclick={resetSettings}>Restore all defaults</button>
      <button type="button" class="close" onclick={() => dialog.close()}>Done</button>
    </footer>
  </div>
</dialog>

<style>
  .prefs {
    width: min(640px, calc(100vw - 32px));
    max-height: min(86vh, 900px);
    padding: 0;
    border: 1px solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 30px 60px -20px rgb(20 16 6 / 0.45);
    font-family: var(--serif);
  }
  .prefs::backdrop {
    background: rgb(20 18 12 / 0.45);
  }
  .sheet {
    padding: 0 28px 24px;
  }
  header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 0 12px;
    background: var(--paper);
    border-bottom: 1px solid var(--ink);
  }
  h2 {
    margin: 0;
    font: 500 1.8rem/1 var(--serif);
  }
  fieldset {
    margin: 0;
    padding: 18px 0 16px;
    border: 0;
    border-bottom: 1px solid var(--rule);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  legend {
    float: left;
    width: 100%;
    padding: 0;
    margin-bottom: 4px;
    font: italic 500 1.2rem/1.2 var(--serif);
  }
  .help {
    margin: 0;
    font-size: 0.9rem;
    color: var(--muted);
  }
  small {
    color: var(--muted);
    font-size: 0.82rem;
  }
  .choice {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    cursor: pointer;
  }
  .choice input {
    margin-top: 5px;
  }
  .choice span {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .choice strong {
    font-weight: 500;
  }
  input[type='radio'],
  input[type='checkbox'] {
    accent-color: var(--ink);
    width: 17px;
    height: 17px;
    flex: none;
  }
  .check {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    cursor: pointer;
    min-height: 28px;
  }
  .check input {
    align-self: center;
  }
  .inline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .lbl {
    font: 400 0.85rem/1 var(--sans);
    color: var(--muted);
    margin-right: 4px;
  }
  .num {
    width: 84px;
    height: 36px;
    padding: 0 8px;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    background: var(--sheet);
    color: inherit;
    font: inherit;
    font-variant-numeric: tabular-nums;
    color-scheme: var(--scheme);
  }
  .pill {
    position: relative;
    cursor: pointer;
  }
  .pill input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .pill span {
    display: block;
    padding: 8px 12px;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    font: 500 0.85rem/1.1 var(--sans);
  }
  .pill input:checked + span {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }
  .pill input:focus-visible + span {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 18px;
  }
  .close {
    height: 38px;
    padding: 0 18px;
    border: 0;
    border-radius: 2px;
    background: var(--ink);
    color: var(--paper);
    font: 600 0.88rem/1 var(--sans);
    cursor: pointer;
  }
  .reset {
    border: 0;
    background: none;
    padding: 0;
    color: var(--muted);
    text-decoration: underline;
    text-underline-offset: 3px;
    font: 400 0.88rem/1 var(--sans);
    cursor: pointer;
  }
  @media (max-width: 559px) {
    .prefs {
      width: 100vw;
      max-width: 100vw;
      height: 100dvh;
      max-height: 100dvh;
      margin: 0;
      border: 0;
    }
    .sheet {
      padding: 0 16px calc(24px + env(safe-area-inset-bottom));
    }
    header {
      padding-top: calc(14px + env(safe-area-inset-top));
    }
  }
</style>
