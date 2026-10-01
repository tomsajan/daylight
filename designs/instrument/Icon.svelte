<script lang="ts">
  let { d, size = 14 }: { d: string; size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path {d} fill="currentColor" /></svg>
