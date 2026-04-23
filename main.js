import { convertFileSrc } from '@tauri-apps/api/core';
import { CanvasEngine } from './canvas-engine.js';

// --- DOM References ---
const canvas = document.getElementById('main-canvas');
const uploadBase = document.getElementById('upload-base');
const uploadPattern = document.getElementById('upload-pattern');
const statusBar = document.getElementById('status-bar');
const toolGroup = document.getElementById('tool-group');
const brushSizeInput = document.getElementById('brush-size');
const brushSizeValue = document.getElementById('brush-size-value');
const brushSizeCircle = document.getElementById('brush-size-circle');
const brushSizeDropdown = document.getElementById('brush-size-dropdown');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnClear = document.getElementById('btn-clear');
const btnExport = document.getElementById('btn-export');
const btnExportLayers = document.getElementById('btn-export-layers');
const patternPreviewPopup = document.getElementById('pattern-preview-popup');
const patternPreviewImg = document.getElementById('pattern-preview-img');
const dropOverlay = document.getElementById('drop-overlay');
const dropZoneBase = document.getElementById('drop-zone-base');
const dropZonePattern = document.getElementById('drop-zone-pattern');
const patternHistoryBtn = document.getElementById('pattern-history-btn');
const patternDropdown = document.getElementById('pattern-dropdown');
const patternSizeInput = document.getElementById('pattern-size');
const patternSizeValue = document.getElementById('pattern-size-value');
const patternOpacityInput = document.getElementById('pattern-opacity');
const patternOpacityValue = document.getElementById('pattern-opacity-value');
const opacityIcon = document.getElementById('opacity-icon');

function updateOpacityIcon(opacity) {
  if (opacityIcon) opacityIcon.style.opacity = opacity / 100;
}
updateOpacityIcon(100);
const patternAngleValue = document.getElementById('pattern-angle-value');
const overallAngleValue = document.getElementById('overall-angle-value');
const btnResetPattern = document.getElementById('btn-reset-pattern');
const patternSettingsGroup = document.getElementById('pattern-settings-group');

// --- Text Pattern Modal ---
const textPatternBtn = document.getElementById('text-pattern-btn');
const textPatternModal = document.getElementById('text-pattern-modal');
const textModalClose = document.getElementById('text-modal-close');
const textPatternInput = document.getElementById('text-pattern-input');
const textFontSelect = document.getElementById('text-font-select');
const textBoldBtn = document.getElementById('text-bold-btn');
const textItalicBtn = document.getElementById('text-italic-btn');
const textColorPicker = document.getElementById('text-color-picker');
const textModalCancel = document.getElementById('text-modal-cancel');
const textModalConfirm = document.getElementById('text-modal-confirm');
const textPreviewCanvas = document.getElementById('text-preview-canvas');

// --- Blur Pattern Modal ---
const blurPatternBtn = document.getElementById('blur-pattern-btn');
const blurPatternModal = document.getElementById('blur-pattern-modal');
const blurModalClose = document.getElementById('blur-modal-close');
const blurIntensityInput = document.getElementById('blur-intensity');
const blurIntensityValue = document.getElementById('blur-intensity-value');
const blurModalCancel = document.getElementById('blur-modal-cancel');
const blurModalConfirm = document.getElementById('blur-modal-confirm');
const blurPreviewCanvas = document.getElementById('blur-preview-canvas');

// --- State ---
const engine = new CanvasEngine(canvas);
let baseLoaded = false;
let patternLoaded = false;
let baseFileName = '';
let textBold = false;
let textItalic = false;
let isBlurPattern = false;

// --- Pattern History ---
const PATTERN_HISTORY_KEY = 'pattern-history';
const MAX_STORAGE_IMAGE_SIZE = 128; // max dimension for stored thumbnails
let patternHistory = []; // [{dataUrl, thumbUrl, name}]

function loadPatternHistory() {
  try {
    const raw = localStorage.getItem(PATTERN_HISTORY_KEY);
    patternHistory = raw ? JSON.parse(raw) : [];
    // Migrate old entries: ensure thumbUrl field exists
    patternHistory.forEach(item => {
      if (!item.thumbUrl) item.thumbUrl = item.dataUrl;
    });
  } catch {
    patternHistory = [];
  }
}

function savePatternHistory() {
  try {
    localStorage.setItem(PATTERN_HISTORY_KEY, JSON.stringify(patternHistory));
  } catch {
    // localStorage full — silently fail
  }
}

function resizeImageForStorage(dataUrl, maxSize) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxSize && img.height <= maxSize) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.min(maxSize / img.width, maxSize / img.height);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const offscreen = document.createElement('canvas');
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(offscreen.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function addToPatternHistory(dataUrl, fileName) {
  // Remove existing entry with same name to avoid duplicates
  patternHistory = patternHistory.filter(item => item.name !== fileName);
  patternHistory.unshift({ dataUrl, thumbUrl: null, name: fileName });
  // Keep max 20 items
  if (patternHistory.length > 20) {
    patternHistory = patternHistory.slice(0, 20);
  }
  savePatternHistory();
  renderPatternDropdown();
}

function removeFromPatternHistory(index) {
  patternHistory.splice(index, 1);
  savePatternHistory();
  renderPatternDropdown();
}

function clearAllPatternHistory() {
  patternHistory = [];
  savePatternHistory();
  renderPatternDropdown();
}

function renderPatternDropdown() {
  if (patternHistory.length === 0) {
    patternDropdown.innerHTML = '<div class="pattern-dropdown-empty">暂无历史图案</div>';
    return;
  }

  let html = '';
  patternHistory.forEach((item, index) => {
    html += `
      <div class="pattern-dropdown-item" data-index="${index}">
        <img src="${item.thumbUrl || item.dataUrl}" alt="${item.name}" />
        <span class="pattern-dropdown-item-name" title="${item.name}">${item.name}</span>
        <button class="pattern-dropdown-item-delete" data-delete="${index}" title="删除">✕</button>
      </div>
    `;
  });
  html += `
    <div class="pattern-dropdown-divider"></div>
    <button class="pattern-dropdown-clear" id="pattern-dropdown-clear">清空全部</button>
  `;
  patternDropdown.innerHTML = html;

  // Bind events
  patternDropdown.querySelectorAll('.pattern-dropdown-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.pattern-dropdown-item-delete')) return;
      const idx = parseInt(el.dataset.index, 10);
      const item = patternHistory[idx];
      if (!item) return;
      // Move selected pattern to top (most recently used)
      patternHistory.splice(idx, 1);
      patternHistory.unshift(item);
      savePatternHistory();
      renderPatternDropdown();
      loadImageFromDataUrl(item.dataUrl, item.name);
    });
  });

  patternDropdown.querySelectorAll('.pattern-dropdown-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.delete, 10);
      removeFromPatternHistory(idx);
    });
  });

  document.getElementById('pattern-dropdown-clear').addEventListener('click', () => {
    clearAllPatternHistory();
  });
}

