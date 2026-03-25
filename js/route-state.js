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
    this.landingRouteVisible = new Array(16).fill(true);

    this.crewVisible = new Array(CREW_MEMBERS.length).fill(true);

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

  selectRoute(i) {
    this.selectedRoute = i;
    this._notify();
  }

  deselectRoute() {
    this.selectedRoute = -1;
    this.draggingPoint = -1;
    this._notify();
  }

  moveWaypoint(routeIdx, pointIdx, x, y) {
    const pt = this.takeoffRoutes[routeIdx]?.points[pointIdx];
    if (pt) {
      pt.x = x;
      pt.y = y;
      this._notify();
    }
  }

  addWaypoint(routeIdx, afterIdx, x, y) {
    const route = this.takeoffRoutes[routeIdx];
    if (route) {
      route.points.splice(afterIdx + 1, 0, { x, y, v: 1.0 });
      this._notify();
    }
  }

  removeWaypoint(routeIdx, pointIdx) {
    const route = this.takeoffRoutes[routeIdx];
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

  // ── Import ─────────────────────────────────────────────────────────

  /** Replace all takeoff routes with imported data. */
  loadTakeoffRoutes(routes) {
    this.takeoffRoutes = routes.map(r => ({
      ...r,
      points: r.points.map(p => ({ ...p })),
    }));
    this.takeoffRouteVisible = new Array(routes.length).fill(true);
    this.selectedRoute = -1;
    this.draggingPoint = -1;
    this._notify();
  }

  // ── Revert / diff ─────────────────────────────────────────────────────

  /** Reset a single route to its original data. */
  revertRoute(i) {
    const orig = TAKEOFF_ROUTES[i];
    this.takeoffRoutes[i] = { ...orig, points: orig.points.map(p => ({ ...p })) };
    this._notify();
  }

  /** Has a route been modified from its original data? */
  isRouteModified(i) {
    const orig = TAKEOFF_ROUTES[i];
    const curr = this.takeoffRoutes[i];
    if (orig.points.length !== curr.points.length) return true;
    return orig.points.some((p, j) =>
      p.x !== curr.points[j].x || p.y !== curr.points[j].y || p.v !== curr.points[j].v
    );
  }
}

export const routeState = new RouteState();
