<!-- Line icons on a 24px grid. Filled shapes (play, pause) use `fill`. -->
<script lang="ts" module>
  const PATHS = {
    play: ['M8 5.5v13l10.5-6.5z'],
    pause: ['M7 5h3.6v14H7zM13.4 5H17v14h-3.6z'],
    forward: ['M5 6.5 11 12l-6 5.5M12.5 6.5l6 5.5-6 5.5'],
    left: ['m14.5 6-6 6 6 6'],
    right: ['m9.5 6 6 6-6 6'],
    up: ['m6 14.5 6-6 6 6'],
    down: ['m6 9.5 6 6 6-6'],
    plus: ['M12 5v14M5 12h14'],
    minus: ['M5 12h14'],
    close: ['m6 6 12 12M18 6 6 18'],
    search: ['M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM15.3 15.3 20 20'],
    locate: ['M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3', 'M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z', 'M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z'],
    center: ['M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15', 'M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z'],
    reset: ['M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9', 'M4.5 4.5V9H9'],
    chart: ['M4 19.5h16', 'M7 16v-5M11.5 16V7M16 16v-7.5'],
    gear: [
      'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
      'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
    ],
    compare: ['M9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM21 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z', 'M9 12h6'],
    sunrise: ['M4 18h16M7.5 18a4.5 4.5 0 0 1 9 0', 'M12 4v5M9.5 6.5 12 4l2.5 2.5'],
    sunset: ['M4 18h16M7.5 18a4.5 4.5 0 0 1 9 0', 'M12 9V4M9.5 6.5 12 9l2.5-2.5'],
  } satisfies Record<string, string[]>;

  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    size?: number;
  }
  let { name, size }: Props = $props();
  const filled = $derived(name === 'play' || name === 'pause');
</script>

<svg
  viewBox="0 0 24 24"
  width={size}
  height={size}
  aria-hidden="true"
  fill={filled ? 'currentColor' : 'none'}
  stroke={filled ? 'none' : 'currentColor'}
  stroke-width="1.7"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#each PATHS[name] as d (d)}<path {d} />{/each}
</svg>
