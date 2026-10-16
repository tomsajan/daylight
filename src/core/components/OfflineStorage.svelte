<!--
  How much the site keeps on the device for offline use, with a button that
  drops the kept map and terrain tiles, and one that installs the site as an app
  where the browser offers that. Takes the look of the settings it sits in.
-->
<script lang="ts">
  import { offlineUsage, clearOfflineTiles, formatBytes, install, installApp } from '../offline';

  let usage = $state<number | undefined>();
  let clearing = $state(false);

  async function refresh() {
    usage = await offlineUsage();
  }

  async function clear() {
    clearing = true;
    await clearOfflineTiles();
    await refresh();
    clearing = false;
  }

  $effect(() => {
    refresh();
  });
</script>

{#if install.available}
  <div class="dl-offline">
    <span>Install as an app <small>its own icon and window, and it opens without a network</small></span>
    <button type="button" onclick={installApp}>Install</button>
  </div>
{/if}
{#if usage !== undefined}
  <div class="dl-offline">
    <span>Offline storage: {formatBytes(usage)} <small>the app and the map tiles you have looked at</small></span>
    <button type="button" disabled={clearing} onclick={clear}>Clear tiles</button>
  </div>
{/if}

<style>
  .dl-offline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .dl-offline + .dl-offline {
    margin-top: 6px;
  }
  .dl-offline span {
    display: flex;
    flex-direction: column;
  }
  .dl-offline small {
    opacity: 0.75;
  }
  button {
    flex: none;
    border: 0;
    background: none;
    padding: 0;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
