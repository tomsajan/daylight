<!-- How much the ground in a sky view hides what is below the horizon. -->
<script lang="ts">
  import { ground, setGroundOpacity } from './ground.svelte';
</script>

<label class="ground" title="How much the ground hides the Sun or Moon below the horizon">
  Ground
  <input
    type="range"
    min="0"
    max="1"
    step="0.05"
    value={ground.opacity}
    oninput={(ev) => setGroundOpacity(Number(ev.currentTarget.value))}
    aria-label="Ground opacity"
  />
  <span>{Math.round(ground.opacity * 100)}%</span>
</label>

<style>
  .ground {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 380px;
    margin-top: 4px;
    font-size: 13px;
    color: var(--muted);
  }
  input {
    flex: 1;
    min-width: 0;
    accent-color: var(--accent);
  }
  span {
    min-width: 3.2em;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
