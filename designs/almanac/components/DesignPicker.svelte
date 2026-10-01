<!--
  The core design switcher, set in Almanac type: a quiet underlined select
  that reads like a line of the masthead. Places, time and settings travel
  with it to the other design.
-->
<script lang="ts">
  import DesignSwitcher from '$core/components/DesignSwitcher.svelte';

  interface Props {
    label?: string;
  }
  let { label = 'Design' }: Props = $props();
</script>

<span class="alm-design">
  <DesignSwitcher {label} />
</span>

<style>
  .alm-design {
    display: inline-flex;
    --dl-fg: var(--ink);
    --dl-muted: var(--muted);
    --dl-border: var(--rule-strong);
    --dl-surface: transparent;
    --dl-radius: 0;
    --dl-color-scheme: var(--scheme);
    font: 500 0.88rem/1 var(--sans);
  }
  .alm-design :global(select) {
    height: 36px;
    padding: 0 22px 0 2px;
    border: 0;
    border-bottom: 1px solid var(--rule-strong);
    border-radius: 0;
    appearance: none;
    -webkit-appearance: none;
    /* A small chevron drawn in the text colour in place of the native arrow. */
    background-color: transparent;
    background-image:
      linear-gradient(45deg, transparent 50%, currentColor 50%),
      linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position:
      calc(100% - 9px) 55%,
      calc(100% - 4px) 55%;
    background-size: 5px 5px;
    background-repeat: no-repeat;
    font: italic 500 1rem/1 var(--serif);
  }
  .alm-design :global(select:hover) {
    border-bottom-color: var(--ink);
    color: var(--accent);
  }
  .alm-design :global(option) {
    background: var(--paper);
    color: var(--ink);
    font-style: normal;
  }
  .alm-design :global(.dl-design__label) {
    font: 400 0.82rem/1 var(--sans);
    color: var(--muted);
  }
</style>
