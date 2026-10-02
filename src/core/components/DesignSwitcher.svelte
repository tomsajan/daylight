<!--
  Switch to another design of the same app without losing anything: places, date and time,
  simulation speed and play state travel in the URL; settings are shared
  through localStorage already. Renders as a native select, so it is compact
  and works well on phones. Themable via --dl-* custom properties.
-->
<script lang="ts">
  import { stateQuery } from '../state/app.svelte';
  import { currentDesign, currentSlug, designsOf } from '../apps';

  interface Props {
    /** Visible label before the select; hidden when empty. */
    label?: string;
  }
  let { label = '' }: Props = $props();

  // The other designs of the same app; the other app has its own link (AppSwitch).
  const designs = designsOf(currentDesign?.app ?? 'daylight');
  const current = currentSlug;

  function go(slug: string) {
    if (slug === '__all') {
      location.href = `../../${stateQuery()}`;
    } else if (slug !== current) {
      location.href = `../${slug}/${stateQuery()}`;
    }
  }
</script>

<label class="dl-design">
  {#if label}<span class="dl-design__label">{label}</span>{/if}
  <select value={current} onchange={(e) => go((e.target as HTMLSelectElement).value)} aria-label="Design" title="Switch design (keeps your places, time and settings)">
    {#if !designs.some((d) => d.slug === current)}<option value={current} disabled>Design…</option>{/if}
    {#each designs as d (d.slug)}
      <option value={d.slug}>{d.name}</option>
    {/each}
    <option value="__all">Start page…</option>
  </select>
</label>

<style>
  .dl-design {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--dl-fg, #111);
  }
  .dl-design__label {
    font-size: 0.85em;
    color: var(--dl-muted, #667);
  }
  select {
    height: 34px;
    padding: 0 8px;
    border: 1px solid var(--dl-border, #d0d5dd);
    border-radius: var(--dl-radius, 10px);
    background: var(--dl-surface, #fff);
    color: inherit;
    font: inherit;
    cursor: pointer;
    color-scheme: var(--dl-color-scheme, light);
  }
</style>
