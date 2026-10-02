<!--
  Place search for Observatory, adapted from core PlaceSearch:
  - every result has a separate "Add" action for comparing, besides the main
    action (which follows the compare toggle: show here, or add);
  - an empty, focused field suggests a few places with interesting daylight.
  Keyboard: arrows move, Enter chooses, Shift+Enter adds, Escape closes.
-->
<script lang="ts">
  import { searchPlaces, resultToPlace, reverseGeocode, type SearchResult } from '$core/geo/geocode';
  import { geolocate } from '$core/geo/locate';
  import { makePlace, SAMPLE_PLACES, type Place } from '$core/geo/place';
  import Icon from './Icon.svelte';

  interface Props {
    /** `add`: compare with the current places instead of replacing the selected one. */
    onselect: (place: Place, add: boolean) => void;
    /** The main action adds (compare mode is on). */
    compare?: boolean;
    /** Room for another place. */
    canAdd?: boolean;
    placeholder?: string;
    onfocuschange?: (focused: boolean) => void;
  }

  let { onselect, compare = false, canAdd = true, placeholder = 'Search a place or coordinates', onfocuschange }: Props = $props();

  const SUGGESTIONS: SearchResult[] = SAMPLE_PLACES.map((p) => ({ ...p, kind: 'suggestion' }));

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
  const listId = `obs-search-${Math.random().toString(36).slice(2, 8)}`;

  const suggesting = $derived(query.trim().length < 2);
  const shown = $derived(suggesting ? SUGGESTIONS : results);
  const addMain = $derived(compare && canAdd);

  function onInput() {
    error = '';
    if (timer) clearTimeout(timer);
    active = -1;
    if (query.trim().length < 2) {
      results = [];
      return;
    }
    timer = setTimeout(run, 350);
  }

  /** explicit: the user pressed Enter, so a backup service may be asked too. */
  async function run(explicit = false) {
    controller?.abort();
    controller = new AbortController();
    loading = true;
    try {
      results = await searchPlaces(query, { signal: controller.signal, fallback: explicit });
      active = results.length ? 0 : -1;
      open = document.activeElement === input;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        error = explicit ? 'Search is unavailable right now. Try coordinates, e.g. 50.08, 14.44' : 'Search did not answer. Press Enter to try again.';
        results = [];
      }
    } finally {
      loading = false;
    }
  }

  function choose(r: SearchResult, add: boolean) {
    onselect(resultToPlace(r), add && canAdd);
    query = '';
    results = [];
    open = false;
    active = -1;
    input?.blur();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      open = true;
      active = Math.min(shown.length - 1, active + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      active = Math.max(0, active - 1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (timer && query.trim().length >= 2 && !results.length) {
        clearTimeout(timer);
        run(true);
      } else if (shown[active]) choose(shown[active], e.shiftKey || addMain);
    } else if (e.key === 'Escape') {
      open = false;
      input?.blur();
    }
  }

  async function useMyLocation() {
    locating = true;
    error = '';
    try {
      const { lat, lon } = await geolocate();
      const named = await reverseGeocode(lat, lon);
      onselect({ ...makePlace(lat, lon), ...named }, addMain);
      open = false;
    } catch (e) {
      error = (e as Error).message || 'Your location is unavailable. Check the browser’s location permission.';
    } finally {
      locating = false;
    }
  }

  function setFocus(f: boolean) {
    onfocuschange?.(f);
    if (f) open = true;
    else setTimeout(() => (open = false), 150);
  }
</script>

<div class="search" class:search--open={open}>
  <div class="field o-glass">
    <span class="lens"><Icon name="search" /></span>
    <input
      bind:this={input}
      type="search"
      role="combobox"
      aria-expanded={open}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      aria-label="Search places"
      {placeholder}
      bind:value={query}
      oninput={onInput}
      onkeydown={onKeydown}
      onfocus={() => setFocus(true)}
      onblur={() => setFocus(false)}
      autocomplete="off"
      spellcheck="false"
      enterkeyhint="search"
    />
    {#if loading}<span class="spinner" aria-label="Searching"></span>{/if}
    <button
      type="button"
      class="locate"
      onclick={useMyLocation}
      disabled={locating}
      title={addMain ? 'Add my location' : 'Use my location'}
      aria-label={addMain ? 'Add my location' : 'Use my location'}
    >
      {#if locating}<span class="spinner"></span>{:else}<Icon name="locate" />{/if}
    </button>
  </div>

  {#if open && (shown.length || error || (!loading && !suggesting))}
    <div class="drop o-glass" role="presentation" onmousedown={(e) => e.preventDefault()}>
      {#if error}
        <p class="msg msg--error">{error}</p>
      {:else if !shown.length}
        <p class="msg">No places match “{query.trim()}”. Try another spelling or coordinates.</p>
      {:else}
        {#if suggesting}<p class="msg">Places with striking daylight</p>{/if}
        <ul role="listbox" id={listId} aria-label="Places">
          {#each shown as r, i (i)}
            <li id="{listId}-{i}" role="option" aria-selected={i === active} class:active={i === active}>
              <button type="button" class="main" tabindex="-1" onclick={() => choose(r, addMain)}>
                <span class="name">{r.name}</span>
                {#if r.detail}<span class="detail">{r.detail}</span>{/if}
              </button>
              {#if addMain}
                <span class="tag">Add</span>
              {:else if canAdd}
                <button type="button" class="add" tabindex="-1" onclick={() => choose(r, true)} title="Add {r.name} to compare">
                  <Icon name="plus" size={14} /> Add
                </button>
              {/if}
            </li>
          {/each}
        </ul>
        {#if !suggesting}
          <p class="hint">{addMain ? 'Enter adds to compare' : canAdd ? 'Enter shows the place, Shift+Enter adds it to compare' : 'Enter shows the place'}</p>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .search {
    position: relative;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 46px;
    padding: 0 4px 0 14px;
    border-radius: 14px;
    box-shadow: none;
    background: rgb(4 8 20 / 0.5);
  }
  .field:focus-within {
    border-color: color-mix(in srgb, var(--gold) 60%, transparent);
    box-shadow: 0 0 0 3px rgb(242 196 109 / 0.14);
  }
  .lens {
    display: grid;
    color: var(--ink-3);
  }
  .lens :global(svg) {
    width: 18px;
    height: 18px;
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    font-size: 15px;
  }
  input::placeholder {
    color: var(--ink-3);
  }
  input::-webkit-search-cancel-button {
    display: none;
  }
  .locate {
    flex: none;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--ink-2);
    cursor: pointer;
  }
  .locate:hover {
    color: var(--gold-hot);
    background: var(--glass-hover);
  }
  .locate :global(svg) {
    width: 20px;
    height: 20px;
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    opacity: 0.6;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .drop {
    position: absolute;
    z-index: 60;
    left: 0;
    right: 0;
    top: calc(100% + 6px);
    padding: 6px;
    border-radius: 16px;
    background: var(--glass-strong);
    max-height: min(60vh, 420px);
    overflow-y: auto;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
    border-radius: 10px;
  }
  li.active,
  li:hover {
    background: rgb(255 240 210 / 0.07);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 8px 10px;
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .name {
    font-weight: 500;
  }
  .detail {
    font-size: 13px;
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .add,
  .tag {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    margin-right: 6px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 13px;
  }
  .add {
    border: 1px solid var(--hair-strong);
    background: transparent;
    color: var(--ink-2);
    cursor: pointer;
  }
  .add:hover {
    color: var(--gold-hot);
    border-color: color-mix(in srgb, var(--gold) 55%, transparent);
  }
  .tag {
    color: var(--gold-hot);
  }
  .msg,
  .hint {
    margin: 0;
    padding: 8px 10px 6px;
    font-size: 13px;
    color: var(--ink-2);
  }
  .hint {
    padding-top: 6px;
    color: var(--ink-3);
    border-top: 1px solid var(--hair);
    margin-top: 4px;
  }
  .msg--error {
    color: #ff9c86;
  }
  @media (pointer: coarse) {
    .hint {
      display: none;
    }
    .main {
      padding: 10px;
    }
    .add {
      height: 36px;
    }
  }
</style>