function loadImageFromDataUrl(dataUrl, name) {
  const img = new Image();
  img.onload = () => {
    isBlurPattern = false;
    engine.setPatternImage(img);
    if (engine.activeLayerIndex >= 0) {
      engine.layers[engine.activeLayerIndex].isBlur = false;
    }
    patternLoaded = true;
    patternPreviewPopup.classList.remove('hidden');
    patternPreviewImg.src = dataUrl;
    statusBar.textContent = `图案已加载: ${name}`;
    updateReadyState();
    closePatternDropdown();
  };
  img.onerror = () => {
    statusBar.textContent = '图案加载失败';
  };
  img.src = dataUrl;
}

// --- Dropdown toggle ---
let dropdownOpen = false;

function togglePatternDropdown() {
  dropdownOpen = !dropdownOpen;
  patternDropdown.classList.toggle('open', dropdownOpen);
}

function closePatternDropdown() {
  dropdownOpen = false;
  patternDropdown.classList.remove('open');
}

patternHistoryBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePatternDropdown();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.pattern-group')) {
    closePatternDropdown();
  }
});

// --- Brush Size Dropdown ---
function updateBrushSizeCircle(percent) {
  const d = 4 + ((percent - 5) / 45) * 18;
  brushSizeCircle.style.setProperty('--circle-d', d + 'px');
}

let brushDropdownOpen = false;

function openBrushSizeDropdown(anchorBtn) {
  const rect = anchorBtn.getBoundingClientRect();
  const toolbarRect = document.getElementById('toolbar').getBoundingClientRect();
  brushSizeDropdown.style.position = 'fixed';
  brushSizeDropdown.style.top = (rect.bottom + 6) + 'px';
  brushSizeDropdown.style.left = rect.left + 'px';
  brushDropdownOpen = true;
  brushSizeDropdown.classList.add('open');
}

function closeBrushSizeDropdown() {
  brushDropdownOpen = false;
  brushSizeDropdown.classList.remove('open');
}

function toggleBrushSizeDropdown(anchorBtn) {
  if (brushDropdownOpen) {
    closeBrushSizeDropdown();
  } else {
    openBrushSizeDropdown(anchorBtn);
  }
}

function ensureBrushSizeDropdown(anchorBtn) {
  if (brushDropdownOpen) {
    openBrushSizeDropdown(anchorBtn);
  } else {
    openBrushSizeDropdown(anchorBtn);
  }
}

updateBrushSizeCircle(parseInt(brushSizeInput.value, 10) || 15);

// --- Brush Size Wheel ---
document.addEventListener('wheel', (e) => {
  const tool = engine.currentTool;
  if (tool !== 'brush' && tool !== 'eraser') return;
  if (e.target.closest('.brush-size-dropdown')) return;
  const delta = e.deltaY < 0 ? 1 : -1;
  let val = parseInt(brushSizeInput.value, 10) + delta;
  val = Math.max(5, Math.min(50, val));
  if (val === parseInt(brushSizeInput.value, 10)) return;
  brushSizeInput.value = val;
  brushSizeValue.textContent = val;
  engine.setBrushSize(val);
  updateBrushSizeCircle(val);
  engine.refreshBrushCursor();
}, { passive: true });

function clearBlurPatternIfNeeded() {
  if (!isBlurPattern) return;
  engine.patternImage = null;
  patternLoaded = false;
  patternPreviewPopup.classList.add('hidden');
}

// --- Image Loading ---
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

uploadBase.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const img = await loadImageFromFile(file);
    clearBlurPatternIfNeeded();
    engine.setBaseImage(img);
    baseLoaded = true;
    baseFileName = file.name.replace(/\.[^.]+$/, '');
    isBlurPattern = false;
    // Reset brush to default 30%
    brushSizeInput.value = 15;
    brushSizeValue.textContent = '15';
    engine.setBrushSize(15);
    updateBrushSizeCircle(15);
    statusBar.textContent = `底图已加载: ${img.naturalWidth}×${img.naturalHeight}`;
    updateReadyState();
  } catch {
    statusBar.textContent = '底图加载失败';
  }
});

uploadPattern.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const img = await loadImageFromFile(file);
    isBlurPattern = false;
    engine.setPatternImage(img);
    if (engine.activeLayerIndex >= 0) {
      engine.layers[engine.activeLayerIndex].isBlur = false;
    }
    patternLoaded = true;
    patternPreviewPopup.classList.remove('hidden');
    patternPreviewImg.src = img.src;
    // Save to history
    addToPatternHistory(img.src, file.name);
    // Generate thumbnail for dropdown display
    const resizedDataUrl = await resizeImageForStorage(img.src, MAX_STORAGE_IMAGE_SIZE);
    if (patternHistory[0]) patternHistory[0].thumbUrl = resizedDataUrl;
    savePatternHistory();
    updateReadyState();
  } catch {
    statusBar.textContent = '图案加载失败';
  }
});

// --- Tool Selection ---
toolGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tool]');
  if (!btn || btn.disabled) return;

  toolGroup.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const tool = btn.dataset.tool;
  engine.setCurrentTool(tool);

  if (tool !== 'brush' && tool !== 'eraser') {
    closeBrushSizeDropdown();
  } else if (tool === 'brush' || tool === 'eraser') {
    if (brushDropdownOpen) {
      openBrushSizeDropdown(btn);
    } else {
      toggleBrushSizeDropdown(btn);
    }
  }
  updateCanvasCursor(tool);
});

// --- Select All ---
document.getElementById('btn-select-all').addEventListener('click', () => {
  if (!engine.ready) return;
  engine.selectAll();
  statusBar.textContent = '已全选 — 可撤销';
});

