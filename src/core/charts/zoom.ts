/**
 * Independent X/Y zoom & pan for canvas charts, with mouse, trackpad and touch:
 * - wheel / trackpad pinch: zoom X (Shift or Alt: zoom Y)
 * - drag: pan both axes
 * - two-finger pinch: horizontal spread zooms X, vertical spread zooms Y
 * - double click / double tap: reset
 * - single click / tap: `onTap`
 */

export interface Domain {
  x: [number, number];
  y: [number, number];
}

export interface ZoomOptions {
  /** Full extent; the view never leaves it. */
  extent: Domain;
  /** Smallest visible span per axis. */
  minSpan: { x: number; y: number };
  /** Inner plot rectangle in CSS pixels, relative to the element. */
  plot: () => { left: number; top: number; width: number; height: number };
  onChange: (view: Domain) => void;
  onTap?: (x: number, y: number) => void;
  onHover?: (x: number, y: number) => void;
  onLeave?: () => void;
  /** y grows downward on screen (e.g. time of day top to bottom). */
  yDown?: boolean;
}

export class ChartZoom {
  view: Domain;
  private opts: ZoomOptions;
  private el: HTMLElement;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { view: Domain; pts: { x: number; y: number }[]; moved: boolean; t: number } | null = null;
  private lastTap = 0;
  private cleanup: () => void;

