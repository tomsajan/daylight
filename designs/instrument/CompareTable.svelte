<!--
  Comparison matrix: one row per place with the selected date's sun times,
  the live sun position and a 24-hour light strip on each place's own clock.
  Click a row to select it; click a column heading to sort.
-->
<script lang="ts">
  import { Light, LIGHT_NAMES, lightLevel } from '$core/astro/daylight';
  import { sunPosition } from '$core/astro/sun';
  import { visibleLevel } from '$core/charts/palette';
  import { app, MAX_PLACES } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { daySummary } from '$core/state/views';
  import { formatClock, formatMinutes, formatOffset, compassPoint } from '$core/time/format';
  import { civilDateOf, minutesOfDay, wallMidnight } from '$core/time/timescale';
  import { formatCoordinates } from '$core/geo/place';
  import { deg, delta, dur, durDelta, PHASE_CODE, zoneAbbr } from './lib';
  import { ui } from './ui.svelte';

  type SortKey = 'order' | 'name' | 'clock' | 'phase' | 'alt' | 'az' | 'rise' | 'set' | 'len' | 'change' | 'noon' | 'noonAlt';

  let sortKey = $state<SortKey>('order');
  let sortDir = $state<1 | -1>(1);

  const hc = $derived(settings.hourCycle);

  const rows = $derived.by(() => {
    const sel = app.selected;
    const selLen = sel ? daySummary(sel)?.day.daylightMin : null;
    return app.places.map((p, order) => {
      const s = daySummary(p)!;
      const scale = app.scaleFor(p);
      const pos = sunPosition(app.time, p.lat, p.lon);
      const phase = lightLevel(pos.altitude, app.daylightOptions);
      const local = civilDateOf(app.time, scale);
      const dayShift = Math.round((wallMidnight(local) - wallMidnight(app.date)) / 86_400_000);
      const nowMin = minutesOfDay(app.time, s.day.date, scale);
      return {
        p,
        order,
        color: app.colorOf(p),
        selected: p.id === sel?.id,
        s,
        pos,
        phase,
        clock: formatClock(app.time, scale, hc),
        dayShift,
        offset: formatOffset(app.time, scale),
        offsetMin: scale.offsetMinutes(app.time),
        zone: settings.timeScale === 'local' ? zoneAbbr(app.time, p.tz) : '',
        nowPct: nowMin >= 0 && nowMin <= 1440 ? (nowMin / 1440) * 100 : null,
        vsSelected: selLen != null && p.id !== sel?.id ? s.day.daylightMin - selLen : null,
      };
    });
  });

  type Row = (typeof rows)[number];

  const KEY: Record<SortKey, (r: Row) => number | string> = {
    order: (r) => r.order,
    name: (r) => r.p.name.toLowerCase(),
    clock: (r) => r.offsetMin,
    phase: (r) => r.pos.altitude,
    alt: (r) => r.pos.altitude,
    az: (r) => r.pos.azimuth,
    rise: (r) => r.s.day.sunrise?.minutes ?? Infinity,
    set: (r) => r.s.day.sunset?.minutes ?? Infinity,
    len: (r) => r.s.day.daylightMin,
    change: (r) => r.s.change,
    noon: (r) => r.s.day.solarNoon.minutes,
    noonAlt: (r) => r.s.day.solarNoon.altitude,
  };

  const sorted = $derived.by(() => {
    if (sortKey === 'order') return rows;
    const k = KEY[sortKey];
    return [...rows].sort((a, b) => {
      const x = k(a);
      const y = k(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sortDir;
    });
  });

  function sortBy(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === 1) sortDir = -1;
      else {
        sortKey = 'order';
        sortDir = 1;
      }
    } else {
      sortKey = key;
      sortDir = key === 'name' || key === 'order' ? 1 : -1;
    }
  }

  const PH_VAR: Record<Light, string> = {
    [Light.Night]: 'var(--ph-night)',
    [Light.Astronomical]: 'var(--ph-astro)',
    [Light.Nautical]: 'var(--ph-naut)',
    [Light.Civil]: 'var(--ph-civil)',
    [Light.Day]: 'var(--ph-day)',
  };

  function strip(r: Row): string {
    const stops: string[] = [];
    for (const seg of r.s.day.segments) {
      const c = PH_VAR[visibleLevel(seg.light, settings.twilight)];
      stops.push(`${c} ${((seg.startMin / 1440) * 100).toFixed(2)}%`, `${c} ${((seg.endMin / 1440) * 100).toFixed(2)}%`);
    }
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }

  function addPlace() {
    ui.pickMode = 'add';
    ui.focusSearch();
  }

  const COLS: { key: SortKey; label: string; title: string; cls?: string }[] = [
    { key: 'clock', label: 'Clock', title: 'Current time at the place and its offset from UTC' },
    { key: 'phase', label: 'Light', title: 'Light at the place right now' },
    { key: 'alt', label: 'Alt', title: 'Sun altitude above the horizon now', cls: 'r' },
    { key: 'az', label: 'Az', title: 'Sun azimuth (compass bearing) now', cls: 'r' },
    { key: 'rise', label: 'Rise', title: 'Sunrise on the selected date', cls: 'r' },
    { key: 'set', label: 'Set', title: 'Sunset on the selected date', cls: 'r' },
    { key: 'len', label: 'Daylight', title: 'Length of daylight; below it, the difference from the selected place', cls: 'r' },
    { key: 'change', label: 'Δ Day', title: 'Change in daylight since the day before', cls: 'r' },
    { key: 'noon', label: 'Noon', title: 'Solar noon: when the sun is highest', cls: 'r' },
    { key: 'noonAlt', label: 'Noon alt', title: 'Sun altitude at solar noon', cls: 'r' },
  ];
