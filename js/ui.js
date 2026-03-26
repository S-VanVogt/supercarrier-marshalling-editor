/**
 * UI controller — binds DOM elements to application state, manages the
 * point list, slider, import/export, route panels, and canvas interactions.
 */
import { polylinePoint } from './polyline.js';
import { CATAPULT_COLORS, LANDING_COLOR } from './route-data.js';
import { CREW_MEMBERS, LIVERY_COLOURS } from './crew-data.js';
import { downloadPatchedLua, parseTakeoffRoutes } from './lua-patcher.js';
import { parseCrewLua } from './crew-lua-parser.js';
import { replaceCrewMembers } from './crew-data.js';
import { CREW_ROUTES, replaceCrewRoutes } from './crew-routes-data.js';
import { replaceTaskData } from './takeoff-tasks-data.js';
import { patchCrewLua, downloadPatchedCrewLua } from './crew-lua-patcher.js';

export class UI {
  /** @param {import('./viewport.js').Viewport} viewport  @param {import('./renderer.js').Renderer} renderer  @param {import('./route-state.js').RouteState} routeState */
  constructor(viewport, renderer, routeState) {
    this.viewport = viewport;
    this.renderer = renderer;
    this.canvas = renderer.canvas;
    this.rs = routeState;

    /** Original Lua text for patching/export. */
    this._originalLuaText = null;
    this._originalCrewLuaText = null;
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
      this.rs.setT(this.slider.value / 100);
    });

    // Canvas — drag to move, middle/shift-drag to pan, right-click to add/insert
    this._panning = false;
    this._panLast = null;
    this.canvas.addEventListener('pointerdown', e => this._onPointerDown(e));
    this.canvas.addEventListener('pointermove', e => this._onPointerMove(e));
    this.canvas.addEventListener('pointerup',   e => this._onPointerUp(e));
    this.canvas.addEventListener('pointerleave', e => this._onPointerUp(e));
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Wheel — heading rotation in crew edit mode, otherwise zoom
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (this.rs.crewEditMode && this.rs.hoveredCrewIdx >= 0) {
        const delta = e.deltaY < 0 ? 5 : -5;
        this.rs.rotateCrewMember(this.rs.hoveredCrewIdx, delta);
      } else {
        const w = this._canvasWorld(e);
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        this.viewport.zoom(factor, w.x, w.y);
        this._update();
      }
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

    // Import crew.lua
    document.getElementById('btn-import-crew').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.lua';
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        file.text().then(text => {
          try {
            this._importCrewLua(text);
          } catch (err) {
            alert('Failed to parse crew.lua: ' + err.message);
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

    // Export Crew
    document.getElementById('btn-export-crew').addEventListener('click', () => {
      if (!this._originalCrewLuaText) { alert('crew.lua not imported yet.'); return; }
      const headerComment = document.getElementById('crew-header-comment').value.trim();
      downloadPatchedCrewLua(this._originalCrewLuaText, CREW_MEMBERS, CREW_ROUTES, headerComment);
    });

    // Crew edit mode buttons
    document.getElementById('btn-edit-idle-crew').addEventListener('click', () => {
      if (this.rs.crewEditMode === 'idle') {
        this.rs.exitCrewEdit();
      } else {
        this.rs.enterCrewEdit('idle');
      }
    });
    document.getElementById('btn-edit-active-crew').addEventListener('click', () => {
      if (this.rs.crewEditMode === 'active') {
        this.rs.exitCrewEdit();
      } else {
        this.rs.enterCrewEdit('active');
      }
    });

    // Route global toggles
    document.getElementById('takeoff-global').addEventListener('change', e => {
      this.rs.setAllTakeoffRoutes(e.target.checked);
    });
    document.getElementById('landing-global').addEventListener('change', e => {
      if (e.target.checked) {
        if (!this.rs.landingVisible) this.rs.toggleLandingGlobal();
        this.rs.setAllLandingRoutes(true);
      } else {
        this.rs.setAllLandingRoutes(false);
        if (this.rs.landingVisible) this.rs.toggleLandingGlobal();
      }
    });
    document.getElementById('crew-global').addEventListener('change', e => {
      this.rs.setAllCrew(e.target.checked);
    });

    // Resize
    window.addEventListener('resize', () => this._resize());

    // State changes → re-render
    this.rs.onChange(() => {
      this._syncRoutePanel();
      this.renderList();
      this._update();
    });
  }

  // ── Route panel generation ────────────────────────────────────────────
  _buildRoutePanels() {
    const list = document.getElementById('takeoff-route-list');
    this._buildTakeoffRows(list);

    // Landing route rows
    const lList = document.getElementById('landing-route-list');
    this._buildLandingRows(lList);

    // Crew member rows
    this._rebuildCrewIdleList();
    this._rebuildCrewActiveList();
  }

  _rebuildCrewIdleList() {
    const cList = document.getElementById('crew-idle-list');
    cList.innerHTML = '';
    for (let i = 0; i < CREW_MEMBERS.length; i++) {
      const m = CREW_MEMBERS[i];
      const pal = LIVERY_COLOURS[m.livery] || LIVERY_COLOURS.yellow;
      const row = document.createElement('div');
      row.className = 'route-row';
      row.innerHTML = `
        <span class="route-color-dot" style="background:${pal.fill}"></span>
        <input type="checkbox" checked data-ci="${i}">
        <span class="route-label">${m.name}</span>
        <button class="route-revert-btn" data-ci="${i}" title="Revert to original" disabled>Revert</button>
      `;
      row.querySelector('input[type="checkbox"]').addEventListener('change', () => {
        this.rs.toggleCrewMember(i);
      });
      row.querySelector('.route-revert-btn').addEventListener('click', () => {
        this.rs.revertCrewMember(i);
      });
      cList.appendChild(row);
    }
  }

  _rebuildCrewActiveList() {
    const cList = document.getElementById('crew-active-list');
    cList.innerHTML = '';
    for (let i = 0; i < CREW_ROUTES.length; i++) {
      const r = CREW_ROUTES[i];
      const row = document.createElement('div');
      row.className = 'route-row';
      row.innerHTML = `
        <span class="route-color-dot" style="background:#999"></span>
        <span class="route-label">${i}: ${r.name}</span>
        <button class="route-revert-btn" data-cri="${i}" title="Revert to original" disabled>Revert</button>
      `;
      row.querySelector('.route-revert-btn').addEventListener('click', () => {
        this.rs.revertCrewRoute(i);
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
        if (this.rs.selectedRouteType === 'takeoff' && this.rs.selectedRoute === i) {
          this.rs.deselectRoute();
        } else {
          this.rs.selectRoute('takeoff', i);
        }
        this.renderList();
      });
      list.appendChild(row);
    }
  }

  _buildLandingRows(list) {
    for (let i = 0; i < this.rs.landingRoutes.length; i++) {
      const route = this.rs.landingRoutes[i];
      const color = LANDING_COLOR;
      const row = document.createElement('div');
      row.className = 'route-row';
      row.dataset.landingRoute = i;
      row.innerHTML = `
        <span class="route-color-dot" style="background:${color}"></span>
        <input type="checkbox" checked data-li="${i}">
        <input class="route-label-input" type="text" value="${route.id}. ${route.label}" data-li="${i}">
        <button class="route-edit-btn" data-li="${i}" title="Edit route on canvas">Edit</button>
        <button class="route-revert-btn" data-li="${i}" title="Revert to original" disabled>Revert</button>
      `;
      row.querySelector('input[type="checkbox"]').addEventListener('change', () => {
        this.rs.toggleLandingRoute(i);
        // Auto-enable master visibility when any individual route is checked
        if (this.rs.landingRouteVisible[i] && !this.rs.landingVisible) {
          this.rs.toggleLandingGlobal();
        }
      });
      row.querySelector('.route-label-input').addEventListener('change', (e) => {
        this.rs.landingRoutes[i].label = e.target.value;
      });
      row.querySelector('.route-revert-btn').addEventListener('click', () => {
        this.rs.revertLandingRoute(i);
      });
      row.querySelector('.route-edit-btn').addEventListener('click', () => {
        if (this.rs.selectedRouteType === 'landing' && this.rs.selectedRoute === i) {
          this.rs.deselectRoute();
        } else {
          // Auto-enable landing visibility when editing a landing route
          if (!this.rs.landingVisible) this.rs.toggleLandingGlobal();
          this.rs.selectRoute('landing', i);
        }
        this.renderList();
      });
      list.appendChild(row);
    }
  }

  _importCrewLua(text) {
    const data = parseCrewLua(text);

    // Store original text for export
    this._originalCrewLuaText = text;

    // Replace members data in-place
    replaceCrewMembers(data.members);

    // Replace routes data in-place
    replaceCrewRoutes(data.routes, data.takeoffTasks);

    // Replace task data in-place
    replaceTaskData(data.takeoffTasks, data.parkingTasks);

    // Update crew visibility array to match new member count
    this.rs.crewVisible = new Array(data.members.length).fill(true);

    // Refresh snapshots for revert
    this.rs.refreshCrewSnapshots();

    // Exit crew edit mode if active
    if (this.rs.crewEditMode) this.rs.exitCrewEdit();

    // Rebuild crew panels
    this._rebuildCrewIdleList();
    this._rebuildCrewActiveList();

    // Trigger redraw
    this.rs._notify();

    console.log(`Imported crew.lua: ${data.members.length} members, ${data.routes.length} routes, ${data.takeoffTasks.length} takeoff tasks, ${data.parkingTasks.length} parking tasks`);
  }

  _rebuildRouteList() {
    const list = document.getElementById('takeoff-route-list');
    list.innerHTML = '';
    this._buildTakeoffRows(list);
    this._syncRoutePanel();
  }

  _syncRoutePanel() {
    // Takeoff panel
    const rows = document.querySelectorAll('#takeoff-route-list .route-row');
    for (let i = 0; i < rows.length; i++) {
      const cb = rows[i].querySelector('input[type="checkbox"]');
      cb.checked = this.rs.takeoffRouteVisible[i];
      const btn = rows[i].querySelector('.route-edit-btn');
      const isSelected = this.rs.selectedRouteType === 'takeoff' && this.rs.selectedRoute === i;
      btn.classList.toggle('active', isSelected);
      rows[i].classList.toggle('selected', isSelected);
      const revertBtn = rows[i].querySelector('.route-revert-btn');
      revertBtn.disabled = !this.rs.isRouteModified(i);
    }
    document.getElementById('takeoff-global').checked = this.rs.allTakeoffRoutesVisible();

    // Landing panel
    const lRows = document.querySelectorAll('#landing-route-list .route-row');
    for (let i = 0; i < lRows.length; i++) {
      const cb = lRows[i].querySelector('input[type="checkbox"]');
      cb.checked = this.rs.landingRouteVisible[i];
      const btn = lRows[i].querySelector('.route-edit-btn');
      const isSelected = this.rs.selectedRouteType === 'landing' && this.rs.selectedRoute === i;
      btn.classList.toggle('active', isSelected);
      lRows[i].classList.toggle('selected', isSelected);
      const revertBtn = lRows[i].querySelector('.route-revert-btn');
      revertBtn.disabled = !this.rs.isLandingRouteModified(i);
    }
    document.getElementById('landing-global').checked = this.rs.landingVisible && this.rs.allLandingRoutesVisible();

    // Crew idle sync
    const idleRows = document.querySelectorAll('#crew-idle-list .route-row');
    for (let i = 0; i < idleRows.length; i++) {
      const cb = idleRows[i].querySelector('input[type="checkbox"]');
      if (cb) cb.checked = this.rs.crewVisible[i];
      const revertBtn = idleRows[i].querySelector('.route-revert-btn');
      if (revertBtn) revertBtn.disabled = !this.rs.isCrewMemberModified(i);
      const isSelected = this.rs.crewEditMode === 'idle' && this.rs.selectedCrewIdx === i;
      idleRows[i].classList.toggle('selected', isSelected);
    }
    document.getElementById('crew-global').checked = this.rs.allCrewVisible();

    // Crew active sync
    const activeRows = document.querySelectorAll('#crew-active-list .route-row');
    for (let i = 0; i < activeRows.length; i++) {
      const revertBtn = activeRows[i].querySelector('.route-revert-btn');
      if (revertBtn) revertBtn.disabled = !this.rs.isCrewRouteModified(i);
      const isSelected = this.rs.crewEditMode === 'active' && this.rs.selectedCrewIdx === i;
      activeRows[i].classList.toggle('selected', isSelected);
    }

    // Crew edit buttons
    const idleBtn = document.getElementById('btn-edit-idle-crew');
    const activeBtn = document.getElementById('btn-edit-active-crew');
    if (idleBtn) idleBtn.classList.toggle('active', this.rs.crewEditMode === 'idle');
    if (activeBtn) activeBtn.classList.toggle('active', this.rs.crewEditMode === 'active');
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
    if ((this.rs.selectedRoute >= 0 && this.rs.selectedRouteType) || this.rs.crewEditMode) {
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
    // Crew edit mode
    if (this.rs.crewEditMode && e.button === 0) {
      this._onCrewPointerDown(e);
      return;
    }
    if (this.rs.selectedRoute >= 0 && this.rs.selectedRouteType) {
      if (e.button === 2) {
        this._onRouteRightClick(e);
      } else {
        this._onRoutePointerDown(e);
      }
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
    // Crew edit mode: drag or hover
    if (this.rs.crewEditMode) {
      this._onCrewPointerMove(e);
      return;
    }
    if (this.rs.selectedRoute >= 0 && this.rs.selectedRouteType) {
      this._onRoutePointerMove(e);
    }
  }

  _onPointerUp(e) {
    this._panning = false;
    this._panLast = null;
    this.rs.draggingPoint = -1;
    this.rs.draggingCrew = false;
  }

  // ── Route pointer handlers ────────────────────────────────────────────
  /** Get the points array of the currently selected route. */
  _selectedPoints() {
    const route = this.rs.getSelectedRoute();
    return route ? route.points : null;
  }

  _onRoutePointerDown(e) {
    const ri = this.rs.selectedRoute;
    if (ri < 0) return;
    const w = this._canvasWorld(e);
    const pts = this._selectedPoints();
    if (!pts) return;
    const hr = this._hitRadius();

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

  _onRouteRightClick(e) {
    const ri = this.rs.selectedRoute;
    if (ri < 0) return;
    const w = this._canvasWorld(e);
    const pts = this._selectedPoints();
    if (!pts) return;
    const hr = this._hitRadius() * 2;

    let bestSeg = -1, bestD = Infinity;
    for (let j = 0; j < pts.length - 1; j++) {
      const d = this._distToSegment(w, pts[j], pts[j + 1]);
      if (d < hr && d < bestD) { bestSeg = j; bestD = d; }
    }

    const x = +w.x.toFixed(2);
    const y = +w.y.toFixed(2);
    if (bestSeg >= 0) {
      this.rs.addWaypoint(ri, bestSeg, x, y);
    } else {
      this.rs.addWaypoint(ri, pts.length - 1, x, y);
    }
    this.renderList();
  }

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

  // ── Crew pointer handlers ────────────────────────────────────────────
  _crewHitTest(w) {
    const hr = this._hitRadius();
    if (this.rs.crewEditMode === 'idle') {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < CREW_MEMBERS.length; i++) {
        const m = CREW_MEMBERS[i];
        const dx = m.x - w.x, dy = m.y - w.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < hr && d < bestD) { best = i; bestD = d; }
      }
      return best;
    } else if (this.rs.crewEditMode === 'active') {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < CREW_ROUTES.length; i++) {
        const r = CREW_ROUTES[i];
        // Test last point for multi-point, or the single position
        const pos = (r.points && r.points.length > 0) ? r.points[r.points.length - 1] : r;
        const dx = pos.x - w.x, dy = pos.y - w.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < hr && d < bestD) { best = i; bestD = d; }
      }
      return best;
    }
    return -1;
  }

  _onCrewPointerDown(e) {
    const w = this._canvasWorld(e);
    const hit = this._crewHitTest(w);
    if (hit >= 0) {
      this.rs.selectedCrewIdx = hit;
      this.rs.draggingCrew = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.rs._notify();
    } else {
      if (this.rs.selectedCrewIdx >= 0) {
        this.rs.selectedCrewIdx = -1;
        this.rs._notify();
      }
    }
  }

  _onCrewPointerMove(e) {
    const w = this._canvasWorld(e);
    // Dragging
    if (this.rs.draggingCrew && this.rs.selectedCrewIdx >= 0) {
      this.rs.moveCrewMember(this.rs.selectedCrewIdx, +w.x.toFixed(2), +w.y.toFixed(2));
      return;
    }
    // Hover detection for scroll-wheel rotation
    const hit = this._crewHitTest(w);
    if (hit !== this.rs.hoveredCrewIdx) {
      this.rs.hoveredCrewIdx = hit;
      this.canvas.style.cursor = hit >= 0 ? 'grab' : 'crosshair';
    }
  }

  // ── Point list ──────────────────────────────────────────────────────────
  renderList() {
    this.ptRows.innerHTML = '';
    const title = document.getElementById('pt-list-title');
    const header = document.querySelector('.pt-header');

    // ── Crew edit mode ──
    if (this.rs.crewEditMode && this.rs.selectedCrewIdx >= 0) {
      if (this.rs.crewEditMode === 'idle') {
        const m = CREW_MEMBERS[this.rs.selectedCrewIdx];
        if (!m) return;
        title.textContent = `Crew: ${m.name}`;
        header.innerHTML = `<span>#</span><span>x</span><span>y</span><span>hdg (°)</span><span></span>`;
        header.style.gridTemplateColumns = '28px 1fr 1fr 80px 28px';

        const row = document.createElement('div');
        row.className = 'pt-row';
        row.style.gridTemplateColumns = '28px 1fr 1fr 80px 28px';
        row.innerHTML = `
          <span class="pt-idx">0</span>
          <input type="number" value="${m.x.toFixed(2)}" step="0.1" data-k="x">
          <input type="number" value="${m.y.toFixed(2)}" step="0.1" data-k="y">
          <input type="number" value="${m.hdg.toFixed(1)}" step="5" data-k="hdg" style="width:100%">
          <span></span>
        `;
        for (const inp of row.querySelectorAll('input')) {
          inp.addEventListener('input', () => {
            const val = parseFloat(inp.value);
            if (isNaN(val)) return;
            const k = inp.dataset.k;
            if (k === 'x') { m.x = val; this.rs._notify(); }
            else if (k === 'y') { m.y = val; this.rs._notify(); }
            else if (k === 'hdg') { m.hdg = val; this.rs._notify(); }
          });
        }
        this.ptRows.appendChild(row);
      } else if (this.rs.crewEditMode === 'active') {
        const r = CREW_ROUTES[this.rs.selectedCrewIdx];
        if (!r) return;
        title.textContent = `Route: ${r.name}`;
        header.innerHTML = `<span>#</span><span>x</span><span>y</span><span>angle (°)</span><span></span>`;
        header.style.gridTemplateColumns = '28px 1fr 1fr 80px 28px';

        const pts = r.points || [{ x: r.x, y: r.y, angle: r.angle }];
        pts.forEach((p, i) => {
          const row = document.createElement('div');
          row.className = 'pt-row';
          row.style.gridTemplateColumns = '28px 1fr 1fr 80px 28px';
          const angleDeg = (p.angle * 180 / Math.PI).toFixed(1);
          row.innerHTML = `
            <span class="pt-idx">${i}</span>
            <input type="number" value="${p.x.toFixed(2)}" step="0.1" data-i="${i}" data-k="x">
            <input type="number" value="${p.y.toFixed(2)}" step="0.1" data-i="${i}" data-k="y">
            <input type="number" value="${angleDeg}" step="5" data-i="${i}" data-k="angle" style="width:100%">
            <span></span>
          `;
          for (const inp of row.querySelectorAll('input')) {
            inp.addEventListener('input', () => {
              const val = parseFloat(inp.value);
              if (isNaN(val)) return;
              const k = inp.dataset.k;
              const idx = +inp.dataset.i;
              const pt = pts[idx];
              if (k === 'x') { pt.x = val; if (!r.points) r.x = val; this.rs._notify(); }
              else if (k === 'y') { pt.y = val; if (!r.points) r.y = val; this.rs._notify(); }
              else if (k === 'angle') {
                const rad = val * Math.PI / 180;
                pt.angle = rad;
                if (!r.points) r.angle = rad;
                this.rs._notify();
              }
            });
          }
          this.ptRows.appendChild(row);
        });
      }
      return;
    }

    // ── Route edit mode ──
    const ri = this.rs.selectedRoute;
    const type = this.rs.selectedRouteType;
    const isRoute = ri >= 0 && type;
    const route = isRoute ? this.rs.getSelectedRoute() : null;
    const points = route ? route.points : [];

    if (route) {
      const prefix = type === 'landing' ? 'Landing' : 'Route';
      title.textContent = `${prefix} ${route.id}: ${route.label}`;
    } else {
      title.textContent = 'No route selected';
    }

    if (!route) return;

    header.innerHTML = `<span>#</span><span>x</span><span>y</span><span>v</span><span></span>`;
    header.style.gridTemplateColumns = '28px 1fr 1fr 60px 28px';

    points.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'pt-row';
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
            route.points[idx].v = val;
            this.rs._notify();
          } else {
            const pt = route.points[idx];
            this.rs.moveWaypoint(ri, idx,
              key === 'x' ? val : pt.x,
              key === 'y' ? val : pt.y);
          }
        });
      }
      this.ptRows.appendChild(row);
    });
  }

  _addFromInputs() {
    const x = parseFloat(this.addXInput.value);
    const y = parseFloat(this.addYInput.value);
    if (isNaN(x) || isNaN(y)) return;
    const ri = this.rs.selectedRoute;
    if (ri >= 0 && this.rs.selectedRouteType) {
      const pts = this._selectedPoints();
      if (pts) this.rs.addWaypoint(ri, pts.length - 1, x, y);
    }
    this.addXInput.value = '';
    this.addYInput.value = '';
    this.renderList();
  }

  // ── Render loop ────────────────────────────────────────────────────────
  _update() {
    this.tval.textContent = this.rs.t.toFixed(2);
    this.slider.value = Math.round(this.rs.t * 100);
    this.renderer.render(this.rs);

    // Update coord display from route marker
    const route = this.rs.getSelectedRoute();
    if (route) {
      const rpt = polylinePoint(route.points, this.rs.t);
      if (rpt) {
        this.coordout.textContent = `x: ${rpt.x.toFixed(2)}, y: ${rpt.y.toFixed(2)}`;
      }
    } else {
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
