<!--
  Place search (adapted from core PlaceSearch): every result offers both
  "Set" (replace the selected place) and "Add" (compare), and the row itself
  follows the current pick mode. Enter = pick mode, Shift+Enter = add.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { searchPlaces, resultToPlace, reverseGeocode, type SearchResult } from '$core/geo/geocode';
  import { geolocate } from '$core/geo/locate';
  import { makePlace, type Place } from '$core/geo/place';
  import { app, MAX_PLACES } from '$core/state/app.svelte';
  import { ui, type PickMode } from './ui.svelte';

  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let active = $state(-1);
  let open = $state(false);
  let loading = $state(false);
  let error = $state('');
  let locating = $state(false);
  let input: HTMLInputElement;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listId = 'ins-search-list';

  const full = $derived(app.places.length >= MAX_PLACES);

  // Errors are transient; don't leave a box over the layout.
  $effect(() => {
    if (!error) return;
    const t = setTimeout(() => (error = ''), 7000);
    return () => clearTimeout(t);
  });

  onMount(() => {
    ui.focusSearch = () => {
      input?.focus();
      input?.select();
    };
  });

  function use(place: Place, mode: PickMode) {
    if (mode === 'add') app.addPlace(place);
    else app.replaceSelected(place);
  }

  function onInput() {
    error = '';
    if (timer) clearTimeout(timer);
    if (query.trim().length < 2) {
      results = [];
      open = false;
      return;
    }
    timer = setTimeout(run, 350);
  }

  async function run() {
    controller?.abort();
    controller = new AbortController();
    loading = true;
    try {
      results = await searchPlaces(query, controller.signal);
      active = results.length ? 0 : -1;
      open = true;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        error = 'Search is unavailable. Check the connection, or enter coordinates like 50.08, 14.44.';
        results = [];
      }
    } finally {
      loading = false;
    }
  }

  function choose(r: SearchResult, mode: PickMode) {
    use(resultToPlace(r), mode);
    query = '';
    results = [];
    open = false;
    input?.blur();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      active = Math.min(results.length - 1, active + 1);
      open = true;
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      active = Math.max(0, active - 1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (timer && query.trim().length >= 2 && !results.length) {
        clearTimeout(timer);
        run();
      } else if (results[active]) choose(results[active], e.shiftKey ? 'add' : ui.pickMode);
    } else if (e.key === 'Escape') {
      if (open) open = false;
      else input.blur();
      e.stopPropagation();
    }
  }

  async function useMyLocation() {
    locating = true;
    error = '';
    try {
      const { lat, lon } = await geolocate();
      const named = await reverseGeocode(lat, lon);
      use({ ...makePlace(lat, lon), ...named }, ui.pickMode);
    } catch (e) {
      error = (e as Error).message || 'Your location is unavailable.';
    } finally {
      locating = false;
    }
  }
</script>

<div class="search">
  <div class="field-wrap">
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" fill="currentColor" /></svg>
    <input
      bind:this={input}
      type="search"
      role="combobox"
      aria-label="Search a place or enter coordinates"
      aria-expanded={open}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={active >= 0 && open ? `${listId}-${active}` : undefined}
      placeholder="Search place or lat, lon"
      bind:value={query}
      oninput={onInput}
      onkeydown={onKeydown}
      onfocus={() => results.length && (open = true)}
      onblur={() => setTimeout(() => (open = false), 150)}
      autocomplete="off"
      spellcheck="false"
      enterkeyhint="search"
    />
    {#if loading}<span class="spinner" aria-label="Searching"></span>{/if}
    <button type="button" class="locate" onclick={useMyLocation} disabled={locating} title="Use my location" aria-label="Use my location">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 2v2.06A8 8 0 0 0 4.06 11H2v2h2.06A8 8 0 0 0 11 19.94V22h2v-2.06A8 8 0 0 0 19.94 13H22v-2h-2.06A8 8 0 0 0 13 4.06V2h-2Zm1 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" fill="currentColor" /></svg>
    </button>
  </div>

  {#if open && results.length}
    <ul class="results" role="listbox" id={listId}>
      {#each results as r, i (i)}
        <li id="{listId}-{i}" role="option" aria-selected={i === active} class:active={i === active} onmousedown={(e) => e.preventDefault()}>
          <button type="button" class="main" tabindex="-1" onclick={() => choose(r, ui.pickMode)}>
            <span class="name">{r.name}</span>
            {#if r.detail}<span class="detail">{r.detail}</span>{/if}
          </button>
          <button type="button" class="btn" class:on={ui.pickMode === 'replace'} tabindex="-1" onclick={() => choose(r, 'replace')} title="Replace the selected place">Set</button>
          <button
            type="button"
            class="btn"
            class:on={ui.pickMode === 'add'}
            tabindex="-1"
            onclick={() => choose(r, 'add')}
            title={full ? 'Six places is the maximum: this replaces the selected one' : 'Add to the comparison'}>+ Add</button
          >
        </li>
      {/each}
      <li class="foot lbl" role="presentation">
        Enter: {ui.pickMode === 'add' ? 'add' : 'set'} · Shift+Enter: add
      </li>
    </ul>
  {:else if open && !loading && query.trim().length >= 2 && !error}
    <div class="results empty">No places match “{query.trim()}”. Try a city name or coordinates.</div>
  {/if}
  {#if error}<div class="error" role="alert">{error}</div>{/if}
</div>

<style>
  .search {
    position: relative;
    min-width: 0;
  }
  .field-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 2px 0 9px;
    border: 1px solid var(--rule-strong);
    border-radius: var(--r);
    background: var(--panel);
  }
  .field-wrap:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .icon {
    width: 15px;
    height: 15px;
    flex: none;
    color: var(--muted);
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    font: 500 13px var(--mono);
  }
  input::placeholder {
    color: var(--faint);
    font-family: var(--sans);
    font-weight: 400;
  }
  input::-webkit-search-cancel-button {
    display: none;
  }
  .locate {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 2px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .locate:hover {
    color: var(--accent);
    background: var(--accent-soft);
  }
  .locate svg {
    width: 17px;
    height: 17px;
  }
  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--muted);
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .results {
    position: absolute;
    z-index: 60;
    left: 0;
    right: 0;
    top: calc(100% + 3px);
    margin: 0;
    padding: 3px;
    list-style: none;
    background: var(--panel);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);
    max-height: min(60vh, 380px);
    overflow-y: auto;
    min-width: min(340px, calc(100vw - 24px));
  }
  @media (max-width: 759px) {
    .results,
    .error {
      position: fixed;
      left: 8px;
      right: 8px;
      top: calc(env(safe-area-inset-top) + 46px);
      min-width: 0;
      max-height: 65dvh;
    }
  }
  .empty {
    padding: 10px;
    color: var(--muted);
  }
  li {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 3px 2px 0;
    border-radius: 2px;
  }
  li.active {
    background: var(--accent-soft);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 5px 8px;
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .name {
    font-weight: 600;
    font-size: 13px;
  }
  .detail {
    font-size: 11.5px;
    color: var(--muted);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .foot {
    padding: 6px 8px 4px;
    border-top: 1px solid var(--rule);
    margin-top: 3px;
    letter-spacing: 0.05em;
    color: var(--faint);
  }
  .error {
    position: absolute;
    z-index: 60;
    left: 0;
    right: 0;
    top: calc(100% + 3px);
    padding: 8px 10px;
    font-size: 12px;
    color: var(--danger);
    background: var(--panel);
    border: 1px solid var(--danger);
    border-radius: var(--r);
  }
</style>
