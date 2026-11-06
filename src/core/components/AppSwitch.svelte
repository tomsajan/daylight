<!--
  Links to the other apps: Daylight (the design last used), Eclipses (the eclipse
  it showed) and Night Sky. Places come along. Themable via --dl-* custom
  properties, like the design switcher.
-->
<script lang="ts">
  import { stateQuery } from '../state/app.svelte';
  import { APP_INFO, APP_NAMES, appHref, currentApp } from '../apps';

  interface Props {
    /** Icons only, the names in the tooltips. */
    compact?: boolean;
  }
  let { compact = false }: Props = $props();

  const others = APP_NAMES.filter((a) => a !== currentApp);
  const places = $derived(stateQuery({ time: false }));
</script>

<span class="dl-apps">
  {#each others as to (to)}
    <a class="dl-app" class:dl-app--compact={compact} href={appHref(to, places)} title={APP_INFO[to].title} aria-label={compact ? APP_INFO[to].name : undefined}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        {#if to === 'daylight'}
          <circle cx="10" cy="10" r="3.6" fill="currentColor" />
          <path d="M10 1.5v2.6M10 15.9v2.6M1.5 10h2.6M15.9 10h2.6M4 4l1.8 1.8M14.2 14.2 16 16M4 16l1.8-1.8M14.2 5.8 16 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        {:else if to === 'eclipses'}
          <!-- The Sun's crescent with the Moon over it. -->
          <path d="M14.04 13.8A6 6 0 1 1 6.96 5.7A6 6 0 0 0 14.04 13.8Z" fill="currentColor" />
          <circle cx="12.5" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.55" />
        {:else}
          <!-- Stars of a constellation, joined. -->
          <path d="M3.5 14.5 8 9.5l4.5 2L16.5 4" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.6" />
          <circle cx="3.5" cy="14.5" r="1.6" fill="currentColor" />
          <circle cx="8" cy="9.5" r="1.9" fill="currentColor" />
          <circle cx="12.5" cy="11.5" r="1.4" fill="currentColor" />
          <path d="m16.5 1.6.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z" fill="currentColor" />
        {/if}
      </svg>
      {#if !compact}<span>{APP_INFO[to].name}</span>{/if}
    </a>
  {/each}
</span>

<style>
  /* No weight of their own, so a design's styles override them. */
  :where(.dl-apps) {
    display: inline-flex;
    gap: 6px;
  }
  :where(.dl-app) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--dl-border, #d0d5dd);
    border-radius: var(--dl-radius, 10px);
    background: var(--dl-surface, #fff);
    color: var(--dl-fg, #111);
    font: inherit;
    text-decoration: none;
    white-space: nowrap;
    box-sizing: border-box;
  }
  :where(.dl-app--compact) {
    width: 34px;
    padding: 0;
    justify-content: center;
  }
  :where(.dl-app:hover) {
    border-color: var(--dl-accent, #f2a516);
    color: var(--dl-accent-fg, var(--dl-fg, #111));
  }
  :where(.dl-app svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
</style>
