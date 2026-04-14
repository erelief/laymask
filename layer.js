export class Layer {
  /**
   * @param {number} id - Unique layer ID
   * @param {number} w - Canvas width (from base image)
   * @param {number} h - Canvas height (from base image)
   */
  constructor(id, w, h) {
    this.id = id;
    this.name = `图层 ${id}`;

    // Off-screen canvases
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = w;
    this.maskCanvas.height = h;
    this.maskCtx = this.maskCanvas.getContext('2d');

    this.patternCanvas = document.createElement('canvas');
    this.patternCanvas.width = w;
    this.patternCanvas.height = h;
    this.patternCtx = this.patternCanvas.getContext('2d');

    // Pattern image reference
    this.patternImage = null;

    // Pattern settings (per-layer)
    this.patternScale = 100;
    this.patternOpacity = 100;
    this.patternOffsetX = 0;
    this.patternOffsetY = 0;
    this.patternAngle = 0;
    this.overallAngle = 0;

    // Mask state
    this.hasMask = false;
    this._maskCenter = null;

    // Visibility
    this.visible = true;

    // Blur mode (per-layer)
    this.isBlur = false;
  }

  /** Get the bounding-box center of the mask; cached until invalidated. */
  getMaskCenter() {
    if (this._maskCenter) return this._maskCenter;
    const w = this.maskCanvas.width;
    const h = this.maskCanvas.height;
    const data = this.maskCtx.getImageData(0, 0, w, h).data;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      const rowOff = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (data[rowOff + x * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) {
      this._maskCenter = { x: w / 2, y: h / 2 };
    } else {
      this._maskCenter = { x: (minX + maxX + 1) / 2, y: (minY + maxY + 1) / 2 };
    }
    return this._maskCenter;
  }

  invalidateMaskCenter() {
    this._maskCenter = null;
  }
}
