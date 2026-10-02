<!--
  Start page: the two apps, Daylight and Eclipses. Daylight opens in its default
  design, with the other designs one click away; the development pages are only
  listed on a local host.
-->
<script lang="ts">
  import { DEFAULT_DAYLIGHT, DESIGNS, designsOf, isLocalHost } from '$core/apps';

  const search = location.search;
  const daylight = designsOf('daylight');
  const eclipses = designsOf('eclipses')[0];
  const dev = isLocalHost() ? DESIGNS.filter((d) => d.dev) : [];
</script>

<main>
  <h1>Daylight</h1>
  <p class="lead">How the days change, and when the Sun or the Moon goes dark, anywhere on Earth.</p>

  <div class="apps">
    <section class="app">
      <a class="main" href="designs/{DEFAULT_DAYLIGHT}/{search}">
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r="7.5" fill="currentColor" />
          <path d="M20 3v5M20 32v5M3 20h5M32 20h5M8 8l3.5 3.5M28.5 28.5 32 32M8 32l3.5-3.5M28.5 11.5 32 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
        </svg>
        <strong>Daylight</strong>
        <span>Sunrise, sunset, twilight and day length through the year for any place, on a 3D globe and charts. Compare up to six places.</span>
      </a>
      <p class="also">Pick a look; your places, time and settings come along when you switch:</p>
      <ul class="designs">
        {#each daylight as d (d.slug)}
          <li>
            <a href="designs/{d.slug}/{search}">
              <b>{d.name}{#if d.slug === DEFAULT_DAYLIGHT}<small>default</small>{/if}</b>
              <em>{d.tagline}</em>
            </a>
          </li>
        {/each}
      </ul>
    </section>

    {#if eclipses}
      <section class="app">
        <a class="main" href="designs/{eclipses.slug}/{search}">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <!-- The Sun's crescent with the Moon over it. -->
            <path d="M28.1 27.6A12 12 0 1 1 13.9 11.4A12 12 0 0 0 28.1 27.6Z" fill="currentColor" />
            <circle cx="25" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2" opacity="0.55" />
          </svg>
          <strong>{eclipses.name}</strong>
          <span>{eclipses.description}</span>
        </a>
      </section>
    {/if}
  </div>

  {#if dev.length}
    <section class="dev">
      <h2>Development <small>only listed on this local host</small></h2>
      <ul class="designs">
        {#each dev as d (d.slug)}
          <li>
            <a href="designs/{d.slug}/{search}"><b>{d.name}</b><em>{d.tagline}</em></a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    font: 16px/1.5 system-ui, sans-serif;
    background: #0e1220;
    color: #e8ecf5;
  }
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 48px 16px;
  }
  h1 {
    margin: 0;
    font-size: 2.4rem;
  }
  .lead {
    margin: 4px 0 28px;
    color: #a7b0c6;
  }
  .apps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
    gap: 16px;
    align-items: start;
  }
  .app {
    display: flex;
    flex-direction: column;
    border: 1px solid #2a3150;
    border-radius: 16px;
    overflow: hidden;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 22px 22px 18px;
  }
  .main:hover {
    background: #151b30;
  }
  .main svg {
    width: 40px;
    height: 40px;
    color: #f2a516;
  }
  .main strong {
    font-size: 1.6rem;
    line-height: 1.2;
  }
  .main:hover strong {
    color: #f2a516;
  }
  .main span {
    color: #a7b0c6;
  }
  .also {
    margin: 0;
    padding: 12px 22px 6px;
    border-top: 1px solid #2a3150;
    font-size: 14px;
    color: #a7b0c6;
  }
  .designs {
    list-style: none;
    margin: 0;
    padding: 0 10px 12px;
    display: grid;
    gap: 2px;
  }
  .designs a {
    display: flex;
    flex-direction: column;
    padding: 8px 12px;
    border-radius: 10px;
  }
  .designs a:hover {
    background: #151b30;
  }
  .designs a:hover b {
    color: #f2a516;
  }
  .designs b {
    font-weight: 600;
  }
  .designs small {
    margin-left: 8px;
    padding: 1px 6px;
    border: 1px solid #f2a516;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    color: #f2a516;
    vertical-align: 2px;
  }
  .designs em {
    font-style: normal;
    font-size: 14px;
    color: #a7b0c6;
  }
  .dev {
    margin-top: 32px;
  }
  .dev h2 {
    margin: 0 0 6px;
    font-size: 1rem;
    color: #a7b0c6;
  }
  .dev h2 small {
    font-weight: 400;
    margin-left: 6px;
  }
  .dev .designs {
    padding: 0;
  }
  .dev .designs a {
    border: 1px dashed #2a3150;
  }
</style>
