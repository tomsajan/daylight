<!--
  A console panel: a thin header strip with an uppercase title, optional
  tools on the right, and a body that fills the rest.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    /** Secondary text after the title (e.g. a date). */
    sub?: string;
    tools?: Snippet;
    children: Snippet;
    /** Body without padding (charts, globe, tables). */
    flush?: boolean;
    class?: string;
  }
  let { title, sub, tools, children, flush = false, class: cls = '' }: Props = $props();
</script>

<section class="panel {cls}" aria-label={title}>
  <header class="head">
    <h2 class="lbl">{title}</h2>
    {#if sub}<span class="sub num">{sub}</span>{/if}
    {#if tools}<div class="tools">{@render tools()}</div>{/if}
  </header>
  <div class="body" class:flush>
    {@render children()}
  </div>
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--panel);
    border: 1px solid var(--rule);
    border-radius: var(--r);
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 3px 4px 3px 10px;
    border-bottom: 1px solid var(--rule);
    background: var(--panel-2);
    flex: none;
  }
  h2 {
    margin: 0;
    color: var(--ink-2);
    white-space: nowrap;
  }
  .sub {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .tools {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .body {
    position: relative;
    flex: 1;
    min-height: 0;
    padding: 10px;
    overflow: auto;
  }
  .body.flush {
    padding: 0;
    overflow: hidden;
  }
  @media (max-width: 759px) {
    .head {
      flex-wrap: wrap;
      row-gap: 4px;
      padding: 4px;
      padding-left: 10px;
    }
  }
</style>
