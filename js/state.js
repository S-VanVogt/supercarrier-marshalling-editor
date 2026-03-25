/**
 * Centralised observable application state.
 * Listeners are notified on every mutation so the UI and renderer stay in sync.
 */

const DEFAULT_POINTS = [
  { x: -120, y: -20 },
  { x:  -80, y:  10 },
  { x:  -40, y: -15 },
  { x:    0, y:   5 },
  { x:   40, y: -25 },
];

class AppState {
  constructor() {
    /** @type {{ x: number, y: number }[]} */
    this.points = [...DEFAULT_POINTS];
    /** Current ratio 0–1 */
    this.t = 0.5;
    /** Index of point currently being dragged, or -1 */
    this.dragging = -1;
    /** @type {Set<() => void>} */
    this._listeners = new Set();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    for (const fn of this._listeners) fn();
  }

  setT(value) {
    this.t = Math.max(0, Math.min(1, value));
    this._notify();
  }

  addPoint(x, y) {
    this.points.push({ x, y });
    this._notify();
  }

  updatePoint(i, key, value) {
    if (this.points[i]) {
      this.points[i][key] = value;
      this._notify();
    }
  }

  movePoint(i, x, y) {
    if (this.points[i]) {
      this.points[i].x = x;
      this.points[i].y = y;
      this._notify();
    }
  }

  deletePoint(i) {
    this.points.splice(i, 1);
    this._notify();
  }

  clearPoints() {
    this.points = [];
    this._notify();
  }

  /** Replace all points (e.g. from JSON import). */
  loadPoints(arr) {
    this.points = arr.map(p => ({ x: +p.x, y: +p.y }));
    this._notify();
  }

  /** Export points as a clean JSON-serialisable array. */
  exportJSON() {
    return this.points.map(({ x, y }) => ({ x: +x.toFixed(4), y: +y.toFixed(4) }));
  }
}

export const state = new AppState();