// --- Keyboard shortcuts for tool switching ---
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.ctrlKey || e.metaKey) return;

  const toolMap = { r: 'rect', e: 'ellipse', b: 'brush', x: 'eraser', v: 'move-pattern' };
  const tool = toolMap[e.key.toLowerCase()];
  if (tool && engine.ready) {
    const btn = toolGroup.querySelector(`[data-tool="${tool}"]`);
    if (btn && !btn.disabled) {
      toolGroup.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      engine.setCurrentTool(tool);
      if (tool !== 'brush' && tool !== 'eraser') {
        closeBrushSizeDropdown();
      } else if (brushDropdownOpen) {
        openBrushSizeDropdown(btn);
      } else {
        toggleBrushSizeDropdown(btn);
      }
      updateCanvasCursor(tool);
    }
  }

  if (e.key.toLowerCase() === 'a' && engine.ready) {
    engine.selectAll();
    statusBar.textContent = '已全选 — 可撤销';
  }
});

// --- Brush Size ---
brushSizeInput.addEventListener('input', (e) => {
  const percent = parseInt(e.target.value, 10);
  brushSizeValue.textContent = percent;
  engine.setBrushSize(percent);
  updateBrushSizeCircle(percent);
  engine.refreshBrushCursor();
});

// --- Pattern Size ---
let patternSizeBeforeDrag = 100;
patternSizeInput.addEventListener('mousedown', () => {
  patternSizeBeforeDrag = parseInt(patternSizeInput.value, 10);
});
patternSizeInput.addEventListener('input', (e) => {
  const size = parseInt(e.target.value, 10);
  patternSizeValue.textContent = size;
  engine.setPatternScale(size);
});
patternSizeInput.addEventListener('change', () => {
  const size = parseInt(patternSizeInput.value, 10);
  if (size !== patternSizeBeforeDrag) {
    engine.saveScaleUndo(patternSizeBeforeDrag);
  }
});

// --- Pattern Size via Wheel (move-pattern tool) ---
canvas.addEventListener('wheel', (e) => {
  if (engine.currentTool !== 'move-pattern' || !engine.ready) return;
  if (isBlurPattern) return;
  e.preventDefault();
  const step = e.shiftKey ? 15 : 5;
  const delta = e.deltaY < 0 ? step : -step;
  const current = parseInt(patternSizeInput.value, 10);
  const next = Math.max(10, Math.min(300, current + delta));
  if (next === current) return;
  engine.saveScaleUndo(current);
  patternSizeInput.value = next;
  patternSizeValue.textContent = next;
  engine.setPatternScale(next);
}, { passive: false });

// --- Pattern Opacity ---
let patternOpacityBeforeDrag = 100;
patternOpacityInput.addEventListener('mousedown', () => {
  patternOpacityBeforeDrag = parseInt(patternOpacityInput.value, 10);
});
patternOpacityInput.addEventListener('input', (e) => {
  const opacity = parseInt(e.target.value, 10);
  patternOpacityValue.textContent = opacity;
  engine.setPatternOpacity(opacity);
  updateOpacityIcon(opacity);
});
patternOpacityInput.addEventListener('change', () => {
  const opacity = parseInt(patternOpacityInput.value, 10);
  if (opacity !== patternOpacityBeforeDrag) {
    engine.saveOpacityUndo(patternOpacityBeforeDrag);
  }
});

// --- Reset Pattern Settings ---
btnResetPattern.addEventListener('click', () => {
  engine.saveSettingsUndo();
  patternSizeInput.value = 100;
  patternSizeValue.textContent = '100';
  engine.setPatternScale(100);
  patternOpacityInput.value = 100;
  patternOpacityValue.textContent = '100';
  engine.setPatternOpacity(100);
  updateOpacityIcon(100);
  patternAngleValue.textContent = '0';
  engine.setPatternAngle(0);
  overallAngleValue.textContent = '0';
  engine.setOverallAngle(0);
  statusBar.textContent = '图案属性已重置';
});

// --- Pattern Angle (drag-to-scrub) ---
let patternAngleDragging = false;
(function () {
  let startY = 0;
  let startAngle = 0;

  patternAngleValue.addEventListener('mousedown', (e) => {
    e.preventDefault();
    patternAngleDragging = true;
    startY = e.clientY;
    startAngle = engine.patternAngle;
    document.body.style.cursor = 'ns-resize';
  });

  document.addEventListener('mousemove', (e) => {
    if (!patternAngleDragging) return;
    const sensitivity = 3; // px per degree
    const delta = Math.round((startY - e.clientY) / sensitivity);
    let angle = startAngle + delta;
    angle = ((angle % 360) + 360) % 360;
    patternAngleValue.textContent = angle;
    engine.setPatternAngle(angle);
  });

  document.addEventListener('mouseup', () => {
    if (!patternAngleDragging) return;
    patternAngleDragging = false;
    document.body.style.cursor = '';
    if (engine.patternAngle !== startAngle) {
      engine.saveAngleUndo(startAngle);
    }
  });
})();

// --- Overall Angle (drag-to-scrub) ---
let overallAngleDragging = false;
(function () {
  let startY = 0;
  let startAngle = 0;

  overallAngleValue.addEventListener('mousedown', (e) => {
    e.preventDefault();
    overallAngleDragging = true;
    startY = e.clientY;
    startAngle = engine.overallAngle;
    document.body.style.cursor = 'ns-resize';
  });

  document.addEventListener('mousemove', (e) => {
    if (!overallAngleDragging) return;
    const sensitivity = 3; // px per degree
    const delta = Math.round((startY - e.clientY) / sensitivity);
    let angle = startAngle + delta;
    angle = ((angle % 360) + 360) % 360;
    overallAngleValue.textContent = angle;
    engine.setOverallAngle(angle);
  });

  document.addEventListener('mouseup', () => {
    if (!overallAngleDragging) return;
    overallAngleDragging = false;
    document.body.style.cursor = '';
    if (engine.overallAngle !== startAngle) {
      engine.saveOverallAngleUndo(startAngle);
    }
  });
})();

// --- Inline Edit (double-click to type a value) ---
function enableInlineEdit(displayEl, { min, max, normalize, apply, onCancelDrag }) {
  let input = null;
  let originalValue = 0;

  function commit() {
    if (!input) return;
    let val = parseFloat(input.value);
    if (isNaN(val)) val = originalValue;
    if (normalize) val = normalize(val);
    val = Math.round(val / 1) * 1; // ensure integer
    val = Math.max(min, Math.min(max, val));
    displayEl.textContent = val;
    displayEl.style.display = '';
    input.remove();
    input = null;
    if (val !== originalValue) apply(val, originalValue);
  }

  function cancel() {
    if (!input) return;
    displayEl.textContent = originalValue;
    displayEl.style.display = '';
    input.remove();
    input = null;
  }

  displayEl.addEventListener('dblclick', (e) => {
    e.preventDefault();
    if (onCancelDrag) onCancelDrag();
    document.body.style.cursor = '';
    originalValue = parseInt(displayEl.textContent, 10);
    input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = displayEl.textContent;
    displayEl.style.display = 'none';
    displayEl.parentNode.insertBefore(input, displayEl.nextSibling);
    input.focus();
    input.select();
  });

  document.addEventListener('keydown', (e) => {
    if (!input) return;
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });

  document.addEventListener('mousedown', (e) => {
    if (!input) return;
    if (e.target === input) return;
    // Allow clicking inside the parent icon-label area
    if (input.parentNode && input.parentNode.contains(e.target)) return;
    commit();
  });
}

