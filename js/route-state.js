/**
 * Reactive state for taxi route visibility and editing.
 * Deep-clones route data so edits are non-destructive.
 */
import { TAKEOFF_ROUTES, LANDING_ROUTES } from './route-data.js';
import { CREW_MEMBERS } from './crew-data.js';
import { CREW_ROUTES } from './crew-routes-data.js';
import { CATAPULT_CREWS, CATAPULT_PHASES, findPhaseRoute, recalcTangents } from './catapult-crew-data.js';
import { TAKEOFF_TASKS, PARKING_TASKS } from './takeoff-tasks-data.js';

function cloneRoutes(src) {
  return src.map(r => ({
    ...r,
    points: r.points.map(p => ({ ...p })),
  }));
}

class RouteState {
  constructor() {
    this.takeoffRoutes = cloneRoutes(TAKEOFF_ROUTES);
    this.landingRoutes = cloneRoutes(LANDING_ROUTES);

    this.takeoffRouteVisible = new Array(TAKEOFF_ROUTES.length).fill(true);

    this.landingVisible = false;
    this.landingRouteVisible = new Array(LANDING_ROUTES.length).fill(false);

    this.showParkedTakeoff = false;
    this.showParkedLanding = false;

    // Elevator types: index 1-4, value 0=SPAWN, 1=DESPAWN, 2=BOTH
    this.elevatorTypes = { 1: 0, 2: 0, 3: 0, 4: 0 };

    // Blocker terminals: Set of 1-based landing terminal indices
    this.blockerTerminals = new Set();

    this.crewVisible = new Array(CREW_MEMBERS.length).fill(true);
    this.crewActiveVisible = new Array(CREW_ROUTES.length).fill(true);

    /** Progress ratio 0–1 for route marker. */
    this.t = 0;

    /** Type of selected route: 'takeoff' | 'landing' | null */
    this.selectedRouteType = null;
    /** Index of route selected for editing (-1 = none). */
    this.selectedRoute = -1;
    /** Index of waypoint being dragged (-1 = none). */
    this.draggingPoint = -1;
    /** Index of last-selected waypoint for highlight (-1 = none). */
    this.selectedWaypoint = -1;

    // ── Crew editing state ──────────────────────────────────────────────
    /** Whether crew edit mode is active. */
    this.crewEditMode = false;
    /** Type of selected crew item: 'idle' | 'active' | null */
    this.selectedCrewType = null;
    /** Index of selected crew member/route for editing (-1 = none). */
    this.selectedCrewIdx = -1;
    /** Type of hovered crew item: 'idle' | 'active' | null */
    this.hoveredCrewType = null;
    /** Index of hovered crew member/route (-1 = none), for scroll-wheel rotation. */
    this.hoveredCrewIdx = -1;
    /** Point index within a multi-point active route (-1 = single-point or idle). */
    this.selectedCrewPointIdx = -1;
    this.hoveredCrewPointIdx = -1;
    /** Whether a crew dot is being dragged. */
    this.draggingCrew = false;

    // ── Loaded variant info (from SC-Config stamp) ──────────────────────
    this.loadedVariant = null;  // { name, version }

    // Snapshots for revert
    this._originalMembers = CREW_MEMBERS.map(m => ({ ...m }));
    this._originalRoutes = CREW_ROUTES.map(r => {
      const clone = { ...r };
      if (r.points) clone.points = r.points.map(p => ({ ...p }));
      return clone;
    });

    // ── Catapult crew visualization state ──────────────────────────────
    this.catCrewVisible = false;
    this.catCrewCatapult = 0;    // 0..3
    this.catCrewPhase = 5;       // index into CATAPULT_PHASES (default: occupy_cat)
    this.catCrewT = 1;           // slider 0..1 within phase route

    // ── Catapult crew route editing state ────────────────────────────
    this.catCrewEditMode = false;
    this.catCrewEditMember = -1;       // index into crew.members[]
    this.catCrewDraggingPoint = -1;    // index of waypoint being dragged
    this.catCrewSelectedPoint = -1;    // last-selected waypoint for highlight

    /** @type {Array|null} Snapshot for revert — initialized from defaults */
    this._originalCatCrews = null;
    if (CATAPULT_CREWS.length > 0) this.refreshCatCrewSnapshots();

    /** @type {Set<() => void>} */
    this._listeners = new Set();

    // ── Undo / Redo ─────────────────────────────────────────────────────
    this._undoStack = [];
    this._redoStack = [];
    this._maxUndo = 80;
    /** Tag for coalescing rapid edits (drag, scroll-wheel). */
    this._undoCoalesceTag = null;
    this._undoCoalesceTimer = null;
  }

