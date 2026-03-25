/**
 * UI controller — binds DOM elements to application state, manages the
 * point list, slider, import/export, route panels, and canvas interactions.
 */
import { state } from './state.js';
import { nearestPointIndex, polylinePoint } from './polyline.js';
import { CATAPULT_COLORS } from './route-data.js';
import { CREW_MEMBERS, LIVERY_COLOURS } from './crew-data.js';
import { downloadPatchedLua, parseTakeoffRoutes } from './lua-patcher.js';

export class UI {
  /** @param {import('./viewport.js').Viewport} viewport  @param {import('./renderer.js').Renderer} renderer  @param {import('./route-state.js').RouteState} routeState */
  constructor(viewport, renderer, routeState) {
    this.viewport = viewport;
    this.renderer = renderer;
    this.canvas = renderer.canvas;
    this.rs = routeState;

    /** Edit mode: 'polyline' or 'route' */
    this.editMode = 'polyline';

    /** Original Lua text for patching/export. */
    this._originalLuaText = null;
    fetch('./data/USS_Nimitz_RunwaysAndRoutes.lua')
      .then(r => r.text())
      .then(text => { this._originalLuaText = text; });

    // DOM references
    this.slider      = document.getElementById('tslider');
    this.tval        = document.getElementById('tval');
    this.coordout    = document.getElementById('coordout');
    this.ptRows      = document.getElementById('pt-rows');
    this.addXInput   = document.getElementById('add-x');
    this.addYInput   = document.getElementById('add-y');

    this._bindEvents();
    this._buildRoutePanels();
    this.renderList();
  }

