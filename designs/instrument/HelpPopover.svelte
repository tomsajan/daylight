<!-- Keyboard shortcuts and chart gestures. -->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { ICON } from './icons';
  import { ui } from './ui.svelte';

  const KEYS: [string[], string][] = [
    [['Space'], 'Play / pause'],
    [['←', '→'], 'Previous / next day'],
    [['Shift', '←→'], 'Previous / next week'],
    [['↓', '↑'], 'Previous / next month'],
    [[',', '.'], 'Time of day −/+ 15 min (Shift: 1 h)'],
    [['−', '+'], 'Slower / faster (− past pause runs backwards)'],
    [['R'], 'Reverse direction, same rate'],
    [['N'], 'Now (real time)'],
    [['1', '…', '6'], 'Select place 1–6'],
    [['A'], 'Globe tap: switch Replace / Add'],
    [['/'], 'Search'],
    [['M'], 'Year chart: rise & set / day length / Δ per day'],
    [['S'], 'Settings'],
    [['?'], 'This help'],
    [['Esc'], 'Close panels'],
  ];

  const GESTURES: [string, string][] = [
    ['Drag the sun', 'Year: date and time together (Shift: one axis). Day: time of day'],
    ['Drag day line', 'Year: change the date'],
    ['Wheel / pinch', 'Zoom (year: dates; Shift + wheel: hours)'],
    ['Drag elsewhere', 'Pan a zoomed chart'],
    ['Double-click', 'Reset chart zoom'],
    ['Drag a gap', 'Resize the panels (double-click the gap: default size)'],
    ['Enter / Shift+Enter', 'In search: use mode / add'],
  ];
</script>

<div class="help" role="dialog" aria-label="Keyboard shortcuts">
  <header>
    <h2 class="lbl">Keyboard shortcuts</h2>
    <button type="button" class="btn ghost" onclick={() => (ui.helpOpen = false)} aria-label="Close"><Icon d={ICON.close} /></button>
  </header>
  <dl>
    {#each KEYS as [keys, what] (what)}
      <dt>{#each keys as k (k)}<kbd>{k}</kbd>{/each}</dt>
      <dd>{what}</dd>
    {/each}
  </dl>
  <h3 class="lbl">Charts</h3>
  <dl>
    {#each GESTURES as [g, what] (g)}
      <dt class="g">{g}</dt>
      <dd>{what}</dd>
    {/each}
  </dl>
</div>

<style>
  .help {
    position: fixed;
    right: 10px;
    bottom: 120px;
    z-index: 90;
    width: 340px;
    max-width: calc(100vw - 20px);
    max-height: calc(100dvh - 160px);
    overflow: auto;
    padding: 0 12px 12px;
    background: var(--panel);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r);
    box-shadow: 0 16px 40px rgb(0 0 0 / 0.3);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 -12px 8px;
    padding: 3px 4px 3px 12px;
    border-bottom: 1px solid var(--rule);
    background: var(--panel-2);
  }
  h2,
  h3 {
    margin: 0;
  }
  h3 {
    margin: 12px 0 6px;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 5px 12px;
    margin: 0;
    font-size: 12.5px;
  }
  dt {
    display: flex;
    gap: 3px;
    justify-content: flex-end;
  }
  dt.g {
    font-size: 11.5px;
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  kbd {
    min-width: 20px;
    padding: 1px 5px;
    font: 600 11px var(--mono);
    text-align: center;
    border: 1px solid var(--rule-strong);
    border-bottom-width: 2px;
    border-radius: 2px;
    background: var(--panel-2);
  }
</style>
