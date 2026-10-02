<!--
  Solar eclipses for the selected place: the plain wiring of the eclipse engine,
  for checking its numbers against published ones.
-->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import {
    ECLIPSE_CREDIT,
    SOLAR_ECLIPSES,
    deltaTMeasured,
    eclipseDeltaT,
    greatestEclipse,
    greatestEclipseMs,
    localCircumstances,
    type Contact,
    type SolarEclipse,
  } from '$core/eclipse';
  import { formatClock } from '$core/time/format';
  import { formatCoordinates } from '$core/geo/place';

  const TYPE_NAMES = { T: 'Total', A: 'Annular', H: 'Hybrid', P: 'Partial' } as const;

  let onlyVisible = $state(true);
  let chosenId = $state<string | undefined>();

  const place = $derived(app.selected);
  // Every eclipse as seen from the selected place; about a millisecond each.
  const seen = $derived(place ? SOLAR_ECLIPSES.map((e) => localCircumstances(e, place)) : []);
  const listed = $derived(seen.filter((l) => !onlyVisible || l.visible));
  const next = $derived(listed.find((l) => greatestEclipseMs(l.eclipse) > app.time) ?? listed.at(-1));
  const local = $derived(seen.find((l) => l.eclipse.id === chosenId) ?? next);
  const eclipse = $derived(local?.eclipse);
  const greatest = $derived(eclipse ? greatestEclipse(eclipse) : undefined);
  const greatestNasa = $derived(eclipse ? greatestEclipse(eclipse, { deltaT: eclipse.deltaT }) : undefined);

  const utc = (ms: number) => new Date(Math.round(ms / 1000) * 1000).toISOString().slice(11, 19);
  const clock = (ms: number) => formatClock(ms, app.scale, settings.hourCycle, true);
  const pct = (v: number) => `${(v * 100).toFixed(1)} %`;
  const mmss = (s: number) => `${Math.floor(s / 60)}m ${(s % 60).toFixed(1).padStart(4, '0')}s`;
  const nasaUrl = (e: SolarEclipse) => `https://eclipse.gsfc.nasa.gov/SEsearch/SEsearchmap.php?Ecl=${e.id.replaceAll('-', '')}`;

  const rows = $derived.by(() => {
    if (!local) return [];
    const r: [string, Contact][] = [];
    if (local.c1) r.push(['Partial begins (C1)', local.c1]);
    if (local.sunrise) r.push(['Sunrise', local.sunrise]);
    if (local.c2) r.push([local.kind === 'total' ? 'Totality begins (C2)' : 'Annularity begins (C2)', local.c2]);
    if (local.max) r.push(['Maximum', local.max]);
    if (local.c3) r.push([local.kind === 'total' ? 'Totality ends (C3)' : 'Annularity ends (C3)', local.c3]);
    if (local.sunset) r.push(['Sunset', local.sunset]);
    if (local.c4) r.push(['Partial ends (C4)', local.c4]);
    return r.sort((a, b) => a[1].time - b[1].time);
  });
</script>

