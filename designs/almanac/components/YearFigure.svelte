<!--
  Figure 1: the year chart with its mode switch, year stepper, visible zoom
  buttons, a readout of the day under the pointer, a legend and a caption
  that explains how to read the current mode.
  On touch, a one-finger vertical swipe scrolls the page (touchScroll) unless
  the hours are zoomed in, when it pans the chart instead.
-->
<script lang="ts">
  import { app, MAX_PLACES } from '$core/state/app.svelte';
  import { settings } from '$core/state/settings.svelte';
  import { currentMinutes, orderedPlaces, selectedDayIndex } from '$core/state/views';
  import { Light } from '$core/astro/daylight';
  import { visibleLevel } from '$core/charts/palette';
  import { addDays } from '$core/time/timescale';
  import { formatDelta, formatDuration, formatMinutes } from '$core/time/format';
  import YearChart from '$core/charts/YearChart.svelte';
  import Splitter from '$core/components/Splitter.svelte';
  import { clamp, panelSizes } from '$core/state/layout.svelte';
  import { almanacPalette, almanacYearSeries, dayMonth, inkOf, shiftSentence, yearAnnotations } from '../almanac.svelte';

  let chart: YearChart | undefined = $state();
  let zoomed = $state({ x: false, y: false });
  let hover = $state<{ dayIndex: number; minutes: number } | null>(null);

  const hc = $derived(settings.hourCycle);
  const palette = $derived(almanacPalette());
  const series = $derived(almanacYearSeries());
  const year = $derived(app.date.year);
  const bands = $derived(settings.chartMode === 'bands');
  const change = $derived(settings.chartMode === 'change');
  const others = $derived(orderedPlaces().slice(1));
  const annotations = $derived(app.selected ? yearAnnotations(app.selected) : []);

  // The day the readout describes: under the pointer, else the selected day.
  const readIndex = $derived(hover?.dayIndex ?? selectedDayIndex());
  const readDay = $derived(series[0]?.days[Math.max(0, Math.min((series[0]?.days.length ?? 1) - 1, readIndex))]);
  const readPrev = $derived(readIndex > 0 ? series[0]?.days[readIndex - 1] : series[0]?.previous);

  const legend = $derived(
    (
      [
        [Light.Day, 'Daylight', 'sun above the horizon'],
        [Light.Civil, 'Civil twilight', 'sun up to 6° below'],
        [Light.Nautical, 'Nautical twilight', '6–12° below'],
        [Light.Astronomical, 'Astronomical twilight', '12–18° below'],
        [Light.Night, 'Night', 'more than 18° below'],
      ] as const
    ).filter(([l]) => visibleLevel(l, settings.twilight) === l),
  );

  function shiftYear(delta: number) {
    const d = app.date;
    app.setDate({ year: d.year + delta, month: d.month, day: Math.min(d.day, d.month === 2 ? 28 : d.day) });
  }

  function pick(i: number, m: number) {
    app.setDate(addDays({ year, month: 1, day: 1 }, i));
    if (bands) app.setMinutesOfDay(m);
  }

  const sizes = panelSizes('almanac');
  let plate: HTMLDivElement | undefined = $state();
  let startH = 0;
</script>