  constructor(el: HTMLElement, opts: ZoomOptions) {
    this.el = el;
    this.opts = opts;
    this.view = structuredClone(opts.extent);
    el.style.touchAction = 'none';

    const onWheel = (e: WheelEvent) => this.wheel(e);
    const onDown = (e: PointerEvent) => this.down(e);
    const onMove = (e: PointerEvent) => this.move(e);
    const onUp = (e: PointerEvent) => this.up(e);
    const onLeave = () => this.opts.onLeave?.();
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    this.cleanup = () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
    };
  }

  setExtent(extent: Domain, keepView = true): void {
    this.opts.extent = extent;
    this.view = keepView ? this.clamp(this.view) : structuredClone(extent);
    this.opts.onChange(this.view);
  }

  setYDown(yDown: boolean): void {
    this.opts.yDown = yDown;
  }

  /** Show the full vertical extent, keeping the horizontal view. */
  resetY(): void {
    this.view = this.clamp({ x: this.view.x, y: [...this.opts.extent.y] });
    this.opts.onChange(this.view);
  }

  reset(): void {
    this.view = structuredClone(this.opts.extent);
    this.opts.onChange(this.view);
  }

  /** Zoom by a factor (<1 zooms in) around the centre or a data point. */
  zoomBy(fx: number, fy: number, cx?: number, cy?: number): void {
    const v = this.view;
    const ax = cx ?? (v.x[0] + v.x[1]) / 2;
    const ay = cy ?? (v.y[0] + v.y[1]) / 2;
    this.view = this.clamp({
      x: [ax - (ax - v.x[0]) * fx, ax + (v.x[1] - ax) * fx],
      y: [ay - (ay - v.y[0]) * fy, ay + (v.y[1] - ay) * fy],
    });
    this.opts.onChange(this.view);
  }

  /** Centre the view on x (keeping zoom). */
  panTo(x: number): void {
    const half = (this.view.x[1] - this.view.x[0]) / 2;
    this.view = this.clamp({ x: [x - half, x + half], y: this.view.y });
    this.opts.onChange(this.view);
  }

  get zoomed(): boolean {
    const e = this.opts.extent;
    return this.view.x[0] !== e.x[0] || this.view.x[1] !== e.x[1] || this.view.y[0] !== e.y[0] || this.view.y[1] !== e.y[1];
  }

  destroy(): void {
    this.cleanup();
  }

  // --- Internals -----------------------------------------------------------

  private toData(px: number, py: number, view = this.view): { x: number; y: number } {
    const p = this.opts.plot();
    const fx = (px - p.left) / p.width;
    let fy = (py - p.top) / p.height;
    if (!this.opts.yDown) fy = 1 - fy;
    return { x: view.x[0] + fx * (view.x[1] - view.x[0]), y: view.y[0] + fy * (view.y[1] - view.y[0]) };
  }

  private local(e: { clientX: number; clientY: number }) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private clamp(v: Domain): Domain {
    const e = this.opts.extent;
    const fit = (d: [number, number], ext: [number, number], min: number): [number, number] => {
      let span = Math.min(Math.max(d[1] - d[0], min), ext[1] - ext[0]);
      if (!Number.isFinite(span)) span = ext[1] - ext[0];
      let a = Math.max(ext[0], Math.min(d[0], ext[1] - span));
      if (!Number.isFinite(a)) a = ext[0];
      return [a, a + span];
    };
    return { x: fit(v.x, e.x, this.opts.minSpan.x), y: fit(v.y, e.y, this.opts.minSpan.y) };
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const p = this.local(e);
    const d = this.toData(p.x, p.y);
    // Trackpads send small deltas with ctrlKey for pinch; mice send ~100 per notch.
    const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // Horizontal trackpad scroll pans.
      const span = this.view.x[1] - this.view.x[0];
      const p2 = this.opts.plot();
      const shift = (e.deltaX / p2.width) * span;
      this.view = this.clamp({ x: [this.view.x[0] + shift, this.view.x[1] + shift], y: this.view.y });
      this.opts.onChange(this.view);
      return;
    }
    const f = Math.exp(delta * (e.ctrlKey ? 0.01 : 0.0015));
    if (e.shiftKey || e.altKey) this.zoomBy(1, f, d.x, d.y);
    else this.zoomBy(f, 1, d.x, d.y);
  }

  private down(e: PointerEvent): void {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, this.local(e));
    this.gesture = { view: structuredClone(this.view), pts: [...this.pointers.values()], moved: false, t: performance.now() };
  }

  private move(e: PointerEvent): void {
    const p = this.local(e);
    if (!this.pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') {
        const d = this.toData(p.x, p.y);
        this.opts.onHover?.(d.x, d.y);
      }
      return;
    }
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (!g) return;
    const pts = [...this.pointers.values()];
    const plot = this.opts.plot();
    const v0 = g.view;
    const sx = (v0.x[1] - v0.x[0]) / plot.width;
    const sy = ((v0.y[1] - v0.y[0]) / plot.height) * (this.opts.yDown ? 1 : -1);

    if (pts.length === 1 && g.pts.length === 1) {
      const dx = pts[0].x - g.pts[0].x;
      const dy = pts[0].y - g.pts[0].y;
      if (!g.moved && Math.hypot(dx, dy) < 6) return;
      g.moved = true;
      this.view = this.clamp({
        x: [v0.x[0] - dx * sx, v0.x[1] - dx * sx],
        y: [v0.y[0] - dy * sy, v0.y[1] - dy * sy],
      });
      this.opts.onChange(this.view);
    } else if (pts.length >= 2 && g.pts.length >= 2) {
      g.moved = true;
      const [a0, b0] = g.pts;
      const [a1, b1] = pts;
      // Spread along each axis; ignore an axis the fingers barely span.
      const fx = Math.abs(b0.x - a0.x) > 40 ? Math.abs(b0.x - a0.x) / Math.max(1, Math.abs(b1.x - a1.x)) : 1;
      const fy = Math.abs(b0.y - a0.y) > 40 ? Math.abs(b0.y - a0.y) / Math.max(1, Math.abs(b1.y - a1.y)) : 1;
      const c0 = this.toData((a0.x + b0.x) / 2, (a0.y + b0.y) / 2, v0);
      const c1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
      // New view: scaled around c0, then moved so c0 sits under the new midpoint.
      const nx: [number, number] = [c0.x - (c0.x - v0.x[0]) * fx, c0.x + (v0.x[1] - c0.x) * fx];
      const ny: [number, number] = [c0.y - (c0.y - v0.y[0]) * fy, c0.y + (v0.y[1] - c0.y) * fy];
      const tmp: Domain = { x: nx, y: ny };
      const under = this.toData(c1.x, c1.y, tmp);
      this.view = this.clamp({
        x: [nx[0] + (c0.x - under.x), nx[1] + (c0.x - under.x)],
        y: [ny[0] + (c0.y - under.y), ny[1] + (c0.y - under.y)],
      });
      this.opts.onChange(this.view);
    }
  }

  private up(e: PointerEvent): void {
    const g = this.gesture;
    const p = this.local(e);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size > 0) {
      // Continue with the remaining finger from the current view.
      this.gesture = { view: structuredClone(this.view), pts: [...this.pointers.values()], moved: true, t: performance.now() };
      return;
    }
    this.gesture = null;
    if (!g || g.moved || e.type === 'pointercancel') return;
    const now = performance.now();
    if (now - this.lastTap < 300) {
      this.lastTap = 0;
      this.reset();
      return;
    }
    this.lastTap = now;
    const d = this.toData(p.x, p.y);
    this.opts.onTap?.(d.x, d.y);
  }
}