<section class="eclipses">
  <div class="head">
    <h3>Solar eclipses{place ? ` from ${place.name}` : ''}</h3>
    <label><input type="checkbox" bind:checked={onlyVisible} /> Visible from here only</label>
    <select value={eclipse?.id} onchange={(ev) => (chosenId = ev.currentTarget.value)}>
      {#each listed as l (l.eclipse.id)}
        <option value={l.eclipse.id}>
          {l.eclipse.id} · {TYPE_NAMES[l.eclipse.type]}{l.visible ? ` · here: ${l.kind}, ${pct(l.visibleMax?.obscuration ?? 0)}` : ''}
        </option>
      {/each}
    </select>
  </div>

  {#if eclipse && local && greatest && greatestNasa}
    <div class="cols">
      <div>
        <h4>{TYPE_NAMES[eclipse.type]} solar eclipse of {eclipse.id}</h4>
        <dl>
          <dt>Saros</dt><dd>{eclipse.saros} ({eclipse.sarosMember})</dd>
          <dt>Gamma · magnitude</dt><dd>{greatest.gamma.toFixed(4)} · {eclipse.magnitude.toFixed(4)}</dd>
          <dt>Greatest eclipse</dt>
          <dd>{utc(greatest.time)} UT, {formatCoordinates(greatest.lat, greatest.lon)}, sun {greatest.sunAlt.toFixed(1)}°</dd>
          {#if greatest.duration}
            <dt>Central duration · width</dt><dd>{mmss(greatest.duration)} · {greatest.pathWidth?.toFixed(1)} km</dd>
          {/if}
          <dt>ΔT</dt>
          <dd>
            {eclipseDeltaT(eclipse).toFixed(1)} s ({deltaTMeasured(greatest.time) ? 'measured' : 'extrapolated'}); NASA used
            {eclipse.deltaT} s
          </dd>
          <dt>NASA, same ΔT</dt>
          <dd>
            {formatCoordinates(eclipse.greatest.lat, eclipse.greatest.lon)}{eclipse.greatest.duration
              ? `, ${mmss(eclipse.greatest.duration)}, ${eclipse.greatest.pathWidth} km`
              : ''} (ours: {formatCoordinates(greatestNasa.lat, greatestNasa.lon)}{greatestNasa.duration
              ? `, ${mmss(greatestNasa.duration)}`
              : ''}) · <a href={nasaUrl(eclipse)} target="_blank" rel="noopener">NASA map</a>
          </dd>
        </dl>
      </div>

      <div>
        {#if !place}
          <p>Pick a place.</p>
        {:else if local.kind === 'none'}
          <p>Not visible from {place.name}.</p>
        {:else}
          <h4>
            From {place.name}: {local.kind}{local.duration ? `, ${mmss(local.duration)}` : ''}, up to {pct(
              local.visibleMax?.obscuration ?? 0,
            )} of the Sun covered{local.visible ? '' : ' (Sun below the horizon)'}
          </h4>
          <table>
            <thead>
              <tr><th></th><th>Local</th><th>UT</th><th>Sun alt</th><th>Az</th><th>Magnitude</th><th>Covered</th></tr>
            </thead>
            <tbody>
              {#each rows as [label, c] (label)}
                <tr class:below={!c.visible}>
                  <td>{label}</td>
                  <td>{clock(c.time)}</td>
                  <td>{utc(c.time)}</td>
                  <td>{c.altitude.toFixed(1)}°</td>
                  <td>{c.azimuth.toFixed(0)}°</td>
                  <td>{c.magnitude.toFixed(3)}</td>
                  <td>{pct(c.obscuration)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if local.max}
            <button class="dl-btn" onclick={() => app.setTime(local.max!.time)}>Go to maximum</button>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
  <p class="credit">{ECLIPSE_CREDIT}. ΔT from the IERS.</p>
</section>

<style>
  .eclipses {
    grid-area: eclipse;
    background: var(--dl-surface);
    border: 1px solid var(--dl-border);
    border-radius: 8px;
    padding: 12px 16px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  h3,
  h4 {
    margin: 0;
  }
  h4 {
    margin-bottom: 8px;
  }
  select {
    max-width: 100%;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
    gap: 24px;
    margin-top: 12px;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
  }
  dt {
    color: var(--dl-muted);
  }
  dd {
    margin: 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-variant-numeric: tabular-nums;
    margin-bottom: 8px;
  }
  th,
  td {
    text-align: right;
    padding: 2px 8px;
    border-bottom: 1px solid var(--dl-border);
  }
  th:first-child,
  td:first-child {
    text-align: left;
    padding-left: 0;
  }
  tr.below {
    color: var(--dl-muted);
  }
  .credit {
    color: var(--dl-muted);
    font-size: 12px;
    margin: 12px 0 0;
  }
</style>
