<!-- Simulation controls: direction, play/pause, speed, and back to the real time. -->
<script lang="ts">
  import { app, SPEEDS } from '$core/state/app.svelte';
  import Icon from './Icon.svelte';

  const reverse = $derived(app.speed < 0);
  const speedIndex = $derived(Math.max(0, SPEEDS.findIndex((s) => s.value === Math.abs(app.speed))));

  function setSpeed(i: number) {
    app.setSpeed(SPEEDS[i].value * (reverse ? -1 : 1));
    if (!app.playing) app.play();
  }
</script>

<div class="transport">
  <button
    type="button"
    class="o-btn o-btn--icon dir"
    class:dir--back={reverse}
    aria-pressed={reverse}
    onclick={() => app.setSpeed(-app.speed)}
    title={reverse ? 'Time runs backwards. Switch to forwards' : 'Time runs forwards. Switch to backwards'}
    aria-label="Run time backwards"
  >
    <Icon name="forward" />
  </button>
  <button type="button" class="o-btn o-btn--sun" onclick={() => app.toggle()} aria-label={app.playing ? 'Pause' : 'Play'} title={app.playing ? 'Pause' : 'Play'}>
    <Icon name={app.playing ? 'pause' : 'play'} size={22} />
  </button>
  <select class="o-select speed" value={speedIndex} onchange={(e) => setSpeed(+(e.target as HTMLSelectElement).value)} aria-label="Simulation speed" title="Simulation speed">
    {#each SPEEDS as s, i (s.value)}
      <option value={i}>{s.label}</option>
    {/each}
  </select>
  <button type="button" class="o-btn now" class:now--live={app.live} onclick={() => app.goLive()} title="Jump to the current time and follow the clock">
    <span class="dot" aria-hidden="true"></span>{app.live ? 'Live' : 'Now'}
  </button>
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dir :global(svg) {
    transition: transform 0.2s;
  }
  .dir--back :global(svg) {
    transform: scaleX(-1);
  }
  .speed {
    width: 104px;
  }
  .now {
    padding: 0 12px 0 10px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ink-3);
  }
  .now--live {
    color: var(--gold-hot);
    border-color: color-mix(in srgb, var(--gold) 40%, transparent);
  }
  .now--live .dot {
    background: var(--gold);
    box-shadow: 0 0 8px var(--gold);
  }
</style>