const normalizeAngle = (v) => ((v % 360) + 360) % 360;

enableInlineEdit(patternSizeValue, {
  min: 10, max: 300,
  apply(val, old) {
    engine.saveScaleUndo(old);
    engine.setPatternScale(val);
    patternSizeInput.value = val;
  },
});

enableInlineEdit(patternOpacityValue, {
  min: 5, max: 100,
  apply(val, old) {
    engine.saveOpacityUndo(old);
    engine.setPatternOpacity(val);
    patternOpacityInput.value = val;
    updateOpacityIcon(val);
  },
});

enableInlineEdit(patternAngleValue, {
  min: 0, max: 359, normalize: normalizeAngle,
  apply(val, old) { engine.saveAngleUndo(old); engine.setPatternAngle(val); },
  onCancelDrag: () => { patternAngleDragging = false; },
});

enableInlineEdit(overallAngleValue, {
  min: 0, max: 359, normalize: normalizeAngle,
  apply(val, old) { engine.saveOverallAngleUndo(old); engine.setOverallAngle(val); },
  onCancelDrag: () => { overallAngleDragging = false; },
});

// --- Actions ---
btnUndo.addEventListener('click', () => {
  engine.undo();
});

btnRedo.addEventListener('click', () => {
  engine.redo();
});

btnClear.addEventListener('click', () => {
  engine.clearMask();
  statusBar.textContent = '已清除当前图层选区';
});

btnExport.addEventListener('click', async () => {
  try {
    await exportImage();
  } catch (err) {
    console.error('Export failed:', err);
    statusBar.textContent = '导出失败: ' + err.message;
  }
});

btnExportLayers.addEventListener('click', async () => {
  try {
    await exportLayersOnly();
  } catch (err) {
    console.error('Export layers failed:', err);
    statusBar.textContent = '导出图层失败: ' + err.message;
  }
});

// --- Canvas Events ---
canvas.addEventListener('mask-changed', (e) => {
  const { canUndo, canRedo, hasMask, patternAngle, overallAngle, patternScale, patternOpacity } = e.detail;
  // Sync isBlurPattern with active layer's per-layer blur state
  if (engine.activeLayerIndex >= 0 && engine.layers[engine.activeLayerIndex]) {
    isBlurPattern = engine.layers[engine.activeLayerIndex].isBlur;
  }
  btnUndo.disabled = !canUndo;
  btnRedo.disabled = !canRedo;
  btnClear.disabled = !hasMask;
  btnExport.disabled = !hasMask;
  btnExportLayers.disabled = !hasMask;
  const moveBtn = toolGroup.querySelector('[data-tool="move-pattern"]');
  if (moveBtn) moveBtn.disabled = !hasMask || isBlurPattern;
  const eraserBtn = toolGroup.querySelector('[data-tool="eraser"]');
  if (eraserBtn) eraserBtn.disabled = !hasMask;
  patternAngleValue.textContent = patternAngle;
  overallAngleValue.textContent = overallAngle;
  patternSizeInput.value = patternScale;
  patternSizeValue.textContent = patternScale;
  patternOpacityInput.value = patternOpacity;
  patternOpacityValue.textContent = patternOpacity;
  updateOpacityIcon(patternOpacity);
  if (canUndo) {
    statusBar.textContent = '已绘制选区 — 可撤销';
  }
  updateReadyState();
});

canvas.addEventListener('ready-changed', () => {
  updateReadyState();
});

// --- Layers Panel ---
const layersPanel = document.getElementById('layers-panel');
const layersList = document.getElementById('layers-list');
const btnAddLayer = document.getElementById('btn-add-layer');

function renderLayersPanel() {
  const layers = engine.layers;
  const activeIndex = engine.activeLayerIndex;

  layersList.innerHTML = '';

  // Render in reverse order (top layer first in the list)
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const item = document.createElement('div');
    item.className = 'layer-item' + (i === activeIndex ? ' active' : '');
    item.dataset.layerIndex = i;

    // Visibility checkbox
    const visCheckbox = document.createElement('input');
    visCheckbox.type = 'checkbox';
    visCheckbox.checked = layer.visible;
    visCheckbox.className = 'layer-visibility';
    visCheckbox.title = '显示/隐藏图层';
    item.appendChild(visCheckbox);

    // Pattern preview (shows which pattern this layer uses)
    const patPreview = document.createElement('canvas');
    patPreview.className = 'layer-pattern-preview';
    patPreview.width = 32;
    patPreview.height = 32;
    item.appendChild(patPreview);

    // Thumbnail (composited result)
    const thumb = document.createElement('canvas');
    thumb.className = 'layer-thumbnail';
    thumb.width = 32;
    thumb.height = 32;
    item.appendChild(thumb);

    // Name
    const name = document.createElement('span');
    name.className = 'layer-name';
    name.textContent = layer.name;
    item.appendChild(name);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'layer-controls';

    const upBtn = document.createElement('button');
    upBtn.title = '上移';
    upBtn.dataset.action = 'move-up';
    upBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
    upBtn.disabled = (i === layers.length - 1);
    controls.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.title = '下移';
    downBtn.dataset.action = 'move-down';
    downBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    downBtn.disabled = (i === 0);
    controls.appendChild(downBtn);

    const delBtn = document.createElement('button');
    delBtn.title = '删除';
    delBtn.dataset.action = 'delete';
    delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
    delBtn.disabled = (layers.length <= 1);
    controls.appendChild(delBtn);

    item.appendChild(controls);
    layersList.appendChild(item);

    // Draw pattern preview (shows which pattern this layer uses)
    if (layer.patternImage) {
      const pCtx = patPreview.getContext('2d');
      pCtx.clearRect(0, 0, 32, 32);
      pCtx.drawImage(layer.patternImage, 0, 0, 32, 32);
    }

    // Draw thumbnail
    updateLayerThumbnail(layer, thumb);
  }
}

