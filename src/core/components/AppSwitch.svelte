<!--
  A link to the other app: from any Daylight design to Eclipses, and from
  Eclipses back to the Daylight design last used. Places come along, and
  Eclipses comes back to the eclipse it showed. Themable via --dl-* custom
  properties, like the design switcher.
-->
<script lang="ts">
  import { stateQuery } from '../state/app.svelte';
  import { currentDesign, otherAppHref } from '../apps';

  interface Props {
    /** Icon only, the name in the tooltip. */
    compact?: boolean;
  }
  let { compact = false }: Props = $props();

  const toDaylight = currentDesign?.app === 'eclipses';
  const name = toDaylight ? 'Daylight' : 'Eclipses';
  const title = toDaylight ? 'Daylight: sunrise, sunset and day length through the year' : 'Eclipses: every solar and lunar eclipse, 1980-2100';
  const href = $derived(otherAppHref(stateQuery({ time: false })));
</script>

<a class="dl-app" class:dl-app--compact={compact} {href} {title} aria-label={compact ? name : undefined}>
  <svg viewBox="0 0 20 20" aria-hidden="true">
    {#if toDaylight}
      <circle cx="10" cy="10" r="3.6" fill="currentColor" />
      <path d="M10 1.5v2.6M10 15.9v2.6M1.5 10h2.6M15.9 10h2.6M4 4l1.8 1.8M14.2 14.2 16 16M4 16l1.8-1.8M14.2 5.8 16 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    {:else}
      <!-- The Sun's crescent with the Moon over it. -->
      <path d="M14.04 13.8A6 6 0 1 1 6.96 5.7A6 6 0 0 0 14.04 13.8Z" fill="currentColor" />
      <circle cx="12.5" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.55" />
    {/if}
  </svg>
  {#if !compact}<span>{name}</span>{/if}
</a>

<style>
  /* No weight of their own, so a design's styles override them. */
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
