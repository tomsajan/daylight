<!--
  Search-as-you-type for places (or coordinates), plus "use my location".
  Keyboard: arrows to move, Enter to choose, Escape to close.
  Themable via --dl-* custom properties (see core/components/theme.css).
-->
<script lang="ts">
  import { searchPlaces, resultToPlace, type SearchResult } from '../geo/geocode';
  import { geolocate } from '../geo/locate';
  import type { Place } from '../geo/place';
  import { reverseGeocode } from '../geo/geocode';
  import { makePlace } from '../geo/place';

  interface Props {
    onselect: (place: Place) => void;
    placeholder?: string;
    /** Show the locate-me button. */
    locate?: boolean;
    autofocus?: boolean;
  }

  let { onselect, placeholder = 'Search a place or enter coordinates', locate = true, autofocus = false }: Props = $props();

  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let active = $state(-1);
  let open = $state(false);
  let loading = $state(false);
  let error = $state('');
  let locating = $state(false);
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listId = `dl-search-${Math.random().toString(36).slice(2, 8)}`;

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
        error = 'Search is unavailable right now';
        results = [];
      }
    } finally {
      loading = false;
    }
  }

  function choose(r: SearchResult) {
    onselect(resultToPlace(r));
    query = '';
    results = [];
    open = false;
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
      } else if (results[active]) choose(results[active]);
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
      error = (e as Error).message || 'Location unavailable';
    } finally {
      locating = false;
    }
  }
</script>

<div class="dl-search" class:dl-search--open={open && (results.length > 0 || !loading)}>
  <div class="dl-search__field">
    <svg class="dl-search__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" fill="currentColor" /></svg>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type="search"
      role="combobox"
      aria-expanded={open}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      {placeholder}
      {autofocus}
      bind:value={query}
      oninput={onInput}
      onkeydown={onKeydown}
      onfocus={() => results.length && (open = true)}
      onblur={() => setTimeout(() => (open = false), 150)}
      autocomplete="off"
      spellcheck="false"
    />
    {#if loading}<span class="dl-search__spinner" aria-label="Searching"></span>{/if}
    {#if locate}
      <button type="button" class="dl-search__locate" onclick={useMyLocation} disabled={locating} title="Use my location" aria-label="Use my location">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 2v2.06A8 8 0 0 0 4.06 11H2v2h2.06A8 8 0 0 0 11 19.94V22h2v-2.06A8 8 0 0 0 19.94 13H22v-2h-2.06A8 8 0 0 0 13 4.06V2h-2Zm1 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" fill="currentColor" /></svg>
      </button>
    {/if}
  </div>
  {#if open && results.length}
    <ul class="dl-search__results" role="listbox" id={listId}>
      {#each results as r, i (i)}
        <li
          id="{listId}-{i}"
          role="option"
          aria-selected={i === active}
          class:active={i === active}
          onmousedown={(e) => e.preventDefault()}
          onclick={() => choose(r)}
          onkeydown={() => {}}
        >
          <span class="dl-search__name">{r.name}</span>
          {#if r.detail}<span class="dl-search__detail">{r.detail}</span>{/if}
        </li>
      {/each}
    </ul>
  {:else if open && !loading && query.trim().length >= 2 && !error}
    <div class="dl-search__empty">No places found</div>
  {/if}
  {#if error}<div class="dl-search__error">{error}</div>{/if}
</div>

<style>
  .dl-search {
    position: relative;
    font: inherit;
  }
  .dl-search__field {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--dl-surface, #fff);
    border: 1px solid var(--dl-border, #d0d5dd);
    border-radius: var(--dl-radius, 10px);
    padding: 0 6px 0 10px;
    color: var(--dl-fg, #111);
  }
  .dl-search__field:focus-within {
    border-color: var(--dl-accent, #3d8bfd);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--dl-accent, #3d8bfd) 25%, transparent);
  }
  .dl-search__icon {
    width: 18px;
    height: 18px;
    flex: none;
    opacity: 0.6;
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    padding: 10px 0;
  }
  input::-webkit-search-cancel-button {
    display: none;
  }
  .dl-search__locate {
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: calc(var(--dl-radius, 10px) - 4px);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .dl-search__locate:hover {
    background: color-mix(in srgb, currentColor 10%, transparent);
  }
  .dl-search__locate svg {
    width: 20px;
    height: 20px;
  }
  .dl-search__spinner {
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    opacity: 0.5;
    animation: dl-spin 0.7s linear infinite;
  }
  @keyframes dl-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .dl-search__results,
  .dl-search__empty {
    position: absolute;
    z-index: 50;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--dl-surface, #fff);
    color: var(--dl-fg, #111);
    border: 1px solid var(--dl-border, #d0d5dd);
    border-radius: var(--dl-radius, 10px);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.2);
    max-height: min(60vh, 360px);
    overflow-y: auto;
  }
  .dl-search__empty {
    padding: 10px 12px;
    color: var(--dl-muted, #667);
  }
  li {
    display: flex;
    flex-direction: column;
    padding: 8px 10px;
    border-radius: calc(var(--dl-radius, 10px) - 4px);
    cursor: pointer;
  }
  li.active,
  li:hover {
    background: color-mix(in srgb, var(--dl-accent, #3d8bfd) 14%, transparent);
  }
  .dl-search__name {
    font-weight: 600;
  }
  .dl-search__detail {
    font-size: 0.85em;
    color: var(--dl-muted, #667);
  }
  .dl-search__error {
    margin-top: 4px;
    font-size: 0.85em;
    color: var(--dl-danger, #e5484d);
  }
</style>