function updateLayerThumbnail(layer, thumbCanvas) {
  const ctx = thumbCanvas.getContext('2d');
  const w = thumbCanvas.width;
  const h = thumbCanvas.height;
  ctx.clearRect(0, 0, w, h);

  // Draw checkerboard background to indicate transparency
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#333';
  const cs = 4;
  for (let y = 0; y < h; y += cs) {
    for (let x = 0; x < w; x += cs) {
      if (((x / cs) + (y / cs)) % 2 === 0) ctx.fillRect(x, y, cs, cs);
    }
  }

  if (!layer.hasMask || !layer.patternImage) return;

  // Draw the composited layer content scaled down
  ctx.drawImage(layer.patternCanvas, 0, 0, w, h);
}

function syncToolbarToActiveLayer() {
  if (engine.activeLayerIndex < 0) return;
  const layer = engine.layers[engine.activeLayerIndex];
  if (!layer) return;

  patternSizeInput.value = layer.patternScale;
  patternSizeValue.textContent = layer.patternScale;
  patternOpacityInput.value = layer.patternOpacity;
  patternOpacityValue.textContent = layer.patternOpacity;
  updateOpacityIcon(layer.patternOpacity);
  patternAngleValue.textContent = layer.patternAngle;
  overallAngleValue.textContent = layer.overallAngle;

  if (layer.patternImage) {
    patternPreviewImg.src = layer.patternImage.src;
    patternPreviewPopup.classList.remove('hidden');
  } else {
    patternPreviewPopup.classList.add('hidden');
  }
}

layersList.addEventListener('click', (e) => {
  // Handle visibility checkbox
  if (e.target.classList.contains('layer-visibility')) {
    const item = e.target.closest('.layer-item');
    const index = parseInt(item.dataset.layerIndex, 10);
    const layer = engine.layers[index];
    if (layer) {
      layer.visible = e.target.checked;
      engine._renderToMain();
      renderLayersPanel();
    }
    return;
  }

  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn && !actionBtn.disabled) {
    const item = actionBtn.closest('.layer-item');
    const index = parseInt(item.dataset.layerIndex, 10);
    const action = actionBtn.dataset.action;

    if (action === 'move-up') {
      engine.moveLayerUp(index);
      renderLayersPanel();
      return;
    }
    if (action === 'move-down') {
      engine.moveLayerDown(index);
      renderLayersPanel();
      return;
    }
    if (action === 'delete') {
      engine.deleteLayer(index);
      renderLayersPanel();
      syncToolbarToActiveLayer();
      statusBar.textContent = `已删除图层 (剩余 ${engine.layers.length} 层)`;
      return;
    }
  }

  // Click on layer item = select
  const item = e.target.closest('.layer-item');
  if (!item) return;
  const index = parseInt(item.dataset.layerIndex, 10);
  if (index === engine.activeLayerIndex) return;

  engine.setActiveLayer(index);
  renderLayersPanel();
  syncToolbarToActiveLayer();
  statusBar.textContent = `已切换到 ${engine.layers[index].name}`;
});

btnAddLayer.addEventListener('click', () => {
  const layer = engine.addLayer();
  if (layer) {
    renderLayersPanel();
    syncToolbarToActiveLayer();
    statusBar.textContent = `已添加 ${layer.name} (共 ${engine.layers.length} 层)`;
  } else if (engine.layers.length >= 10) {
    statusBar.textContent = '已达到最大图层数 (10)';
  } else {
    statusBar.textContent = '请先上传底图';
  }
});

canvas.addEventListener('layers-changed', () => {
  renderLayersPanel();
});

// --- Layers Panel Drag ---
(function () {
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let hasBeenDragged = false;

  const header = layersPanel.querySelector('.layers-panel-header');

  /** Clamp panel position so it stays within the viewport. Only works when using explicit positioning. */
  function clampPanelPosition() {
    if (!hasBeenDragged) return;
    const rect = layersPanel.getBoundingClientRect();
    let x = rect.left;
    let y = rect.top;
    const maxX = window.innerWidth - layersPanel.offsetWidth;
    const maxY = window.innerHeight - layersPanel.offsetHeight;
    const needFix = x < 0 || y < 0 || x > maxX || y > maxY;
    if (needFix) {
      x = Math.max(0, Math.min(x, maxX));
      y = Math.max(0, Math.min(y, maxY));
      layersPanel.style.left = x + 'px';
      layersPanel.style.top = y + 'px';
    }
  }

  // Re-clamp after layers change (panel height may have changed)
  canvas.addEventListener('layers-changed', clampPanelPosition);

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();

    const rect = layersPanel.getBoundingClientRect();

    // Switch from transform-based centering to explicit positioning
    layersPanel.style.top = rect.top + 'px';
    layersPanel.style.left = rect.left + 'px';
    layersPanel.style.transform = 'none';

    // Clamp immediately so the panel can't start partially off-screen
    let x = rect.left;
    let y = rect.top;
    const maxX = window.innerWidth - layersPanel.offsetWidth;
    const maxY = window.innerHeight - layersPanel.offsetHeight;
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));
    layersPanel.style.left = x + 'px';
    layersPanel.style.top = y + 'px';

    // Recalculate offset from clamped position to avoid jump
    dragOffsetX = e.clientX - x;
    dragOffsetY = e.clientY - y;

    isDragging = true;
    header.classList.add('dragging');
    document.body.style.cursor = 'grabbing';
    hasBeenDragged = true;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    let x = e.clientX - dragOffsetX;
    let y = e.clientY - dragOffsetY;

    const maxX = window.innerWidth - layersPanel.offsetWidth;
    const maxY = window.innerHeight - layersPanel.offsetHeight;
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));

    layersPanel.style.left = x + 'px';
    layersPanel.style.top = y + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    header.classList.remove('dragging');
    document.body.style.cursor = '';
  });

  // Double-click header to reset position
  header.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    if (!hasBeenDragged) return;
    layersPanel.style.top = '';
    layersPanel.style.left = '';
    layersPanel.style.transform = '';
    hasBeenDragged = false;
  });
})();

// --- Cursor ---
function updateCanvasCursor(tool) {
  canvas.classList.remove('cursor-move');
  if (tool === 'move-pattern') {
    canvas.classList.add('cursor-move');
    canvas.style.cursor = '';
  } else if (tool === 'brush' || tool === 'eraser') {
    canvas.style.cursor = 'none';
  } else {
    canvas.style.cursor = 'crosshair';
  }
}

