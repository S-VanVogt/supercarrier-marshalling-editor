/**
 * Reactive state for taxi route visibility and editing.
 * Deep-clones route data so edits are non-destructive.
 */
import { TAKEOFF_ROUTES, LANDING_ROUTES } from './route-data.js';
import { CREW_MEMBERS } from './crew-data.js';

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
    this.landingRouteVisible = new Array(LANDING_ROUTES.length).fill(true);

    this.crewVisible = new Array(CREW_MEMBERS.length).fill(true);

    /** Progress ratio 0–1 for route marker. */
    this.t = 0.5;

    /** Type of selected route: 'takeoff' | 'landing' | null */
    this.selectedRouteType = null;
    /** Index of route selected for editing (-1 = none). */
    this.selectedRoute = -1;
    /** Index of waypoint being dragged (-1 = none). */
    this.draggingPoint = -1;

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
    this.selectedRouteType = type;
    this.selectedRoute = i;
    this._notify();
  }

  deselectRoute() {
    this.selectedRouteType = null;
    this.selectedRoute = -1;
    this.draggingPoint = -1;
    this._notify();
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
