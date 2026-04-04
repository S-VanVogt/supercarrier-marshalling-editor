/**
 * UI controller — binds DOM elements to application state, manages the
 * point list, slider, import/export, route panels, and canvas interactions.
 */
import { polylinePoint, segmentLengths } from './polyline.js';
import { CATAPULT_COLORS, CAT_TAIL_POINTS, LANDING_COLOR } from './route-data.js';
import { CREW_MEMBERS, LIVERY_COLOURS } from './crew-data.js';
import { downloadPatchedLua, buildPatchedLua, parseTakeoffRoutes, parseLandingRoutes, parseElevators, patchElevators, parseBlockerTerminals, patchBlockerTerminals } from './lua-patcher.js';
import { parseCrewLua } from './crew-lua-parser.js';
import { replaceCrewMembers } from './crew-data.js';
import { CREW_ROUTES, CREW_ACTIVE_LINKS, replaceCrewRoutes, refreshCrewActiveLinks } from './crew-routes-data.js';
import { replaceTaskData, refreshTaskDerivedData, TAKEOFF_TASKS, PARKING_TASKS } from './takeoff-tasks-data.js';
import { patchCrewLua, downloadPatchedCrewLua, buildPatchedCrewLua } from './crew-lua-patcher.js';
import { parseCatapultCrew } from './crew-lua-parser.js';
import { CATAPULT_CREWS, CATAPULT_MEMBER_COLORS, CATAPULT_PHASES, findPhaseRoute, memberLocalTs, replaceCatapultCrews } from './catapult-crew-data.js';
import { DEFAULT_CATAPULT_CREWS } from './catapult-crew-defaults.js';
import { validateTakeoffTasks } from './takeoff-validation.js';
import * as CS from './config-store.js';

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

    // Task edit state
    this._taskEditActive = false;
    this._selectedHandoff = -1;  // step index, -1 = none
    this._draggingHandoff = false;

    // Assign mode state (right-click handoff box → click crew on canvas)
    this._assignMode = false;
    this._assignStepIdx = -1;   // step index being assigned
    this._assignIsBrown = false; // true if assigning the brown crew

    // Catapult crew hide state (per cat, sets h to 0.0123 to sink crew below deck)
    this._catCrewHidden = [false, false, false, false];
    // Catapult crew disable state (per cat, marks catapult as unavailable)
    this._catCrewDisabled = [false, false, false, false];

    this._bindEvents();
    this._buildRoutePanels();
    this._buildBlockerGrid();
    this._syncRoutePanel();
    this.renderList();
  }

  // ── Event wiring ────────────────────────────────────────────────────────
  _bindEvents() {
    // Undo / Redo
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        // Don't intercept if focused on an input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        if (this.rs.undo()) {
          this._rebuildAllUI();
          this._update();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey)) ) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        if (this.rs.redo()) {
          this._rebuildAllUI();
          this._update();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        if (this.rs.redo()) {
          this._rebuildAllUI();
          this._update();
        }
      }
    });

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

    // ── Multi-touch: pinch-to-zoom + long-press for right-click ──
    this._activePointers = new Map();   // pointerId → {x, y}
    this._pinchStartDist = 0;
    this._longPressTimer = null;
    this._longPressThreshold = 500;     // ms
    this._longPressMoveLimit = 10;      // px

    this.canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Two fingers → start pinch, cancel long-press
      if (this._activePointers.size === 2) {
        this._clearLongPress();
        this._panning = false;
        this._panLast = null;
        const pts = [...this._activePointers.values()];
        this._pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        return;
      }
      // Single finger → start long-press timer
      if (this._activePointers.size === 1) {
        this._longPressOrigin = { x: e.clientX, y: e.clientY };
        this._longPressEvent = e;
        this._longPressTimer = setTimeout(() => {
          this._longPressTimer = null;
          // Simulate right-click at the long-press position
          this._onLongPress(this._longPressEvent);
        }, this._longPressThreshold);
      }
    });

    this.canvas.addEventListener('pointermove', e => {
      if (e.pointerType !== 'touch') return;
      if (!this._activePointers.has(e.pointerId)) return;
      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Cancel long-press if finger moved too far
      if (this._longPressTimer && this._longPressOrigin) {
        const dx = e.clientX - this._longPressOrigin.x;
        const dy = e.clientY - this._longPressOrigin.y;
        if (Math.hypot(dx, dy) > this._longPressMoveLimit) this._clearLongPress();
      }
      // Pinch zoom with two fingers
      if (this._activePointers.size === 2 && this._pinchStartDist > 0) {
        const pts = [...this._activePointers.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const factor = dist / this._pinchStartDist;
        if (Math.abs(factor - 1) > 0.01) {
          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;
          const rect = this.canvas.getBoundingClientRect();
          const sx = this.canvas.width / rect.width;
          const sy = this.canvas.height / rect.height;
          const w = this.viewport.toWorld((midX - rect.left) * sx, (midY - rect.top) * sy, this.canvas.width, this.canvas.height);
          this.viewport.zoom(factor, w.x, w.y);
          this._pinchStartDist = dist;
          this._update();
        }
      }
    });

    const onTouchEnd = (e) => {
      if (e.pointerType !== 'touch') return;
      this._activePointers.delete(e.pointerId);
      this._clearLongPress();
      if (this._activePointers.size < 2) this._pinchStartDist = 0;
    };
    this.canvas.addEventListener('pointerup', onTouchEnd);
    this.canvas.addEventListener('pointercancel', onTouchEnd);
    this.canvas.addEventListener('pointerleave', onTouchEnd);

    // Wheel — heading rotation in crew edit mode, otherwise zoom
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (this.rs.crewEditMode && this.rs.hoveredCrewIdx >= 0 && this.rs.hoveredCrewType
          && this.rs.hoveredCrewIdx === this.rs.selectedCrewIdx && this.rs.hoveredCrewType === this.rs.selectedCrewType) {
        const delta = e.deltaY < 0 ? 5 : -5;
        this.rs.rotateCrewMember(this.rs.hoveredCrewIdx, this.rs.hoveredCrewType, delta, this.rs.hoveredCrewPointIdx);
      } else if (this.rs.catCrewEditMode && this.rs.catCrewEditMember >= 0) {
        const delta = e.deltaY < 0 ? 5 : -5;
        this.rs.rotateCatCrewHeading(delta);
        this.renderList();
      } else {
        const w = this._canvasWorld(e);
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        this.viewport.zoom(factor, w.x, w.y);
        this._update();
      }
    }, { passive: false });

    // Buttons
    document.getElementById('btn-add').addEventListener('click', () => this._addFromInputs());

    // Add/Delete/Reset step buttons
    document.getElementById('btn-task-add').addEventListener('click', () => this._addTaskStep());
    document.getElementById('btn-task-delete').addEventListener('click', () => this._deleteTaskStep());
    document.getElementById('btn-task-reset').addEventListener('click', () => this._resetTaskStep());
    // Click track background to deselect handoff
    document.getElementById('task-handoff-track').addEventListener('mousedown', (e) => {
      if (e.target === e.currentTarget && this._selectedHandoff >= 0) {
        this._selectedHandoff = -1;
        this._syncTaskRow();
        this._update();
      }
    });
    // Done button — exit all edit modes
    document.getElementById('btn-done').addEventListener('click', () => {
      this._selectedHandoff = -1;
      this._exitAssignMode();
      this.rs.deselectRoute();
      if (this.rs.crewEditMode) this.rs.exitCrewEdit();
      if (this.rs.catCrewEditMode) this.rs.exitCatCrewEdit();
      this._syncTaskRow();
      this._syncRoutePanel();
      this._update();
      this.renderList();
    });
    // Click progress area background to deselect crew in combined mode
    document.getElementById('progress-bar').addEventListener('mousedown', (e) => {
      if (e.target === e.currentTarget && this.rs.crewEditMode && this.rs.selectedRoute >= 0) {
        this.rs.exitCrewEdit();
      }
    });

    // Handoff box dragging (document-level)
    document.addEventListener('mousemove', (e) => {
      if (!this._draggingHandoff || !this._dragTrack) return;
      const rect = this._dragTrack.getBoundingClientRect();
      let progress = (e.clientX - rect.left) / rect.width;
      progress = Math.max(0, Math.min(1, progress));
      const task = this._currentTask();
      if (task && task.steps[this._dragStepIdx]) {
        const draggedStep = task.steps[this._dragStepIdx];
        draggedStep.progress = Math.round(progress * 1000) / 1000;
        // Re-sort steps by progress to keep _controllingStep correct
        task.steps.sort((a, b) => a.progress - b.progress);
        // Update drag index to follow the step's new position
        this._dragStepIdx = task.steps.indexOf(draggedStep);
        this._selectedHandoff = this._dragStepIdx;
        this._syncTaskRow();
        this._update();
      }
    });
    document.addEventListener('mouseup', () => {
      this._draggingHandoff = false;
      this._dragTrack = null;
    });

    // Enter key in add-point inputs
    const addEnter = e => { if (e.key === 'Enter') this._addFromInputs(); };
    this.addXInput.addEventListener('keydown', addEnter);
    this.addYInput.addEventListener('keydown', addEnter);

    // ── SC-Configs folder-based I/O (File System Access API) ─────────────
    this._initConfigStore();

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
            const landingRoutes = parseLandingRoutes(text);
            if (landingRoutes) this.rs.loadLandingRoutes(landingRoutes);
            const elevators = parseElevators(text);
            if (elevators) this._loadElevators(elevators);
            const blockers = parseBlockerTerminals(text);
            if (blockers) this._loadBlockerTerminals(blockers);
            this._originalLuaText = text;
            this.rs.clearUndoHistory();
            // Parse SC-Config stamp for version overlay
            const stamp = this._parseScConfigStamp(text);
            if (stamp) this.rs.loadedVariant = stamp;
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
      downloadPatchedLua(this._originalLuaText, this.rs.takeoffRoutes, headerComment, this.rs.elevatorTypes, [...this.rs.blockerTerminals], this.rs.landingRoutes);
    });

    // Export Crew
    document.getElementById('btn-export-crew').addEventListener('click', () => {
      if (!this._originalCrewLuaText) { alert('crew.lua not imported yet.'); return; }
      if (!this._confirmTakeoffValidation()) return;
      this._enforceAllCatCrewHide();
      const headerComment = document.getElementById('crew-header-comment').value.trim();
      downloadPatchedCrewLua(this._originalCrewLuaText, CREW_MEMBERS, CREW_ROUTES, CATAPULT_CREWS, this.rs._originalCatCrews, headerComment, TAKEOFF_TASKS, PARKING_TASKS);
    });

    // ── Config I/O (folder-based) ──────────────────────────────────────
    document.getElementById('btn-import-config').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.addEventListener('change', () => {
        const files = Array.from(input.files);
        const crewFile = files.find(f => f.name === 'crew.lua');
        const rrFile = files.find(f => f.name === 'USS_Nimitz_RunwaysAndRoutes.lua');
        if (!crewFile && !rrFile) {
          alert('No crew.lua or USS_Nimitz_RunwaysAndRoutes.lua found in selected folder.');
          return;
        }
        const promises = [];
        if (rrFile) promises.push(rrFile.text().then(text => {
          const routes = parseTakeoffRoutes(text);
          this.rs.loadTakeoffRoutes(routes);
          // Parse landing routes
          const landingRoutes = parseLandingRoutes(text);
          if (landingRoutes) this.rs.loadLandingRoutes(landingRoutes);
          // Parse elevators
          const elevators = parseElevators(text);
          if (elevators) this._loadElevators(elevators);
          const blockers = parseBlockerTerminals(text);
          if (blockers) this._loadBlockerTerminals(blockers);
          this._originalLuaText = text;
          this._rebuildRouteList();
          const stamp = this._parseScConfigStamp(text);
          if (stamp) this.rs.loadedVariant = stamp;
        }));
        if (crewFile) promises.push(crewFile.text().then(text => {
          this._importCrewLua(text);
        }));
        Promise.all(promises).then(() => {
          this.rs.refreshRouteSnapshots();
          this.rs._notify();
          const loaded = [rrFile && 'RunwaysAndRoutes', crewFile && 'crew.lua'].filter(Boolean).join(' + ');
          console.log(`Config imported: ${loaded}`);
        }).catch(err => {
          alert('Failed to import config: ' + err.message);
        });
      });
      input.click();
    });

    document.getElementById('btn-export-config').addEventListener('click', () => {
      if (!this._originalLuaText && !this._originalCrewLuaText) {
        alert('No files loaded yet.'); return;
      }
      this._pendingSaveConfig = null; // ensure download path, not SC-Configs save
      const form = document.getElementById('export-stamp-form');
      const verInput = document.getElementById('export-stamp-ver');
      // Pre-fill version from loaded variant (auto-increment)
      const lv = this.rs.loadedVariant;
      if (lv && lv.version) {
        const m = lv.version.match(/^(v\d+\.)(\d+)$/);
        verInput.value = m ? m[1] + (parseInt(m[2]) + 1) : lv.version;
      } else {
        verInput.value = 'v0.1';
      }
      document.getElementById('export-stamp-notes').value = this._lastStampNotes || '';
      form.style.display = '';
    });

    document.getElementById('btn-export-stamp-apply').addEventListener('click', async () => {
      if (this._originalCrewLuaText && !this._confirmTakeoffValidation()) return;
      const ver = document.getElementById('export-stamp-ver').value.trim();
      const notes = document.getElementById('export-stamp-notes').value.trim();
      const lv = this.rs.loadedVariant;
      const name = lv ? lv.name : 'Unknown';
      const date = new Date().toISOString().slice(0, 10);
      let stamp = `-- [SC-Config] ${name} ${ver}\n`;
      stamp += `-- [SC-Config] Modified: ${date}\n`;
      if (notes) stamp += `-- [SC-Config] Notes: ${notes}\n`;

      const saveConfig = this._pendingSaveConfig;
      this._pendingSaveConfig = null;

      if (saveConfig) {
        // SC-Configs Save path — write to folder
        if (!CS.hasRoot()) {
          const ok = await CS.restoreRootFolder(true);
          if (!ok) { alert('Permission denied. Please re-select the SC-Configs folder.'); return; }
        }
        try {
          if (this._originalLuaText) {
            const patched = buildPatchedLua(this._originalLuaText, this.rs.takeoffRoutes, stamp,
              this.rs.elevatorTypes, [...this.rs.blockerTerminals], this.rs.landingRoutes);
            await CS.writeConfigFile(saveConfig, 'USS_Nimitz_RunwaysAndRoutes.lua', patched);
          }
          if (this._originalCrewLuaText) {
            this._enforceAllCatCrewHide();
            const patched = buildPatchedCrewLua(this._originalCrewLuaText, CREW_MEMBERS, CREW_ROUTES,
              CATAPULT_CREWS, this.rs._originalCatCrews, stamp, TAKEOFF_TASKS, PARKING_TASKS);
            await CS.writeConfigFile(saveConfig, 'crew.lua', patched);
          }
          const saved = [this._originalLuaText && 'RunwaysAndRoutes', this._originalCrewLuaText && 'crew.lua'].filter(Boolean).join(' + ');
          console.log(`Config saved to ${saveConfig}: ${saved}`);
          // Reset baselines so "edited" flag clears
          if (this._originalLuaText) {
            this._originalLuaText = buildPatchedLua(this._originalLuaText, this.rs.takeoffRoutes, stamp,
              this.rs.elevatorTypes, [...this.rs.blockerTerminals], this.rs.landingRoutes);
            this.rs.refreshRouteSnapshots();
          }
          if (this._originalCrewLuaText) {
            this._originalCrewLuaText = buildPatchedCrewLua(this._originalCrewLuaText, CREW_MEMBERS, CREW_ROUTES,
              CATAPULT_CREWS, this.rs._originalCatCrews, stamp, TAKEOFF_TASKS, PARKING_TASKS);
            this.rs.refreshCrewSnapshots();
            this.rs.refreshCatCrewSnapshots();
          }
          this._update();
          const saveBtn = document.getElementById('btn-save-config');
          saveBtn.textContent = '✓ Saved';
          setTimeout(() => { saveBtn.textContent = 'Save'; }, 1500);
        } catch (err) {
          alert('Failed to save config: ' + err.message);
        }
      } else {
        // Download path — export as file downloads
        if (this._originalLuaText) {
          downloadPatchedLua(this._originalLuaText, this.rs.takeoffRoutes, stamp, this.rs.elevatorTypes, [...this.rs.blockerTerminals], this.rs.landingRoutes);
        }
        if (this._originalCrewLuaText) {
          this._enforceAllCatCrewHide();
          downloadPatchedCrewLua(this._originalCrewLuaText, CREW_MEMBERS, CREW_ROUTES, CATAPULT_CREWS, this.rs._originalCatCrews, stamp, TAKEOFF_TASKS, PARKING_TASKS);
        }
      }
      // Update loaded variant and save notes for next export
      this.rs.loadedVariant = { name, version: ver };
      this._lastStampNotes = notes;
      this.rs._notify();
      document.getElementById('export-stamp-form').style.display = 'none';
    });

    document.getElementById('btn-export-stamp-cancel').addEventListener('click', () => {
      this._pendingSaveConfig = null;
      document.getElementById('export-stamp-form').style.display = 'none';
    });

    // Crew edit mode button (optional, may not exist)
    const crewEditBtn = document.getElementById('btn-edit-crew');
    if (crewEditBtn) {
      crewEditBtn.addEventListener('click', () => {
        if (this.rs.crewEditMode) {
          this.rs.exitCrewEdit();
        } else {
          this.rs.enterCrewEdit();
        }
      });
    }

    // Route global toggles (momentary: show all / show none)
    document.getElementById('takeoff-global').addEventListener('click', () => {
      const allVisible = this.rs.allTakeoffRoutesVisible();
      this.rs.setAllTakeoffRoutes(!allVisible);
      // Keep edited route visible when hiding all
      if (allVisible && this.rs.selectedRouteType === 'takeoff' && this.rs.selectedRoute >= 0) {
        this.rs.takeoffRouteVisible[this.rs.selectedRoute] = true;
        this.rs._notify();
      }
    });
    document.getElementById('landing-global').addEventListener('click', () => {
      const allVisible = this.rs.landingVisible && this.rs.allLandingRoutesVisible();
      if (allVisible) {
        this.rs.setAllLandingRoutes(false);
        // Keep edited route visible when hiding all
        if (this.rs.selectedRouteType === 'landing' && this.rs.selectedRoute >= 0) {
          this.rs.landingRouteVisible[this.rs.selectedRoute] = true;
        }
        if (this.rs.landingVisible) this.rs.toggleLandingGlobal();
      } else {
        if (!this.rs.landingVisible) this.rs.toggleLandingGlobal();
        this.rs.setAllLandingRoutes(true);
      }
    });
    // Parked toggles (persistent on/off)
    document.getElementById('takeoff-parked').addEventListener('click', () => {
      this.rs.showParkedTakeoff = !this.rs.showParkedTakeoff;
      document.getElementById('takeoff-parked').classList.toggle('active', this.rs.showParkedTakeoff);
      this.rs._notify();
    });
    document.getElementById('landing-parked').addEventListener('click', () => {
      this.rs.showParkedLanding = !this.rs.showParkedLanding;
      document.getElementById('landing-parked').classList.toggle('active', this.rs.showParkedLanding);
      this.rs._notify();
    });

    // ── Elevator type selects ───────────────────────────────────────────
    document.querySelectorAll('.elevator-type').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.dataset.el);
        this.rs.elevatorTypes[idx] = parseInt(sel.value);
        this.rs._notify();
      });
    });

    document.getElementById('crew-idle-global').addEventListener('change', e => {
      this.rs.setAllCrew(e.target.checked);
    });
    document.getElementById('crew-active-global').addEventListener('change', e => {
      this.rs.setAllCrewActive(e.target.checked);
    });
    document.getElementById('crew-related-filter').addEventListener('click', () => {
      this._filterRelatedBySelectedIdle();
    });

    // ── Catapult crew panel ──────────────────────────────────────────────
    document.getElementById('chk-catcrew-visible').addEventListener('change', e => {
      this.rs.catCrewVisible = e.target.checked;
      this.rs._notify();
    });

    document.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.rs.setCatCrewCatapult(parseInt(btn.dataset.cat));
        this._syncCatCrewPanel();
        this._rebuildCatCrewList();
      });
    });

    document.querySelectorAll('.cat-hide-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const catIdx = parseInt(btn.dataset.cat);
        this._catCrewHidden[catIdx] = !this._catCrewHidden[catIdx];
        if (this._catCrewHidden[catIdx]) this._catCrewDisabled[catIdx] = false;
        this._applyCatCrewHide(catIdx);
        this._syncCatCrewPanel();
        this._rebuildCatCrewList();
        this._update();
      });
    });

    document.querySelectorAll('.cat-disable-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const catIdx = parseInt(btn.dataset.cat);
        this._catCrewDisabled[catIdx] = !this._catCrewDisabled[catIdx];
        if (this._catCrewDisabled[catIdx]) this._catCrewHidden[catIdx] = false;
        this._applyCatCrewHide(catIdx);
        this._syncCatCrewPanel();
        this._rebuildCatCrewList();
        this._update();
      });
    });

    document.querySelectorAll('.phase-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.rs.setCatCrewPhase(parseInt(btn.dataset.phase));
        this._syncCatCrewPanel();
        this._rebuildCatCrewList();
      });
    });

    const catSlider = document.getElementById('cat-crew-slider');
    catSlider.addEventListener('input', e => {
      this.rs.setCatCrewT(parseFloat(e.target.value));
      document.getElementById('cat-crew-t-value').textContent = parseFloat(e.target.value).toFixed(2);
      this._rebuildCatCrewList();
    });

    // Resize
    window.addEventListener('resize', () => this._resize());

    // Canvas height drag handle
    const resizeHandle = document.getElementById('canvas-resize-handle');
    let resizeDragY = 0, resizeStartH = 0;
    resizeHandle.addEventListener('mousedown', (e) => {
      resizeDragY = e.clientY;
      resizeStartH = this.canvas.getBoundingClientRect().height;
      const onMove = (ev) => {
        const newH = Math.max(200, Math.round(resizeStartH + (ev.clientY - resizeDragY)));
        this._canvasHeight = newH;
        this._resize();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });

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
    this._buildCrewRefMaps();
    this._rebuildCrewLists();
  }

  /** Build maps: memberId → Set of takeoff/landing task indices, routeId → same. */
  _buildCrewRefMaps() {
    // member → { takeoff: Set, landing: Set }
    const memberRefs = new Map();
    // route → { takeoff: Set, landing: Set }
    const routeRefs = new Map();

    const ensure = (map, id) => {
      if (!map.has(id)) map.set(id, { takeoff: new Set(), landing: new Set() });
      return map.get(id);
    };

    TAKEOFF_TASKS.forEach((task, ti) => {
      ensure(memberRefs, task.brownId).takeoff.add(ti + 1);
      ensure(routeRefs, task.brownRouteId).takeoff.add(ti + 1);
      for (const step of task.steps) {
        ensure(memberRefs, step.memberId).takeoff.add(ti + 1);
        if (step.routeId >= 0) ensure(routeRefs, step.routeId).takeoff.add(ti + 1);
      }
    });

    PARKING_TASKS.forEach((task, ti) => {
      for (const step of task.steps) {
        ensure(memberRefs, step.memberId).landing.add(ti + 1);
        if (step.routeId >= 0) ensure(routeRefs, step.routeId).landing.add(ti + 1);
      }
    });

    this._memberRefs = memberRefs;
    this._routeRefs = routeRefs;

    // member → Set of active route IDs (for "Related" filter)
    const memberToRoutes = new Map();
    TAKEOFF_TASKS.forEach(task => {
      const ensureM = id => { if (!memberToRoutes.has(id)) memberToRoutes.set(id, new Set()); return memberToRoutes.get(id); };
      ensureM(task.brownId).add(task.brownRouteId);
      for (const step of task.steps) {
        if (step.routeId >= 0) ensureM(step.memberId).add(step.routeId);
      }
    });
    PARKING_TASKS.forEach(task => {
      const ensureM = id => { if (!memberToRoutes.has(id)) memberToRoutes.set(id, new Set()); return memberToRoutes.get(id); };
      for (const step of task.steps) {
        if (step.routeId >= 0) ensureM(step.memberId).add(step.routeId);
      }
    });
    this._memberToRoutes = memberToRoutes;
  }

  _filterRelatedBySelectedIdle() {
    const rs = this.rs;
    if (!rs.crewEditMode || rs.selectedCrewType !== 'idle' || rs.selectedCrewIdx < 0) return;
    const memberId = rs.selectedCrewIdx;

    // Active routes used by this member
    const relatedRoutes = this._memberToRoutes.get(memberId);
    for (let i = 0; i < rs.crewActiveVisible.length; i++) {
      rs.crewActiveVisible[i] = relatedRoutes ? relatedRoutes.has(i) : false;
    }

    // Takeoff/landing tasks that reference this member
    const refs = this._memberRefs.get(memberId);
    const relatedTakeoff = refs ? refs.takeoff : new Set(); // 1-based task numbers
    const relatedLanding = refs ? refs.landing : new Set();

    for (let i = 0; i < rs.takeoffRouteVisible.length; i++) {
      rs.takeoffRouteVisible[i] = relatedTakeoff.has(i + 1);
    }
    for (let i = 0; i < rs.landingRouteVisible.length; i++) {
      rs.landingRouteVisible[i] = relatedLanding.has(i + 1);
    }
    // Ensure global landing toggle is on if any landing routes are related
    if (relatedLanding.size > 0) rs.landingVisible = true;

    rs._notify();
    this._syncRoutePanel();
    this.renderList();
  }

  _crewRefLabel(refs) {
    if (!refs) return '';
    const parts = [];
    if (refs.takeoff.size > 0) parts.push([...refs.takeoff].sort((a, b) => a - b).map(n => `T${n}`).join(' '));
    if (refs.landing.size > 0) parts.push([...refs.landing].sort((a, b) => a - b).map(n => `L${n}`).join(' '));
    return parts.join(' ');
  }

  _rebuildCrewLists() {
    refreshCrewActiveLinks(TAKEOFF_TASKS);
    refreshTaskDerivedData();
    this._buildCrewRefMaps();
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
      const refLabel = this._crewRefLabel(this._memberRefs.get(i));
      row.innerHTML = `
        <span class="route-color-dot" style="background:${pal.fill}"></span>
        <input type="checkbox" checked data-ci="${i}">
        <span class="route-label">${i}: [${i + 1}] ${m.name}</span>
        <span class="crew-ref-tags">${refLabel}</span>
        <button class="route-revert-btn" data-ci="${i}" title="Revert to original" disabled>Revert</button>
      `;
      row.querySelector('input[type="checkbox"]').addEventListener('change', () => {
        this.rs.toggleCrewMember(i);
      });
      row.querySelector('.route-label').addEventListener('click', () => {
        // If a task step is highlighted, clicking reassigns memberId
        if (this._tryReassignFromCrewList('idle', i)) return;
        if (!this.rs.crewEditMode) this.rs.enterCrewEdit();
        this.rs.selectCrewMember(i, 'idle', -1);
        this.renderList();
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
      const refLabel = this._crewRefLabel(this._routeRefs.get(i));
      row.innerHTML = `
        <span class="route-color-dot" style="background:#999"></span>
        <input type="checkbox" checked data-cai="${i}">
        <span class="route-label">${i}: [${i + 1}] ${r.name}</span>
        <span class="crew-ref-tags">${refLabel}</span>
        <button class="route-revert-btn" data-cri="${i}" title="Revert to original" disabled>Revert</button>
      `;
      row.querySelector('input[type="checkbox"]').addEventListener('change', () => {
        this.rs.toggleCrewActive(i);
      });
      row.querySelector('.route-label').addEventListener('click', () => {
        // If a task step is highlighted, clicking reassigns routeId
        if (this._tryReassignFromCrewList('active', i)) return;
        if (!this.rs.crewEditMode) this.rs.enterCrewEdit();
        this.rs.selectCrewMember(i, 'active', -1);
        this.renderList();
      });
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
        <span class="route-id">${route.id}.</span>
        <input class="route-label-input" type="text" value="${route.label}" data-ri="${i}">
        <span class="cat-selector" data-ri="${i}">${[1,2,3,4].map(c =>
          `<button class="cat-sel-btn${c === route.runwayIdx ? ' active' : ''}" data-cat="${c}" style="--cat-color:${CATAPULT_COLORS[c]}">${c}</button>`
        ).join('')}</span>
        <button class="route-edit-btn" data-ri="${i}" title="Edit route on canvas">Edit</button>
        <button class="route-revert-btn" data-ri="${i}" title="Revert to original" disabled>Revert</button>
      `;
      row.querySelector('input[type="checkbox"]').addEventListener('change', () => {
        this.rs.toggleTakeoffRoute(i);
        // Unchecking the edited route exits edit mode
        if (!this.rs.takeoffRouteVisible[i] && this.rs.selectedRouteType === 'takeoff' && this.rs.selectedRoute === i) {
          this.rs.deselectRoute();
          this.renderList();
        }
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
          if (!this.rs.takeoffRouteVisible[i]) this.rs.toggleTakeoffRoute(i);
          this.rs.selectRoute('takeoff', i);
        }
        this.renderList();
      });
      row.querySelector('.cat-selector').addEventListener('click', (e) => {
        const btn = e.target.closest('.cat-sel-btn');
        if (!btn) return;
        const newCat = parseInt(btn.dataset.cat);
        this._switchRouteCatapult(i, newCat);
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
        <input type="checkbox" ${this.rs.landingRouteVisible[i] ? 'checked' : ''} data-li="${i}">
        <span class="route-id">${route.id}.</span>
        <input class="route-label-input" type="text" value="${route.label}" data-li="${i}">
        <button class="route-edit-btn" data-li="${i}" title="Edit route on canvas">Edit</button>
        <button class="route-revert-btn" data-li="${i}" title="Revert to original" disabled>Revert</button>
      `;
      row.querySelector('input[type="checkbox"]').addEventListener('change', () => {
        this.rs.toggleLandingRoute(i);
        // Unchecking the edited route exits edit mode
        if (!this.rs.landingRouteVisible[i] && this.rs.selectedRouteType === 'landing' && this.rs.selectedRoute === i) {
          this.rs.deselectRoute();
          this.renderList();
        }
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
          if (!this.rs.landingRouteVisible[i]) this.rs.toggleLandingRoute(i);
          this.rs.selectRoute('landing', i);
        }
        this.renderList();
      });
      list.appendChild(row);
    }
  }

  _parseScConfigStamp(text) {
    // Try versioned format: Name v1.0
    const mv = text.match(/^--\s*\[SC-Config\]\s+(\S+)\s+(v\S+)/m);
    if (mv) {
      const n = text.match(/^--\s*\[SC-Config\]\s+Notes:\s*(.+)/m);
      if (n) this._lastStampNotes = n[1].trim();
      return { name: mv[1], version: mv[2] };
    }
    // Fallback: Name without version (e.g. "Original DCS file")
    const m = text.match(/^--\s*\[SC-Config\]\s+(.+)/m);
    if (!m || m[1].startsWith('Modified:') || m[1].startsWith('Author:') || m[1].startsWith('Notes:') || m[1].startsWith('Origin:')) return null;
    const n = text.match(/^--\s*\[SC-Config\]\s+Notes:\s*(.+)/m);
    if (n) this._lastStampNotes = n[1].trim();
    return { name: m[1].trim(), version: '' };
  }

  // ── SC-Configs folder store ────────────────────────────────────────────

  async _initConfigStore() {
    const scBtn = document.getElementById('btn-set-sc-folder');
    const label = document.getElementById('sc-folder-label');
    const select = document.getElementById('sc-config-select');
    const loadBtn = document.getElementById('btn-load-config');
    const saveBtn = document.getElementById('btn-save-config');

    if (!CS.isSupported()) {
      scBtn.style.display = 'none';
      label.textContent = 'File System Access API not supported';
      return;
    }

    // Visual state helper — highlights button when no root is set
    const updateRootVisual = () => {
      if (CS.hasRoot()) {
        scBtn.classList.remove('needs-attention');
        label.textContent = CS.getRootName();
        label.style.color = '';
      } else {
        scBtn.classList.add('needs-attention');
        label.textContent = 'No folder set — click to select SC-Configs root';
        label.style.color = '#c0392b';
      }
    };

    // Try to restore saved folder handle (no permission prompt yet)
    const restored = await CS.restoreRootFolder(false);
    if (restored) {
      await this._refreshConfigList();
    }
    updateRootVisual();

    // Set SC-Configs folder button
    scBtn.addEventListener('click', async () => {
      try {
        await CS.pickRootFolder();
        updateRootVisual();
        console.log('[SC-Config] Root folder set:', CS.getRootName());
        await this._refreshConfigList();
        console.log('[SC-Config] Config list refreshed, options:', select.options.length - 1);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[SC-Config] pickRootFolder error:', err);
          alert('Failed to set folder: ' + err.message);
        }
      }
    });

    // Config select change
    select.addEventListener('change', () => {
      const name = select.value;
      loadBtn.disabled = !name;
      saveBtn.disabled = !name;
      if (name) CS.setActiveConfig(name);
    });

    // Load button
    loadBtn.addEventListener('click', async () => {
      const name = select.value;
      if (!name) return;
      try {
        // Re-request permission if needed (user gesture context)
        if (!CS.hasRoot()) {
          const ok = await CS.restoreRootFolder(true);
          if (!ok) { alert('Permission denied. Please re-select the SC-Configs folder.'); return; }
        }
        const rrText = await CS.readConfigFile(name, 'USS_Nimitz_RunwaysAndRoutes.lua');
        const crewText = await CS.readConfigFile(name, 'crew.lua');
        if (!rrText && !crewText) { alert('No .lua files found in ' + name); return; }
        if (rrText) {
          const routes = parseTakeoffRoutes(rrText);
          this.rs.loadTakeoffRoutes(routes);
          const landingRoutes = parseLandingRoutes(rrText);
          if (landingRoutes) this.rs.loadLandingRoutes(landingRoutes);
          const elevators = parseElevators(rrText);
          if (elevators) this._loadElevators(elevators);
          const blockers = parseBlockerTerminals(rrText);
          if (blockers) this._loadBlockerTerminals(blockers);
          this._originalLuaText = rrText;
          this._rebuildRouteList();
          const stamp = this._parseScConfigStamp(rrText);
          if (stamp) this.rs.loadedVariant = stamp;
        }
        if (crewText) {
          this._importCrewLua(crewText);
        }
        this.rs.refreshRouteSnapshots();
        this.rs._notify();
        CS.setActiveConfig(name);
        const loaded = [rrText && 'RunwaysAndRoutes', crewText && 'crew.lua'].filter(Boolean).join(' + ');
        console.log(`Config loaded from ${name}: ${loaded}`);
      } catch (err) {
        alert('Failed to load config: ' + err.message);
      }
    });

    // Save button — opens stamp form then writes to selected config folder
    saveBtn.addEventListener('click', () => {
      const name = select.value;
      if (!name) return;
      if (!this._originalLuaText && !this._originalCrewLuaText) {
        alert('No files loaded yet.'); return;
      }
      // Show stamp form — _pendingSaveConfig tells Apply handler to save to SC-Configs
      this._pendingSaveConfig = name;
      const form = document.getElementById('export-stamp-form');
      const verInput = document.getElementById('export-stamp-ver');
      const lv = this.rs.loadedVariant;
      if (lv && lv.version) {
        const m = lv.version.match(/^(v\d+\.)(\d+)$/);
        verInput.value = m ? m[1] + (parseInt(m[2]) + 1) : lv.version;
      } else {
        verInput.value = 'v0.1';
      }
      document.getElementById('export-stamp-notes').value = this._lastStampNotes || '';
      form.style.display = '';
    });
  }

  async _refreshConfigList() {
    const select = document.getElementById('sc-config-select');
    const loadBtn = document.getElementById('btn-load-config');
    const saveBtn = document.getElementById('btn-save-config');
    try {
      const configs = await CS.listConfigs();
      console.log('[SC-Config] Found configs:', configs);
      // Clear and repopulate
      select.innerHTML = '<option value="">— select config —</option>';
      for (const name of configs) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      }
      select.disabled = configs.length === 0;
      // Restore last selection
      const last = CS.getLastConfig();
      if (last && configs.includes(last)) {
        select.value = last;
        loadBtn.disabled = false;
        saveBtn.disabled = false;
      }
    } catch (err) {
      console.error('[SC-Config] Failed to list configs:', err);
      select.disabled = true;
    }
  }

  _importCrewLua(text) {
    const data = parseCrewLua(text);

    // Parse SC-Config stamp for version overlay
    this.rs.loadedVariant = this._parseScConfigStamp(text);

    // Store original text for export
    this._originalCrewLuaText = text;

    // Replace members data in-place
    replaceCrewMembers(data.members);

    // Replace routes data in-place
    replaceCrewRoutes(data.routes, data.takeoffTasks);

    // Replace task data in-place
    replaceTaskData(data.takeoffTasks, data.parkingTasks);

    // Update crew visibility arrays to match new counts
    this.rs.crewVisible = new Array(data.members.length).fill(true);
    this.rs.crewActiveVisible = new Array(data.routes.length).fill(true);

    // Refresh snapshots for revert
    this.rs.refreshCrewSnapshots();

    // Exit crew edit mode if active
    if (this.rs.crewEditMode) this.rs.exitCrewEdit();

    // Rebuild crew panels
    this._buildCrewRefMaps();
    this._rebuildCrewLists();

    // Parse catapult crew section
    try {
      const catCrewData = parseCatapultCrew(text);
      if (catCrewData.length > 0) {
        replaceCatapultCrews(catCrewData);
        this.rs.refreshCatCrewSnapshots();
        // Detect hidden cats by checking h values on route points
        for (let ci = 0; ci < catCrewData.length && ci < 4; ci++) {
          const crew = catCrewData[ci];
          const hasSeaLevel = crew.members.some(m =>
            m.routes.some(r => r.points.some(p => p.h != null && p.h < 1))
          );
          this._catCrewHidden[ci] = hasSeaLevel;
        }
        this._syncCatCrewPanel();
        this._rebuildCatCrewList();
        console.log(`Imported catapult crew: ${catCrewData.length} catapults`);
      }
    } catch (e) {
      console.warn('Could not parse catapult crew section:', e.message);
    }

    // Trigger redraw
    this.rs.clearUndoHistory();
    this.rs._notify();
    this._syncTakeoffValidationWarning();
    this._syncCatCrewCanvasWarning();

    console.log(`Imported crew.lua: ${data.members.length} members, ${data.routes.length} routes, ${data.takeoffTasks.length} takeoff tasks, ${data.parkingTasks.length} parking tasks`);
  }

  _switchRouteCatapult(routeIdx, newCat) {
    const route = this.rs.takeoffRoutes[routeIdx];
    if (route.runwayIdx === newCat) return;
    this.rs.pushUndo();
    const tail = CAT_TAIL_POINTS[newCat];
    const pts = route.points;
    // Replace last 3 points with the new catapult's approach
    const keep = pts.slice(0, pts.length - 3);
    route.points = [...keep, ...tail.map(p => ({ ...p }))];
    route.runwayIdx = newCat;
    // Update label suffix
    route.label = route.label.replace(/Cat \d/, `Cat ${newCat}`);
    this._rebuildRouteList();
    this.rs._notify();
  }

  /** Full UI rebuild after undo/redo. */
  _rebuildAllUI() {
    this._rebuildRouteList();
    this._rebuildCrewLists();
    this._rebuildCatCrewList();
    this._syncCatCrewPanel();
    this._syncTaskRow();
    this._syncTakeoffValidationWarning();
    this._syncCatCrewCanvasWarning();
  }

  _rebuildRouteList() {
    const list = document.getElementById('takeoff-route-list');
    list.innerHTML = '';
    this._buildTakeoffRows(list);
    this._syncRoutePanel();
  }

  _syncRoutePanel() {
    // Build set of task indices with validation errors
    const { errors } = validateTakeoffTasks(TAKEOFF_TASKS, PARKING_TASKS);
    const invalidTaskIndices = new Set(errors.map(e => e.taskIdx));
    this._syncTakeoffValidationWarning();
    this._syncCatCrewCanvasWarning();

    // Takeoff panel
    const rows = document.querySelectorAll('#takeoff-route-list .route-row');
    for (let i = 0; i < rows.length; i++) {
      const cb = rows[i].querySelector('input[type="checkbox"]');
      cb.checked = this.rs.takeoffRouteVisible[i];
      const btn = rows[i].querySelector('.route-edit-btn');
      const isSelected = this.rs.selectedRouteType === 'takeoff' && this.rs.selectedRoute === i;
      btn.classList.toggle('active', isSelected);
      rows[i].classList.toggle('selected', isSelected);
      rows[i].classList.toggle('invalid', invalidTaskIndices.has(i));
      const revertBtn = rows[i].querySelector('.route-revert-btn');
      revertBtn.disabled = !this.rs.isRouteModified(i);
    }
    const allTakeoff = this.rs.allTakeoffRoutesVisible();
    document.getElementById('takeoff-global').textContent = allTakeoff ? 'Show none' : 'Show all';

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
    const allLanding = this.rs.landingVisible && this.rs.allLandingRoutesVisible();
    document.getElementById('landing-global').textContent = allLanding ? 'Show none' : 'Show all';

    // Crew idle sync
    const idleRows = document.querySelectorAll('#crew-idle-list .route-row');
    for (let i = 0; i < idleRows.length; i++) {
      const cb = idleRows[i].querySelector('input[type="checkbox"]');
      if (cb) cb.checked = this.rs.crewVisible[i];
      const revertBtn = idleRows[i].querySelector('.route-revert-btn');
      if (revertBtn) revertBtn.disabled = !this.rs.isCrewMemberModified(i);
      const isSelected = this.rs.crewEditMode && this.rs.selectedCrewType === 'idle' && this.rs.selectedCrewIdx === i;
      idleRows[i].classList.toggle('selected', isSelected);
    }
    document.getElementById('crew-idle-global').checked = this.rs.allCrewVisible();
    document.getElementById('crew-active-global').checked = this.rs.allCrewActiveVisible();

    // Enable "Related" filter button only when an idle member is selected
    const filterBtn = document.getElementById('crew-related-filter');
    const hasIdleSelected = this.rs.crewEditMode && this.rs.selectedCrewType === 'idle' && this.rs.selectedCrewIdx >= 0;
    filterBtn.disabled = !hasIdleSelected;

    // Crew active sync
    const activeRows = document.querySelectorAll('#crew-active-list .route-row');
    for (let i = 0; i < activeRows.length; i++) {
      const cb = activeRows[i].querySelector('input[type="checkbox"]');
      if (cb) cb.checked = this.rs.crewActiveVisible[i];
      const revertBtn = activeRows[i].querySelector('.route-revert-btn');
      if (revertBtn) revertBtn.disabled = !this.rs.isCrewRouteModified(i);
      const isSelected = this.rs.crewEditMode && this.rs.selectedCrewType === 'active' && this.rs.selectedCrewIdx === i;
      activeRows[i].classList.toggle('selected', isSelected);
    }

    this._syncCrewHighlights();

    // Crew edit button (if present)
    const crewEditBtn2 = document.getElementById('btn-edit-crew');
    if (crewEditBtn2) crewEditBtn2.classList.toggle('active', !!this.rs.crewEditMode);

    // Crew toolbar fields
    this._syncCrewToolbarFields();

    // Task row
    this._syncTaskRow();
  }

  /** Sync task-highlight class on crew idle/active rows. */
  _syncCrewHighlights() {
    const taskStep = this._getHighlightedTaskStep();
    const hlMemberId = taskStep ? taskStep.memberId : -1;
    const hlRouteId = taskStep ? taskStep.routeId : -999;
    const idleRows = document.querySelectorAll('#crew-idle-list .route-row');
    for (let i = 0; i < idleRows.length; i++) {
      idleRows[i].classList.toggle('task-highlight', i === hlMemberId);
    }
    const activeRows = document.querySelectorAll('#crew-active-list .route-row');
    for (let i = 0; i < activeRows.length; i++) {
      activeRows[i].classList.toggle('task-highlight', i === hlRouteId);
    }
  }

  /**
   * Try to reassign the highlighted task step from a crew list click.
   * @param {'idle'|'active'} type — which list was clicked
   * @param {number} idx — member index (idle) or route index (active)
   * @returns {boolean} true if reassignment happened
   */
  _tryReassignFromCrewList(type, idx) {
    const task = this._currentTask();
    if (!task) return false;

    // Assign mode: reassign and exit
    if (this._assignMode) {
      this.rs.pushUndo();
      if (this._assignIsBrown) {
        if (type === 'idle') task.brownId = idx;
        else task.brownRouteId = idx;
      } else {
        const step = task.steps[this._assignStepIdx];
        if (!step) return false;
        if (type === 'idle') step.memberId = idx;
        else step.routeId = idx;
      }
      this._exitAssignMode();
      this._rebuildCrewLists();
      this._update();
      return true;
    }

    // Selected handoff: reassign member or route
    if (this._selectedHandoff >= 0 && this._selectedHandoff < task.steps.length) {
      this.rs.pushUndo();
      const step = task.steps[this._selectedHandoff];
      if (type === 'idle') step.memberId = idx;
      else step.routeId = idx;
      this._rebuildCrewLists();
      this._syncTaskRow();
      this._update();
      return true;
    }

    return false;
  }

  /** Get the task step currently highlighted (selected or being assigned). */
  _getHighlightedTaskStep() {
    const task = this._currentTask();
    if (!task) return null;
    // Assign mode takes priority
    if (this._assignMode) {
      if (this._assignIsBrown) return { memberId: task.brownId, routeId: task.brownRouteId };
      const step = task.steps[this._assignStepIdx];
      return step || null;
    }
    // Selected handoff
    if (this._selectedHandoff >= 0 && this._selectedHandoff < task.steps.length) {
      return task.steps[this._selectedHandoff];
    }
    return null;
  }

  // ── Task editing ──────────────────────────────────────────────────────

  /** Get the current task for the selected route, or null. */
  _currentTask() {
    const rs = this.rs;
    if (rs.selectedRouteType === 'takeoff' && rs.selectedRoute >= 0) {
      return TAKEOFF_TASKS[rs.selectedRoute] || null;
    }
    if (rs.selectedRouteType === 'landing' && rs.selectedRoute >= 0) {
      return PARKING_TASKS[rs.selectedRoute] || null;
    }
    return null;
  }

  _syncVertexTicks() {
    const vtTrack = document.getElementById('vertex-tick-track');
    vtTrack.innerHTML = '';
    const rs = this.rs;
    let points = null;
    if (rs.selectedRouteType === 'takeoff' && rs.selectedRoute >= 0) {
      points = rs.takeoffRoutes[rs.selectedRoute]?.points;
    } else if (rs.selectedRouteType === 'landing' && rs.selectedRoute >= 0) {
      points = rs.landingRoutes[rs.selectedRoute]?.points;
    }
    if (!points || points.length < 2) return;

    const { segs, total } = segmentLengths(points);
    let cumulative = 0;
    for (let i = 0; i < points.length; i++) {
      const t = total > 0 ? cumulative / total : 0;
      const tick = document.createElement('div');
      tick.className = 'vertex-tick';
      tick.style.left = (t * 100) + '%';
      tick.innerHTML = `<span class="vertex-tick-label">${i}</span><div class="vertex-tick-line"></div>`;
      vtTrack.appendChild(tick);
      if (i < segs.length) cumulative += segs[i];
    }
  }

  _syncTaskRow() {
    // Vertex ticks — show whenever a route is selected
    this._syncVertexTicks();

    const brownBox = document.getElementById('task-brown-box');
    const track = document.getElementById('task-handoff-track');
    const valSpan = document.getElementById('task-handoff-val');

    const task = this._currentTask();
    const isTakeoff = this.rs.selectedRouteType === 'takeoff';

    // Task edit is always active when a route with a task is selected
    this._taskEditActive = !!task;
    this.rs.taskEditActive = this._taskEditActive;
    this.rs.selectedHandoff = this._selectedHandoff;
    this.rs.assignMode = this._assignMode;
    this.rs.assignStepIdx = this._assignStepIdx;
    this.rs.assignIsBrown = this._assignIsBrown;

    // Show/hide task content and Done button
    const isEditing = this.rs.selectedRoute >= 0 && this.rs.selectedRouteType;
    const showContent = !!task;
    brownBox.style.visibility = showContent ? '' : 'hidden';
    track.style.visibility = showContent ? '' : 'hidden';
    valSpan.style.visibility = showContent ? '' : 'hidden';
    document.getElementById('btn-done').style.display = isEditing ? '' : 'none';

    // Add/Delete/Reset buttons
    const actionGroup = document.getElementById('task-action-group');
    const delBtn = document.getElementById('btn-task-delete');
    const resetBtn = document.getElementById('btn-task-reset');
    actionGroup.classList.toggle('visible', !!showContent);
    if (showContent) {
      const hasSelection = this._selectedHandoff >= 0 && task.steps && this._selectedHandoff < task.steps.length;
      delBtn.disabled = !hasSelection;
      resetBtn.disabled = !hasSelection;
    }

    if (!showContent) {
      this._selectedHandoff = -1;
      brownBox.innerHTML = '';
      track.innerHTML = '';
      valSpan.innerHTML = '';
      return;
    }

    // Brown box — placed at position 0 inside the track for takeoff
    brownBox.innerHTML = '';

    // Handoff boxes on the track
    track.innerHTML = '';
    const steps = task.steps || [];

    // Compute positions, nudge overlapping boxes
    const boxW = 20;
    const positions = steps.map(s => s.progress);
    // Add brown at position 0 for takeoff nudge calculation
    const hasBrown = isTakeoff && task.brownId != null;
    if (hasBrown) positions.unshift(0);
    const nudged = this._nudgePositions(positions, boxW, track);

    // Place brown box at position 0 inside track
    if (hasBrown) {
      const brownCrewBox = this._makeCrewBox(task.brownRouteId, task.brownId, 'brown', true);
      brownCrewBox.style.position = 'absolute';
      brownCrewBox.style.left = `calc(${nudged[0] * 100}% - ${boxW / 2}px)`;
      brownCrewBox.classList.remove('static-brown');
      brownCrewBox.style.cursor = 'default';
      if (this._assignMode && this._assignIsBrown) brownCrewBox.classList.add('assigning');
      if (isTakeoff && (task.brownRouteId < 0 || task.brownRouteId > 15)) {
        brownCrewBox.classList.add('invalid');
        brownCrewBox.title = `brown_route_id = ${task.brownRouteId} out of range (0–15)`;
      }
      // Right-click to enter assign mode
      brownCrewBox.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this._enterAssignMode(-1, true);
      });
      track.appendChild(brownCrewBox);
      // Remove the brown entry from nudged so step indices stay aligned
      nudged.shift();
    }

    for (let si = 0; si < steps.length; si++) {
      const step = steps[si];
      const memberColor = this._memberColor(step.memberId);
      const box = this._makeCrewBox(step.routeId, step.memberId, memberColor, false);
      box.style.left = `calc(${nudged[si] * 100}% - ${boxW / 2}px)`;
      box.dataset.stepIdx = si;
      if (si === this._selectedHandoff) box.classList.add('selected');
      if (this._assignMode && !this._assignIsBrown && this._assignStepIdx === si) box.classList.add('assigning');
      if (isTakeoff && (step.routeId === -1 || step.routeId === 0)) {
        box.classList.add('invalid');
        box.title = step.routeId === 0
          ? 'route_id = 0 (Lua 1-based: routes[0] = nil, will crash DCS)'
          : 'route_id = -1 not allowed in takeoff tasks';
      }

      // Click to select + drag
      box.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        this.rs.pushUndo('drag-handoff');
        this._selectedHandoff = si;
        this._draggingHandoff = true;
        this._dragTrack = track;
        this._dragStepIdx = si;
        e.preventDefault();
        this._syncTaskRow();
        this._update();
      });
      // Right-click to enter assign mode
      box.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this._enterAssignMode(si, false);
      });

      track.appendChild(box);
    }

    // Handoff value display — always show when task edit is active
    valSpan.innerHTML = '';
    const hasSelection = this._selectedHandoff >= 0 && this._selectedHandoff < steps.length;
    const step = hasSelection ? steps[this._selectedHandoff] : null;
    const increment = 0.005;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = step ? step.progress.toFixed(3) : '--';
    input.disabled = !step;
    if (step) {
      input.addEventListener('change', () => {
        const v = parseFloat(input.value);
        if (!isNaN(v) && v >= 0 && v <= 1) {
          this.rs.pushUndo();
          step.progress = v;
          this._syncTaskRow();
          this._update();
        }
      });
    }

    const upBtn = document.createElement('button');
    upBtn.className = 'task-spinner-btn';
    upBtn.textContent = '\u25B2';
    upBtn.disabled = !step;
    if (step) {
      upBtn.addEventListener('click', () => {
        this.rs.pushUndo();
        step.progress = Math.min(1, Math.round((step.progress + increment) * 1000) / 1000);
        this._syncTaskRow();
        this._update();
      });
    }

    const downBtn = document.createElement('button');
    downBtn.className = 'task-spinner-btn';
    downBtn.textContent = '\u25BC';
    downBtn.disabled = !step;
    if (step) {
      downBtn.addEventListener('click', () => {
        this.rs.pushUndo();
        step.progress = Math.max(0, Math.round((step.progress - increment) * 1000) / 1000);
        this._syncTaskRow();
        this._update();
      });
    }

    const spinnerDiv = document.createElement('span');
    spinnerDiv.className = 'task-spinner';
    spinnerDiv.appendChild(upBtn);
    spinnerDiv.appendChild(downBtn);

    valSpan.appendChild(input);
    valSpan.appendChild(spinnerDiv);

    // Update crew list highlights to match current selection
    this._syncCrewHighlights();
    this._syncTakeoffValidationWarning();
    this._syncCatCrewCanvasWarning();
  }

  _makeCrewBox(routeId, memberId, memberColor, isStatic) {
    const box = document.createElement('div');
    box.className = 'task-crew-box' + (isStatic ? ' static-brown' : '');
    const routeLabel = routeId >= 0 ? routeId : '--';
    box.innerHTML = `<div class="crew-route-half">${routeLabel}</div><div class="crew-member-half ${memberColor}">${memberId}</div>`;
    return box;
  }

  _memberColor(memberId) {
    const m = CREW_MEMBERS[memberId];
    if (!m) return 'yellow';
    return m.livery === 'brown' ? 'brown' : 'yellow';
  }

  // ── Assign mode (right-click handoff box → pick crew on canvas) ────────

  _enterAssignMode(stepIdx, isBrown) {
    this._assignMode = true;
    this._assignStepIdx = stepIdx;
    this._assignIsBrown = isBrown;
    this.canvas.style.cursor = 'crosshair';
    this._syncTaskRow();
    this._update();
  }

  _exitAssignMode() {
    this._assignMode = false;
    this._assignStepIdx = -1;
    this._assignIsBrown = false;
    this.canvas.style.cursor = '';
    this._syncTaskRow();
    this._update();
  }

  /** Handle canvas click while in assign mode. Returns true if handled. */
  _handleAssignClick(w) {
    if (!this._assignMode) return false;

    const hit = this._crewHitTest(w);
    if (hit.idx < 0) {
      // Clicked empty space → cancel
      this._exitAssignMode();
      return true;
    }

    const task = this._currentTask();
    if (!task) { this._exitAssignMode(); return true; }

    const isTakeoff = this.rs.selectedRouteType === 'takeoff';

    // Canvas click: active sets both (member + route pair), idle sets member + route -1
    let memberId, routeId;
    if (hit.type === 'active') {
      const link = CREW_ACTIVE_LINKS.find(l => l.routeId === hit.idx);
      memberId = link ? link.memberIdx : 0;
      routeId = hit.idx;
    } else {
      memberId = hit.idx;
      routeId = -1;
    }

    this.rs.pushUndo();
    if (this._assignIsBrown) {
      task.brownId = memberId;
      task.brownRouteId = routeId;
    } else {
      const step = task.steps[this._assignStepIdx];
      if (!step) { this._exitAssignMode(); return true; }
      step.memberId = memberId;
      step.routeId = routeId;
    }

    this._exitAssignMode();
    this._rebuildCrewLists();
    this._update();
    return true;
  }

  // ── Add / Delete task steps ────────────────────────────────────────────

  _addTaskStep() {
    const task = this._currentTask();
    if (!task) return;
    this.rs.pushUndo();
    const steps = task.steps;

    // Place new step at midpoint of largest gap, or at 0.5 if empty
    let newProgress = 0.5;
    if (steps.length > 0) {
      // Find largest gap between existing steps (including 0 and 1 boundaries)
      const sorted = steps.map(s => s.progress).sort((a, b) => a - b);
      const boundaries = [0, ...sorted, 1];
      let bestGap = 0, bestMid = 0.5;
      for (let i = 1; i < boundaries.length; i++) {
        const gap = boundaries[i] - boundaries[i - 1];
        if (gap > bestGap) { bestGap = gap; bestMid = (boundaries[i - 1] + boundaries[i]) / 2; }
      }
      newProgress = Math.round(bestMid * 1000) / 1000;
    }

    // Default to memberId 0; for takeoff tasks use routeId 1 (valid), parking uses -1 (idle)
    const isTakeoff = this.rs.selectedRouteType === 'takeoff';
    const newStep = { progress: newProgress, memberId: 0, routeId: isTakeoff ? 1 : -1 };
    steps.push(newStep);
    // Keep steps sorted by progress
    steps.sort((a, b) => a.progress - b.progress);

    // Select the new step
    this._selectedHandoff = steps.indexOf(newStep);
    this._rebuildCrewLists();
    this._syncTaskRow();
    this._update();
  }

  _deleteTaskStep() {
    const task = this._currentTask();
    if (!task || this._selectedHandoff < 0 || this._selectedHandoff >= task.steps.length) return;
    this.rs.pushUndo();
    task.steps.splice(this._selectedHandoff, 1);
    // Adjust selection
    if (this._selectedHandoff >= task.steps.length) {
      this._selectedHandoff = task.steps.length - 1;
    }
    this._rebuildCrewLists();
    this._syncTaskRow();
    this._update();
  }

  _resetTaskStep() {
    const task = this._currentTask();
    if (!task || this._selectedHandoff < 0 || this._selectedHandoff >= task.steps.length) return;
    this.rs.pushUndo();
    const step = task.steps[this._selectedHandoff];
    const isTakeoff = this.rs.selectedRouteType === 'takeoff';
    step.memberId = 0;
    step.routeId = isTakeoff ? 1 : -1;
    this._rebuildCrewLists();
    this._syncTaskRow();
    this._update();
  }

  _confirmTakeoffValidation() {
    const { errors, warnings } = validateTakeoffTasks(TAKEOFF_TASKS, PARKING_TASKS);
    if (errors.length === 0 && warnings.length === 0) return true;
    let msg = '';
    if (errors.length > 0) {
      msg += 'ERRORS (will crash DCS):\n' + errors.map(e => `  Task ${e.taskIdx + 1}: ${e.message}`).join('\n') + '\n\n';
    }
    if (warnings.length > 0) {
      msg += 'WARNINGS:\n' + warnings.map(w => `  ${w.message}`).join('\n') + '\n\n';
    }
    return confirm(msg + 'Export anyway?');
  }

  _syncTakeoffValidationWarning() {
    const { errors, warnings } = validateTakeoffTasks(TAKEOFF_TASKS, PARKING_TASKS);
    if (errors.length === 0 && warnings.length === 0) {
      this.renderer.validationWarning = null;
      this.renderer.validationWarningLevel = null;
    } else if (errors.length > 0) {
      this.renderer.validationWarning = '\u26A0 ' + errors.map(e => `Task ${e.taskIdx + 1}: ${e.message}`).join('  |  ');
      this.renderer.validationWarningLevel = 'error';
    } else {
      this.renderer.validationWarning = '\u26A0 ' + warnings.map(w => w.message).join('  |  ');
      this.renderer.validationWarningLevel = 'warning';
    }
  }

  /** Nudge overlapping positions so boxes don't stack. Returns adjusted 0-1 values for display. */
  _nudgePositions(positions, boxW, track) {
    // Use fractional width - estimate track width
    const trackW = track.offsetWidth || 400;
    const minGap = (boxW + 2) / trackW;  // min separation in 0-1 space
    const nudged = positions.slice();
    // Sort indices by position
    const indices = nudged.map((_, i) => i).sort((a, b) => nudged[a] - nudged[b]);
    for (let k = 1; k < indices.length; k++) {
      const prev = indices[k - 1];
      const curr = indices[k];
      if (nudged[curr] - nudged[prev] < minGap) {
        nudged[curr] = nudged[prev] + minGap;
      }
    }
    return nudged;
  }

  _syncCrewToolbarFields() {
    const label = document.getElementById('crew-edit-label');
    const fieldsDiv = document.getElementById('crew-edit-fields');
    const progressBar = document.getElementById('progress-bar');
    const crewBar = document.getElementById('crew-edit-bar');
    if (!label || !fieldsDiv || !progressBar || !crewBar) return;

    const rs = this.rs;
    const hasRoute = rs.selectedRoute >= 0 && rs.selectedRouteType;
    const showCrewBar = !!rs.crewEditMode;
    // Show progress bar when a route is selected (even if crew edit also active)
    progressBar.style.display = hasRoute ? '' : (showCrewBar ? 'none' : '');
    crewBar.style.display = showCrewBar ? '' : 'none';

    if (!rs.crewEditMode || rs.selectedCrewIdx < 0 || !rs.selectedCrewType) {
      label.textContent = 'No crew selected';
      fieldsDiv.innerHTML = '';
      fieldsDiv.dataset.key = '';
      return;
    }

    if (rs.selectedCrewType === 'idle') {
      const m = CREW_MEMBERS[rs.selectedCrewIdx];
      if (!m) return;
      label.textContent = `Idle ${rs.selectedCrewIdx}: [${rs.selectedCrewIdx + 1}] ${m.name}`;
      // Only rebuild inputs if they don't already match (avoid losing focus)
      if (fieldsDiv.dataset.key !== `idle-${rs.selectedCrewIdx}`) {
        fieldsDiv.dataset.key = `idle-${rs.selectedCrewIdx}`;
        fieldsDiv.innerHTML = `
          <label>x</label><input type="number" value="${m.x.toFixed(2)}" step="0.1" data-k="x">
          <label>y</label><input type="number" value="${m.y.toFixed(2)}" step="0.1" data-k="y">
          <label>hdg°</label><input type="number" value="${m.hdg.toFixed(1)}" step="5" data-k="hdg">
        `;
        for (const inp of fieldsDiv.querySelectorAll('input')) {
          inp.addEventListener('input', () => {
            const val = parseFloat(inp.value);
            if (isNaN(val)) return;
            rs.pushUndo(`panel-crew-${mi}`);
            const k = inp.dataset.k;
            if (k === 'x') { m.x = val; rs._notify(); }
            else if (k === 'y') { m.y = val; rs._notify(); }
            else if (k === 'hdg') { m.hdg = val; rs._notify(); }
          });
        }
      } else {
        // Update values without rebuilding
        const inputs = fieldsDiv.querySelectorAll('input');
        if (inputs[0] && document.activeElement !== inputs[0]) inputs[0].value = m.x.toFixed(2);
        if (inputs[1] && document.activeElement !== inputs[1]) inputs[1].value = m.y.toFixed(2);
        if (inputs[2]) inputs[2].value = m.hdg.toFixed(1);
      }
    } else if (rs.selectedCrewType === 'active') {
      const r = CREW_ROUTES[rs.selectedCrewIdx];
      if (!r) return;
      const pts = r.points || [{ x: r.x, y: r.y, angle: r.angle }];
      const ptIdx = rs.selectedCrewPointIdx >= 0 ? rs.selectedCrewPointIdx : 0;
      const p = pts[ptIdx];
      if (!p) return;
      const ptLabel = pts.length > 1 ? `Active ${rs.selectedCrewIdx}.${ptIdx}: [${rs.selectedCrewIdx + 1}]` : `Active ${rs.selectedCrewIdx}: [${rs.selectedCrewIdx + 1}]`;
      label.textContent = `${ptLabel}: ${r.name}`;
      const key = `active-${rs.selectedCrewIdx}-${ptIdx}`;
      if (fieldsDiv.dataset.key !== key) {
        fieldsDiv.dataset.key = key;
        const angleDeg = (p.angle * 180 / Math.PI).toFixed(1);
        fieldsDiv.innerHTML = `
          <label>x</label><input type="number" value="${p.x.toFixed(2)}" step="0.1" data-k="x">
          <label>y</label><input type="number" value="${p.y.toFixed(2)}" step="0.1" data-k="y">
          <label>angle°</label><input type="number" value="${angleDeg}" step="5" data-k="angle">
        `;
        for (const inp of fieldsDiv.querySelectorAll('input')) {
          inp.addEventListener('input', () => {
            const val = parseFloat(inp.value);
            if (isNaN(val)) return;
            rs.pushUndo(`panel-route-${ri}`);
            const k = inp.dataset.k;
            if (k === 'x') { p.x = val; if (!r.points) r.x = val; rs._notify(); }
            else if (k === 'y') { p.y = val; if (!r.points) r.y = val; rs._notify(); }
            else if (k === 'angle') {
              const rad = val * Math.PI / 180;
              p.angle = rad;
              if (!r.points) r.angle = rad;
              rs._notify();
            }
          });
        }
      } else {
        const inputs = fieldsDiv.querySelectorAll('input');
        const angleDeg = (p.angle * 180 / Math.PI).toFixed(1);
        if (inputs[0] && document.activeElement !== inputs[0]) inputs[0].value = p.x.toFixed(2);
        if (inputs[1] && document.activeElement !== inputs[1]) inputs[1].value = p.y.toFixed(2);
        if (inputs[2]) inputs[2].value = angleDeg;
      }
    }
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

  /** Hit-test radius in world units (~ 8 CSS px). */
  _hitRadius() {
    const dpr = window.devicePixelRatio || 1;
    return (this.viewport.width / (this.canvas.width / dpr)) * 8;
  }

  /** Custom cursor: crosshair with circle, cached as data URI. */
  _circleCrosshairCursor() {
    if (!this._ccCursor) {
      const sz = 24, c = sz / 2, r = 8, gap = 3;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}">` +
        `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="black" stroke-width="1.5"/>` +
        `<line x1="${c}" y1="0" x2="${c}" y2="${c - r - gap}" stroke="black" stroke-width="1.2"/>` +
        `<line x1="${c}" y1="${c + r + gap}" x2="${c}" y2="${sz}" stroke="black" stroke-width="1.2"/>` +
        `<line x1="0" y1="${c}" x2="${c - r - gap}" y2="${c}" stroke="black" stroke-width="1.2"/>` +
        `<line x1="${c + r + gap}" y1="${c}" x2="${sz}" y2="${c}" stroke="black" stroke-width="1.2"/>` +
        `</svg>`;
      this._ccCursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${c} ${c}, crosshair`;
    }
    return this._ccCursor;
  }

  _redCircleCursor() {
    if (!this._rcCursor) {
      const sz = 24, c = sz / 2, r = 8;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}">` +
        `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="red" stroke-width="2"/>` +
        `</svg>`;
      this._rcCursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${c} ${c}, crosshair`;
    }
    return this._rcCursor;
  }

  _clearLongPress() {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
  }

  _onLongPress(e) {
    // Cancel any ongoing pan/drag
    this._panning = false;
    this._panLast = null;
    this.rs.draggingPoint = -1;
    this.rs.draggingCrew = false;

    const w = this._canvasWorld(e);

    // In route edit mode → insert waypoint (same as right-click)
    if (this.rs.selectedRoute >= 0 && this.rs.selectedRouteType) {
      this._onRouteRightClick(e);
      // Brief vibration feedback if available
      if (navigator.vibrate) navigator.vibrate(30);
      return;
    }
    // In catapult crew edit mode → insert waypoint
    if (this.rs.catCrewEditMode && this.rs.catCrewEditMember >= 0) {
      this._onCatCrewRightClick(e);
      if (navigator.vibrate) navigator.vibrate(30);
      return;
    }
  }

  _isPanButton(e) {
    // Right-click is for adding waypoints when in edit mode, not panning
    if (e.button === 2 && this.rs.selectedRoute >= 0 && this.rs.selectedRouteType) return false;
    if (e.button === 2 && this.rs.catCrewEditMode && this.rs.catCrewEditMember >= 0) return false;
    return e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey);
  }

  _onPointerDown(e) {
    // Assign mode: left-click picks crew or cancels
    if (this._assignMode && e.button === 0) {
      const w = this._canvasWorld(e);
      this._handleAssignClick(w);
      return;
    }

    if (this._isPanButton(e)) {
      this._panning = true;
      this._panLast = this._canvasWorld(e);
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    // Right-click to add waypoints in route edit mode
    if (e.button === 2 && this.rs.selectedRoute >= 0 && this.rs.selectedRouteType) {
      this._onRouteRightClick(e);
      return;
    }
    // Right-click to add waypoints in cat crew edit mode
    if (e.button === 2 && this.rs.catCrewEditMode && this.rs.catCrewEditMember >= 0) {
      this._onCatCrewRightClick(e);
      return;
    }
    if (e.button !== 0) return;

    const w = this._canvasWorld(e);

    // Catapult crew edit mode: handle waypoint drag or switch/exit
    if (this.rs.catCrewEditMode) {
      const catHit = this._catCrewHitTest(w);
      if (catHit.memberIdx >= 0) {
        this.rs.catCrewEditMember = catHit.memberIdx;
        this.rs.catCrewSelectedPoint = catHit.pointIdx;
        this.rs.catCrewDraggingPoint = catHit.pointIdx;
        this.canvas.setPointerCapture(e.pointerId);
        this.rs._notify();
        this.renderList();
        return;
      }
      // Miss cat crew — try crew dots or route segments to switch
      const crewHit = this._crewHitTest(w);
      if (crewHit.idx >= 0) {
        this.rs.exitCatCrewEdit();
        this.rs.enterCrewEdit();
        this.rs.selectCrewMember(crewHit.idx, crewHit.type, crewHit.pointIdx);
        this.rs.draggingCrew = true;
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      const routeHit = this._routeHitTest(w);
      if (routeHit) {
        this.rs.exitCatCrewEdit();
        this.rs.selectRoute(routeHit.type, routeHit.idx);
        this.renderList();
        return;
      }
      // Miss everything — exit cat crew edit
      this.rs.exitCatCrewEdit();
      this.renderList();
    }

    // Route edit mode (may also have crew edit active): waypoint drag, crew, or switch
    else if (this.rs.selectedRoute >= 0 && this.rs.selectedRouteType) {
      // Try waypoint drag first
      const pts = this._selectedPoints();
      if (pts) {
        const hr = this._hitRadius();
        let best = -1, bestD = Infinity;
        for (let j = 0; j < pts.length; j++) {
          const dx = pts[j].x - w.x, dy = pts[j].y - w.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < hr && d < bestD) { best = j; bestD = d; }
        }
        if (best >= 0) {
          this.rs.draggingPoint = best;
          this.rs.selectedWaypoint = best;
          this.canvas.setPointerCapture(e.pointerId);
          this.renderList();
          return;
        }
      }
      // Miss waypoint — try crew dot (enter crew edit, keep route selected)
      const crewHit = this._crewHitTest(w);
      if (crewHit.idx >= 0) {
        if (!this.rs.crewEditMode) this.rs.enterCrewEdit();
        this.rs.selectCrewMember(crewHit.idx, crewHit.type, crewHit.pointIdx);
        this.rs.draggingCrew = true;
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      // Try another route segment to switch route
      const routeHit = this._routeHitTest(w);
      if (routeHit) {
        this.rs.selectRoute(routeHit.type, routeHit.idx);
        this.renderList();
        return;
      }
      // Miss everything in route edit
      if (this.rs.crewEditMode) {
        // Exit crew edit but keep route selected
        this.rs.exitCrewEdit();
      }
      if (this._taskEditActive && this._selectedHandoff >= 0) {
        this._selectedHandoff = -1;
        this._syncTaskRow();
        this._update();
      }
    }

    // Crew edit mode only (no route selected): handle crew interaction or switch
    else if (this.rs.crewEditMode) {
      const crewHit = this._crewHitTest(w);
      if (crewHit.idx >= 0) {
        this.rs.selectCrewMember(crewHit.idx, crewHit.type, crewHit.pointIdx);
        this.rs.draggingCrew = true;
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      // Miss crew — try route segment to switch mode
      const routeHit = this._routeHitTest(w);
      if (routeHit) {
        this.rs.exitCrewEdit();
        this.rs.selectRoute(routeHit.type, routeHit.idx);
        this.renderList();
        return;
      }
      // Miss everything — exit crew edit mode
      this.rs.exitCrewEdit();
    }

    // No edit mode — click-to-enter: test cat crew waypoints, crew dots, then route segments
    else {
      // Catapult crew waypoints
      const catHit = this._catCrewHitTest(w);
      if (catHit.memberIdx >= 0) {
        this.rs.enterCatCrewEdit(catHit.memberIdx);
        this.rs.catCrewSelectedPoint = catHit.pointIdx;
        this.rs.catCrewDraggingPoint = catHit.pointIdx;
        this.canvas.setPointerCapture(e.pointerId);
        this.rs._notify();
        this.renderList();
        return;
      }
      const crewHit = this._crewHitTest(w);
      if (crewHit.idx >= 0) {
        this.rs.enterCrewEdit();
        this.rs.selectCrewMember(crewHit.idx, crewHit.type, crewHit.pointIdx);
        this.rs.draggingCrew = true;
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      const routeHit = this._routeHitTest(w);
      if (routeHit) {
        this.rs.selectRoute(routeHit.type, routeHit.idx);
        this.renderList();
        return;
      }
    }

    // Nothing hit — start panning with left click
    this._panning = true;
    this._panLast = w;
    this.canvas.setPointerCapture(e.pointerId);
  }

  /** Hit-test all visible route segments. Returns { type, idx } or null. */
  _routeHitTestAll(w) {
    const hr = this._hitRadius() * 2.5;
    const hits = [];

    // Takeoff routes
    for (let i = 0; i < this.rs.takeoffRoutes.length; i++) {
      if (!this.rs.takeoffRouteVisible[i]) continue;
      const pts = this.rs.takeoffRoutes[i].points;
      let minD = Infinity;
      for (let j = 0; j < pts.length - 1; j++) {
        const d = this._distToSegment(w, pts[j], pts[j + 1]);
        if (d < minD) minD = d;
      }
      if (minD < hr) hits.push({ type: 'takeoff', idx: i, dist: minD });
    }

    // Landing routes
    if (this.rs.landingVisible) {
      for (let i = 0; i < this.rs.landingRoutes.length; i++) {
        if (!this.rs.landingRouteVisible[i]) continue;
        const pts = this.rs.landingRoutes[i].points;
        let minD = Infinity;
        for (let j = 0; j < pts.length - 1; j++) {
          const d = this._distToSegment(w, pts[j], pts[j + 1]);
          if (d < minD) minD = d;
        }
        if (minD < hr) hits.push({ type: 'landing', idx: i, dist: minD });
      }
    }

    // Sort by distance (closest first)
    hits.sort((a, b) => a.dist - b.dist);
    return hits;
  }

  _routeHitTest(w) {
    const hits = this._routeHitTestAll(w);
    if (hits.length === 0) return null;

    // Cycling: if clicking near the same spot, advance to next hit
    const SAME_SPOT_THRESHOLD = 5; // world units
    const now = Date.now();
    if (this._lastRouteHitPos
        && Math.abs(w.x - this._lastRouteHitPos.x) < SAME_SPOT_THRESHOLD
        && Math.abs(w.y - this._lastRouteHitPos.y) < SAME_SPOT_THRESHOLD
        && (now - (this._lastRouteHitTime || 0)) < 2000) {
      // Find current selection in hits
      const curIdx = hits.findIndex(h =>
        h.type === this._lastRouteHitResult?.type && h.idx === this._lastRouteHitResult?.idx);
      const nextIdx = (curIdx + 1) % hits.length;
      const pick = hits[nextIdx];
      this._lastRouteHitPos = w;
      this._lastRouteHitTime = now;
      this._lastRouteHitResult = pick;
      return pick;
    }

    // New spot — pick closest
    const pick = hits[0];
    this._lastRouteHitPos = w;
    this._lastRouteHitTime = now;
    this._lastRouteHitResult = pick;
    return pick;
  }

  _onPointerMove(e) {
    if (this._panning && this._panLast) {
      const w = this._canvasWorld(e);
      this.viewport.pan(this._panLast.x - w.x, this._panLast.y - w.y);
      this._update();
      this._panLast = this._canvasWorld(e);
      return;
    }
    // Assign mode: red circle cursor over valid crew targets
    if (this._assignMode) {
      const w = this._canvasWorld(e);
      const hit = this._crewHitTest(w);
      this.canvas.style.cursor = hit.idx >= 0 ? this._redCircleCursor() : 'crosshair';
      return;
    }
    // Catapult crew edit mode: drag or hover
    if (this.rs.catCrewEditMode) {
      const w = this._canvasWorld(e);
      if (this.rs.catCrewDraggingPoint >= 0) {
        this.rs.moveCatCrewWaypoint(this.rs.catCrewDraggingPoint, +w.x.toFixed(4), +w.y.toFixed(4));
        this.renderList();
        return;
      }
      // Hover cursor
      const catHit = this._catCrewHitTest(w);
      this.canvas.style.cursor = catHit.memberIdx >= 0 ? this._circleCrosshairCursor() : 'crosshair';
      return;
    }
    // Route edit + optional crew edit: handle both
    if (this.rs.selectedRoute >= 0 && this.rs.selectedRouteType) {
      // If crew is being dragged, handle that first
      if (this.rs.crewEditMode && this.rs.draggingCrew) {
        this._onCrewPointerMove(e);
        return;
      }
      // Update crew hover state for scroll-wheel rotation in combined mode
      if (this.rs.crewEditMode) {
        const w = this._canvasWorld(e);
        const hit = this._crewHitTest(w);
        if (hit.idx !== this.rs.hoveredCrewIdx || hit.type !== this.rs.hoveredCrewType || hit.pointIdx !== this.rs.hoveredCrewPointIdx) {
          this.rs.hoveredCrewIdx = hit.idx;
          this.rs.hoveredCrewType = hit.type;
          this.rs.hoveredCrewPointIdx = hit.pointIdx;
          if (hit.idx >= 0) {
            this.canvas.style.cursor = this._circleCrosshairCursor();
          }
        }
      }
      this._onRoutePointerMove(e);
      return;
    }
    // Crew edit mode only (no route): drag or hover
    if (this.rs.crewEditMode) {
      this._onCrewPointerMove(e);
      return;
    }
    // No edit mode: show cursor hint over clickable elements
    const w = this._canvasWorld(e);
    const catHit = this._catCrewHitTest(w);
    if (catHit.memberIdx >= 0) {
      this.canvas.style.cursor = this._circleCrosshairCursor();
      return;
    }
    const crewHit = this._crewHitTest(w);
    if (crewHit.idx >= 0) {
      this.canvas.style.cursor = this._circleCrosshairCursor();
      return;
    }
    const routeHits = this._routeHitTestAll(w);
    this.canvas.style.cursor = routeHits.length > 0 ? 'pointer' : 'crosshair';
  }

  _onPointerUp(e) {
    this._panning = false;
    this._panLast = null;
    this.rs.draggingPoint = -1;
    this.rs.draggingCrew = false;
    this.rs.catCrewDraggingPoint = -1;
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
    if (ri < 0) return;
    const w = this._canvasWorld(e);
    // Dragging a waypoint
    if (this.rs.draggingPoint >= 0) {
      this.rs.moveWaypoint(ri, this.rs.draggingPoint, +w.x.toFixed(2), +w.y.toFixed(2));
      return;
    }
    // Hover cursor over waypoints
    const pts = this._selectedPoints();
    if (pts) {
      const hr = this._hitRadius();
      let overPoint = false;
      for (let j = 0; j < pts.length; j++) {
        const dx = pts[j].x - w.x, dy = pts[j].y - w.y;
        if (Math.sqrt(dx * dx + dy * dy) < hr) { overPoint = true; break; }
      }
      this.canvas.style.cursor = overPoint ? this._circleCrosshairCursor() : 'crosshair';
    }
  }

  // ── Crew pointer handlers ────────────────────────────────────────────
  /** Hit-test both idle members and active routes. Returns { idx, type, pointIdx }. */
  // ── Catapult crew route hit testing & interaction ─────────────────────

  /** Hit-test catapult crew route waypoints. Returns { memberIdx, pointIdx } or { memberIdx: -1 }. */
  _catCrewHitTest(w) {
    if (!this.rs.catCrewVisible) return { memberIdx: -1, pointIdx: -1 };
    const crew = CATAPULT_CREWS[this.rs.catCrewCatapult];
    if (!crew) return { memberIdx: -1, pointIdx: -1 };
    const phase = CATAPULT_PHASES[this.rs.catCrewPhase];
    const hr = this._hitRadius();
    let bestMi = -1, bestPi = -1, bestD = Infinity;

    for (let mi = 0; mi < crew.members.length; mi++) {
      const route = findPhaseRoute(crew.members[mi], phase);
      if (!route || route.points.length === 0) continue;
      for (let pi = 0; pi < route.points.length; pi++) {
        const dx = route.points[pi].x - w.x, dy = route.points[pi].y - w.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < hr && d < bestD) { bestMi = mi; bestPi = pi; bestD = d; }
      }
    }
    return { memberIdx: bestMi, pointIdx: bestPi };
  }

  _onCatCrewRightClick(e) {
    e.preventDefault();
    const route = this.rs.getCatCrewEditRoute();
    if (!route || route.points.length < 2) return;
    const w = this._canvasWorld(e);

    // Find nearest segment
    let bestSeg = 0, bestD = Infinity;
    for (let j = 0; j < route.points.length - 1; j++) {
      const d = this._distToSegment(w, route.points[j], route.points[j + 1]);
      if (d < bestD) { bestSeg = j; bestD = d; }
    }
    this.rs.addCatCrewWaypoint(bestSeg, +w.x.toFixed(4), +w.y.toFixed(4));
    this.rs.catCrewSelectedPoint = bestSeg + 1;
    this.renderList();
  }

  _crewHitTest(w) {
    const hr = this._hitRadius();
    let bestIdx = -1, bestType = null, bestPointIdx = -1, bestD = Infinity;

    // Test idle members (skip hidden)
    for (let i = 0; i < CREW_MEMBERS.length; i++) {
      if (this.rs && !this.rs.crewVisible[i]) continue;
      const m = CREW_MEMBERS[i];
      const dx = m.x - w.x, dy = m.y - w.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < hr && d < bestD) { bestIdx = i; bestType = 'idle'; bestPointIdx = -1; bestD = d; }
    }

    // Test active routes (all points of multi-point routes)
    for (let i = 0; i < CREW_ROUTES.length; i++) {
      const r = CREW_ROUTES[i];
      if (r.points && r.points.length > 0) {
        for (let j = 0; j < r.points.length; j++) {
          const dx = r.points[j].x - w.x, dy = r.points[j].y - w.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < hr && d < bestD) { bestIdx = i; bestType = 'active'; bestPointIdx = j; bestD = d; }
        }
      } else {
        const dx = r.x - w.x, dy = r.y - w.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < hr && d < bestD) { bestIdx = i; bestType = 'active'; bestPointIdx = -1; bestD = d; }
      }
    }

    return { idx: bestIdx, type: bestType, pointIdx: bestPointIdx };
  }

  _onCrewPointerDown(e) {
    const w = this._canvasWorld(e);
    const hit = this._crewHitTest(w);
    if (hit.idx >= 0) {
      this.rs.selectCrewMember(hit.idx, hit.type, hit.pointIdx);
      this.rs.draggingCrew = true;
      this.canvas.setPointerCapture(e.pointerId);
    } else {
      if (this.rs.selectedCrewIdx >= 0) {
        this.rs.selectedCrewType = null;
        this.rs.selectedCrewIdx = -1;
        this.rs.selectedCrewPointIdx = -1;
        this.rs._notify();
      }
    }
  }

  _onCrewPointerMove(e) {
    const w = this._canvasWorld(e);
    // Dragging
    if (this.rs.draggingCrew && this.rs.selectedCrewIdx >= 0 && this.rs.selectedCrewType) {
      this.rs.moveCrewMember(this.rs.selectedCrewIdx, this.rs.selectedCrewType, +w.x.toFixed(2), +w.y.toFixed(2), this.rs.selectedCrewPointIdx);
      return;
    }
    // Hover detection for scroll-wheel rotation
    const hit = this._crewHitTest(w);
    if (hit.idx !== this.rs.hoveredCrewIdx || hit.type !== this.rs.hoveredCrewType || hit.pointIdx !== this.rs.hoveredCrewPointIdx) {
      this.rs.hoveredCrewIdx = hit.idx;
      this.rs.hoveredCrewType = hit.type;
      this.rs.hoveredCrewPointIdx = hit.pointIdx;
      this.canvas.style.cursor = hit.idx >= 0 ? this._circleCrosshairCursor() : 'crosshair';
    }
  }

  // ── Point list ──────────────────────────────────────────────────────────
  renderList() {
    this.ptRows.innerHTML = '';
    const title = document.getElementById('pt-list-title');
    const header = document.querySelector('.pt-header');

    // ── Route edit mode ──
    const ri = this.rs.selectedRoute;
    const type = this.rs.selectedRouteType;
    const isRoute = ri >= 0 && type;
    const route = isRoute ? this.rs.getSelectedRoute() : null;
    const points = route ? route.points : [];

    // ── Catapult crew route edit mode ──
    if (this.rs.catCrewEditMode && this.rs.catCrewEditMember >= 0) {
      const catRoute = this.rs.getCatCrewEditRoute();
      const member = this.rs.getCatCrewEditMember();
      if (catRoute && member) {
        const phase = CATAPULT_PHASES[this.rs.catCrewPhase];
        title.textContent = `Cat ${this.rs.catCrewCatapult + 1} ${member.name} — ${phase.label}`;
        header.innerHTML = `<span>#</span><span>x</span><span>y</span><span></span>`;
        header.style.gridTemplateColumns = '28px 1fr 1fr 28px';
        catRoute.points.forEach((p, i) => {
          const row = document.createElement('div');
          row.className = 'pt-row' + (i === this.rs.catCrewSelectedPoint ? ' selected' : '');
          row.style.gridTemplateColumns = '28px 1fr 1fr 28px';
          row.innerHTML = `
            <span class="pt-idx">${i}</span>
            <input type="number" value="${p.x.toFixed(4)}" step="0.1" data-i="${i}" data-k="x">
            <input type="number" value="${p.y.toFixed(4)}" step="0.1" data-i="${i}" data-k="y">
            <button class="del-btn" title="Remove">\u2715</button>
          `;
          row.querySelector('.del-btn').addEventListener('click', () => {
            this.rs.removeCatCrewWaypoint(i);
            this.renderList();
          });
          for (const inp of row.querySelectorAll('input')) {
            inp.addEventListener('input', () => {
              const val = parseFloat(inp.value);
              if (isNaN(val)) return;
              const idx = +inp.dataset.i;
              const key = inp.dataset.k;
              const pt = catRoute.points[idx];
              this.rs.moveCatCrewWaypoint(idx,
                key === 'x' ? val : pt.x,
                key === 'y' ? val : pt.y);
            });
          }
          row.addEventListener('click', (ev) => {
            if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'BUTTON') return;
            this.rs.catCrewSelectedPoint = i;
            this.rs._notify();
            this.renderList();
          });
          this.ptRows.appendChild(row);
        });
        // Heading row (finalHeading or computed from last segment)
        if (catRoute.points.length >= 1) {
          const pts = catRoute.points;
          let effHdg;
          if (catRoute.finalHeading != null) {
            effHdg = catRoute.finalHeading;
          } else if (pts.length >= 2) {
            const prev = pts[pts.length - 2], last = pts[pts.length - 1];
            effHdg = -Math.atan2(last.y - prev.y, last.x - prev.x) * 180 / Math.PI;
          } else {
            effHdg = member.position.hdg;
          }
          const hdgRow = document.createElement('div');
          hdgRow.className = 'pt-row';
          hdgRow.style.gridTemplateColumns = '28px 1fr 1fr 28px';
          const hasExplicit = catRoute.finalHeading != null;
          hdgRow.innerHTML = `
            <span class="pt-idx" style="color:${hasExplicit ? '#333' : '#aaa'}">hdg</span>
            <input type="number" value="${effHdg.toFixed(1)}" step="5" style="grid-column: 2 / 4">
            <span></span>
          `;
          const hdgInp = hdgRow.querySelector('input');
          hdgInp.addEventListener('input', () => {
            const val = parseFloat(hdgInp.value);
            if (isNaN(val)) return;
            this.rs.pushUndo('catcrew-hdg-input');
            catRoute.finalHeading = ((val + 180) % 360 + 360) % 360 - 180;
            this.rs._notify();
          });
          this.ptRows.appendChild(hdgRow);
        }
        return;
      }
    }

    if (route) {
      const prefix = type === 'landing' ? 'Landing' : 'Route';
      title.textContent = `${prefix} ${route.id}: ${route.label}`;
    } else {
      title.textContent = 'No route selected';
    }

    if (!route) return;

    const isTakeoff = type === 'takeoff';
    const extraLabel = isTakeoff ? 'sp ⌀' : 'desp';
    header.innerHTML = `<span>#</span><span>x</span><span>y</span><span>vel</span><span>${extraLabel}</span><span></span>`;
    header.style.gridTemplateColumns = '28px 1fr 1fr 60px 52px 28px';

    points.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'pt-row' + (i === this.rs.selectedWaypoint ? ' selected' : '');
      row.style.gridTemplateColumns = '28px 1fr 1fr 60px 52px 28px';
      // Spawn diameter on first point (takeoff), despawn time on last point (landing)
      const showExtra = (isTakeoff && i === 0) || (!isTakeoff && i === points.length - 1);
      const extraVal = showExtra
        ? (isTakeoff ? (route.terminalSize || 0) : (route.despawnTime || 0))
        : '';
      const extraCell = showExtra
        ? `<input type="number" value="${extraVal}" step="1" min="0" data-i="${i}" data-k="${isTakeoff ? 'terminalSize' : 'despawnTime'}" style="width:100%">`
        : `<span></span>`;
      row.innerHTML = `
        <span class="pt-idx">${i}</span>
        <input type="number" value="${p.x.toFixed(2)}" step="0.1" data-i="${i}" data-k="x">
        <input type="number" value="${p.y.toFixed(2)}" step="0.1" data-i="${i}" data-k="y">
        <input type="number" value="${(p.v ?? 1).toFixed(2)}" step="0.1" data-i="${i}" data-k="v" style="width:100%">
        ${extraCell}
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
          if (key === 'terminalSize') {
            this.rs.pushUndo();
            route.terminalSize = val > 0 ? val : null;
            this.rs._notify();
          } else if (key === 'despawnTime') {
            this.rs.pushUndo();
            route.despawnTime = val > 0 ? val : null;
            this.rs._notify();
          } else if (key === 'v') {
            this.rs.pushUndo();
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

    // Update progress label and coord display from route marker
    const pLabel = document.getElementById('progress-label');
    const route = this.rs.getSelectedRoute();
    if (pLabel) {
      pLabel.textContent = route ? `Route ${this.rs.selectedRoute + 1}:` : 'Progress:';
    }
    if (route) {
      const rpt = polylinePoint(route.points, this.rs.t);
      if (rpt) {
        this.coordout.textContent = `x: ${rpt.x.toFixed(2)} y: ${rpt.y.toFixed(2)} v: ${rpt.v.toFixed(2)}`;
      }
    } else {
      this.coordout.textContent = 'x: \u2014, y: \u2014';
    }

    // Update crew bar coord display
    const crewCoord = document.getElementById('coordout-crew');
    if (crewCoord && this.rs.crewEditMode && this.rs.selectedCrewIdx >= 0 && this.rs.selectedCrewType) {
      if (this.rs.selectedCrewType === 'idle') {
        const m = CREW_MEMBERS[this.rs.selectedCrewIdx];
        if (m) crewCoord.textContent = `x: ${m.x.toFixed(2)}, y: ${m.y.toFixed(2)}`;
      } else {
        const r = CREW_ROUTES[this.rs.selectedCrewIdx];
        if (r) {
          const pts = r.points || [r];
          const pi = this.rs.selectedCrewPointIdx >= 0 ? this.rs.selectedCrewPointIdx : 0;
          const p = pts[pi];
          if (p) crewCoord.textContent = `x: ${p.x.toFixed(2)}, y: ${p.y.toFixed(2)}`;
        }
      }
    } else if (crewCoord) {
      crewCoord.textContent = 'x: \u2014, y: \u2014';
    }
  }

  // ── Elevator helpers ──────────────────────────────────────────────────
  _loadElevators(elevators) {
    // Merge parsed elevator entries into state (group by elevatorIdx, take first type)
    for (const el of elevators) {
      this.rs.elevatorTypes[el.elevatorIdx] = el.elevatorType;
    }
    this._syncElevatorUI();
  }

  _syncElevatorUI() {
    document.querySelectorAll('.elevator-type').forEach(sel => {
      const idx = parseInt(sel.dataset.el);
      sel.value = this.rs.elevatorTypes[idx] ?? 0;
    });
  }

  // ── Blocker terminal helpers ─────────────────────────────────────────
  _loadBlockerTerminals(terminals) {
    this.rs.blockerTerminals = new Set(terminals);
    this._buildBlockerGrid();
  }

  _buildBlockerGrid() {
    const grid = document.getElementById('blocker-grid');
    grid.innerHTML = '';
    const count = this.rs.landingRoutes.length;
    for (let i = 1; i <= count; i++) {
      const btn = document.createElement('button');
      btn.className = 'blocker-btn' + (this.rs.blockerTerminals.has(i) ? ' active' : '');
      btn.textContent = i;
      btn.addEventListener('click', () => {
        if (this.rs.blockerTerminals.has(i)) {
          this.rs.blockerTerminals.delete(i);
        } else {
          this.rs.blockerTerminals.add(i);
        }
        btn.classList.toggle('active', this.rs.blockerTerminals.has(i));
        this.rs._notify();
      });
      grid.appendChild(btn);
    }
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // On small screens, cap canvas height to 40% of viewport height
    if (!this._canvasHeight) {
      const vh = window.innerHeight;
      this._canvasHeight = vh < 700 ? Math.round(vh * 0.4) : 475;
    }
    const cssW = Math.round(rect.width);
    const cssH = this._canvasHeight;
    // Buffer is dpr-scaled for sharp rendering on high-DPI screens
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.height = cssH + 'px';
    // Tell renderer the dpr so it draws in CSS pixel space
    this.renderer.dpr = dpr;
    this.viewport.equalizeScale(cssW, cssH);
    this._update();
  }

  // ── Catapult crew panel ───────────────────────────────────────────────

  _syncCatCrewPanel() {
    document.querySelectorAll('.cat-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.cat) === this.rs.catCrewCatapult);
    });
    document.querySelectorAll('.cat-hide-btn').forEach(btn => {
      const catIdx = parseInt(btn.dataset.cat);
      btn.classList.toggle('active', this._catCrewHidden[catIdx]);
      btn.textContent = this._catCrewHidden[catIdx] ? 'hidden' : 'hide';
    });
    document.querySelectorAll('.cat-disable-btn').forEach(btn => {
      const catIdx = parseInt(btn.dataset.cat);
      btn.classList.toggle('active', this._catCrewDisabled[catIdx]);
      btn.textContent = this._catCrewDisabled[catIdx] ? 'disabled' : 'disable';
    });
    document.querySelectorAll('.phase-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.phase) === this.rs.catCrewPhase);
    });
    // Warning if any visible route leads to a hidden or disabled catapult
    const warn = document.getElementById('catcrew-warning');
    if (warn) {
      const conflictCats = this._getCatCrewConflicts();
      if (conflictCats.length > 0) {
        const labels = conflictCats.map(c =>
          `Cat ${c.cat} (${c.hidden ? 'hidden' : 'disabled'})`
        );
        warn.textContent = `Warning: routes lead to ${labels.join(', ')} — invalid config.`;
        warn.style.display = '';
      } else {
        warn.style.display = 'none';
      }
    }
    this._syncCatCrewCanvasWarning();
  }

  /** Set all h values for a catapult's crew to deck height or sea level. */
  _applyCatCrewHide(catIdx) {
    const DECK_H = 20.1494140625;
    const SEA_H = 0.0123;
    const hidden = this._catCrewHidden[catIdx];
    const crew = CATAPULT_CREWS[catIdx];
    if (!crew) return;
    const defaults = DEFAULT_CATAPULT_CREWS[catIdx];
    for (let mi = 0; mi < crew.members.length; mi++) {
      const member = crew.members[mi];
      const defMember = defaults?.members[mi];
      if (hidden) {
        member.position.h = SEA_H;
        if (member.fastStartPosition) member.fastStartPosition.h = SEA_H;
        for (const route of member.routes) {
          for (const pt of route.points) pt.h = SEA_H;
        }
      } else {
        // Restore original h per member (cat4 white2 uses a lower altitude)
        member.position.h = defMember?.position?.h ?? DECK_H;
        if (member.fastStartPosition) {
          member.fastStartPosition.h = defMember?.fastStartPosition?.h ?? DECK_H;
        }
        for (const route of member.routes) {
          for (const pt of route.points) pt.h = DECK_H;
        }
      }
    }
  }

  /** Enforce current hide button state on all 4 catapults before export. */
  _enforceAllCatCrewHide() {
    for (let i = 0; i < 4; i++) {
      this._applyCatCrewHide(i);
    }
  }

  /** Return list of catapults that have route conflicts (hidden or disabled with routes pointing to them). */
  _getCatCrewConflicts() {
    const conflicts = [];
    for (let catIdx = 0; catIdx < 4; catIdx++) {
      const hidden = this._catCrewHidden[catIdx];
      const disabled = this._catCrewDisabled[catIdx];
      if (!hidden && !disabled) continue;
      const hasRoute = this.rs.takeoffRoutes.some((r, i) =>
        this.rs.takeoffRouteVisible[i] && r.runwayIdx - 1 === catIdx
      );
      if (hasRoute) conflicts.push({ cat: catIdx + 1, hidden, disabled });
    }
    return conflicts;
  }

  /** Update canvas warning for hidden/disabled catapult conflicts. */
  _syncCatCrewCanvasWarning() {
    const conflicts = this._getCatCrewConflicts();
    if (conflicts.length > 0) {
      const labels = conflicts.map(c => `Cat ${c.cat} ${c.hidden ? 'hidden' : 'disabled'}`);
      this.renderer.catCrewWarning = '\u26A0 ' + labels.join(', ') + ' — has takeoff routes';
    } else {
      this.renderer.catCrewWarning = null;
    }
  }

  _rebuildCatCrewList() {
    const list = document.getElementById('catcrew-member-list');
    if (!list) return;
    list.innerHTML = '';

    const crew = CATAPULT_CREWS[this.rs.catCrewCatapult];
    if (!crew || !crew.members.length) {
      list.innerHTML = '<div style="font-size:11px;color:#999;padding:4px">No catapult crew data. Import crew.lua first.</div>';
      return;
    }

    const phase = CATAPULT_PHASES[this.rs.catCrewPhase];

    const catIdx = this.rs.catCrewCatapult;
    const localTs = memberLocalTs(crew, phase, this.rs.catCrewT);

    for (let mi = 0; mi < crew.members.length; mi++) {
      const member = crew.members[mi];
      const colors = CATAPULT_MEMBER_COLORS[member.name] || { fill: '#aaa', stroke: '#888' };
      const route = findPhaseRoute(member, phase);
      const t = localTs[mi];

      let wx, wy;
      if (phase.useFastStart) {
        const fsp = member.fastStartPosition;
        if (fsp) { wx = fsp.x; wy = fsp.y; }
        else { wx = member.position.x; wy = member.position.y; }
      } else if (!route || route.points.length === 0) {
        wx = member.position.x;
        wy = member.position.y;
      } else {
        const pts = route.points;
        if (t >= 1 || pts.length === 1) {
          const last = pts[pts.length - 1];
          wx = last.x; wy = last.y;
        } else if (t <= 0) {
          wx = pts[0].x; wy = pts[0].y;
        } else {
          const totalSegs = pts.length - 1;
          const rawIdx = t * totalSegs;
          const segIdx = Math.min(Math.floor(rawIdx), totalSegs - 1);
          const segT = rawIdx - segIdx;
          const a = pts[segIdx], b = pts[segIdx + 1];
          wx = a.x + (b.x - a.x) * segT;
          wy = a.y + (b.y - a.y) * segT;
        }
      }

      const isEditing = this.rs.catCrewEditMode && this.rs.catCrewEditMember === mi;
      const isModified = this.rs.isCatCrewMemberModified(catIdx, mi);
      const row = document.createElement('div');
      row.className = 'route-row' + (isEditing ? ' selected' : '');
      row.innerHTML = `
        <span style="display:inline-block;width:8px;height:8px;transform:rotate(45deg);background:${colors.fill};border:1px solid ${colors.stroke};margin-right:4px;flex-shrink:0"></span>
        <span class="route-label" style="min-width:70px;cursor:pointer">${member.name}</span>
        <span style="font-size:10px;color:#888;font-variant-numeric:tabular-nums">${wx.toFixed(2)}, ${wy.toFixed(2)}</span>
        <button class="route-revert-btn" title="Revert to original" ${isModified ? '' : 'disabled'}>Revert</button>
      `;
      row.querySelector('.route-label').addEventListener('click', () => {
        if (!this.rs.catCrewEditMode) {
          this.rs.enterCatCrewEdit(mi);
        } else {
          this.rs.catCrewEditMember = mi;
          this.rs.catCrewSelectedPoint = -1;
          this.rs._notify();
        }
        this.renderList();
        this._rebuildCatCrewList();
      });
      row.querySelector('.route-revert-btn').addEventListener('click', () => {
        this.rs.revertCatCrewMember(catIdx, mi);
        this._rebuildCatCrewList();
        this.renderList();
      });
      list.appendChild(row);
    }
  }

  /** First paint. */
  boot() {
    this._resize();
  }
}