// --- Ready State ---
function updateReadyState() {
  const ready = baseLoaded && patternLoaded;
  const toolBtns = toolGroup.querySelectorAll('.tool-btn');
  toolBtns.forEach(btn => btn.disabled = !ready);

  // In blur mode: hide move-pattern tool entirely
  const moveBtn = toolGroup.querySelector('[data-tool="move-pattern"]');
  if (moveBtn) {
    if (isBlurPattern) {
      moveBtn.style.display = 'none';
      moveBtn.disabled = true;
    } else {
      moveBtn.style.display = '';
      moveBtn.disabled = !ready || !engine.hasMask;
    }
  }
  // If currently on move-pattern tool and blur mode activated, switch to rect
  if (isBlurPattern && engine.currentTool === 'move-pattern') {
    const rectBtn = toolGroup.querySelector('[data-tool="rect"]');
    if (rectBtn) {
      toolBtns.forEach(b => b.classList.remove('active'));
      rectBtn.classList.add('active');
      engine.setCurrentTool('rect');
      updateCanvasCursor('rect');
    }
  }

  const eraserBtn = toolGroup.querySelector('[data-tool="eraser"]');
  if (eraserBtn) eraserBtn.disabled = !ready || !engine.hasMask;
  btnClear.disabled = !ready || !engine.hasMask;
  btnExport.disabled = !ready || !engine.hasMask;
  btnExportLayers.disabled = !ready || !engine.hasMask;
  patternSettingsGroup.style.display = patternLoaded ? 'flex' : 'none';
  patternSettingsGroup.classList.toggle('blur-mode', patternLoaded && isBlurPattern);

  if (ready) {
    statusBar.textContent = '就绪 — 选择工具开始绘制';
    updateCanvasCursor(engine.currentTool);
  } else {
    canvas.style.cursor = 'default';
    canvas.classList.remove('cursor-move');
  }

  // Show/hide layers panel
  if (baseLoaded) {
    layersPanel.classList.add('visible');
    renderLayersPanel();
  } else {
    layersPanel.classList.remove('visible');
  }
}

// --- Export ---
async function exportImage() {
  const dataURL = engine.getDataURL();

  // Try Tauri native save dialog
  if (window.__TAURI__) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeBinaryFile } = await import('@tauri-apps/plugin-fs');

    const exportName = baseFileName ? `masked_${baseFileName}.png` : 'masked_result.png';
    const filePath = await save({
      defaultPath: exportName,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });

    if (!filePath) return; // User cancelled

    // Convert base64 dataURL to Uint8Array
    const base64 = dataURL.split(',')[1];
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    await writeBinaryFile(filePath, bytes);
    statusBar.textContent = `已保存: ${filePath}`;
    return;
  }

  // Web: try File System Access API (native save dialog)
  if ('showSaveFilePicker' in window) {
    try {
      const exportName = baseFileName ? `masked_${baseFileName}.png` : 'masked_result.png';
      const handle = await window.showSaveFilePicker({
        suggestedName: exportName,
        types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }],
      });
      const base64 = dataURL.split(',')[1];
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      statusBar.textContent = `已保存: ${handle.name}`;
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // User cancelled
      throw e;
    }
  }

  // Fallback for unsupported browsers (Firefox/Safari)
  const link = document.createElement('a');
  link.download = baseFileName ? `masked_${baseFileName}.png` : 'masked_result.png';
  link.href = dataURL;
  link.click();
  statusBar.textContent = '图像已导出';
}

// --- Export Layers Only ---
async function exportLayersOnly() {
  const dataURL = engine.getLayersDataURL();

  if (window.__TAURI__) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeBinaryFile } = await import('@tauri-apps/plugin-fs');

    const exportName = baseFileName ? `layers_${baseFileName}.png` : 'layers_only.png';
    const filePath = await save({
      defaultPath: exportName,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });

    if (!filePath) return;

    const base64 = dataURL.split(',')[1];
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    await writeBinaryFile(filePath, bytes);
    statusBar.textContent = `已保存: ${filePath}`;
    return;
  }

  if ('showSaveFilePicker' in window) {
    try {
      const exportName = baseFileName ? `layers_${baseFileName}.png` : 'layers_only.png';
      const handle = await window.showSaveFilePicker({
        suggestedName: exportName,
        types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }],
      });
      const base64 = dataURL.split(',')[1];
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      statusBar.textContent = `已保存: ${handle.name}`;
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
      throw e;
    }
  }

  const link = document.createElement('a');
  link.download = baseFileName ? `layers_${baseFileName}.png` : 'layers_only.png';
  link.href = dataURL;
  link.click();
  statusBar.textContent = '图层已导出';
}

// --- Text Pattern Modal ---
function openTextModal() {
  textPatternModal.classList.add('modal-open');
  textPatternInput.focus();
  renderTextPreview();
}

function closeTextModal() {
  textPatternModal.classList.remove('modal-open');
}

function calculateTextFontSize(text, fontFamily, fontWeight, fontStyle) {
  const ctx = textPreviewCanvas.getContext('2d');
  const maxWidth = 236; // 256 - 2 * 10 padding
  let low = 8, high = 200, fontSize = 16;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    ctx.font = `${fontStyle} ${fontWeight} ${mid}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) {
      fontSize = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return fontSize;
}

function renderTextPreview() {
  const canvas = textPreviewCanvas;
  const ctx = canvas.getContext('2d');
  const text = textPatternInput.value || '';

  ctx.clearRect(0, 0, 256, 256);
  if (!text.trim()) return;

  const fontFamily = textFontSelect.value;
  const color = textColorPicker.value;
  const fontWeight = textBold ? 'bold' : 'normal';
  const fontStyle = textItalic ? 'italic' : 'normal';

  const fontSize = calculateTextFontSize(text, fontFamily, fontWeight, fontStyle);

  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 128);
}

function buildSvgString(text, fontFamily, color, fontWeight, fontStyle, fontSize) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <text x="128" y="128"
        font-family="${fontFamily}"
        font-size="${fontSize}"
        font-weight="${fontWeight}"
        font-style="${fontStyle}"
        fill="${color}"
        text-anchor="middle"
        dominant-baseline="central">${escaped}</text>
</svg>`;
}

textPatternBtn.addEventListener('click', openTextModal);
textModalClose.addEventListener('click', closeTextModal);
textModalCancel.addEventListener('click', closeTextModal);

