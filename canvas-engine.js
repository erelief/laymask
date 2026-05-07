import { Layer } from './layer.js';

export class CanvasEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Images
    this.baseImage = null;

    // Layers
    this.layers = [];
    this.activeLayerIndex = -1;
    this._layerIdCounter = 0;

    // Pointer-redirected references (always point to active layer's data)
    this.maskCanvas = null;
    this.maskCtx = null;
    this.patternCanvas = null;
    this.patternCtx = null;
    this.patternImage = null;
    this.patternScale = 100;
    this.patternOpacity = 100;
    this.patternOffsetX = 0;
    this.patternOffsetY = 0;
    this.patternAngle = 0;
    this.overallAngle = 0;
    this._hasMask = false;

    // Tool state
    this.currentTool = 'rect';
    this.shortSide = 0;
    this.brushPercent = 15;

    // Drawing state
    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.brushPoints = [];

    // Crop state
    this.isCropActive = false;
    this.cropRect = null;
    this._cropResizeHandle = null;   // 'n','s','e','w','nw','ne','sw','se' or null
    this._cropResizeStart = null;    // snapshot of cropRect at drag start

    // Undo/Redo (global)
    this.undoStack = [];
    this.redoStack = [];
    this.maxUndo = 20;

    // Display scale
    this.scale = 1;

    // Ready state
    this.ready = false;

    // Bind events
    this._boundMouseDown = this._onMouseDown.bind(this);
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._boundTouchStart = this._onTouchStart.bind(this);
    this._boundTouchMove = this._onTouchMove.bind(this);
    this._boundTouchEnd = this._onTouchEnd.bind(this);
    this._boundResize = this._resizeDisplay.bind(this);
    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundDblClick = this._onDblClick.bind(this);

    this._attachEvents();

    // Brush cursor overlay
    this._brushCursor = document.getElementById('brush-cursor');
    this._boundCursorMove = this._onCursorMove.bind(this);
    this._boundCursorLeave = this._onCursorLeave.bind(this);
    this.canvas.addEventListener('mousemove', this._boundCursorMove);
    this.canvas.addEventListener('mouseleave', this._boundCursorLeave);

    // Crop action buttons
    this._cropConfirmBtn = document.getElementById('crop-confirm');
    this._cropCancelBtn = document.getElementById('crop-cancel');
  }

  _attachEvents() {
    document.addEventListener('mousedown', this._boundMouseDown);
    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);

    this.canvas.addEventListener('touchstart', this._boundTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this._boundTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this._boundTouchEnd, { passive: false });

    window.addEventListener('resize', this._boundResize);
    window.addEventListener('keydown', this._boundKeyDown);
    this.canvas.addEventListener('dblclick', this._boundDblClick);
  }

  destroy() {
    document.removeEventListener('mousedown', this._boundMouseDown);
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);
    this.canvas.removeEventListener('touchstart', this._boundTouchStart);
    this.canvas.removeEventListener('touchmove', this._boundTouchMove);
    this.canvas.removeEventListener('touchend', this._boundTouchEnd);
    window.removeEventListener('resize', this._boundResize);
    window.removeEventListener('keydown', this._boundKeyDown);
    this.canvas.removeEventListener('dblclick', this._boundDblClick);
    this.canvas.removeEventListener('mousemove', this._boundCursorMove);
    this.canvas.removeEventListener('mouseleave', this._boundCursorLeave);
  }

  // --- Public API ---

  setBaseImage(img) {
    this.baseImage = img;
    this._initCanvases(img.naturalWidth, img.naturalHeight);
    this._checkReady();
  }

  setPatternImage(img) {
    this.patternImage = img;
    if (this.activeLayerIndex >= 0) {
      this.layers[this.activeLayerIndex].patternImage = img;
    }
    this._checkReady();
    if (this.ready) {
      this._renderToMain();
    }
  }

  setCurrentTool(tool) {
    if (this.currentTool === 'crop' && tool !== 'crop' && this.isCropActive) {
      this._cancelCrop();
    }
    this.currentTool = tool;
  }

  setBrushSize(percent) {
    this.brushPercent = percent;
    this.brushSize = (percent / 100) * this.shortSide;
  }

  setPatternScale(scale) {
    this.patternScale = scale;
    if (this.activeLayerIndex >= 0) {
      this.layers[this.activeLayerIndex].patternScale = scale;
    }
    if (this.ready) {
      this._composite();
      this._renderToMain();
    }
  }

  setPatternOpacity(percent) {
    this.patternOpacity = percent;
    if (this.activeLayerIndex >= 0) {
      this.layers[this.activeLayerIndex].patternOpacity = percent;
    }
    if (this.ready) {
      this._renderToMain();
    }
  }

  setPatternAngle(degrees) {
    this.patternAngle = ((degrees % 360) + 360) % 360;
    if (this.activeLayerIndex >= 0) {
      this.layers[this.activeLayerIndex].patternAngle = this.patternAngle;
    }
    if (this.ready) {
      this._composite();
      this._renderToMain();
    }
  }

  setOverallAngle(degrees) {
    this.overallAngle = ((degrees % 360) + 360) % 360;
    if (this.activeLayerIndex >= 0) {
      this.layers[this.activeLayerIndex].overallAngle = this.overallAngle;
    }
    if (this.ready) {
      this._composite();
      this._renderToMain();
    }
  }

  // --- Layer Management ---

  addLayer() {
    if (!this.baseImage) return null;
    if (this.layers.length >= 10) return null;

    const id = ++this._layerIdCounter;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const layer = new Layer(id, w, h);
    // Inherit pattern image from the currently active layer
    if (this.activeLayerIndex >= 0) {
      const src = this.layers[this.activeLayerIndex];
      if (src) {
        layer.patternImage = src.patternImage;
        layer.patternScale = src.patternScale;
        layer.patternOpacity = src.patternOpacity;
        layer.patternAngle = src.patternAngle;
        layer.overallAngle = src.overallAngle;
        layer.isBlur = src.isBlur;
      }
    }
    this.layers.push(layer);

    // Push undo entry
    this.undoStack.push({ type: 'layer-added', layerIndex: this.layers.length - 1 });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];

    this.setActiveLayer(this.layers.length - 1);
    return layer;
  }

  deleteLayer(index) {
    if (this.layers.length <= 1) return false;
    if (index < 0 || index >= this.layers.length) return false;

    const deletedLayer = this.layers[index];

    // Save full snapshot for undo
    const snapshot = {
      maskData: deletedLayer.maskCtx.getImageData(0, 0, deletedLayer.maskCanvas.width, deletedLayer.maskCanvas.height),
      patternImage: deletedLayer.patternImage,
      patternScale: deletedLayer.patternScale,
      patternOpacity: deletedLayer.patternOpacity,
      patternOffsetX: deletedLayer.patternOffsetX,
      patternOffsetY: deletedLayer.patternOffsetY,
      patternAngle: deletedLayer.patternAngle,
      overallAngle: deletedLayer.overallAngle,
      hasMask: deletedLayer.hasMask,
      name: deletedLayer.name,
      id: deletedLayer.id,
    };

    this.undoStack.push({ type: 'layer-deleted', layerIndex: index, layerSnapshot: snapshot });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];

    this.layers.splice(index, 1);

    if (this.activeLayerIndex >= this.layers.length) {
      this.activeLayerIndex = this.layers.length - 1;
    } else if (this.activeLayerIndex > index) {
      this.activeLayerIndex--;
    } else if (this.activeLayerIndex === index) {
      // Deleted the active layer — activate adjacent
      if (this.activeLayerIndex >= this.layers.length) {
        this.activeLayerIndex = this.layers.length - 1;
      }
    }

    this._loadActiveLayerState();
    this._renderToMain();
    this._emitMaskChanged();
    return true;
  }

  moveLayerUp(index) {
    if (index >= this.layers.length - 1) return false;
    const temp = this.layers[index];
    this.layers[index] = this.layers[index + 1];
    this.layers[index + 1] = temp;
    if (this.activeLayerIndex === index) this.activeLayerIndex = index + 1;
    else if (this.activeLayerIndex === index + 1) this.activeLayerIndex = index;
    this._renderToMain();
    this._emitMaskChanged();
    return true;
  }

  moveLayerDown(index) {
    if (index <= 0) return false;
    return this.moveLayerUp(index - 1);
  }

  setActiveLayer(index) {
    if (index < 0 || index >= this.layers.length) return;
    if (index === this.activeLayerIndex) return;

    this._saveCurrentLayerState();
    this.activeLayerIndex = index;
    this._loadActiveLayerState();
    this._renderToMain();
    this._emitMaskChanged();
  }

  _loadActiveLayerState() {
    if (this.activeLayerIndex < 0 || !this.layers[this.activeLayerIndex]) return;
    const layer = this.layers[this.activeLayerIndex];

    this.maskCanvas = layer.maskCanvas;
    this.maskCtx = layer.maskCtx;
    this.patternCanvas = layer.patternCanvas;
    this.patternCtx = layer.patternCtx;
    this.patternImage = layer.patternImage;
    this.patternScale = layer.patternScale;
    this.patternOpacity = layer.patternOpacity;
    this.patternOffsetX = layer.patternOffsetX;
    this.patternOffsetY = layer.patternOffsetY;
    this.patternAngle = layer.patternAngle;
    this.overallAngle = layer.overallAngle;
    this._hasMask = layer.hasMask;
  }

  _saveCurrentLayerState() {
    if (this.activeLayerIndex < 0 || !this.layers[this.activeLayerIndex]) return;
    const layer = this.layers[this.activeLayerIndex];
    layer.patternImage = this.patternImage;
    layer.patternScale = this.patternScale;
    layer.patternOpacity = this.patternOpacity;
    layer.patternOffsetX = this.patternOffsetX;
    layer.patternOffsetY = this.patternOffsetY;
    layer.patternAngle = this.patternAngle;
    layer.overallAngle = this.overallAngle;
    layer.hasMask = this._hasMask;
  }

  // --- Undo / Redo (global, typed) ---

  undo() {
    if (this.undoStack.length === 0) return false;
    const entry = this.undoStack.pop();

    // Capture current state for redo
    this._pushRedoForUndoEntry(entry);

    this._applyUndoEntry(entry);
    this._renderToMain();
    this._emitMaskChanged();
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    const entry = this.redoStack.pop();

    // Capture current state for undo
    this._pushUndoForRedoEntry(entry);

    this._applyRedoEntry(entry);
    this._renderToMain();
    this._emitMaskChanged();
    return true;
  }

  _pushRedoForUndoEntry(entry) {
    switch (entry.type) {
      case 'mask':
      case 'settings': {
        const layer = this.layers[entry.layerIndex];
        if (layer) {
          this.redoStack.push({
            type: entry.type,
            layerIndex: entry.layerIndex,
            maskData: layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height),
            patternAngle: layer.patternAngle,
            overallAngle: layer.overallAngle,
            patternOffsetX: layer.patternOffsetX,
            patternOffsetY: layer.patternOffsetY,
            patternScale: layer.patternScale,
            patternOpacity: layer.patternOpacity,
          });
        }
        break;
      }
      case 'layer-added': {
        // Undo of "layer added" = delete the layer. Redo = re-add it.
        // We need the layer's data to recreate it on redo.
        const layer = this.layers[entry.layerIndex];
        if (layer) {
          this.redoStack.push({
            type: 'layer-added',
            layerIndex: entry.layerIndex,
            layerSnapshot: {
              maskData: layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height),
              patternImage: layer.patternImage,
              patternScale: layer.patternScale,
              patternOpacity: layer.patternOpacity,
              patternOffsetX: layer.patternOffsetX,
              patternOffsetY: layer.patternOffsetY,
              patternAngle: layer.patternAngle,
              overallAngle: layer.overallAngle,
              hasMask: layer.hasMask,
              name: layer.name,
              id: layer.id,
            },
          });
        }
        break;
      }
      case 'layer-deleted': {
        // Undo of "layer deleted" = re-insert. Redo = delete again.
        this.redoStack.push({ type: 'layer-deleted', layerIndex: entry.layerIndex });
        break;
      }
      case 'crop': {
        this.redoStack.push({
          type: 'crop',
          oldWidth: this.canvas.width,
          oldHeight: this.canvas.height,
          oldBaseImage: this._cloneBaseImage(),
          layers: this.layers.map(l => this._snapshotLayer(l)),
          activeLayerIndex: this.activeLayerIndex,
        });
        break;
      }
    }
    if (this.redoStack.length > this.maxUndo) this.redoStack.shift();
  }

  _pushUndoForRedoEntry(entry) {
    switch (entry.type) {
      case 'mask':
      case 'settings': {
        const layer = this.layers[entry.layerIndex];
        if (layer) {
          this.undoStack.push({
            type: entry.type,
            layerIndex: entry.layerIndex,
            maskData: layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height),
            patternAngle: layer.patternAngle,
            overallAngle: layer.overallAngle,
            patternOffsetX: layer.patternOffsetX,
            patternOffsetY: layer.patternOffsetY,
            patternScale: layer.patternScale,
            patternOpacity: layer.patternOpacity,
          });
        }
        break;
      }
      case 'layer-added': {
        const layer = this.layers[entry.layerIndex];
        if (layer) {
          this.undoStack.push({
            type: 'layer-added',
            layerIndex: entry.layerIndex,
            layerSnapshot: {
              maskData: layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height),
              patternImage: layer.patternImage,
              patternScale: layer.patternScale,
              patternOpacity: layer.patternOpacity,
              patternOffsetX: layer.patternOffsetX,
              patternOffsetY: layer.patternOffsetY,
              patternAngle: layer.patternAngle,
              overallAngle: layer.overallAngle,
              hasMask: layer.hasMask,
              name: layer.name,
              id: layer.id,
            },
          });
        }
        break;
      }
      case 'layer-deleted': {
        this.undoStack.push({ type: 'layer-deleted', layerIndex: entry.layerIndex, layerSnapshot: entry.layerSnapshot });
        break;
      }
      case 'crop': {
        this.undoStack.push({
          type: 'crop',
          oldWidth: this.canvas.width,
          oldHeight: this.canvas.height,
          oldBaseImage: this._cloneBaseImage(),
          layers: this.layers.map(l => this._snapshotLayer(l)),
          activeLayerIndex: this.activeLayerIndex,
        });
        break;
      }
    }
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
  }

  _applyUndoEntry(entry) {
    switch (entry.type) {
      case 'mask':
      case 'settings': {
        const layer = this.layers[entry.layerIndex];
        if (!layer) break;
        layer.maskCtx.putImageData(entry.maskData, 0, 0);
        layer.patternAngle = entry.patternAngle;
        layer.overallAngle = entry.overallAngle;
        layer.patternOffsetX = entry.patternOffsetX;
        layer.patternOffsetY = entry.patternOffsetY;
        layer.patternScale = entry.patternScale;
        layer.patternOpacity = entry.patternOpacity;
        layer.hasMask = this._checkLayerHasMask(layer);
        layer.invalidateMaskCenter();
        // If the affected layer is active, refresh redirected pointers
        if (entry.layerIndex === this.activeLayerIndex) {
          this._loadActiveLayerState();
        }
        break;
      }
      case 'layer-added': {
        // Undo add = remove the layer
        this.layers.splice(entry.layerIndex, 1);
        if (this.activeLayerIndex >= this.layers.length) {
          this.activeLayerIndex = this.layers.length - 1;
        } else if (this.activeLayerIndex > entry.layerIndex) {
          this.activeLayerIndex--;
        }
        if (this.activeLayerIndex < 0 && this.layers.length > 0) {
          this.activeLayerIndex = 0;
        }
        this._loadActiveLayerState();
        break;
      }
      case 'layer-deleted': {
        // Undo delete = re-insert the layer
        const snap = entry.layerSnapshot;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const layer = new Layer(snap.id, w, h);
        layer.name = snap.name;
        layer.maskCtx.putImageData(snap.maskData, 0, 0);
        layer.patternImage = snap.patternImage;
        layer.patternScale = snap.patternScale;
        layer.patternOpacity = snap.patternOpacity;
        layer.patternOffsetX = snap.patternOffsetX;
        layer.patternOffsetY = snap.patternOffsetY;
        layer.patternAngle = snap.patternAngle;
        layer.overallAngle = snap.overallAngle;
        layer.hasMask = snap.hasMask;
        this.layers.splice(entry.layerIndex, 0, layer);
        // Update activeLayerIndex if needed
        if (this.activeLayerIndex >= entry.layerIndex) {
          this.activeLayerIndex++;
        }
        this._loadActiveLayerState();
        break;
      }
      case 'crop': {
        this.baseImage = entry.oldBaseImage;
        this.canvas.width = entry.oldWidth;
        this.canvas.height = entry.oldHeight;
        this.shortSide = Math.min(entry.oldWidth, entry.oldHeight);
        this.isCropActive = false;
        this.cropRect = null;
        this._restoreLayersFromSnapshots(entry.layers, entry.activeLayerIndex);
        this._resizeDisplay();
        break;
      }
    }
  }

  _applyRedoEntry(entry) {
    switch (entry.type) {
      case 'mask':
      case 'settings': {
        const layer = this.layers[entry.layerIndex];
        if (!layer) break;
        layer.maskCtx.putImageData(entry.maskData, 0, 0);
        layer.patternAngle = entry.patternAngle;
        layer.overallAngle = entry.overallAngle;
        layer.patternOffsetX = entry.patternOffsetX;
        layer.patternOffsetY = entry.patternOffsetY;
        layer.patternScale = entry.patternScale;
        layer.patternOpacity = entry.patternOpacity;
        layer.hasMask = this._checkLayerHasMask(layer);
        layer.invalidateMaskCenter();
        if (entry.layerIndex === this.activeLayerIndex) {
          this._loadActiveLayerState();
        }
        break;
      }
      case 'layer-added': {
        // Redo add = re-insert the layer from snapshot
        const snap = entry.layerSnapshot;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const layer = new Layer(snap.id, w, h);
        layer.name = snap.name;
        layer.maskCtx.putImageData(snap.maskData, 0, 0);
        layer.patternImage = snap.patternImage;
        layer.patternScale = snap.patternScale;
        layer.patternOpacity = snap.patternOpacity;
        layer.patternOffsetX = snap.patternOffsetX;
        layer.patternOffsetY = snap.patternOffsetY;
        layer.patternAngle = snap.patternAngle;
        layer.overallAngle = snap.overallAngle;
        layer.hasMask = snap.hasMask;
        this.layers.splice(entry.layerIndex, 0, layer);
        if (this.activeLayerIndex >= entry.layerIndex) {
          this.activeLayerIndex++;
        }
        this._loadActiveLayerState();
        break;
      }
      case 'layer-deleted': {
        // Redo delete = remove the layer again
        this.layers.splice(entry.layerIndex, 1);
        if (this.activeLayerIndex >= this.layers.length) {
          this.activeLayerIndex = this.layers.length - 1;
        } else if (this.activeLayerIndex > entry.layerIndex) {
          this.activeLayerIndex--;
        }
        if (this.activeLayerIndex < 0 && this.layers.length > 0) {
          this.activeLayerIndex = 0;
        }
        this._loadActiveLayerState();
        break;
      }
      case 'crop': {
        this.baseImage = entry.oldBaseImage;
        this.canvas.width = entry.oldWidth;
        this.canvas.height = entry.oldHeight;
        this.shortSide = Math.min(entry.oldWidth, entry.oldHeight);
        this.isCropActive = false;
        this.cropRect = null;
        this._restoreLayersFromSnapshots(entry.layers, entry.activeLayerIndex);
        this._resizeDisplay();
        break;
      }
    }
  }

  _adjustOffsetForMaskCenterChange(layer) {
    if (!layer.patternImage) return;
    const theta = layer.overallAngle * Math.PI / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const oldCenter = layer._maskCenter || { x: layer.maskCanvas.width / 2, y: layer.maskCanvas.height / 2 };
    layer.invalidateMaskCenter();
    const newCenter = layer.getMaskCenter();
    const dcx = oldCenter.x - newCenter.x;
    const dcy = oldCenter.y - newCenter.y;
    layer.patternOffsetX += dcx * (1 - cosT) + dcy * sinT;
    layer.patternOffsetY += -dcx * sinT + dcy * (1 - cosT);
    if (this.activeLayerIndex >= 0 && this.layers[this.activeLayerIndex] === layer) {
      this.patternOffsetX = layer.patternOffsetX;
      this.patternOffsetY = layer.patternOffsetY;
    }
  }

  _checkLayerHasMask(layer) {
    const data = layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clearMask() {
    if (this.layers.length === 0 || this.activeLayerIndex < 0) return;
    const layer = this.layers[this.activeLayerIndex];

    // Save undo (single-layer mask entry)
    this.undoStack.push({
      type: 'mask',
      layerIndex: this.activeLayerIndex,
      maskData: layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height),
      patternAngle: layer.patternAngle,
      overallAngle: layer.overallAngle,
      patternOffsetX: layer.patternOffsetX,
      patternOffsetY: layer.patternOffsetY,
      patternScale: layer.patternScale,
      patternOpacity: layer.patternOpacity,
    });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];

    // Clear only the active layer
    layer.maskCtx.clearRect(0, 0, layer.maskCanvas.width, layer.maskCanvas.height);
    layer.hasMask = false;
    this._adjustOffsetForMaskCenterChange(layer);
    this._hasMask = false;
    this._composite();
    this._renderToMain();
    this._emitMaskChanged();
  }

  selectAll() {
    if (!this.maskCanvas || !this.ready) return;
    this._saveMaskState();
    this.maskCtx.fillStyle = '#000000';
    this.maskCtx.fillRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    this._hasMask = true;
    if (this.activeLayerIndex >= 0) {
      this.layers[this.activeLayerIndex].hasMask = true;
      this._adjustOffsetForMaskCenterChange(this.layers[this.activeLayerIndex]);
    }
    this._composite();
    this._renderToMain();
    this._emitMaskChanged();
  }

  renderFinal() {
    this._renderToMain();
  }

  getDataURL() {
    this.renderFinal();
    return this.canvas.toDataURL('image/png');
  }

  getLayersDataURL() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d');

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (!layer.patternImage || !layer.hasMask || !layer.visible) continue;
      this._compositeLayer(layer);
      ctx.globalAlpha = layer.patternOpacity / 100;
      ctx.drawImage(layer.patternCanvas, 0, 0);
    }
    ctx.globalAlpha = 1;

    return offscreen.toDataURL('image/png');
  }

  // --- Canvas Init ---

  _initCanvases(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.shortSide = Math.min(w, h);

    // Preserve pattern image across canvas reset
    const savedPatternImage = this.patternImage;

    // Reset layers
    this.layers = [];
    this.activeLayerIndex = -1;
    this._layerIdCounter = 0;

    // Create default first layer
    const defaultLayer = new Layer(++this._layerIdCounter, w, h);
    // Restore pattern image to the new layer if one was already loaded
    if (savedPatternImage) {
      defaultLayer.patternImage = savedPatternImage;
    }
    this.layers.push(defaultLayer);
    this.activeLayerIndex = 0;
    this._loadActiveLayerState();

    // Clear undo/redo
    this.undoStack = [];
    this.redoStack = [];

    this._resizeDisplay();

    // Draw base image
    this.ctx.drawImage(this.baseImage, 0, 0);
  }

  _checkReady() {
    this.ready = !!(this.baseImage && this.patternImage);
    this._emitReadyChanged();
  }

  // --- Responsive Display ---

  _resizeDisplay() {
    if (!this.canvas.width || !this.canvas.height) return;
    const workspace = document.getElementById('workspace');
    if (!workspace) return;

    const containerW = workspace.clientWidth - 40;
    const containerH = workspace.clientHeight - 40;
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;

    this.scale = Math.min(containerW / canvasW, containerH / canvasH, 1);
    this.canvas.style.width = Math.round(canvasW * this.scale) + 'px';
    this.canvas.style.height = Math.round(canvasH * this.scale) + 'px';
    if (this.isCropActive) this._updateCropButtons();
  }

  // --- Coordinate Mapping ---

  _getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  _onCursorMove(e) {
    this._cursorClientX = e.clientX;
    this._cursorClientY = e.clientY;
    this._updateBrushCursor();
    this._updateCropCursor(e);
  }

  _onCursorLeave() {
    if (this._brushCursor) this._brushCursor.classList.remove('visible');
  }

  _updateBrushCursor() {
    if (!this._brushCursor) return;
    if (this.currentTool !== 'brush' && this.currentTool !== 'eraser') {
      this._brushCursor.classList.remove('visible');
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const brushPx = this.brushSize / (this.canvas.width / rect.width);
    this._brushCursor.style.width = brushPx + 'px';
    this._brushCursor.style.height = brushPx + 'px';
    this._brushCursor.style.left = this._cursorClientX + 'px';
    this._brushCursor.style.top = this._cursorClientY + 'px';
    this._brushCursor.classList.add('visible');
  }

  refreshBrushCursor() {
    this._updateBrushCursor();
  }

  _updateCropCursor(e) {
    if (this.currentTool !== 'crop' || !this.isCropActive || this.isDrawing) return;
    const { x, y } = this._getCanvasCoords(e);
    const cursor = this._getCropResizeCursor(x, y);
    this.canvas.style.cursor = cursor || 'crosshair';
  }

  // --- Mouse Handlers ---

  _onMouseDown(e) {
    if (!this.baseImage) return;
    if (this.currentTool !== 'crop' && !this.ready) return;
    if (e.target.closest('#toolbar')) return;
    if (e.target.closest('.modal-overlay')) return;
    if (e.target.closest('.brush-size-dropdown')) return;
    if (e.target.closest('#layers-panel')) return;
    if (e.target.closest('.crop-action-btn')) return;
    if (this.currentTool === 'move-pattern' && !this._hasMask) return;

    // Crop tool
    if (this.currentTool === 'crop') {
      e.preventDefault();
      const { x, y } = this._getCanvasCoords(e);
      // Check if clicking on a resize handle
      if (this.isCropActive && this.cropRect) {
        const handle = this._getCropResizeHandle(x, y);
        if (handle) {
          this.isDrawing = true;
          this._cropResizeHandle = handle;
          this._cropResizeStart = { ...this.cropRect, mx: x, my: y };
          return;
        }
      }
      // Start a new crop rectangle
      if (this.isCropActive) {
        this._cancelCrop();
      }
      this.isDrawing = true;
      this.startX = x;
      this.startY = y;
      this.currentX = x;
      this.currentY = y;
      return;
    }

    e.preventDefault();
    this.isDrawing = true;
    const { x, y } = this._getCanvasCoords(e);
    this.startX = x;
    this.startY = y;
    this.currentX = x;
    this.currentY = y;
    this.brushPoints = [{ x, y }];

    if (this.currentTool === 'move-pattern') {
      this._moveStartOffsetX = this.patternOffsetX;
      this._moveStartOffsetY = this.patternOffsetY;
      this.canvas.classList.add('cursor-move-active');
    }
  }

  _onMouseMove(e) {
    if (!this.isDrawing) return;
    const { x, y } = this._getCanvasCoords(e);
    this.currentX = x;
    this.currentY = y;

    if (this.currentTool === 'crop') {
      if (this._cropResizeHandle) {
        this._resizeCrop(x, y);
      } else {
        const cx = Math.max(0, Math.min(this.currentX, this.canvas.width));
        const cy = Math.max(0, Math.min(this.currentY, this.canvas.height));
        const sx = Math.max(0, Math.min(this.startX, this.canvas.width));
        const sy = Math.max(0, Math.min(this.startY, this.canvas.height));
        this.cropRect = {
          x: Math.min(sx, cx),
          y: Math.min(sy, cy),
          w: Math.abs(cx - sx),
          h: Math.abs(cy - sy),
        };
      }
      this._drawCropPreview();
      if (this.isCropActive) this._updateCropButtons();
      return;
    }

    if (this.currentTool === 'move-pattern') {
      const dx = this.currentX - this.startX;
      const dy = this.currentY - this.startY;
      this.patternOffsetX = this._moveStartOffsetX + dx;
      this.patternOffsetY = this._moveStartOffsetY + dy;
      if (this.activeLayerIndex >= 0) {
        this.layers[this.activeLayerIndex].patternOffsetX = this.patternOffsetX;
        this.layers[this.activeLayerIndex].patternOffsetY = this.patternOffsetY;
      }
      this._composite();
      this._renderToMain();
      return;
    }

    if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
      this.brushPoints.push({ x, y });
    }
    this._drawPreview();
  }

  _onMouseUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.canvas.classList.remove('cursor-move-active');

    const { x, y } = this._getCanvasCoords(e);
    this.currentX = x;
    this.currentY = y;

    if (this.currentTool === 'crop') {
      this._cropResizeHandle = null;
      this._cropResizeStart = null;
      if (this.cropRect && this.cropRect.w >= 5 && this.cropRect.h >= 5) {
        this.isCropActive = true;
        this._drawCropPreview();
        this._updateCropButtons();
      } else {
        this._cancelCrop();
      }
      return;
    }

    if (this.currentTool === 'move-pattern') {
      return; // Offset already applied during mousemove
    }

    // Skip tiny shapes
    const dx = Math.abs(this.currentX - this.startX);
    const dy = Math.abs(this.currentY - this.startY);
    if (this.currentTool !== 'brush' && this.currentTool !== 'eraser' && dx < 3 && dy < 3) return;
    if ((this.currentTool === 'brush' || this.currentTool === 'eraser') && this.brushPoints.length < 2) return;

    this._saveMaskState();
    this._drawOnMask();
    this._hasMask = true;
    if (this.activeLayerIndex >= 0) {
      this.layers[this.activeLayerIndex].hasMask = true;
      this._adjustOffsetForMaskCenterChange(this.layers[this.activeLayerIndex]);
    }
    this._composite();
    this._renderToMain();
    this._emitMaskChanged();
  }

  // --- Double-click ---

  _onDblClick(e) {
    if (this.currentTool === 'crop' && this.isCropActive) {
      this._applyCrop();
    }
  }

  // --- Touch Handlers ---

  _onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this._boundMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {} });
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this._boundMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }

  _onTouchEnd(e) {
    e.preventDefault();
    if (e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      this._boundMouseUp({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }

  // --- Keyboard ---

  _onKeyDown(e) {
    if (this.currentTool === 'crop' && this.isCropActive) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._applyCrop();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this._cancelCrop();
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
      this._emitMaskChanged();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      this.redo();
      this._emitMaskChanged();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Z') {
      e.preventDefault();
      this.redo();
      this._emitMaskChanged();
    }
  }

  // --- Preview ---

  _drawPreview() {
    if (this.currentTool === 'crop') {
      this._drawCropPreview();
      return;
    }
    this._renderToMain();

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.7)';
    ctx.fillStyle = 'rgba(233, 69, 96, 0.15)';
    ctx.lineWidth = 2 / this.scale;
    ctx.setLineDash([]);

    if (this.currentTool === 'rect') {
      const x = Math.min(this.startX, this.currentX);
      const y = Math.min(this.startY, this.currentY);
      const w = Math.abs(this.currentX - this.startX);
      const h = Math.abs(this.currentY - this.startY);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    } else if (this.currentTool === 'ellipse') {
      const cx = (this.startX + this.currentX) / 2;
      const cy = (this.startY + this.currentY) / 2;
      const rx = Math.abs(this.currentX - this.startX) / 2;
      const ry = Math.abs(this.currentY - this.startY) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (this.currentTool === 'brush' && this.brushPoints.length > 1) {
      ctx.lineWidth = this.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(233, 69, 96, 0.5)';
      ctx.beginPath();
      ctx.moveTo(this.brushPoints[0].x, this.brushPoints[0].y);
      for (let i = 1; i < this.brushPoints.length; i++) {
        ctx.lineTo(this.brushPoints[i].x, this.brushPoints[i].y);
      }
      ctx.stroke();
    } else if (this.currentTool === 'eraser' && this.brushPoints.length > 1) {
      ctx.lineWidth = this.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.moveTo(this.brushPoints[0].x, this.brushPoints[0].y);
      for (let i = 1; i < this.brushPoints.length; i++) {
        ctx.lineTo(this.brushPoints[i].x, this.brushPoints[i].y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  _getCropResizeHandle(px, py) {
    if (!this.cropRect) return null;
    const { x, y, w, h } = this.cropRect;
    const threshold = 8 / this.scale; // 8 CSS pixels
    const nearLeft   = Math.abs(px - x) < threshold;
    const nearRight  = Math.abs(px - (x + w)) < threshold;
    const nearTop    = Math.abs(py - y) < threshold;
    const nearBottom = Math.abs(py - (y + h)) < threshold;
    const insideX = px >= x - threshold && px <= x + w + threshold;
    const insideY = py >= y - threshold && py <= y + h + threshold;

    if (nearTop && nearLeft)     return 'nw';
    if (nearTop && nearRight)    return 'ne';
    if (nearBottom && nearLeft)  return 'sw';
    if (nearBottom && nearRight) return 'se';
    if (nearTop && insideX)      return 'n';
    if (nearBottom && insideX)   return 's';
    if (nearLeft && insideY)     return 'w';
    if (nearRight && insideY)    return 'e';
    return null;
  }

  _getCropResizeCursor(px, py) {
    const handle = this._getCropResizeHandle(px, py);
    const cursors = {
      n: 'ns-resize', s: 'ns-resize',
      e: 'ew-resize', w: 'ew-resize',
      nw: 'nwse-resize', se: 'nwse-resize',
      ne: 'nesw-resize', sw: 'nesw-resize',
    };
    return cursors[handle] || null;
  }

  _resizeCrop(px, py) {
    const s = this._cropResizeStart;
    const dx = px - s.mx;
    const dy = py - s.my;
    const handle = this._cropResizeHandle;
    let { x, y, w, h } = s;

    if (handle.includes('w')) { x = s.x + dx; w = s.w - dx; }
    if (handle.includes('e')) { w = s.w + dx; }
    if (handle.includes('n')) { y = s.y + dy; h = s.h - dy; }
    if (handle.includes('s')) { h = s.h + dy; }

    // Normalize (allow flipping)
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }

    // Clamp to canvas
    x = Math.max(0, x);
    y = Math.max(0, y);
    w = Math.min(w, this.canvas.width - x);
    h = Math.min(h, this.canvas.height - y);

    this.cropRect = { x, y, w, h };
  }

  _drawCropPreview() {
    if (!this.cropRect) return;
    this._renderToMain();
    if (this.isCropActive) this._updateCropButtons();

    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const { x, y, w, h } = this.cropRect;

    ctx.save();
    // Darkened overlay outside crop area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, cw, y);           // top
    ctx.fillRect(0, y + h, cw, ch - y - h); // bottom
    ctx.fillRect(0, y, x, h);            // left
    ctx.fillRect(x + w, y, cw - x - w, h); // right

    // Crop border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1.5 / this.scale;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, w, h);

    // Rule of thirds
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 0.5 / this.scale;
    ctx.beginPath();
    ctx.moveTo(x + w / 3, y); ctx.lineTo(x + w / 3, y + h);
    ctx.moveTo(x + 2 * w / 3, y); ctx.lineTo(x + 2 * w / 3, y + h);
    ctx.moveTo(x, y + h / 3); ctx.lineTo(x + w, y + h / 3);
    ctx.moveTo(x, y + 2 * h / 3); ctx.lineTo(x + w, y + 2 * h / 3);
    ctx.stroke();

    // Corner handles
    const handleLen = Math.min(16, w / 4, h / 4) / this.scale;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2.5 / this.scale;
    ctx.beginPath();
    ctx.moveTo(x, y + handleLen); ctx.lineTo(x, y); ctx.lineTo(x + handleLen, y);
    ctx.moveTo(x + w - handleLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + handleLen);
    ctx.moveTo(x, y + h - handleLen); ctx.lineTo(x, y + h); ctx.lineTo(x + handleLen, y + h);
    ctx.moveTo(x + w - handleLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - handleLen);
    ctx.stroke();

    ctx.restore();
  }

  // --- Crop Apply / Cancel ---

  _applyCrop() {
    if (!this.isCropActive || !this.cropRect) return;

    let { x, y, w, h } = this.cropRect;
    x = Math.max(0, Math.round(x));
    y = Math.max(0, Math.round(y));
    w = Math.min(this.canvas.width - x, Math.round(w));
    h = Math.min(this.canvas.height - y, Math.round(h));
    if (w < 2 || h < 2) { this._cancelCrop(); return; }

    // Save full undo snapshot
    const undoEntry = {
      type: 'crop',
      oldWidth: this.canvas.width,
      oldHeight: this.canvas.height,
      oldBaseImage: this._cloneBaseImage(),
      layers: this.layers.map(layer => this._snapshotLayer(layer)),
      activeLayerIndex: this.activeLayerIndex,
    };
    this.undoStack.push(undoEntry);
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];

    this._executeCrop(x, y, w, h);
  }

  _executeCrop(x, y, w, h) {
    // Create cropped base image as canvas element
    const croppedBase = document.createElement('canvas');
    croppedBase.width = w;
    croppedBase.height = h;
    const cCtx = croppedBase.getContext('2d');
    cCtx.drawImage(this.baseImage, x, y, w, h, 0, 0, w, h);
    this.baseImage = croppedBase;

    // Resize main canvas
    this.canvas.width = w;
    this.canvas.height = h;
    this.shortSide = Math.min(w, h);

    // Recreate each layer with cropped data
    const newLayers = [];
    for (let i = 0; i < this.layers.length; i++) {
      const old = this.layers[i];
      const layer = new Layer(old.id, w, h);
      layer.name = old.name;
      layer.patternImage = old.patternImage;
      layer.patternScale = old.patternScale;
      layer.patternOpacity = old.patternOpacity;
      layer.patternAngle = old.patternAngle;
      layer.overallAngle = old.overallAngle;
      layer.visible = old.visible;
      layer.isBlur = old.isBlur;
      layer.patternOffsetX = old.patternOffsetX - x;
      layer.patternOffsetY = old.patternOffsetY - y;

      // Crop the mask
      layer.maskCtx.drawImage(old.maskCanvas, x, y, w, h, 0, 0, w, h);
      layer.hasMask = this._checkLayerHasMask(layer);
      layer.invalidateMaskCenter();

      newLayers.push(layer);
    }

    this.layers = newLayers;
    this._loadActiveLayerState();
    this.isCropActive = false;
    this.cropRect = null;
    this._updateCropButtons();
    this._resizeDisplay();
    this._renderToMain();
    this._emitMaskChanged();
  }

  _cancelCrop() {
    this.isCropActive = false;
    this.cropRect = null;
    this.isDrawing = false;
    this._updateCropButtons();
    this._renderToMain();
  }

  _updateCropButtons() {
    if (!this.isCropActive || !this.cropRect) {
      this._cropConfirmBtn.classList.remove('visible');
      this._cropCancelBtn.classList.remove('visible');
      return;
    }
    const workspace = document.getElementById('workspace');
    const wsRect = workspace.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const { x, y, w, h } = this.cropRect;

    // Canvas position within workspace
    const offsetX = canvasRect.left - wsRect.left;
    const offsetY = canvasRect.top - wsRect.top;

    // Crop rect in workspace coordinates
    const cx = offsetX + x * this.scale;
    const cy = offsetY + y * this.scale;
    const cw = w * this.scale;
    const ch = h * this.scale;

    const gap = 4;
    const btnW = 30;
    const rightEdge = cx + cw;
    const bottomEdge = cy + ch;

    this._cropCancelBtn.style.left = (rightEdge - btnW * 2 - gap) + 'px';
    this._cropCancelBtn.style.top = (bottomEdge + gap) + 'px';
    this._cropConfirmBtn.style.left = (rightEdge - btnW) + 'px';
    this._cropConfirmBtn.style.top = (bottomEdge + gap) + 'px';

    this._cropConfirmBtn.classList.add('visible');
    this._cropCancelBtn.classList.add('visible');
  }

  _cloneBaseImage() {
    const clone = document.createElement('canvas');
    const src = this.baseImage;
    clone.width = src.naturalWidth !== undefined ? src.naturalWidth : src.width;
    clone.height = src.naturalHeight !== undefined ? src.naturalHeight : src.height;
    clone.getContext('2d').drawImage(src, 0, 0);
    return clone;
  }

  _snapshotLayer(layer) {
    return {
      maskData: layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height),
      patternImage: layer.patternImage,
      patternScale: layer.patternScale,
      patternOpacity: layer.patternOpacity,
      patternOffsetX: layer.patternOffsetX,
      patternOffsetY: layer.patternOffsetY,
      patternAngle: layer.patternAngle,
      overallAngle: layer.overallAngle,
      hasMask: layer.hasMask,
      name: layer.name,
      id: layer.id,
      visible: layer.visible,
      isBlur: layer.isBlur,
    };
  }

  _restoreLayersFromSnapshots(snapshots, activeIdx) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.layers = [];
    for (const snap of snapshots) {
      const layer = new Layer(snap.id, w, h);
      layer.name = snap.name;
      layer.maskCtx.putImageData(snap.maskData, 0, 0);
      layer.patternImage = snap.patternImage;
      layer.patternScale = snap.patternScale;
      layer.patternOpacity = snap.patternOpacity;
      layer.patternOffsetX = snap.patternOffsetX;
      layer.patternOffsetY = snap.patternOffsetY;
      layer.patternAngle = snap.patternAngle;
      layer.overallAngle = snap.overallAngle;
      layer.hasMask = snap.hasMask;
      layer.visible = snap.visible;
      layer.isBlur = snap.isBlur;
      this.layers.push(layer);
    }
    this.activeLayerIndex = activeIdx;
    this._loadActiveLayerState();
  }

  // --- Draw on Mask ---

  _drawOnMask() {
    const ctx = this.maskCtx;
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';

    if (this.currentTool === 'rect') {
      const x = Math.min(this.startX, this.currentX);
      const y = Math.min(this.startY, this.currentY);
      const w = Math.abs(this.currentX - this.startX);
      const h = Math.abs(this.currentY - this.startY);
      ctx.fillRect(x, y, w, h);
    } else if (this.currentTool === 'ellipse') {
      const cx = (this.startX + this.currentX) / 2;
      const cy = (this.startY + this.currentY) / 2;
      const rx = Math.abs(this.currentX - this.startX) / 2;
      const ry = Math.abs(this.currentY - this.startY) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.currentTool === 'brush') {
      ctx.lineWidth = this.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(this.brushPoints[0].x, this.brushPoints[0].y);
      for (let i = 1; i < this.brushPoints.length; i++) {
        ctx.lineTo(this.brushPoints[i].x, this.brushPoints[i].y);
      }
      ctx.stroke();
    } else if (this.currentTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = this.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(this.brushPoints[0].x, this.brushPoints[0].y);
      for (let i = 1; i < this.brushPoints.length; i++) {
        ctx.lineTo(this.brushPoints[i].x, this.brushPoints[i].y);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // --- Core Composite Pipeline ---

  _getScaledPatternCanvas(patternImage, scale, angle) {
    const sw = Math.max(1, Math.round(patternImage.naturalWidth * scale));
    const sh = Math.max(1, Math.round(patternImage.naturalHeight * scale));

    const needsScale = scale !== 1;
    const needsRotate = angle !== 0;

    if (!needsScale && !needsRotate) return patternImage;

    if (needsScale && !needsRotate) {
      if (!this._scaledPatternCanvas) {
        this._scaledPatternCanvas = document.createElement('canvas');
        this._scaledPatternCtx = this._scaledPatternCanvas.getContext('2d');
      }
      this._scaledPatternCanvas.width = sw;
      this._scaledPatternCanvas.height = sh;
      this._scaledPatternCtx.drawImage(patternImage, 0, 0, sw, sh);
      return this._scaledPatternCanvas;
    }

    const srcW = needsScale ? sw : patternImage.naturalWidth;
    const srcH = needsScale ? sh : patternImage.naturalHeight;
    const rad = angle * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const rw = Math.ceil(srcW * cos + srcH * sin);
    const rh = Math.ceil(srcW * sin + srcH * cos);

    if (!this._rotatedPatternCanvas) {
      this._rotatedPatternCanvas = document.createElement('canvas');
      this._rotatedPatternCtx = this._rotatedPatternCanvas.getContext('2d');
    }
    this._rotatedPatternCanvas.width = rw;
    this._rotatedPatternCanvas.height = rh;
    const rCtx = this._rotatedPatternCtx;
    rCtx.clearRect(0, 0, rw, rh);
    rCtx.translate(rw / 2, rh / 2);
    rCtx.rotate(rad);
    rCtx.drawImage(patternImage, -srcW / 2, -srcH / 2, srcW, srcH);

    return this._rotatedPatternCanvas;
  }

  _compositeLayer(layer) {
    if (!layer.maskCanvas || !layer.patternCanvas || !layer.patternImage) return;

    const pCtx = layer.patternCtx;
    const w = layer.patternCanvas.width;
    const h = layer.patternCanvas.height;
    const scale = layer.patternScale / 100;

    pCtx.clearRect(0, 0, w, h);

    const pattern = pCtx.createPattern(this._getScaledPatternCanvas(layer.patternImage, scale, layer.patternAngle), 'repeat');
    const matrix = new DOMMatrix();
    matrix.translateSelf(layer.patternOffsetX, layer.patternOffsetY);
    if (layer.overallAngle !== 0) {
      const center = layer.getMaskCenter();
      matrix.translateSelf(center.x, center.y);
      matrix.rotateSelf(layer.overallAngle);
      matrix.translateSelf(-center.x, -center.y);
    }
    pattern.setTransform(matrix);
    pCtx.fillStyle = pattern;
    pCtx.fillRect(0, 0, w, h);

    pCtx.globalCompositeOperation = 'destination-in';
    pCtx.drawImage(layer.maskCanvas, 0, 0);
    pCtx.globalCompositeOperation = 'source-over';
  }

  _composite() {
    if (this.activeLayerIndex < 0) return;
    this._compositeLayer(this.layers[this.activeLayerIndex]);
  }

  // --- Render to Main Canvas ---

  _renderToMain() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Base image
    if (this.baseImage) {
      ctx.drawImage(this.baseImage, 0, 0);
    }

    // Draw all layers bottom to top
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (!layer.patternImage || !layer.hasMask || !layer.visible) continue;

      this._compositeLayer(layer);

      ctx.globalAlpha = layer.patternOpacity / 100;
      ctx.drawImage(layer.patternCanvas, 0, 0);
    }
    ctx.globalAlpha = 1;
  }

  // --- Undo / Redo helpers ---

  _saveMaskState() {
    if (!this.maskCanvas || this.activeLayerIndex < 0) return;
    const layer = this.layers[this.activeLayerIndex];
    this.undoStack.push({
      type: 'mask',
      layerIndex: this.activeLayerIndex,
      maskData: layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height),
      patternAngle: layer.patternAngle,
      overallAngle: layer.overallAngle,
      patternOffsetX: layer.patternOffsetX,
      patternOffsetY: layer.patternOffsetY,
      patternScale: layer.patternScale,
      patternOpacity: layer.patternOpacity,
    });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];
  }

  _captureState() {
    if (this.activeLayerIndex < 0) return null;
    const layer = this.layers[this.activeLayerIndex];
    return {
      type: 'mask',
      layerIndex: this.activeLayerIndex,
      maskData: layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height),
      patternAngle: layer.patternAngle,
      overallAngle: layer.overallAngle,
      patternOffsetX: layer.patternOffsetX,
      patternOffsetY: layer.patternOffsetY,
      patternScale: layer.patternScale,
      patternOpacity: layer.patternOpacity,
    };
  }

  saveAngleUndo(oldAngle) {
    if (!this.maskCanvas || this.activeLayerIndex < 0) return;
    const layer = this.layers[this.activeLayerIndex];
    this.undoStack.push({
      type: 'settings',
      layerIndex: this.activeLayerIndex,
      maskData: layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height),
      patternAngle: oldAngle,
      overallAngle: layer.overallAngle,
      patternOffsetX: layer.patternOffsetX,
      patternOffsetY: layer.patternOffsetY,
      patternScale: layer.patternScale,
      patternOpacity: layer.patternOpacity,
    });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];
    this._emitMaskChanged();
  }

  saveScaleUndo(oldScale) {
    if (!this.maskCanvas || this.activeLayerIndex < 0) return;
    const layer = this.layers[this.activeLayerIndex];
    this.undoStack.push({
      type: 'settings',
      layerIndex: this.activeLayerIndex,
      maskData: layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height),
      patternAngle: layer.patternAngle,
      overallAngle: layer.overallAngle,
      patternOffsetX: layer.patternOffsetX,
      patternOffsetY: layer.patternOffsetY,
      patternScale: oldScale,
      patternOpacity: layer.patternOpacity,
    });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];
    this._emitMaskChanged();
  }

  saveOpacityUndo(oldOpacity) {
    if (!this.maskCanvas || this.activeLayerIndex < 0) return;
    const layer = this.layers[this.activeLayerIndex];
    this.undoStack.push({
      type: 'settings',
      layerIndex: this.activeLayerIndex,
      maskData: layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height),
      patternAngle: layer.patternAngle,
      overallAngle: layer.overallAngle,
      patternOffsetX: layer.patternOffsetX,
      patternOffsetY: layer.patternOffsetY,
      patternScale: layer.patternScale,
      patternOpacity: oldOpacity,
    });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];
    this._emitMaskChanged();
  }

  saveOverallAngleUndo(oldAngle) {
    if (!this.maskCanvas || this.activeLayerIndex < 0) return;
    const layer = this.layers[this.activeLayerIndex];
    this.undoStack.push({
      type: 'settings',
      layerIndex: this.activeLayerIndex,
      maskData: layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height),
      patternAngle: layer.patternAngle,
      overallAngle: oldAngle,
      patternOffsetX: layer.patternOffsetX,
      patternOffsetY: layer.patternOffsetY,
      patternScale: layer.patternScale,
      patternOpacity: layer.patternOpacity,
    });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];
    this._emitMaskChanged();
  }

  saveSettingsUndo() {
    if (!this.maskCanvas || this.activeLayerIndex < 0) return;
    const layer = this.layers[this.activeLayerIndex];
    this.undoStack.push({
      type: 'settings',
      layerIndex: this.activeLayerIndex,
      maskData: layer.maskCtx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height),
      patternAngle: layer.patternAngle,
      overallAngle: layer.overallAngle,
      patternOffsetX: layer.patternOffsetX,
      patternOffsetY: layer.patternOffsetY,
      patternScale: layer.patternScale,
      patternOpacity: layer.patternOpacity,
    });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];
    this._emitMaskChanged();
  }

  // --- Has Mask Check ---

  get hasMask() {
    return this._hasMask;
  }

  _updateHasMask() {
    if (!this.maskCanvas) { this._hasMask = false; return; }
    const data = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) { this._hasMask = true; return; }
    }
    this._hasMask = false;
  }

  // --- Events ---

  _emitMaskChanged() {
    this.canvas.dispatchEvent(new CustomEvent('mask-changed', {
      detail: {
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
        hasMask: this._hasMask,
        patternAngle: this.patternAngle,
        overallAngle: this.overallAngle,
        patternScale: this.patternScale,
        patternOpacity: this.patternOpacity,
        activeLayerIndex: this.activeLayerIndex,
      },
    }));
    this.canvas.dispatchEvent(new CustomEvent('layers-changed'));
  }

  _emitReadyChanged() {
    this.canvas.dispatchEvent(new CustomEvent('ready-changed', {
      detail: { ready: this.ready },
    }));
  }
}
