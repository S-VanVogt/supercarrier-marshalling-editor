/* Catapult crew data — populated from crew.lua ["crew"] section on import.
   4 catapults × 6 members (shooter, director, white1, white2, green_hbb, green_nw).
   Each member has idle position and movement routes (launch, initial, free_cat, occupy_cat). */

export const CATAPULT_CREWS = [];          // [{name, members: [{name, position, routes}]}]

export const CATAPULT_MEMBER_COLORS = {
  shooter:   { fill: '#e74c3c', stroke: '#c0392b' },   // red
  director:  { fill: '#f1c40f', stroke: '#d4ac0f' },   // yellow
  white1:    { fill: '#ecf0f1', stroke: '#95a5a6' },   // white
  white2:    { fill: '#ecf0f1', stroke: '#95a5a6' },   // white
  green_hbb: { fill: '#2ecc71', stroke: '#27ae60' },   // green
  green_nw:  { fill: '#27ae60', stroke: '#1e8449' },   // green (slightly darker)
};

export const CATAPULT_PHASES = [
  { id: 'idle',        label: 'Idle',        routeSuffix: null },
  { id: 'fast_start',  label: 'Fast Start',  routeSuffix: null, useFastStart: true },
  { id: 'launch_pos',  label: 'Launch Pos',  routeSuffix: 'launch_pos' },
  { id: 'initial_pos', label: 'Initial Pos', routeSuffix: 'initial_pos' },
  { id: 'free_cat',    label: 'Free Cat',    routeSuffix: 'free_cat' },
  { id: 'occupy_cat',  label: 'Occupy Cat',  routeSuffix: 'occupy_cat' },
];

/** Find the route for a given phase on a specific member (by name keyword). */
export function findPhaseRoute(member, phase) {
  if (!phase.routeSuffix) return null;
  return member.routes.find(r => r.name.includes(phase.routeSuffix)) || null;
}

/** Calculate the total path length of a route's points array. */
export function routePathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

/**
 * For a given global t (0–1 over the longest route), compute each member's
 * local t based on their path length ratio. Returns an array of local t values
 * (one per member), clamped to [0, 1].
 */
export function memberLocalTs(crew, phase, globalT) {
  const routes = crew.members.map(m => findPhaseRoute(m, phase));
  const lengths = routes.map(r => (r && r.points.length >= 2) ? routePathLength(r.points) : 0);
  const maxLen = Math.max(...lengths, 0.001);
  return lengths.map(len => len > 0 ? Math.min(1, globalT * maxLen / len) : 0);
}

/**
 * Recalculate Hermite tangents (tx, tz) for points in a catapult crew route.
 * DCS uses cubic Hermite splines where tangent = 0.5 × chord produces a straight line.
 * All points use 0.5 × adjacent chord: this yields straight segments for 2-point
 * routes and smooth curves for multi-point routes.
 * Only updates the specified indices (or all if null).
 */
export function recalcTangents(points, indices) {
  if (!points || points.length < 2) return;
  const toUpdate = indices || points.map((_, i) => i);
  for (const i of toUpdate) {
    if (i < 0 || i >= points.length) continue;
    const p = points[i];
    let tx, tz;
    if (points.length === 1) {
      tx = 0; tz = 0;
    } else if (i === 0) {
      // First point: half chord toward next point
      tx = (points[1].x - p.x) * 0.5;
      tz = (points[1].y - p.y) * 0.5;
    } else if (i === points.length - 1) {
      // Last point: half chord from previous point
      tx = (p.x - points[i - 1].x) * 0.5;
      tz = (p.y - points[i - 1].y) * 0.5;
    } else {
      // Interior: half of Catmull-Rom span (0.5 × 0.5 × (next - prev))
      tx = (points[i + 1].x - points[i - 1].x) * 0.25;
      tz = (points[i + 1].y - points[i - 1].y) * 0.25;
    }
    p.vx = tx;
    p.vy = 0;
    p.vz = tz;
  }
}

export function replaceCatapultCrews(data) {
  CATAPULT_CREWS.length = 0;
  for (const c of data) CATAPULT_CREWS.push(c);
}