textPatternModal.addEventListener('click', (e) => {
  if (e.target === textPatternModal) closeTextModal();
});

textBoldBtn.addEventListener('click', () => {
  textBold = !textBold;
  textBoldBtn.classList.toggle('active', textBold);
  renderTextPreview();
});

textItalicBtn.addEventListener('click', () => {
  textItalic = !textItalic;
  textItalicBtn.classList.toggle('active', textItalic);
  renderTextPreview();
});

textPatternInput.addEventListener('input', renderTextPreview);
textFontSelect.addEventListener('change', renderTextPreview);
textColorPicker.addEventListener('input', renderTextPreview);

textModalConfirm.addEventListener('click', () => {
  const text = textPatternInput.value;
  if (!text || !text.trim()) {
    statusBar.textContent = '请输入文字';
    return;
  }

  const fontFamily = textFontSelect.value;
  const color = textColorPicker.value;
  const fontWeight = textBold ? 'bold' : 'normal';
  const fontStyle = textItalic ? 'italic' : 'normal';

  const fontSize = calculateTextFontSize(text, fontFamily, fontWeight, fontStyle);
  const svgContent = buildSvgString(text, fontFamily, color, fontWeight, fontStyle, fontSize);
  const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);

  const img = new Image();
  img.onload = () => {
    isBlurPattern = false;
    engine.setPatternImage(img);
    if (engine.activeLayerIndex >= 0) {
      engine.layers[engine.activeLayerIndex].isBlur = false;
    }
    patternLoaded = true;
    patternPreviewPopup.classList.remove('hidden');
    patternPreviewImg.src = svgDataUrl;
    const historyName = `文字: ${text.substring(0, 10)}${text.length > 10 ? '...' : ''}`;
    statusBar.textContent = `文字图案已加载: "${text}"`;
    addToPatternHistory(svgDataUrl, historyName);
    updateReadyState();
    closeTextModal();
  };
  img.onerror = () => {
    statusBar.textContent = '文字图案生成失败';
  };
  img.src = svgDataUrl;
});

// --- Blur Pattern Modal ---
function generateBlurredImage(baseImage, blurRadius) {
  const origW = baseImage.naturalWidth;
  const origH = baseImage.naturalHeight;

  // Downscale for performance
  const downscaleMax = 800;
  const downScale = Math.min(downscaleMax / origW, downscaleMax / origH, 1);
  const smallW = Math.max(1, Math.round(origW * downScale));
  const smallH = Math.max(1, Math.round(origH * downScale));

  const scaledBlur = Math.max(1, blurRadius * downScale);

  // Add padding so blur kernel doesn't sample transparent pixels at edges
  const pad = Math.ceil(scaledBlur * 3);

  // Create padded small canvas
  const padCanvas = document.createElement('canvas');
  padCanvas.width = smallW + pad * 2;
  padCanvas.height = smallH + pad * 2;
  const padCtx = padCanvas.getContext('2d');
  padCtx.filter = `blur(${scaledBlur}px)`;
  padCtx.drawImage(baseImage, 0, 0, origW, origH, pad, pad, smallW, smallH);
  padCtx.filter = 'none';

  // Crop the padded region and upscale back to original dimensions
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = origW;
  resultCanvas.height = origH;
  const resultCtx = resultCanvas.getContext('2d');
  resultCtx.imageSmoothingEnabled = true;
  resultCtx.imageSmoothingQuality = 'medium';
  resultCtx.drawImage(padCanvas, pad, pad, smallW, smallH, 0, 0, origW, origH);

  return resultCanvas;
}

function renderBlurPreview() {
  if (!engine.baseImage) return;
  const ctx = blurPreviewCanvas.getContext('2d');
  const radius = parseInt(blurIntensityInput.value, 10) || 10;

  const imgW = engine.baseImage.naturalWidth;
  const imgH = engine.baseImage.naturalHeight;
  const cropSize = Math.min(imgW, imgH);
  const sx = (imgW - cropSize) / 2;
  const sy = (imgH - cropSize) / 2;

  ctx.clearRect(0, 0, 256, 256);
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(engine.baseImage, sx, sy, cropSize, cropSize, 0, 0, 256, 256);
  ctx.filter = 'none';
}

function openBlurModal() {
  if (!baseLoaded) {
    statusBar.textContent = '请先上传底图';
    return;
  }
  blurPatternModal.classList.add('modal-open');
  renderBlurPreview();
}

function closeBlurModal() {
  blurPatternModal.classList.remove('modal-open');
}

blurPatternBtn.addEventListener('click', openBlurModal);
blurModalClose.addEventListener('click', closeBlurModal);
blurModalCancel.addEventListener('click', closeBlurModal);

blurPatternModal.addEventListener('click', (e) => {
  if (e.target === blurPatternModal) closeBlurModal();
});

blurIntensityInput.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  blurIntensityValue.textContent = val;
  renderBlurPreview();
});

blurModalConfirm.addEventListener('click', () => {
  if (!baseLoaded) return;

  const blurRadius = parseInt(blurIntensityInput.value, 10) || 10;
  const blurredCanvas = generateBlurredImage(engine.baseImage, blurRadius);
  const dataUrl = blurredCanvas.toDataURL('image/png');

  const img = new Image();
  img.onload = () => {
    isBlurPattern = true;
    engine.setPatternImage(img);
    if (engine.activeLayerIndex >= 0) {
      engine.layers[engine.activeLayerIndex].isBlur = true;
    }
    patternLoaded = true;
    // Force scale 100%, opacity 100%, angles 0, offsets 0
    engine.setPatternScale(100);
    engine.setPatternOpacity(100);
    engine.setPatternAngle(0);
    engine.setOverallAngle(0);
    engine.patternOffsetX = 0;
    engine.patternOffsetY = 0;
    // Update UI
    patternSizeInput.value = 100;
    patternSizeValue.textContent = '100';
    patternOpacityInput.value = 100;
    patternOpacityValue.textContent = '100';
    updateOpacityIcon(100);
    patternAngleValue.textContent = '0';
    overallAngleValue.textContent = '0';
    patternPreviewPopup.classList.remove('hidden');
    patternPreviewImg.src = dataUrl;
    statusBar.textContent = `模糊图案已加载 (强度: ${blurRadius}) — 选择区域以模糊`;
    // Do NOT save to pattern history — blur is session-only
    updateReadyState();
    closeBlurModal();
  };
  img.onerror = () => {
    statusBar.textContent = '模糊图案生成失败';
  };
  img.src = dataUrl;
});

