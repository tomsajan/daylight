<!--
  Place search adapted from core/components/PlaceSearch.svelte: each result can
  either be shown (replacing the selected place) or added to the comparison.
  Also accepts coordinates ("50.08, 14.44") and offers "use my location".
-->
<script lang="ts">
  import { searchPlaces, resultToPlace, reverseGeocode, type SearchResult } from '$core/geo/geocode';
  import { geolocate } from '$core/geo/locate';
  import { makePlace, type Place } from '$core/geo/place';

  interface Props {
    /** Primary action for a result (and for "use my location"). */
    onselect: (place: Place) => void;
    /** Secondary action shown on each result; omit to hide it. */
    oncompare?: (place: Place) => void;
    placeholder?: string;
    label: string;
    selectLabel?: string;
  }

  let { onselect, oncompare, placeholder = 'Find a place or type coordinates', label, selectLabel = 'Show' }: Props = $props();

  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let active = $state(-1);
  let open = $state(false);
  let loading = $state(false);
  let error = $state('');
  let locating = $state(false);
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listId = `alm-search-${Math.random().toString(36).slice(2, 8)}`;

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
        error = 'Place search is unavailable. Check your connection, or type coordinates such as 50.08, 14.44.';
        results = [];
      }
    } finally {
      loading = false;
    }
  }

  function done() {
    query = '';
    results = [];
    open = false;
  }

  function choose(r: SearchResult) {
    onselect(resultToPlace(r));
    done();
  }

  function compare(r: SearchResult) {
    oncompare?.(resultToPlace(r));
    done();
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
      } else if (results[active]) {
        // Shift+Enter adds to the comparison, mirroring the second button.
        if (e.shiftKey && oncompare) compare(results[active]);
        else choose(results[active]);
      }
    } else if (e.key === 'Escape') {
      open = false;
    }
  }

  async function useMyLocation() {
    locating = true;
    error = '';
    try {
      const { lat, lon } = await geolocate();
      const named = await reverseGeocode(lat, lon);
      onselect({ ...makePlace(lat, lon), ...named });
    } catch (e) {
      error = (e as Error).message || 'Your location is unavailable.';
    } finally {
      locating = false;
    }
  }

  // Close when focus leaves the whole widget (input and result buttons), not just the input.
  let root: HTMLDivElement;
  function onFocusOut(e: FocusEvent) {
    if (!root.contains(e.relatedTarget as Node | null)) setTimeout(() => (open = false), 120);
  }
</script>

<div class="search" bind:this={root} onfocusout={onFocusOut}>
  <div class="field">
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" fill="currentColor" /></svg
    >
    <input
      type="search"
      role="combobox"
      aria-label={label}
      aria-expanded={open}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={active >= 0 && open ? `${listId}-${active}` : undefined}
      {placeholder}
      bind:value={query}
      oninput={onInput}
      onkeydown={onKeydown}
      onfocus={() => results.length && (open = true)}
      autocomplete="off"
      spellcheck="false"
      enterkeyhint="search"
    />
    {#if loading}<span class="spinner" aria-label="Searching"></span>{/if}
    <button type="button" class="locate" onclick={useMyLocation} disabled={locating} aria-label="Use my location" title="Use my location">
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path
          d="M11 2v2.06A8 8 0 0 0 4.06 11H2v2h2.06A8 8 0 0 0 11 19.94V22h2v-2.06A8 8 0 0 0 19.94 13H22v-2h-2.06A8 8 0 0 0 13 4.06V2h-2Zm1 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
          fill="currentColor"
        /></svg
      >
    </button>
  </div>

  {#if open && results.length}
    <ul class="results" role="listbox" id={listId} aria-label="Places found">
      {#each results as r, i (i)}
        <li id="{listId}-{i}" role="option" aria-selected={i === active} class:active={i === active}>
          <button type="button" class="pick" tabindex="-1" onmousedown={(e) => e.preventDefault()} onclick={() => choose(r)}>
            <span class="name">{r.name}</span>
            {#if r.detail}<span class="detail">{r.detail}</span>{/if}
            <span class="hint">{selectLabel}</span>
          </button>
          {#if oncompare}
            <button type="button" class="compare" onmousedown={(e) => e.preventDefault()} onclick={() => compare(r)} aria-label="Add {r.name} to the comparison">
              <span aria-hidden="true">+</span> Compare
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if open && !loading && query.trim().length >= 2 && !error}
    <div class="empty">No places match “{query.trim()}”. Try a nearby town, or type coordinates.</div>
  {/if}
  {#if locating}<div class="status">Finding your location…</div>{/if}
  {#if error}<div class="error" role="alert">{error}</div>{/if}
</div>

<style>
  .search {
    position: relative;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1.5px solid var(--ink);
    color: var(--ink);
    padding-left: 2px;
  }
  .field:focus-within {
    border-bottom-color: var(--accent);
    box-shadow: 0 1.5px 0 var(--accent);
  }
  .icon {
    width: 17px;
    height: 17px;
    flex: none;
    opacity: 0.55;
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font: italic 400 1.0625rem/1.2 var(--serif);
    padding: 10px 0 9px;
  }
  input::placeholder {
    color: var(--muted);
    opacity: 1;
  }
  input::-webkit-search-cancel-button {
    display: none;
  }
  .locate {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    border-radius: 2px;
  }
  .locate:hover {
    color: var(--accent);
  }
  .locate svg {
    width: 19px;
    height: 19px;
  }
  .spinner {
    width: 13px;
    height: 13px;
    border: 1.5px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    opacity: 0.6;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .results,
  .empty {
    position: absolute;
    z-index: 60;
    left: 0;
    right: 0;
    top: calc(100% + 6px);
    margin: 0;
    padding: 4px 0;
    list-style: none;
    background: var(--sheet);
    color: var(--ink);
    border: 1px solid var(--rule-strong);
    box-shadow: 0 14px 30px -12px rgb(30 24 10 / 0.35);
    max-height: min(60vh, 380px);
    overflow-y: auto;
  }
  .empty {
    padding: 12px 14px;
    font: italic 0.95rem/1.4 var(--serif);
    color: var(--muted);
  }
  li {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--rule);
  }
  li:last-child {
    border-bottom: 0;
  }
  li.active {
    background: var(--wash);
  }
  .pick {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: 1fr auto;
    column-gap: 10px;
    text-align: left;
    padding: 9px 12px;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  .pick:hover {
    background: var(--wash);
  }
  .name {
    font: 500 1.02rem/1.25 var(--serif);
  }
  .detail {
    grid-column: 1;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .hint {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .compare {
    flex: none;
    border: 0;
    border-left: 1px solid var(--rule);
    background: none;
    color: var(--accent);
    font: 600 0.8rem/1 var(--sans);
    padding: 0 12px;
    min-width: 92px;
    cursor: pointer;
  }
  .compare:hover {
    background: var(--wash);
  }
  .status,
  .error {
    margin-top: 6px;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .error {
    color: var(--alert);
  }
</style>