  // ── Undo / Redo ─────────────────────────────────────────────────────────

  /** Snapshot all editable data for undo. */
  _snapshotData() {
    return {
      takeoffRoutes: this.takeoffRoutes.map(r => ({ ...r, points: r.points.map(p => ({ ...p })) })),
      landingRoutes: this.landingRoutes.map(r => ({ ...r, points: r.points.map(p => ({ ...p })) })),
      crewMembers: CREW_MEMBERS.map(m => ({ ...m })),
      crewRoutes: CREW_ROUTES.map(r => {
        const c = { ...r };
        if (r.points) c.points = r.points.map(p => ({ ...p }));
        return c;
      }),
      catCrews: CATAPULT_CREWS.map(c => ({
        ...c,
        members: c.members.map(m => ({
          ...m,
          position: { ...m.position },
          fastStartPosition: m.fastStartPosition ? { ...m.fastStartPosition } : null,
          routes: m.routes.map(rt => ({
            ...rt,
            points: rt.points.map(p => ({ ...p })),
          })),
        })),
      })),
      takeoffTasks: TAKEOFF_TASKS.map(t => ({
        ...t,
        steps: t.steps.map(s => ({ ...s })),
      })),
      parkingTasks: PARKING_TASKS.map(t => ({
        ...t,
        steps: t.steps.map(s => ({ ...s })),
      })),
    };
  }

  /** Restore all editable data from a snapshot. */
  _restoreSnapshot(snap) {
    // Takeoff routes
    this.takeoffRoutes.length = 0;
    snap.takeoffRoutes.forEach(r => this.takeoffRoutes.push({ ...r, points: r.points.map(p => ({ ...p })) }));
    // Landing routes
    this.landingRoutes.length = 0;
    snap.landingRoutes.forEach(r => this.landingRoutes.push({ ...r, points: r.points.map(p => ({ ...p })) }));
    // Crew members
    snap.crewMembers.forEach((m, i) => Object.assign(CREW_MEMBERS[i], m));
    // Crew routes
    snap.crewRoutes.forEach((r, i) => {
      Object.assign(CREW_ROUTES[i], r);
      if (r.points) CREW_ROUTES[i].points = r.points.map(p => ({ ...p }));
    });
    // Catapult crews
    snap.catCrews.forEach((c, ci) => {
      if (!CATAPULT_CREWS[ci]) return;
      c.members.forEach((m, mi) => {
        const target = CATAPULT_CREWS[ci].members[mi];
        if (!target) return;
        Object.assign(target.position, m.position);
        if (m.fastStartPosition && target.fastStartPosition) {
          Object.assign(target.fastStartPosition, m.fastStartPosition);
        }
        target.routes = m.routes.map(rt => ({
          ...rt,
          points: rt.points.map(p => ({ ...p })),
        }));
      });
    });
    // Tasks
    snap.takeoffTasks.forEach((t, i) => {
      if (!TAKEOFF_TASKS[i]) return;
      Object.assign(TAKEOFF_TASKS[i], { brownId: t.brownId, brownRouteId: t.brownRouteId });
      TAKEOFF_TASKS[i].steps = t.steps.map(s => ({ ...s }));
    });
    snap.parkingTasks.forEach((t, i) => {
      if (!PARKING_TASKS[i]) return;
      PARKING_TASKS[i].steps = t.steps.map(s => ({ ...s }));
    });
  }

  /**
   * Push an undo snapshot before an edit.
   * @param {string} [tag] - Coalesce tag. Rapid edits with the same tag
   *   (within 500ms) share one undo entry.
   */
  pushUndo(tag = null) {
    if (tag && tag === this._undoCoalesceTag) {
      // Same tag within coalesce window — don't push, just extend timer
      clearTimeout(this._undoCoalesceTimer);
      this._undoCoalesceTimer = setTimeout(() => { this._undoCoalesceTag = null; }, 500);
      return;
    }
    // New edit — push snapshot
    this._undoStack.push(this._snapshotData());
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
    this._redoStack.length = 0;  // clear redo on new edit
    if (tag) {
      this._undoCoalesceTag = tag;
      clearTimeout(this._undoCoalesceTimer);
      this._undoCoalesceTimer = setTimeout(() => { this._undoCoalesceTag = null; }, 500);
    } else {
      this._undoCoalesceTag = null;
    }
  }