// --- Info Modal ---
const btnInfo = document.getElementById('btn-info');
const infoModal = document.getElementById('info-modal');
const infoModalClose = document.getElementById('info-modal-close');
const infoVersionNumber = document.getElementById('info-version-number');

infoVersionNumber.textContent = __APP_VERSION__;

const infoAppIcon = document.getElementById('info-app-icon');
if (__APP_ICON__) {
  infoAppIcon.src = convertFileSrc(__APP_ICON__);
  infoAppIcon.alt = 'Laymask';
}

function openInfoModal() {
  infoModal.classList.add('modal-open');
}

function closeInfoModal() {
  infoModal.classList.remove('modal-open');
}

btnInfo.addEventListener('click', openInfoModal);
infoModalClose.addEventListener('click', closeInfoModal);
infoModal.addEventListener('click', (e) => {
  if (e.target === infoModal) closeInfoModal();
});

// --- Init pattern history ---
loadPatternHistory();
renderPatternDropdown();
if (patternHistory.length > 0) {
  loadImageFromDataUrl(patternHistory[0].dataUrl, patternHistory[0].name);
}

// --- Init: load base image from CLI args (Windows "Open with") ---
async function initOpenWithFile() {
  if (!window.__TAURI_INTERNALS__) {
    console.log('[OpenWith] Not running in Tauri');
    return;
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const files = await invoke('get_opened_files');
    console.log('[OpenWith] files:', files);
    statusBar.textContent = `检测到启动参数: ${JSON.stringify(files)}`;
    if (!files || files.length === 0) return;

    const filePath = files[0];
    statusBar.textContent = `正在加载: ${filePath}`;
    const dataUrl = await invoke('read_file_as_data_url', { path: filePath });
    console.log('[OpenWith] dataUrl length:', dataUrl.length);

    const img = new Image();
    img.onload = () => {
      clearBlurPatternIfNeeded();
      engine.setBaseImage(img);
      baseLoaded = true;
      baseFileName = filePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
      brushSizeInput.value = 15;
      brushSizeValue.textContent = '15';
      engine.setBrushSize(15);
      updateBrushSizeCircle(15);
      statusBar.textContent = `底图已加载: ${img.naturalWidth}×${img.naturalHeight}`;
      updateReadyState();
    };
    img.onerror = () => {
      statusBar.textContent = '底图加载失败';
    };
    img.src = dataUrl;
  } catch (err) {
    console.warn('[OpenWith] Error:', err);
    statusBar.textContent = `加载失败: ${err}`;
  }
}
initOpenWithFile();

// --- Drag-and-Drop ---
const SUPPORTED_EXT = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'];
let lastHoveredZone = null;

function isSupportedImageFile(pathOrName) {
  const lower = pathOrName.toLowerCase();
  return SUPPORTED_EXT.some(ext => lower.endsWith(ext));
}

function showDropOverlay() {
  dropOverlay.classList.remove('hidden');
  // Force reflow so the transition from opacity 0 works
  void dropOverlay.offsetHeight;
  dropOverlay.classList.add('visible');
}

function hideDropOverlay() {
  dropOverlay.classList.remove('visible');
  if (lastHoveredZone) lastHoveredZone.classList.remove('hover');
  lastHoveredZone = null;
}

function getZoneUnderPoint(physX, physY) {
  const dpr = window.devicePixelRatio || 1;
  const cssX = physX / dpr;
  const cssY = physY / dpr;
  for (const zone of [dropZoneBase, dropZonePattern]) {
    const rect = zone.getBoundingClientRect();
    if (cssX >= rect.left && cssX <= rect.right && cssY >= rect.top && cssY <= rect.bottom) {
      return zone;
    }
  }
  return null;
}

function updateZoneHover(zone) {
  if (lastHoveredZone && lastHoveredZone !== zone) {
    lastHoveredZone.classList.remove('hover');
  }
  if (zone) zone.classList.add('hover');
  lastHoveredZone = zone;
}

async function handleDroppedFilePath(path, role) {
  const { invoke } = await import('@tauri-apps/api/core');
  const dataUrl = await invoke('read_file_as_data_url', { path });
  const fileName = path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });

  if (role === 'base') {
    clearBlurPatternIfNeeded();
    engine.setBaseImage(img);
    baseLoaded = true;
    baseFileName = fileName;
    brushSizeInput.value = 15;
    brushSizeValue.textContent = '15';
    engine.setBrushSize(15);
    updateBrushSizeCircle(15);
    statusBar.textContent = `底图已加载: ${img.naturalWidth}×${img.naturalHeight}`;
    updateReadyState();
  } else {
    isBlurPattern = false;
    engine.setPatternImage(img);
    if (engine.activeLayerIndex >= 0) {
      engine.layers[engine.activeLayerIndex].isBlur = false;
    }
    patternLoaded = true;
    patternPreviewPopup.classList.remove('hidden');
    patternPreviewImg.src = dataUrl;
    addToPatternHistory(dataUrl, path.split(/[\\/]/).pop());
    const resizedDataUrl = await resizeImageForStorage(dataUrl, MAX_STORAGE_IMAGE_SIZE);
    if (patternHistory[0]) patternHistory[0].thumbUrl = resizedDataUrl;
    savePatternHistory();
    updateReadyState();
  }
}

async function initTauriDragDrop() {
  if (!window.__TAURI_INTERNALS__) return;
  const { getCurrentWebview } = await import('@tauri-apps/api/webview');
  const webview = getCurrentWebview();

  await webview.onDragDropEvent((event) => {
    const payload = event.payload;
    if (payload.type === 'enter') {
      if (!payload.paths.some(isSupportedImageFile)) return;
      showDropOverlay();
    } else if (payload.type === 'over') {
      updateZoneHover(getZoneUnderPoint(payload.position.x, payload.position.y));
    } else if (payload.type === 'drop') {
      const zone = getZoneUnderPoint(payload.position.x, payload.position.y);
      const role = zone
        ? zone.dataset.role
        : (baseLoaded && !patternLoaded ? 'pattern' : 'base');
      const filePath = payload.paths.find(isSupportedImageFile);
      if (filePath) {
        hideDropOverlay();
        handleDroppedFilePath(filePath, role).catch(() => {
          statusBar.textContent = '拖拽加载失败';
        });
      } else {
        hideDropOverlay();
      }
    } else if (payload.type === 'leave') {
      hideDropOverlay();
    }
  });
}

initTauriDragDrop();
