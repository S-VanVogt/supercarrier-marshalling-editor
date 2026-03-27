/**
 * Reactive state for taxi route visibility and editing.
 * Deep-clones route data so edits are non-destructive.
 */
import { TAKEOFF_ROUTES, LANDING_ROUTES } from './route-data.js';
import { CREW_MEMBERS } from './crew-data.js';
import { CREW_ROUTES } from './crew-routes-data.js';

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

    this.crewVisible = new Array(CREW_MEMBERS.length).fill(true);

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

    // Snapshots for revert
    this._originalMembers = CREW_MEMBERS.map(m => ({ ...m }));
    this._originalRoutes = CREW_ROUTES.map(r => {
      const clone = { ...r };
      if (r.points) clone.points = r.points.map(p => ({ ...p }));
      return clone;
    });

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
    // Mutual exclusivity: exit route edit when entering crew edit
    if (this.selectedRoute >= 0) {
      this.selectedRouteType = null;
      this.selectedRoute = -1;
      this.draggingPoint = -1;
    }
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
    const routes = this._selectedRoutes();
    if (!routes) return;
    const route = routes[routeIdx];
    if (route) {
      route.points.splice(afterIdx + 1, 0, { x, y, v: 1.0 });
      this._notify();
    }
  }

  removeWaypoint(routeIdx, pointIdx) {
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
}

export const routeState = new RouteState();