</script>

<div class="wrap">
  <table>
    <thead>
      <tr>
        <th class="place">
          <button type="button" class="sort" onclick={() => sortBy('name')} title="Sort by name">
            <span class="lbl">Place</span>{#if sortKey === 'name'}<span class="dir">{sortDir === 1 ? '▲' : '▼'}</span>{/if}
          </button>
        </th>
        {#each COLS as c (c.key)}
          <th class={c.cls} aria-sort={sortKey === c.key ? (sortDir === 1 ? 'ascending' : 'descending') : undefined}>
            <button type="button" class="sort" onclick={() => sortBy(c.key)} title={c.title}>
              <span class="lbl">{c.label}</span>{#if sortKey === c.key}<span class="dir">{sortDir === 1 ? '▲' : '▼'}</span>{/if}
            </button>
          </th>
        {/each}
        <th class="strip-h"><span class="lbl" title="The selected date at each place, midnight to midnight on its own clock">24 h light</span></th>
        <th class="x"><span class="sr">Remove</span></th>
      </tr>
    </thead>
    <tbody>
      {#each sorted as r (r.p.id)}
        <!-- The place button is the keyboard target; the whole row is a larger click target. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <tr class:sel={r.selected} style="--c: {r.color}" onclick={() => app.select(r.p.id)}>
          <td class="place">
            <button type="button" class="pick" aria-pressed={r.selected} title="{r.p.name} · {formatCoordinates(r.p.lat, r.p.lon)}">
              <span class="idx num">{r.order + 1}</span>
              <span class="nm">
                <strong>{r.p.name}</strong>
                <small class="num">{formatCoordinates(r.p.lat, r.p.lon, 1)}{r.p.detail ? ` · ${r.p.detail}` : ''}</small>
              </span>
            </button>
          </td>
          <td class="num clock">
            <span>{r.clock}{#if r.dayShift}<sup>{r.dayShift > 0 ? '+' : '−'}{Math.abs(r.dayShift)}d</sup>{/if}</span>
            <small>{r.zone && r.zone !== r.offset ? `${r.zone} ` : ''}{r.offset}</small>
          </td>
          <td>
            <span class="pill" data-phase={r.phase} title={LIGHT_NAMES[r.phase]}>{PHASE_CODE[r.phase]}</span>
          </td>
          <td class="num r" class:neg={r.pos.altitude < 0}>{deg(r.pos.altitude)}</td>
          <td class="num r">{deg(r.pos.azimuth, 0)}<small class="cp">{compassPoint(r.pos.azimuth)}</small></td>
          <td class="num r">{r.s.day.sunrise ? formatMinutes(r.s.day.sunrise.minutes, hc) : '—'}</td>
          <td class="num r">{r.s.day.sunset ? formatMinutes(r.s.day.sunset.minutes, hc) : '—'}</td>
          <td class="num r len">
            <span>{r.s.day.polarDay ? '24h00m' : dur(r.s.day.daylightMin)}</span>
            {#if r.s.day.polarDay}<small>midnight sun</small>
            {:else if r.s.day.polarNight}<small>polar night</small>
            {:else if r.vsSelected != null}<small>{durDelta(r.vsSelected)} vs selected</small>{/if}
          </td>
          <td class="num r" class:up={r.s.change > 0.004} class:down={r.s.change < -0.004}>{delta(r.s.change)}</td>
          <td class="num r">{formatMinutes(r.s.day.solarNoon.minutes, hc)}</td>
          <td class="num r">{deg(r.s.day.solarNoon.altitude)}</td>
          <td class="strip-c">
            <div class="strip" style="background: {strip(r)}">
              {#if r.nowPct != null}<span class="now" style="left: {r.nowPct}%"></span>{/if}
            </div>
          </td>
          <td class="x">
            {#if app.places.length > 1}
              <button
                type="button"
                class="btn ghost rm"
                aria-label="Remove {r.p.name}"
                title="Remove {r.p.name}"
                onclick={(e) => {
                  e.stopPropagation();
                  app.removePlace(r.p.id);
                }}>×</button
              >
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="foot">
    <span class="lbl count num">{app.places.length}/{MAX_PLACES} places</span>
    {#if app.places.length < MAX_PLACES}
      <button type="button" class="btn" onclick={addPlace}>+ Add place</button>
      <span class="hint">Search for a place, or switch the globe to <b>Add</b> and tap it.</span>
    {:else}
      <span class="hint">Six places is the maximum. Adding another replaces the selected one.</span>
    {/if}
  </div>
</div>

<style>
  .wrap {
    height: 100%;
    overflow: auto;
    overscroll-behavior-x: contain;
  }
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 12.5px;
  }
  th,
  td {
    padding: 0 8px;
    text-align: left;
    white-space: nowrap;
    border-bottom: 1px solid var(--rule);
  }
  th {
    position: sticky;
    top: 0;
    z-index: 2;
    height: 26px;
    background: var(--panel-2);
  }
  th.r,
  td.r {
    text-align: right;
  }
  th.r .sort {
    justify-content: flex-end;
  }
  .sort {
    display: flex;
    align-items: center;
    gap: 3px;
    width: 100%;
    height: 26px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .sort:hover .lbl {
    color: var(--accent);
  }
  .dir {
    font-size: 8px;
    color: var(--accent);
  }
  td {
    height: 42px;
    font-weight: 500;
  }
  tbody tr {
    cursor: pointer;
  }
  tbody tr:hover td {
    background: color-mix(in srgb, var(--accent) 5%, var(--panel));
  }
  tbody tr.sel td {
    background: var(--accent-soft);
  }
  /* Sticky place column so names stay visible while scrolling sideways on phones. */
  .place {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--panel);
    padding-left: 0;
    max-width: 220px;
  }
  th.place {
    z-index: 3;
    background: var(--panel-2);
    padding-left: 10px;
  }
  tbody tr.sel td.place {
    background: color-mix(in srgb, var(--accent) 11%, var(--panel));
  }
  .place::after {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--rule);
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 41px;
    padding: 0 6px 0 0;
    border: 0;
    border-left: 4px solid var(--c);
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .idx {
    width: 18px;
    flex: none;
    text-align: right;
    font-size: 10.5px;
    color: var(--faint);
  }
  tr.sel .idx {
    color: var(--c);
    font-weight: 600;
  }
  .nm {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .nm strong {
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }
  .nm small {
    font-size: 10px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }
  .clock span {
    font-size: 13px;
    font-weight: 600;
  }
  .clock small,
  .len small {
    display: block;
    font-size: 10px;
    color: var(--muted);
    font-weight: 400;
  }
  sup {
    font-size: 9px;
    margin-left: 2px;
    color: var(--led-hold);
  }
  .cp {
    display: inline-block;
    width: 2.6em;
    text-align: left;
    padding-left: 4px;
    font-size: 10px;
    color: var(--muted);
  }
  .neg {
    color: var(--muted);
  }
  .up {
    color: var(--led-live);
  }
  .down {
    color: var(--danger);
  }
  .pill {
    display: inline-block;
    min-width: 46px;
    padding: 2px 5px;
    border-radius: 2px;
    font: 600 10px/1.2 var(--mono);
    letter-spacing: 0.04em;
    text-align: center;
    border: 1px solid var(--rule-strong);
  }
  .pill[data-phase='0'] {
    background: var(--ph-night);
    color: #c9d3e1;
  }
  .pill[data-phase='1'] {
    background: var(--ph-astro);
    color: #d8e0ee;
  }
  .pill[data-phase='2'] {
    background: var(--ph-naut);
    color: #eef2fa;
  }
  .pill[data-phase='3'] {
    background: var(--ph-civil);
    color: #0f1626;
  }
  .pill[data-phase='4'] {
    background: var(--ph-day);
    color: #3a2a00;
  }
  .strip-h,
  .strip-c {
    width: 160px;
    min-width: 130px;
  }
  .strip {
    position: relative;
    height: 14px;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
  }
  .now {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 2px;
    margin-left: -1px;
    background: var(--cursor);
  }
  .x {
    width: 34px;
    padding: 0 4px;
  }
  .rm {
    min-width: 28px;
    font-size: 16px;
    color: var(--muted);
  }
  .rm:hover {
    color: var(--danger);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .foot {
    position: sticky;
    left: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    padding: 8px 10px;
  }
  .count {
    color: var(--faint);
  }
  .hint {
    font-size: 12px;
    color: var(--muted);
  }
</style>
