<!-- Settings in a side drawer (desktop) or a full-height sheet (phones), using the core panel restyled. -->
<script lang="ts">
  import SettingsPanel from '$core/components/SettingsPanel.svelte';
  import Icon from './Icon.svelte';
  import { ICON } from './icons';
  import { ui } from './ui.svelte';
</script>

<div class="backdrop" role="presentation" onclick={() => (ui.settingsOpen = false)}></div>
<div class="drawer" role="dialog" aria-label="Settings" aria-modal="true">
  <header>
    <h2 class="lbl">Settings</h2>
    <button type="button" class="btn" onclick={() => (ui.settingsOpen = false)}><Icon d={ICON.close} /> Close</button>
  </header>
  <div class="content">
    <SettingsPanel />
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgb(0 0 0 / 0.35);
  }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 101;
    width: min(380px, 100vw);
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-left: 1px solid var(--rule-strong);
    box-shadow: -16px 0 40px rgb(0 0 0 / 0.25);
    padding-top: env(safe-area-inset-top);
    animation: slide 0.18s ease-out;
  }
  @keyframes slide {
    from {
      transform: translateX(24px);
      opacity: 0;
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    padding: 0 8px 0 14px;
    border-bottom: 1px solid var(--rule);
    background: var(--panel-2);
  }
  h2 {
    margin: 0;
  }
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 14px 14px calc(20px + env(safe-area-inset-bottom));
  }

  /* Restyle the core panel to match the console. */
  .content :global(.dl-settings) {
    gap: 18px;
    font-size: 13px;
  }
  .content :global(fieldset) {
    gap: 9px;
    padding-top: 10px;
    border-top: 1px solid var(--rule);
  }
  .content :global(legend) {
    float: left;
    width: 100%;
    padding: 0 0 2px;
    font: 600 10px/1.2 var(--sans);
    letter-spacing: 0.09em;
    color: var(--ink-2);
  }
  .content :global(.dl-radio strong) {
    font-weight: 600;
  }
  .content :global(.dl-radio small),
  .content :global(.dl-checks small),
  .content :global(.dl-row small) {
    font-size: 11.5px;
    line-height: 1.3;
  }
  .content :global(.dl-segmented) {
    border-color: var(--rule-strong);
  }
  .content :global(.dl-segmented span) {
    padding: 6px 11px;
    font: 600 11px var(--sans);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .content :global(.dl-segmented label + label span) {
    border-left: 1px solid var(--rule-strong);
  }
  .content :global(.dl-number input) {
    font: 500 12px var(--mono);
    border-color: var(--rule-strong);
  }
  .content :global(.dl-checks label) {
    display: flex;
    align-items: baseline;
    gap: 7px;
    flex-wrap: wrap;
    cursor: pointer;
  }
  .content :global(input[type='radio']),
  .content :global(input[type='checkbox']) {
    accent-color: var(--accent);
    width: 15px;
    height: 15px;
  }
  .content :global(.dl-reset) {
    font: 600 11px var(--sans);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--danger);
    text-decoration: none;
    padding: 6px 0;
  }
</style>
