/**
 * Viewport — manages the mapping between world coordinates and canvas pixels.
 * Supports configurable bounds and provides coordinate conversion utilities.
 */
export class Viewport {
  constructor(minX = -150, maxX = 60, minY = -32, maxY = 32) {
    this.minX = minX;
    this.maxX = maxX;
    this.minY = minY;
    this.maxY = maxY;
  }

  /** World → canvas pixel. */
  toCanvas(wx, wy, canvasW, canvasH) {
    return {
      x: ((wx - this.minX) / (this.maxX - this.minX)) * canvasW,
      y: ((wy - this.minY) / (this.maxY - this.minY)) * canvasH,
    };
  }

  /** Canvas pixel → world. */
  toWorld(cx, cy, canvasW, canvasH) {
    return {
      x: this.minX + (cx / canvasW) * (this.maxX - this.minX),
      y: this.minY + (cy / canvasH) * (this.maxY - this.minY),
    };
  }

  /** Update bounds (all at once). */
  setBounds(minX, maxX, minY, maxY) {
    this.minX = minX;
    this.maxX = maxX;
    this.minY = minY;
    this.maxY = maxY;
  }

  /** World-space width / height. */
  get width()  { return this.maxX - this.minX; }
  get height() { return this.maxY - this.minY; }

  /** Zoom by a factor centred on a world-space point. factor > 1 = zoom in. */
  zoom(factor, centreX, centreY) {
    const newW = this.width / factor;
    const newH = this.height / factor;
    // Keep (centreX, centreY) at the same relative position
    const ratioX = (centreX - this.minX) / this.width;
    const ratioY = (centreY - this.minY) / this.height;
    this.minX = centreX - ratioX * newW;
    this.maxX = centreX + (1 - ratioX) * newW;
    this.minY = centreY - ratioY * newH;
    this.maxY = centreY + (1 - ratioY) * newH;
  }

  /** Pan by a world-space delta. */
  pan(dx, dy) {
    this.minX += dx;
    this.maxX += dx;
    this.minY += dy;
    this.maxY += dy;
  }

  /**
   * Adjust viewport so world-units-per-pixel is equal in X and Y.
   * Expands the smaller dimension (centred) to match the larger one's scale.
   */
  equalizeScale(canvasW, canvasH) {
    const scaleX = this.width / canvasW;   // world units per pixel
    const scaleY = this.height / canvasH;
    if (scaleX > scaleY) {
      // X is coarser — expand Y to match
      const newH = scaleX * canvasH;
      const cy = (this.minY + this.maxY) / 2;
      this.minY = cy - newH / 2;
      this.maxY = cy + newH / 2;
    } else {
      // Y is coarser — expand X to match
      const newW = scaleY * canvasW;
      const cx = (this.minX + this.maxX) / 2;
      this.minX = cx - newW / 2;
      this.maxX = cx + newW / 2;
    }
  }
}
