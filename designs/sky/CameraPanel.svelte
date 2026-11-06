<!--
  Camera and lens: the sensor, the focal length, the aperture and how the frame is turned.
  Kept in this browser.
-->
<script lang="ts">
  import { SENSORS, field, rule500, ruleNpf } from '$core/sky/camera';
  import { prefs } from './prefs.svelte';

  const cam = prefs.camera;
  const f = $derived(field(prefs.camera));
  const FOCALS = [14, 20, 24, 35, 50, 85, 135, 200, 300, 400, 600, 1000];
</script>

<section class="camera">
  <h2>Camera and lens</h2>
  <div class="grid">
    <label class="wide">
      Sensor
      <select class="dl-input" bind:value={cam.sensor}>
        {#each SENSORS as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
        <option value="custom">Custom…</option>
      </select>
    </label>
    {#if cam.sensor === 'custom'}
      <label>Width, mm <input class="dl-input" type="number" min="1" max="100" step="0.1" bind:value={cam.custom.width} /></label>
      <label>Height, mm <input class="dl-input" type="number" min="1" max="100" step="0.1" bind:value={cam.custom.height} /></label>
      <label>Pixel, µm <input class="dl-input" type="number" min="0.5" max="20" step="0.01" bind:value={cam.custom.pixel} /></label>
    {/if}
    <label>
      Focal length, mm
      <input class="dl-input" type="number" min="4" max="5000" step="1" bind:value={cam.focal} list="focals" />
      <datalist id="focals">{#each FOCALS as v (v)}<option value={v}></option>{/each}</datalist>
    </label>
    <label>
      Aperture, f/
      <input class="dl-input" type="number" min="0.95" max="32" step="0.1" bind:value={cam.fNumber} />
    </label>
    <label class="wide" title="The position angle of the frame's top edge, east of north: at 0° the long side runs east-west">
      Frame angle {cam.rotation}° <small>(top edge, east of north)</small>
      <input type="range" min="0" max="179" step="1" bind:value={cam.rotation} />
    </label>
  </div>
  <p class="out">
    {f.width.toFixed(1)}° × {f.height.toFixed(1)}° ({f.diagonal.toFixed(1)}° across), {f.pixelScale.toFixed(2)}″ a pixel. On a fixed tripod: {rule500(cam).toFixed(1)} s by the 500 rule,
    {ruleNpf(cam).toFixed(1)} s by the NPF rule near the celestial equator.
  </p>
</section>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 10px;
  }
  label {
    display: grid;
    gap: 3px;
    font-size: 13px;
    color: var(--muted);
  }
  .wide {
    grid-column: 1 / -1;
  }
  input[type='number'] {
    width: 100%;
    box-sizing: border-box;
  }
  small {
    font-size: 11px;
  }
  .out {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--muted);
  }
</style>