  /** Undo last edit. Returns true if something was undone. */
  undo() {
    if (this._undoStack.length === 0) return false;
    this._redoStack.push(this._snapshotData());
    this._restoreSnapshot(this._undoStack.pop());
    this._undoCoalesceTag = null;
    this._notify();
    return true;
  }

  /** Redo last undone edit. Returns true if something was redone. */
  redo() {
    if (this._redoStack.length === 0) return false;
    this._undoStack.push(this._snapshotData());
    this._restoreSnapshot(this._redoStack.pop());
    this._notify();
    return true;
  }

  /** Clear undo/redo stacks (e.g., after import). */
  clearUndoHistory() {
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this._undoCoalesceTag = null;
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

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** Get the routes array for the currently selected type. */
  _selectedRoutes() {
    if (this.selectedRouteType === 'takeoff') return this.takeoffRoutes;
    if (this.selectedRouteType === 'landing') return this.landingRoutes;
    return null;
  }

  /** Get the currently selected route object, or null. */
  getSelectedRoute() {
    const routes = this._selectedRoutes();
    if (!routes || this.selectedRoute < 0) return null;
    return routes[this.selectedRoute] || null;
  }

  // ── Visibility toggles ──────────────────────────────────────────────

  setAllTakeoffRoutes(on) {
    this.takeoffRouteVisible.fill(on);
    this._notify();
  }

  toggleTakeoffRoute(i) {
    this.takeoffRouteVisible[i] = !this.takeoffRouteVisible[i];
    this._notify();
  }

  toggleLandingGlobal() {
    this.landingVisible = !this.landingVisible;
    this._notify();
  }

  setAllLandingRoutes(on) {
    this.landingRouteVisible.fill(on);
    this._notify();
  }

  toggleLandingRoute(i) {
    this.landingRouteVisible[i] = !this.landingRouteVisible[i];
    this._notify();
  }

  // ── Crew visibility ────────────────────────────────────────────────

  toggleCrewMember(i) {
    this.crewVisible[i] = !this.crewVisible[i];
    this._notify();
  }

  setAllCrew(on) {
    this.crewVisible.fill(on);
    this._notify();
  }

  allCrewVisible() {
    return this.crewVisible.every(Boolean);
  }

  toggleCrewActive(i) {
    this.crewActiveVisible[i] = !this.crewActiveVisible[i];
    this._notify();
  }

  setAllCrewActive(on) {
    this.crewActiveVisible.fill(on);
    this._notify();
  }

  allCrewActiveVisible() {
    return this.crewActiveVisible.every(Boolean);
  }

  // ── Selection / editing ─────────────────────────────────────────────

  selectRoute(type, i) {
    // Mutual exclusivity: exit crew edit when selecting a route
    if (this.crewEditMode) {
      this.crewEditMode = false;
      this.selectedCrewType = null;
      this.selectedCrewIdx = -1;
      this.selectedCrewPointIdx = -1;
      this.hoveredCrewType = null;
      this.hoveredCrewIdx = -1;
      this.hoveredCrewPointIdx = -1;
      this.draggingCrew = false;
    }
    // Mutual exclusivity: exit cat crew edit
    if (this.catCrewEditMode) this._resetCatCrewEdit();
    this.selectedRouteType = type;
    this.selectedRoute = i;
    this._notify();
  }

  deselectRoute() {
    this.selectedRouteType = null;
    this.selectedRoute = -1;
    this.draggingPoint = -1;
    this.selectedWaypoint = -1;
    this._notify();
  }

  // ── Crew editing ──────────────────────────────────────────────────

  enterCrewEdit() {
    // Exit cat crew edit, but keep route edit active if present
    if (this.catCrewEditMode) this._resetCatCrewEdit();
    this.crewEditMode = true;
    this.selectedCrewType = null;
    this.selectedCrewIdx = -1;
    this.selectedCrewPointIdx = -1;
    this.hoveredCrewType = null;
    this.hoveredCrewIdx = -1;
    this.hoveredCrewPointIdx = -1;
    this.draggingCrew = false;
    this._notify();
  }

  exitCrewEdit() {
    this.crewEditMode = false;
    this.selectedCrewType = null;
    this.selectedCrewIdx = -1;
    this.selectedCrewPointIdx = -1;
    this.hoveredCrewType = null;
    this.hoveredCrewIdx = -1;
    this.hoveredCrewPointIdx = -1;
    this.draggingCrew = false;
    this._notify();
  }

  selectCrewMember(idx, type, pointIdx = -1) {
    this.selectedCrewIdx = idx;
    this.selectedCrewType = type;
    this.selectedCrewPointIdx = pointIdx;
    this._notify();
  }

  moveCrewMember(idx, type, x, y, pointIdx = -1) {
    this.pushUndo(`move-crew-${type}-${idx}-${pointIdx}`);
    if (type === 'idle') {
      const m = CREW_MEMBERS[idx];
      if (m) { m.x = x; m.y = y; this._notify(); }
    } else if (type === 'active') {
      const r = CREW_ROUTES[idx];
      if (!r) return;
      if (r.points && r.points.length > 0 && pointIdx >= 0) {
        // Move specific point within multi-point route
        const pt = r.points[pointIdx];
        if (pt) { pt.x = x; pt.y = y; }
        // Keep route.x/y synced to last point
        const last = r.points[r.points.length - 1];
        r.x = last.x; r.y = last.y;
      } else {
        // Single-point route or no point specified
        r.x = x; r.y = y;
        if (r.points && r.points.length > 0) {
          r.points[r.points.length - 1].x = x;
          r.points[r.points.length - 1].y = y;
        }
      }
      this._notify();
    }
  }

  rotateCrewMember(idx, type, deltaDeg, pointIdx = -1) {
    this.pushUndo(`rotate-crew-${type}-${idx}-${pointIdx}`);
    if (type === 'idle') {
      const m = CREW_MEMBERS[idx];
      if (m) {
        m.hdg = ((m.hdg + deltaDeg + 180) % 360 + 360) % 360 - 180;
        this._notify();
      }
    } else if (type === 'active') {
      const r = CREW_ROUTES[idx];
      if (!r) return;
      const deltaRad = deltaDeg * Math.PI / 180;
      if (r.points && r.points.length > 0 && pointIdx >= 0) {
        // Rotate specific point
        const pt = r.points[pointIdx];
        if (pt) {
          pt.angle = pt.angle + deltaRad;
          while (pt.angle > Math.PI) pt.angle -= 2 * Math.PI;
          while (pt.angle < -Math.PI) pt.angle += 2 * Math.PI;
        }
        // Keep route.angle synced to last point
        r.angle = r.points[r.points.length - 1].angle;
      } else {
        r.angle = r.angle + deltaRad;
        while (r.angle > Math.PI) r.angle -= 2 * Math.PI;
        while (r.angle < -Math.PI) r.angle += 2 * Math.PI;
        if (r.points && r.points.length > 0) {
          r.points[r.points.length - 1].angle = r.angle;
        }
      }
      this._notify();
    }
  }

  isCrewMemberModified(idx) {
    const orig = this._originalMembers[idx];
    const curr = CREW_MEMBERS[idx];
    if (!orig || !curr) return false;
    return orig.x !== curr.x || orig.y !== curr.y || orig.hdg !== curr.hdg;
  }

  isCrewRouteModified(idx) {
    const orig = this._originalRoutes[idx];
    const curr = CREW_ROUTES[idx];
    if (!orig || !curr) return false;
    if (orig.x !== curr.x || orig.y !== curr.y || orig.angle !== curr.angle) return true;
    if (orig.points && curr.points) {
      if (orig.points.length !== curr.points.length) return true;
      return orig.points.some((p, j) =>
        p.x !== curr.points[j].x || p.y !== curr.points[j].y || p.angle !== curr.points[j].angle
      );
    }
    return false;
  }

  revertCrewMember(idx) {
    const orig = this._originalMembers[idx];
    if (!orig) return;
    const m = CREW_MEMBERS[idx];
    m.x = orig.x; m.y = orig.y; m.hdg = orig.hdg;
    this._notify();
  }

  revertCrewRoute(idx) {
    const orig = this._originalRoutes[idx];
    if (!orig) return;
    const r = CREW_ROUTES[idx];
    r.x = orig.x; r.y = orig.y; r.angle = orig.angle;
    if (orig.points) {
      r.points = orig.points.map(p => ({ ...p }));
    }
    this._notify();
  }

  /** Refresh snapshots after crew.lua import. */
  refreshCrewSnapshots() {
    this._originalMembers = CREW_MEMBERS.map(m => ({ ...m }));
    this._originalRoutes = CREW_ROUTES.map(r => {
      const clone = { ...r };
      if (r.points) clone.points = r.points.map(p => ({ ...p }));
      return clone;
    });
  }

  moveWaypoint(routeIdx, pointIdx, x, y) {
    this.pushUndo(`move-wp-${routeIdx}-${pointIdx}`);
    const routes = this._selectedRoutes();
    if (!routes) return;
    const pt = routes[routeIdx]?.points[pointIdx];
    if (pt) {
      pt.x = x;
      pt.y = y;
      this._notify();
    }
  }

  addWaypoint(routeIdx, afterIdx, x, y) {
    this.pushUndo();
    const routes = this._selectedRoutes();
    if (!routes) return;
    const route = routes[routeIdx];
    if (route) {
      route.points.splice(afterIdx + 1, 0, { x, y, v: 1.0 });
      this._notify();
    }
  }

  removeWaypoint(routeIdx, pointIdx) {
    this.pushUndo();
    const routes = this._selectedRoutes();
    if (!routes) return;
    const route = routes[routeIdx];
    if (route && route.points.length > 2) {
      route.points.splice(pointIdx, 1);
      this._notify();
    }
  }

  /** Is a specific takeoff route visible? */
  isTakeoffRouteVisible(i) {
    return this.takeoffRouteVisible[i];
  }

  /** Are all takeoff routes currently visible? */
  allTakeoffRoutesVisible() {
    return this.takeoffRouteVisible.every(Boolean);
  }

  /** Is a specific landing route visible? */
  isLandingRouteVisible(i) {
    return this.landingVisible && this.landingRouteVisible[i];
  }

  /** Are all landing routes currently visible? */
  allLandingRoutesVisible() {
    return this.landingRouteVisible.every(Boolean);
  }

  // ── Import ─────────────────────────────────────────────────────────

  /** Replace all takeoff routes with imported data. */
  loadTakeoffRoutes(routes) {
    this.takeoffRoutes = routes.map(r => ({
      ...r,
      points: r.points.map(p => ({ ...p })),
    }));
    this.takeoffRouteVisible = new Array(routes.length).fill(true);
    this.selectedRouteType = null;
    this.selectedRoute = -1;
    this.draggingPoint = -1;
    this._notify();
  }

  /** Replace all landing routes with imported data. */
  loadLandingRoutes(routes) {
    this.landingRoutes = routes.map(r => ({
      ...r,
      points: r.points.map(p => ({ ...p })),
    }));
    this.landingRouteVisible = new Array(routes.length).fill(true);
    this.selectedRouteType = null;
    this.selectedRoute = -1;
    this.draggingPoint = -1;
    this._notify();
  }

  /** Refresh route snapshots after import so nothing appears modified. */
  refreshRouteSnapshots() {
    TAKEOFF_ROUTES.length = 0;
    this.takeoffRoutes.forEach(r => TAKEOFF_ROUTES.push({ ...r, points: r.points.map(p => ({ ...p })) }));
    LANDING_ROUTES.length = 0;
    this.landingRoutes.forEach(r => LANDING_ROUTES.push({ ...r, points: r.points.map(p => ({ ...p })) }));
  }

  // ── Revert / diff ─────────────────────────────────────────────────────

  /** Reset a single takeoff route to its original data. */
  revertRoute(i) {
    const orig = TAKEOFF_ROUTES[i];
    this.takeoffRoutes[i] = { ...orig, points: orig.points.map(p => ({ ...p })) };
    this._notify();
  }

  /** Has a takeoff route been modified from its original data? */
  isRouteModified(i) {
    const orig = TAKEOFF_ROUTES[i];
    const curr = this.takeoffRoutes[i];
    if (orig.points.length !== curr.points.length) return true;
    return orig.points.some((p, j) =>
      p.x !== curr.points[j].x || p.y !== curr.points[j].y || p.v !== curr.points[j].v
    );
  }

  /** Reset a single landing route to its original data. */
  revertLandingRoute(i) {
    const orig = LANDING_ROUTES[i];
    this.landingRoutes[i] = { ...orig, points: orig.points.map(p => ({ ...p })) };
    this._notify();
  }

  /** Has a landing route been modified from its original data? */
  isLandingRouteModified(i) {
    const orig = LANDING_ROUTES[i];
    const curr = this.landingRoutes[i];
    if (orig.points.length !== curr.points.length) return true;
    return orig.points.some((p, j) =>
      p.x !== curr.points[j].x || p.y !== curr.points[j].y || p.v !== curr.points[j].v
    );
  }

  // ── Catapult crew methods ────────────────────────────────────────────
  setCatCrewCatapult(i) {
    if (this.catCrewEditMode) this._resetCatCrewEdit();
    this.catCrewCatapult = i;
    this._notify();
  }
  setCatCrewPhase(p) {
    if (this.catCrewEditMode) this._resetCatCrewEdit();
    this.catCrewPhase = p;
    this._notify();
  }
  setCatCrewT(t)        { this.catCrewT = t; this._notify(); }
  toggleCatCrewVisible() { this.catCrewVisible = !this.catCrewVisible; this._notify(); }

  // ── Catapult crew route editing ────────────────────────────────────

  _resetCatCrewEdit() {
    this.catCrewEditMode = false;
    this.catCrewEditMember = -1;
    this.catCrewDraggingPoint = -1;
    this.catCrewSelectedPoint = -1;
  }

  enterCatCrewEdit(memberIdx) {
    // Mutual exclusivity: exit route edit and crew edit
    if (this.selectedRoute >= 0) {
      this.selectedRouteType = null;
      this.selectedRoute = -1;
      this.draggingPoint = -1;
    }
    if (this.crewEditMode) {
      this.crewEditMode = false;
      this.selectedCrewType = null;
      this.selectedCrewIdx = -1;
      this.selectedCrewPointIdx = -1;
      this.hoveredCrewType = null;
      this.hoveredCrewIdx = -1;
      this.hoveredCrewPointIdx = -1;
      this.draggingCrew = false;
    }
    this.catCrewEditMode = true;
    this.catCrewEditMember = memberIdx;
    this.catCrewDraggingPoint = -1;
    this.catCrewSelectedPoint = -1;
    this._notify();
  }

  exitCatCrewEdit() {
    this._resetCatCrewEdit();
    this._notify();
  }

  /** Get the route object currently being edited. */
  getCatCrewEditRoute() {
    const crew = CATAPULT_CREWS[this.catCrewCatapult];
    if (!crew || this.catCrewEditMember < 0) return null;
    const member = crew.members[this.catCrewEditMember];
    if (!member) return null;
    const phase = CATAPULT_PHASES[this.catCrewPhase];
    return findPhaseRoute(member, phase);
  }

  getCatCrewEditMember() {
    const crew = CATAPULT_CREWS[this.catCrewCatapult];
    if (!crew || this.catCrewEditMember < 0) return null;
    return crew.members[this.catCrewEditMember] || null;
  }

  moveCatCrewWaypoint(pointIdx, x, y) {
    this.pushUndo(`move-catcrew-${this.catCrewCatapult}-${this.catCrewEditMember}-${pointIdx}`);
    const route = this.getCatCrewEditRoute();
    if (!route || !route.points[pointIdx]) return;
    route.points[pointIdx].x = x;
    route.points[pointIdx].y = y;
    // Only recalc tangent for the moved point — preserve neighbors' original tangents
    recalcTangents(route.points, [pointIdx]);
    this._notify();
  }

  addCatCrewWaypoint(afterIdx, x, y) {
    this.pushUndo();
    const route = this.getCatCrewEditRoute();
    if (!route) return;
    const newIdx = afterIdx + 1;
    const h = route.points[afterIdx]?.h ?? 20.1494140625;
    route.points.splice(newIdx, 0, { x, h, y, vx: 0, vy: 0, vz: 0 });
    // Only recalc tangent for the new point — preserve existing points' original tangents
    recalcTangents(route.points, [newIdx]);
    this._notify();
  }

  rotateCatCrewHeading(deltaDeg) {
    this.pushUndo(`rotate-catcrew-${this.catCrewCatapult}-${this.catCrewEditMember}`);
    const member = this.getCatCrewEditMember();
    if (!member) return;
    const phase = CATAPULT_PHASES[this.catCrewPhase];
    if (!phase.routeSuffix) {
      // Idle / fast_start — rotate position.hdg or fastStartPosition.hdg
      const pos = phase.useFastStart && member.fastStartPosition
        ? member.fastStartPosition : member.position;
      pos.hdg = ((pos.hdg + deltaDeg + 180) % 360 + 360) % 360 - 180;
    } else {
      // Route phase — rotate finalHeading
      const route = findPhaseRoute(member, phase);
      if (!route || route.points.length === 0) return;
      const pts = route.points;
      // Compute current effective heading
      let cur;
      if (route.finalHeading != null) {
        cur = route.finalHeading;
      } else if (pts.length >= 2) {
        const prev = pts[pts.length - 2], last = pts[pts.length - 1];
        cur = -Math.atan2(last.y - prev.y, last.x - prev.x) * 180 / Math.PI;
      } else {
        cur = member.position.hdg;
      }
      route.finalHeading = ((cur + deltaDeg + 180) % 360 + 360) % 360 - 180;
    }
    this._notify();
  }

  removeCatCrewWaypoint(pointIdx) {
    this.pushUndo();
    const route = this.getCatCrewEditRoute();
    if (!route || route.points.length <= 2) return;
    route.points.splice(pointIdx, 1);
    if (this.catCrewSelectedPoint >= route.points.length) {
      this.catCrewSelectedPoint = route.points.length - 1;
    }
    // Don't recalc neighbors — preserve their original tangents
    this._notify();
  }

  /** Snapshot catapult crews for revert. */
  refreshCatCrewSnapshots() {
    this._originalCatCrews = CATAPULT_CREWS.map(c => ({
      name: c.name,
      members: c.members.map(m => ({
        ...m,
        position: { ...m.position },
        fastStartPosition: m.fastStartPosition ? { ...m.fastStartPosition } : null,
        routes: m.routes.map(r => ({
          ...r,
          points: r.points.map(p => ({ ...p })),
        })),
      })),
    }));
  }

  isCatCrewMemberModified(catIdx, memberIdx) {
    if (!this._originalCatCrews) return false;
    const orig = this._originalCatCrews[catIdx]?.members[memberIdx];
    const curr = CATAPULT_CREWS[catIdx]?.members[memberIdx];
    if (!orig || !curr) return false;
    for (let ri = 0; ri < orig.routes.length; ri++) {
      const oRoute = orig.routes[ri];
      const cRoute = curr.routes[ri];
      if (!cRoute) return true;
      if (oRoute.points.length !== cRoute.points.length) return true;
      if (oRoute.points.some((p, j) =>
        p.x !== cRoute.points[j].x || p.y !== cRoute.points[j].y
      )) return true;
    }
    return false;
  }

  isAnythingModified() {
    for (let i = 0; i < CREW_MEMBERS.length; i++) {
      if (this.isCrewMemberModified(i)) return true;
    }
    for (let i = 0; i < CREW_ROUTES.length; i++) {
      if (this.isCrewRouteModified(i)) return true;
    }
    for (let i = 0; i < this.takeoffRoutes.length; i++) {
      if (this.isRouteModified(i)) return true;
    }
    for (let i = 0; i < this.landingRoutes.length; i++) {
      if (this.isLandingRouteModified(i)) return true;
    }
    for (let ci = 0; ci < CATAPULT_CREWS.length; ci++) {
      for (let mi = 0; mi < CATAPULT_CREWS[ci].members.length; mi++) {
        if (this.isCatCrewMemberModified(ci, mi)) return true;
      }
    }
    return false;
  }

  revertCatCrewMember(catIdx, memberIdx) {
    if (!this._originalCatCrews) return;
    const orig = this._originalCatCrews[catIdx]?.members[memberIdx];
    const curr = CATAPULT_CREWS[catIdx]?.members[memberIdx];
    if (!orig || !curr) return;
    curr.routes = orig.routes.map(r => ({
      ...r,
      points: r.points.map(p => ({ ...p })),
    }));
    this._notify();
  }
}

export const routeState = new RouteState();
