<!--
  Switch to another design without losing anything: places, date and time,
  simulation speed and play state travel in the URL; settings are shared
  through localStorage already. Renders as a native select, so it is compact
  and works well on phones. Themable via --dl-* custom properties.
-->
<script lang="ts">
  import { stateQuery } from '../state/app.svelte';

  interface DesignMeta {
    name: string;
    tagline: string;
    order?: number;
  }

  interface Props {
    /** Visible label before the select; hidden when empty. */
    label?: string;
  }
  let { label = '' }: Props = $props();

  // Designs with order ≥ 90 (the reference wiring) are development pages, not offered here.
  const designs = Object.entries(import.meta.glob<{ default: DesignMeta }>('/designs/*/meta.ts', { eager: true }))
    .map(([path, mod]) => ({ slug: path.split('/')[2], ...mod.default }))
    .filter((d) => (d.order ?? 50) < 90)
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));

  const current = location.pathname.match(/\/designs\/([^/]+)/)?.[1] ?? '';

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
    <option value="__all">All designs…</option>
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
