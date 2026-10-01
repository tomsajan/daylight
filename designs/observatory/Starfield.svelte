<!--
  Static deep-space backdrop behind the (transparent) globe canvas.
  Drawn once per resize with a seeded random so stars don't jump around.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  let canvas: HTMLCanvasElement;

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Mulberry32: tiny deterministic PRNG.
    let seed = 0x5eed;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const count = Math.round((w * h) / 2600);
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const m = rand();
      // Most stars are faint; a few are bright, a few warm or cool.
      const r = m > 0.985 ? 1.3 : m > 0.9 ? 0.85 : 0.5;
      const a = m > 0.985 ? 0.95 : 0.25 + rand() * 0.45;
      const tint = rand();
      const color = tint > 0.92 ? '255, 214, 160' : tint < 0.1 ? '180, 205, 255' : '236, 232, 222';
      ctx.fillStyle = `rgba(${color}, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (m > 0.985) {
        ctx.fillStyle = `rgba(${color}, 0.12)`;
        ctx.beginPath();
        ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  onMount(() => {
    draw();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(draw, 150);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });
</script>

<div class="space" aria-hidden="true">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .space {
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 70% 60% at 62% 42%, rgb(30 52 110 / 0.35), transparent 70%),
      radial-gradient(ellipse 50% 40% at 15% 90%, rgb(90 60 30 / 0.12), transparent 70%),
      linear-gradient(180deg, #050a18 0%, #03050c 60%, #020309 100%);
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
