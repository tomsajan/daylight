<!-- Landing page listing every design in designs/*, each described by its meta.ts. -->
<script lang="ts">
  interface DesignMeta {
    name: string;
    tagline: string;
    description: string;
    /** Sort order on this page. */
    order?: number;
  }

  const modules = import.meta.glob<{ default: DesignMeta }>('/designs/*/meta.ts', { eager: true });
  const designs = Object.entries(modules)
    .map(([path, mod]) => ({ slug: path.split('/')[2], ...mod.default }))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
</script>

<main>
  <h1>Daylight</h1>
  <p class="lead">How daylight changes through the year, anywhere on Earth. Pick a design:</p>
  <ul>
    {#each designs as d (d.slug)}
      <li>
        <a href="designs/{d.slug}/{location.search}">
          <strong>{d.name}</strong>
          <em>{d.tagline}</em>
          <span>{d.description}</span>
        </a>
      </li>
    {/each}
  </ul>
</main>

<style>
  :global(body) {
    margin: 0;
    font: 16px/1.5 system-ui, sans-serif;
    background: #0e1220;
    color: #e8ecf5;
  }
  main {
    max-width: 760px;
    margin: 0 auto;
    padding: 48px 16px;
  }
  h1 {
    margin: 0;
    font-size: 2.4rem;
  }
  .lead {
    color: #a7b0c6;
  }
  ul {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 12px;
  }
  a {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 16px 18px;
    border: 1px solid #2a3150;
    border-radius: 12px;
    color: inherit;
    text-decoration: none;
  }
  a:hover {
    border-color: #f2a516;
  }
  em {
    color: #f2a516;
    font-style: normal;
  }
  span {
    color: #a7b0c6;
  }
</style>
