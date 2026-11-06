<!--
  What to photograph tonight: the targets ranked by how long they are high enough in the dark
  with the Moon down, with a search and filters by kind.
-->
<script lang="ts">
  import type { Target, Visibility } from '$core/sky/targets';
  import { formatClock, formatDuration, type HourCycle } from '$core/time/format';
  import type { TimeScale } from '$core/time/timescale';
  import { GROUPS, listGroup, prefs } from './prefs.svelte';
  import { DSO_COLORS } from './draw';

  interface Props {
    rows: { target: Target; vis: Visibility }[];
    /** The night's moonless dark, ms, for the bars' scale. */
    darkMs: number;
    selectedId: string | null;
    scale: TimeScale;
    hourCycle: HourCycle;
    onselect: (id: string) => void;
  }
  let { rows, darkMs, selectedId, scale, hourCycle, onselect }: Props = $props();

  let query = $state('');
  let showAll = $state(false);
  let onlyUp = $state(true);

  const SOLAR_COLOR = '#e8e6df';
  const color = (t: Target) => DSO_COLORS[t.group] ?? (t.kind === 'core' ? '#ffecc8' : SOLAR_COLOR);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(({ target: t, vis }) => {
      if (q) return `${t.title} ${t.dso?.desig ?? ''} ${t.typeName} ${t.constellation}`.toLowerCase().includes(q.replace(/^m\s+/, 'm'));
      if (!prefs.groups[listGroup(t.group)]) return false;
      return !onlyUp || vis.darkMs > 0;
    });
  });
  const shown = $derived(showAll || query ? filtered : filtered.slice(0, 40));
</script>

<section class="targets">
  <h2>Targets tonight</h2>
  <input class="dl-input search" type="search" placeholder="Search: M42, Orion, galaxy, Jupiter…" bind:value={query} aria-label="Search targets" />
  <div class="groups">
    {#each GROUPS as g (g.id)}
      <label><input type="checkbox" autocomplete="off" bind:checked={prefs.groups[g.id]} /> {g.name}</label>
    {/each}
  </div>
  <div class="opts">
    <label>
      Up above
      <select class="dl-input" bind:value={prefs.minAlt} aria-label="Lowest altitude">
        {#each [10, 20, 30, 40, 50, 60] as a (a)}<option value={a}>{a}°</option>{/each}
      </select>
    </label>
    <label><input type="checkbox" autocomplete="off" bind:checked={onlyUp} /> Only those up in the dark</label>
  </div>
  <p class="note">By the hours each is above {prefs.minAlt}° in the dark with the Moon down (green), then with it up (grey).</p>
  <ol>
    {#each shown as { target: t, vis } (t.id)}
      <li>
        <button class:on={t.id === selectedId} onclick={() => onselect(t.id)}>
          <span class="dot" style:background={color(t)}></span>
          <span class="name">
            <b>{t.title}</b>
            <small>{t.typeName}{t.constellation ? ` · ${t.constellation}` : ''}{t.mag !== null ? ` · mag ${t.mag.toFixed(1)}` : ''}</small>
          </span>
          <span class="when">
            {#if vis.darkMs > 0}
              <span class="bar" title="{formatDuration(vis.moonlessMs / 60000)} moonless, {formatDuration(vis.darkMs / 60000)} in all">
                <i class="all" style:width="{Math.min(100, (vis.darkMs / Math.max(1, darkMs)) * 100)}%"></i>
                <i class="moonless" style:width="{Math.min(100, (vis.moonlessMs / Math.max(1, darkMs)) * 100)}%"></i>
              </span>
              <small>{formatDuration(vis.moonlessMs / 60000, true)} · {Math.round(vis.best.alt)}° at {formatClock(vis.best.time, scale, hourCycle)}</small>
            {:else}
              <small>{vis.culmination.alt < 0 ? 'Not up tonight' : `Up to ${Math.round(vis.best.alt)}° in the dark`}</small>
            {/if}
          </span>
        </button>
      </li>
    {:else}
      <li class="empty">Nothing matches.</li>
    {/each}
  </ol>
  {#if !query && filtered.length > shown.length}
    <button class="link" onclick={() => (showAll = true)}>Show all {filtered.length}</button>
  {/if}
</section>

<style>
  .search {
    width: 100%;
    box-sizing: border-box;
  }
  .groups,
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin-top: 8px;
    font-size: 13px;
    color: var(--muted);
  }
  .opts select {
    height: 30px;
    margin-left: 4px;
  }
  .note {
    margin: 8px 0 4px;
    font-size: 12px;
    color: var(--muted);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li button {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) 118px;
    gap: 8px;
    align-items: center;
    width: 100%;
    padding: 6px 6px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  li button:hover {
    background: color-mix(in srgb, var(--fg) 6%, transparent);
  }
  li button.on {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .name {
    min-width: 0;
    display: grid;
  }
  .name b {
    font-weight: 500;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    color: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .name small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .when {
    display: grid;
    gap: 3px;
    justify-items: end;
  }
  .bar {
    position: relative;
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    overflow: hidden;
  }
  .bar i {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
  }
  .bar .all {
    background: rgb(150 160 190 / 0.6);
  }
  .bar .moonless {
    background: #3fbf78;
  }
  .empty {
    color: var(--muted);
    padding: 8px;
  }
</style>
