<!-- Date stepping and exact date/time entry, in the selected place's clock. -->
<script lang="ts">
  import { app } from '$core/state/app.svelte';
  import { currentMinutes } from '$core/state/views';
  import { addDays, dateKey } from '$core/time/timescale';
  import { formatOffset } from '$core/time/format';
  import Icon from './Icon.svelte';

  interface Props {
    /** Show the time-of-day field. */
    time?: boolean;
  }
  let { time = true }: Props = $props();

  const minutes = $derived(currentMinutes());
  const timeValue = $derived(`${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`);

  function onDate(e: Event) {
    const m = (e.target as HTMLInputElement).value.match(/^(\d{4,})-(\d{2})-(\d{2})$/);
    if (m) app.setDate({ year: +m[1], month: +m[2], day: +m[3] });
  }
  function onTime(e: Event) {
    const m = (e.target as HTMLInputElement).value.match(/^(\d{2}):(\d{2})/);
    if (m) app.setMinutesOfDay(+m[1] * 60 + +m[2]);
  }
</script>

<div class="dates">
  <div class="day">
    <button type="button" class="o-btn o-btn--icon o-btn--quiet" onclick={() => app.setDate(addDays(app.date, -1))} title="Previous day" aria-label="Previous day">
      <Icon name="left" />
    </button>
    <input class="o-input date" type="date" value={dateKey(app.date)} onchange={onDate} aria-label="Date" />
    <button type="button" class="o-btn o-btn--icon o-btn--quiet" onclick={() => app.setDate(addDays(app.date, 1))} title="Next day" aria-label="Next day">
      <Icon name="right" />
    </button>
  </div>
  {#if time}
    <input class="o-input clock" type="time" value={timeValue} onchange={onTime} aria-label="Time of day" />
    <span class="zone" title={app.selected?.tz}>{formatOffset(app.time, app.scale)}</span>
  {/if}
</div>

<style>
  .dates {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .day {
    display: flex;
    align-items: center;
    gap: 2px;
    border: 1px solid var(--hair);
    border-radius: var(--r-ctl);
    background: rgb(255 255 255 / 0.03);
  }
  .day .o-btn {
    width: 34px;
    min-width: 34px;
    height: 38px;
  }
  .date {
    border: 0;
    background: transparent;
    padding: 0 2px;
    min-width: 0;
  }
  .zone {
    font-size: 13px;
    color: var(--ink-2);
    white-space: nowrap;
  }
</style>