<figure class="fig year-fig">
  <header class="fig-head">
    <p class="fig-no">Figure 1</p>
    <h2>
      <span>The year in daylight,</span>
      <span class="year-step">
        <button type="button" onclick={() => shiftYear(-1)} aria-label="Previous year ({year - 1})" title="Previous year">‹</button>
        <span class="num">{year}</span>
        <button type="button" onclick={() => shiftYear(1)} aria-label="Next year ({year + 1})" title="Next year">›</button>
      </span>
    </h2>
  </header>

  <div class="toolbar">
    <div class="tabs" role="radiogroup" aria-label="What the chart shows">
      <button type="button" role="radio" aria-checked={bands} onclick={() => (settings.chartMode = 'bands')}>Sunrise &amp; sunset</button>
      <button type="button" role="radio" aria-checked={settings.chartMode === 'daylength'} onclick={() => (settings.chartMode = 'daylength')}>Day length</button>
      <button type="button" role="radio" aria-checked={change} onclick={() => (settings.chartMode = 'change')}>Daily change</button>
    </div>
    <div class="zoom" role="group" aria-label="Zoom">
      <span class="zl">Dates</span>
      <button type="button" onclick={() => chart?.zoomOut()} disabled={!zoomed.x} aria-label="Zoom out dates" title="Show more days">−</button>
      <button type="button" onclick={() => chart?.zoomIn()} aria-label="Zoom in dates" title="Show fewer days, around the selected date">+</button>
      <span class="zl">{bands ? 'Hours' : change ? 'Minutes' : 'Length'}</span>
      <button type="button" onclick={() => chart?.zoomTimeOut()} disabled={!zoomed.y} aria-label="Zoom out hours" title="Show more of the day">−</button>
      <button type="button" onclick={() => chart?.zoomTimeIn()} aria-label="Zoom in hours" title="Show less of the day">+</button>
      <button type="button" class="reset" onclick={() => chart?.resetZoom()} disabled={!zoomed.x && !zoomed.y}>Whole year</button>
    </div>
  </div>

  <div class="plate" bind:this={plate} style:--year-h={sizes.get('year') != null ? `${sizes.get('year')}px` : undefined}>
    {#if app.selected}
      <YearChart
        bind:this={chart}
        {series}
        {year}
        mode={settings.chartMode}
        selectedIndex={selectedDayIndex()}
        currentMinutes={currentMinutes()}
        twilight={settings.twilight}
        hourCycle={hc}
        {palette}
        {annotations}
        touchScroll={!zoomed.y}
        onpick={pick}
        onhover={(h) => (hover = h)}
        onviewchange={(z) => (zoomed = z)}
      />
    {/if}
  </div>
  <div class="grip">
    <Splitter
      axis="y"
      label="Chart height"
      onstart={() => (startH = plate?.offsetHeight ?? 0)}
      onmove={(d) => sizes.set('year', clamp(startH + d, 240, 1100))}
      onreset={() => sizes.clear('year')}
    />
  </div>

  {#if readDay}
    <p class="readout" aria-live="off">
      <strong>{dayMonth(readDay.date)}</strong>{hover ? ':' : ', the selected day:'}
      {#if readDay.polarDay}
        midnight sun, the sun never sets.
      {:else if readDay.polarNight}
        polar night, the sun never rises.
      {:else if change && readPrev}
        {formatDuration(readDay.daylightMin)} of daylight, {Math.round(Math.abs(readDay.daylightMin - readPrev.daylightMin) * 60) < 1
          ? 'the same as the day before'
          : `${formatDelta(readDay.daylightMin - readPrev.daylightMin)} on the day before`}. {shiftSentence(readPrev, readDay)}
      {:else}
        sunrise {readDay.sunrise ? formatMinutes(readDay.sunrise.minutes, hc) : 'none'}, sunset
        {readDay.sunset ? formatMinutes(readDay.sunset.minutes, hc) : 'none'}, {formatDuration(readDay.daylightMin)} of daylight.
      {/if}
      {#if hover && bands}<span class="at">Pointer at {formatMinutes(hover.minutes, hc)}.</span>{/if}
    </p>
  {/if}

  <div class="legend">
    {#if bands}
      <ul class="key" aria-label="Colour key">
        {#each legend as [level, name, note] (level)}
          <li><span class="sw" style="background: {palette.light[level]}"></span><span>{name} <em>{note}</em></span></li>
        {/each}
        <li><span class="sw line dashed"></span><span>Solar noon <em>sun highest</em></span></li>
        <li><span class="sw line now"></span><span>Selected day <em>dot: the sun at the chosen time</em></span></li>
      </ul>
      {#if others.length}
        <ul class="key places" aria-label="Compared places">
          <li class="lead">Sunrise and sunset lines for</li>
          {#each others as p (p.id)}
            <li><span class="sw line" style="--c: {inkOf(p)}"></span>{p.name}</li>
          {/each}
        </ul>
      {/if}
    {:else if change}
      <ul class="key" aria-label="Colour key">
        <li><span class="sw" style="background: {palette.light[Light.Day]}; opacity: .6"></span><span>Days getting longer</span></li>
        <li><span class="sw" style="background: {palette.light[Light.Civil]}; opacity: .6"></span><span>Days getting shorter</span></li>
        {#each orderedPlaces() as p (p.id)}
          <li><span class="sw line" style="--c: {inkOf(p)}"></span>{p.name} <em>total</em></li>
        {/each}
      </ul>
    {:else}
      <ul class="key" aria-label="Places">
        {#each orderedPlaces() as p (p.id)}
          <li><span class="sw line" style="--c: {inkOf(p)}"></span>{p.name}</li>
        {/each}
        <li><span class="sw" style="background: {palette.light[Light.Day]}"></span><span>Daylight <em>{app.selected?.name}</em></span></li>
        {#if settings.twilight.civil}
          <li><span class="sw" style="background: {palette.light[Light.Civil]}; opacity: .6"></span><span>with civil twilight</span></li>
        {/if}
      </ul>
    {/if}
  </div>

  <figcaption>
    {#if bands}
      Each thin column is one day of {year} at {app.selected?.name ?? 'the selected place'}, read from midnight at the top to midnight at the
      bottom. Where the pale band is tall, the day is long. Dashed rules mark the solstices and equinoxes{annotations.some((a) => a.kind === 'clock')
        ? '; dotted rules mark the days the clocks change, where sunrise and sunset jump by an hour'
        : ''}.
    {:else if change}
      How much daylight {app.selected?.name ?? 'the selected place'} gains or loses from one day to the next through {year}. The dashed line is the
      part won or lost in the morning, as sunrise moves; the dotted line is the evening, as sunset moves. Together they make the total. Around the
      solstices they can pull in opposite directions: just before the shortest day the evenings already lengthen while the mornings still darken.
    {:else}
      Hours of daylight on each day of {year}, one line per place{app.places.length < MAX_PLACES ? ' (add places below to compare them)' : ''}. The
      curves cross at the equinoxes, when day and night are close to equal everywhere.
    {/if}
    <span class="how">
      {#if bands}
        Drag the sun to move through the year and through the day at once (hold Shift to keep to one direction); drag the red line to change only the
        date.
      {:else}
        Drag the red line to change the date.
      {/if}
      Tap a day to read it. Drag elsewhere to pan; scroll, pinch or use the buttons to zoom; double-tap to see the whole year.
    </span>
  </figcaption>
</figure>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 20px;
    margin: 14px 0 10px;
    font-family: var(--sans);
    font-size: 0.85rem;
  }
  .tabs {
    display: flex;
    gap: 18px;
  }
  .tabs button {
    border: 0;
    background: none;
    padding: 8px 0 6px;
    font: 500 1.02rem/1 var(--serif);
    color: var(--muted);
    border-bottom: 2px solid transparent;
    cursor: pointer;
  }
  .tabs button[aria-checked='true'] {
    color: var(--ink);
    border-bottom-color: var(--ink);
  }
  .tabs button:hover {
    color: var(--ink);
  }
  .zoom {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .zl {
    color: var(--muted);
    margin: 0 2px 0 8px;
  }
  .zl:first-child {
    margin-left: 0;
  }
  .zoom button {
    min-width: 34px;
    height: 34px;
    padding: 0 8px;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    background: transparent;
    color: var(--ink);
    font: 500 1rem/1 var(--sans);
    cursor: pointer;
  }
  .zoom button.reset {
    margin-left: 8px;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .zoom button:hover:not(:disabled) {
    border-color: var(--ink);
  }
  .zoom button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  /* Drag the rule under the plate to make the chart taller or shorter (not on phones). */
  .grip {
    position: relative;
    height: 14px;
    margin-bottom: -6px;
    --dl-split-color: var(--accent);
    --dl-split-width: 2px;
  }
  .grip::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 28px;
    height: 5px;
    transform: translate(-50%, -50%);
    border-top: 1px solid var(--muted);
    border-bottom: 1px solid var(--muted);
    background: var(--paper);
    pointer-events: none;
  }
  .plate {
    height: var(--year-h, clamp(320px, 52vh, 520px));
    border-top: 1px solid var(--ink);
    border-bottom: 1px solid var(--rule);
    padding-top: 4px;
  }
  .year-step {
    white-space: nowrap;
  }
  .year-step button {
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    padding: 0 4px;
    cursor: pointer;
  }
  .year-step button:hover {
    color: var(--accent);
  }
  .readout {
    margin: 10px 0 0;
    font-family: var(--sans);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    min-height: 1.4em;
  }
  .readout strong {
    font-weight: 600;
  }
  .at {
    color: var(--muted);
  }
  .legend {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-family: var(--sans);
    font-size: 0.8rem;
  }
  .key li {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .key em {
    font-style: normal;
    color: var(--muted);
  }
  .key .lead {
    color: var(--muted);
  }
  .sw {
    width: 18px;
    height: 11px;
    flex: none;
    border: 1px solid var(--rule-strong);
    box-sizing: border-box;
  }
  .sw.line {
    height: 0;
    border: 0;
    border-top: 2.5px solid var(--c, var(--ink));
  }
  .sw.dashed {
    border-top: 1.5px dashed var(--muted);
  }
  .sw.now {
    border-top: 2px solid var(--now);
  }
  figcaption .how {
    display: block;
    margin-top: 4px;
    color: var(--muted);
  }

  @media (max-width: 759px) {
    .grip {
      display: none;
    }
    .plate {
      height: 360px;
      margin: 0 calc(-1 * var(--gutter) + 4px);
    }
    .zl:first-child {
      margin-left: 0;
    }
  }
</style>