  // ── Event wiring ────────────────────────────────────────────────────────
  _bindEvents() {
    // Slider
    this.slider.addEventListener('input', () => {
      state.setT(this.slider.value / 100);
    });

    // Canvas — click to add, drag to move, middle/shift-drag to pan
    this._panning = false;
    this._panLast = null;
    this.canvas.addEventListener('pointerdown', e => this._onPointerDown(e));
    this.canvas.addEventListener('pointermove', e => this._onPointerMove(e));
    this.canvas.addEventListener('pointerup',   e => this._onPointerUp(e));
    this.canvas.addEventListener('pointerleave', e => this._onPointerUp(e));
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Wheel to zoom
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const w = this._canvasWorld(e);
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.viewport.zoom(factor, w.x, w.y);
      this._update();
    }, { passive: false });

    // Touch: prevent scroll while dragging/panning on canvas
    this.canvas.addEventListener('touchstart', e => {
      if (state.dragging >= 0 || this._panning) e.preventDefault();
    }, { passive: false });
    this.canvas.addEventListener('touchmove', e => {
      if (state.dragging >= 0 || this._panning) e.preventDefault();
    }, { passive: false });

    // Buttons
    document.getElementById('btn-add').addEventListener('click', () => this._addFromInputs());

    // Enter key in add-point inputs
    const addEnter = e => { if (e.key === 'Enter') this._addFromInputs(); };
    this.addXInput.addEventListener('keydown', addEnter);
    this.addYInput.addEventListener('keydown', addEnter);

    // Import Lua
    document.getElementById('btn-import-lua').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.lua';
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        file.text().then(text => {
          try {
            const routes = parseTakeoffRoutes(text);
            this.rs.loadTakeoffRoutes(routes);
            this._originalLuaText = text;
            this._rebuildRouteList();
          } catch (err) {
            alert('Failed to parse Lua file: ' + err.message);
          }
        });
      });
      input.click();
    });

    // Export Lua
    document.getElementById('btn-export-lua').addEventListener('click', () => {
      if (!this._originalLuaText) { alert('Lua file not loaded yet.'); return; }
      const headerComment = document.getElementById('lua-header-comment').value.trim();
      downloadPatchedLua(this._originalLuaText, this.rs.takeoffRoutes, headerComment);
    });

    // Route global toggles
    document.getElementById('takeoff-global').addEventListener('change', e => {
      this.rs.setAllTakeoffRoutes(e.target.checked);
    });
    document.getElementById('landing-global').addEventListener('change', e => {
      if (this.rs.landingVisible !== e.target.checked) this.rs.toggleLandingGlobal();
    });
    document.getElementById('crew-global').addEventListener('change', e => {
      this.rs.setAllCrew(e.target.checked);
    });

    // Resize
    window.addEventListener('resize', () => this._resize());

    // State changes → re-render
    state.onChange(() => this._update());
    this.rs.onChange(() => {
      this._syncRoutePanel();
      if (this.editMode === 'route') this.renderList();
      this._update();
    });
  }

  // ── Route panel generation ────────────────────────────────────────────
  _buildRoutePanels() {
    const list = document.getElementById('takeoff-route-list');
    this._buildTakeoffRows(list);

    // Landing placeholder rows
    const lList = document.getElementById('landing-route-list');
    for (let i = 0; i < 16; i++) {
      const row = document.createElement('div');
      row.className = 'route-row';
      row.innerHTML = `
        <span class="route-color-dot" style="background:#aaa"></span>
        <input type="checkbox" checked data-li="${i}" disabled>
        <span class="route-label" style="color:#aaa">${i + 1}. Landing route ${i + 1}</span>
      `;
      lList.appendChild(row);
    }

    // Crew member rows
    const cList = document.getElementById('crew-list');
    for (let i = 0; i < CREW_MEMBERS.length; i++) {
      const m = CREW_MEMBERS[i];
      const pal = LIVERY_COLOURS[m.livery] || LIVERY_COLOURS.yellow;
      const row = document.createElement('div');
      row.className = 'route-row';
      row.innerHTML = `
        <span class="route-color-dot" style="background:${pal.fill}"></span>
        <input type="checkbox" checked data-ci="${i}">
        <span class="route-label">${m.name}</span>
      `;
      row.querySelector('input[type="checkbox"]').addEventListener('change', () => {
        this.rs.toggleCrewMember(i);
      });
      cList.appendChild(row);
    }
  }

  _buildTakeoffRows(list) {
    for (let i = 0; i < this.rs.takeoffRoutes.length; i++) {
      const route = this.rs.takeoffRoutes[i];
      const color = CATAPULT_COLORS[route.runwayIdx] || '#888';
      const row = document.createElement('div');
      row.className = 'route-row';
      row.dataset.route = i;
      row.innerHTML = `
        <span class="route-color-dot" style="background:${color}"></span>
        <input type="checkbox" checked data-ri="${i}">
        <input class="route-label-input" type="text" value="${route.id}. ${route.label}" data-ri="${i}">
        <button class="route-edit-btn" data-ri="${i}" title="Edit route on canvas">Edit</button>
        <button class="route-revert-btn" data-ri="${i}" title="Revert to original" disabled>Revert</button>
      `;
      row.querySelector('input[type="checkbox"]').addEventListener('change', () => {
        this.rs.toggleTakeoffRoute(i);
      });
      row.querySelector('.route-label-input').addEventListener('change', (e) => {
        this.rs.takeoffRoutes[i].label = e.target.value;
      });
      row.querySelector('.route-revert-btn').addEventListener('click', () => {
        this.rs.revertRoute(i);
      });
      row.querySelector('.route-edit-btn').addEventListener('click', () => {
        if (this.rs.selectedRoute === i) {
          this.rs.deselectRoute();
          this.editMode = 'polyline';
        } else {
          this.rs.selectRoute(i);
          this.editMode = 'route';
        }
        this.renderList();
      });
      list.appendChild(row);
    }
  }

  _rebuildRouteList() {
    const list = document.getElementById('takeoff-route-list');
    list.innerHTML = '';
    this._buildTakeoffRows(list);
    this._syncRoutePanel();
  }

  _syncRoutePanel() {
    const rows = document.querySelectorAll('#takeoff-route-list .route-row');
    for (let i = 0; i < rows.length; i++) {
      const cb = rows[i].querySelector('input[type="checkbox"]');
      cb.checked = this.rs.takeoffRouteVisible[i];
      const btn = rows[i].querySelector('.route-edit-btn');
      btn.classList.toggle('active', this.rs.selectedRoute === i);
      rows[i].classList.toggle('selected', this.rs.selectedRoute === i);
      const revertBtn = rows[i].querySelector('.route-revert-btn');
      revertBtn.disabled = !this.rs.isRouteModified(i);
    }
    document.getElementById('takeoff-global').checked = this.rs.allTakeoffRoutesVisible();

    // Crew sync
    const crewRows = document.querySelectorAll('#crew-list .route-row');
    for (let i = 0; i < crewRows.length; i++) {
      const cb = crewRows[i].querySelector('input[type="checkbox"]');
      cb.checked = this.rs.crewVisible[i];
    }
    document.getElementById('crew-global').checked = this.rs.allCrewVisible();
  }

  // ── Canvas pointer handling ─────────────────────────────────────────────
  _canvasWorld(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / rect.width;
    const sy = this.canvas.height / rect.height;
    return this.viewport.toWorld(
      (e.clientX - rect.left) * sx,
      (e.clientY - rect.top) * sy,
      this.canvas.width, this.canvas.height,
    );
  }

  /** Hit-test radius in world units (~ 8 px). */
  _hitRadius() {
    return (this.viewport.width / this.canvas.width) * 8;
  }

  _isPanButton(e) {
    // In route edit mode, right-click is used for adding points, so only
    // middle-click and shift+left-drag pan.  Outside route mode, right-click pans.
    if (this.editMode === 'route') {
      return e.button === 1 || (e.button === 0 && e.shiftKey);
    }
    return e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey);
  }

  _onPointerDown(e) {
    if (this._isPanButton(e)) {
      this._panning = true;
      this._panLast = this._canvasWorld(e);
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (this.editMode === 'route') {
      if (e.button === 2) {
        this._onRouteRightClick(e);
      } else {
        this._onRoutePointerDown(e);
      }
    } else {
      this._onPolylinePointerDown(e);
    }
  }

  _onPointerMove(e) {
    if (this._panning && this._panLast) {
      const w = this._canvasWorld(e);
      this.viewport.pan(this._panLast.x - w.x, this._panLast.y - w.y);
      this._update();
      this._panLast = this._canvasWorld(e);
      return;
    }
    if (this.editMode === 'route') {
      this._onRoutePointerMove(e);
    } else {
      this._onPolylinePointerMove(e);
    }
  }

  _onPointerUp(e) {
    this._panning = false;
    this._panLast = null;
    if (this.editMode === 'route') {
      this.rs.draggingPoint = -1;
    } else {
      state.dragging = -1;
    }
  }

  // ── Polyline pointer handlers ─────────────────────────────────────────
  _onPolylinePointerDown(e) {
    const w = this._canvasWorld(e);
    const idx = nearestPointIndex(state.points, w.x, w.y, this._hitRadius());
    if (idx >= 0) {
      state.dragging = idx;
      this.canvas.setPointerCapture(e.pointerId);
    } else {
      state.addPoint(+w.x.toFixed(2), +w.y.toFixed(2));
      this.renderList();
    }
  }

  _onPolylinePointerMove(e) {
    if (state.dragging < 0) return;
    const w = this._canvasWorld(e);
    state.movePoint(state.dragging, +w.x.toFixed(2), +w.y.toFixed(2));
    this.renderList();
  }

  // ── Route pointer handlers ────────────────────────────────────────────
  _onRoutePointerDown(e) {
    const ri = this.rs.selectedRoute;
    if (ri < 0) return;
    const w = this._canvasWorld(e);
    const pts = this.rs.takeoffRoutes[ri].points;
    const hr = this._hitRadius();

    // Find nearest waypoint
    let best = -1, bestD = Infinity;
    for (let j = 0; j < pts.length; j++) {
      const dx = pts[j].x - w.x, dy = pts[j].y - w.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < hr && d < bestD) { best = j; bestD = d; }
    }

    if (best >= 0) {
      this.rs.draggingPoint = best;
      this.canvas.setPointerCapture(e.pointerId);
    }
  }

  /** Right-click: insert on nearest segment, or append if not near any segment. */
  _onRouteRightClick(e) {
    const ri = this.rs.selectedRoute;
    if (ri < 0) return;
    const w = this._canvasWorld(e);
    const pts = this.rs.takeoffRoutes[ri].points;
    const hr = this._hitRadius() * 2; // slightly larger hit zone for segments

    // Find nearest segment
    let bestSeg = -1, bestD = Infinity;
    for (let j = 0; j < pts.length - 1; j++) {
      const d = this._distToSegment(w, pts[j], pts[j + 1]);
      if (d < hr && d < bestD) { bestSeg = j; bestD = d; }
    }

    const x = +w.x.toFixed(2);
    const y = +w.y.toFixed(2);
    if (bestSeg >= 0) {
      // Insert between segment endpoints
      this.rs.addWaypoint(ri, bestSeg, x, y);
    } else {
      // Append at end
      this.rs.addWaypoint(ri, pts.length - 1, x, y);
    }
    this.renderList();
  }

  /** Distance from point p to line segment a–b. */
  _distToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx, projY = a.y + t * dy;
    return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
  }

  _onRoutePointerMove(e) {
    const ri = this.rs.selectedRoute;
    if (ri < 0 || this.rs.draggingPoint < 0) return;
    const w = this._canvasWorld(e);
    this.rs.moveWaypoint(ri, this.rs.draggingPoint, +w.x.toFixed(2), +w.y.toFixed(2));
  }

  // ── Point list ──────────────────────────────────────────────────────────
  renderList() {
    this.ptRows.innerHTML = '';
    const ri = this.rs.selectedRoute;
    const isRoute = this.editMode === 'route' && ri >= 0;
    const points = isRoute ? this.rs.takeoffRoutes[ri].points : state.points;

    // Update title
    const title = document.getElementById('pt-list-title');
    if (isRoute) {
      const route = this.rs.takeoffRoutes[ri];
      title.textContent = `Route ${route.id}: ${route.label}`;
    } else {
      title.textContent = 'Polyline Points';
    }

    // Update header to show context
    const header = document.querySelector('.pt-header');
    if (isRoute) {
      const route = this.rs.takeoffRoutes[ri];
      header.innerHTML = `<span>#</span><span>x</span><span>y</span><span>v</span><span></span>`;
      header.style.gridTemplateColumns = '28px 1fr 1fr 60px 28px';
    } else {
      header.innerHTML = `<span>#</span><span>x</span><span>y</span><span></span>`;
      header.style.gridTemplateColumns = '28px 1fr 1fr 28px';
    }

    points.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'pt-row';
      if (isRoute) {
        row.style.gridTemplateColumns = '28px 1fr 1fr 60px 28px';
        row.innerHTML = `
          <span class="pt-idx">${i}</span>
          <input type="number" value="${p.x.toFixed(2)}" step="0.1" data-i="${i}" data-k="x">
          <input type="number" value="${p.y.toFixed(2)}" step="0.1" data-i="${i}" data-k="y">
          <input type="number" value="${(p.v ?? 1).toFixed(2)}" step="0.1" data-i="${i}" data-k="v" style="width:100%">
          <button class="del-btn" title="Remove">\u2715</button>
        `;
        row.querySelector('.del-btn').addEventListener('click', () => {
          this.rs.removeWaypoint(ri, i);
          this.renderList();
        });
        for (const inp of row.querySelectorAll('input')) {
          inp.addEventListener('input', () => {
            const val = parseFloat(inp.value);
            if (isNaN(val)) return;
            const idx = +inp.dataset.i;
            const key = inp.dataset.k;
            if (key === 'v') {
              this.rs.takeoffRoutes[ri].points[idx].v = val;
              this.rs._notify();
            } else {
              const pt = this.rs.takeoffRoutes[ri].points[idx];
              this.rs.moveWaypoint(ri, idx,
                key === 'x' ? val : pt.x,
                key === 'y' ? val : pt.y);
            }
          });
        }
      } else {
        row.innerHTML = `
          <span class="pt-idx">${i}</span>
          <input type="number" value="${p.x.toFixed(2)}" step="0.1" data-i="${i}" data-k="x">
          <input type="number" value="${p.y.toFixed(2)}" step="0.1" data-i="${i}" data-k="y">
          <button class="del-btn" title="Remove">\u2715</button>
        `;
        row.querySelector('.del-btn').addEventListener('click', () => {
          state.deletePoint(i);
          this.renderList();
        });
        for (const inp of row.querySelectorAll('input')) {
          inp.addEventListener('input', () => {
            const val = parseFloat(inp.value);
            if (!isNaN(val)) state.updatePoint(+inp.dataset.i, inp.dataset.k, val);
          });
        }
      }
      this.ptRows.appendChild(row);
    });
  }

  _addFromInputs() {
    const x = parseFloat(this.addXInput.value);
    const y = parseFloat(this.addYInput.value);
    if (isNaN(x) || isNaN(y)) return;
    const ri = this.rs.selectedRoute;
    if (this.editMode === 'route' && ri >= 0) {
      const pts = this.rs.takeoffRoutes[ri].points;
      this.rs.addWaypoint(ri, pts.length - 1, x, y);
    } else {
      state.addPoint(x, y);
    }
    this.addXInput.value = '';
    this.addYInput.value = '';
    this.renderList();
  }

  // ── Render loop ────────────────────────────────────────────────────────
  _update() {
    this.tval.textContent = state.t.toFixed(2);
    this.slider.value = Math.round(state.t * 100);
    const pt = this.renderer.render(state.points, state.t, this.rs);

    // Update coord display from route marker or polyline marker
    const ri = this.rs.selectedRoute;
    if (this.editMode === 'route' && ri >= 0) {
      const rpt = polylinePoint(this.rs.takeoffRoutes[ri].points, state.t);
      if (rpt) {
        this.coordout.textContent = `x: ${rpt.x.toFixed(2)}, y: ${rpt.y.toFixed(2)}`;
      }
    } else if (pt) {
      this.coordout.textContent = `x: ${pt.x.toFixed(2)}, y: ${pt.y.toFixed(2)}`;
    } else if (state.points.length < 2) {
      this.coordout.textContent = 'x: \u2014, y: \u2014';
    }
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.min(rect.width, 2048);
    this.canvas.height = 500;
    this.viewport.equalizeScale(this.canvas.width, this.canvas.height);
    this._update();
  }

  /** First paint. */
  boot() {
    this._resize();
  }
}
