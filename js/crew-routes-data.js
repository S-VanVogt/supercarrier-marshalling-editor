/**
 * Crew active (marshalling) positions extracted from crew.lua takeoff_crew["routes"].
 * Member-to-route mapping derived from takeoff_tasks (NOT from naming convention).
 *
 * route_id in tasks is 0-based → Lua routes[route_id + 1].
 * member_id in tasks is 0-based → CREW_MEMBERS[member_id].
 *
 * All route positions: Lua [1]=X → viewport X, [2]=Z → viewport Y, [3]=angle (radians).
 */

/**
 * All "to-" routes indexed by route_id (0-based, matching task references).
 * Lua routes[1] = route_id 0, etc.
 */
export const CREW_ROUTES = [
  /* route_id  0 */ { name: 'to-brown-pos-00', x:  14.200, y:   4.100, angle:  0.1396 },
  /* route_id  1 */ { name: 'to-brown-pos-01', x:  -3.200, y:   2.400, angle:  0.0698 },
  /* route_id  2 */ { name: 'to-brown-pos-02', x: -20.300, y:   4.900, angle:  0.1300 },
  /* route_id  3 */ { name: 'to-brown-pos-03', x: -35.900, y:   8.500, angle:  0.3665 },
  /* route_id  4 */ { name: 'to-brown-pos-04', x:  -4.183, y:  18.749, angle: -1.6057 },
  /* route_id  5 */ { name: 'to-brown-pos-05', x: -30.428, y:  22.233, angle: -0.7505 },
  /* route_id  6 */ { name: 'to-brown-pos-06', x: -89.835, y: -24.884, angle:  3.1416 },
  /* route_id  7 */ { name: 'to-brown-pos-07', x:-110.876, y: -16.692, angle:  0.3665 },
  /* route_id  8 */ { name: 'to-brown-pos-08', x: -85.102, y:  22.511, angle: -0.9425 },
  /* route_id  9 */ { name: 'to-brown-pos-09', x:-110.812, y:  23.544, angle: -0.5760 },
  /* route_id 10 */ { name: 'to-brown-pos-10', x:  29.687, y:  21.723, angle: -0.7330 },
  /* route_id 11 */ { name: 'to-brown-pos-11', x:  17.297, y:  19.981, angle: -0.8029 },
  /* route_id 12 */ { name: 'to-brown-pos-12', x:  -0.801, y:  20.505, angle: -0.2269 },
  /* route_id 13 */ { name: 'to-brown-pos-13', x:-109.900, y:  19.200, angle: -2.3387 },
  /* route_id 14 */ { name: 'to-brown-pos-14', x:-117.400, y:  14.200, angle: -2.6354, points: [
                      { x: -121.700, y: 21.100, angle: -2.5656 },
                      { x: -117.400, y: 14.200, angle: -2.6354 },
                    ] },
  /* route_id 15 */ { name: 'to-brown-pos-15', x:-130.495, y:  19.259, angle: -3.1416 },
  /* route_id 16 */ { name: 'park-pos-00',     x:  36.423, y:   2.829, angle:  2.3562 },
  /* route_id 17 */ { name: 'park-pos-01',     x:  -2.837, y:  17.174, angle:  1.1868 },
  /* route_id 18 */ { name: 'park-pos-02',     x: -56.276, y:  20.091, angle:  0.4538 },
  /* route_id 19 */ { name: 'park-pos-03',     x: -86.072, y:  30.055, angle:  0.6109 },
  /* route_id 20 */ { name: 'park-pos-04',     x:-147.601, y:  22.114, angle: -0.1396 },
  /* route_id 21 */ { name: 'park-pos-05',     x:-122.211, y:  29.692, angle:  1.6057 },
  /* route_id 22 */ { name: 'park-pos-06',     x:-113.198, y:  29.589, angle:  1.2392 },
  /* route_id 23 */ { name: 'park-pos-07',     x: -95.281, y:  35.849, angle:  1.4661 },
  /* route_id 24 */ { name: 'park-pos-08',     x: -82.023, y:  35.510, angle:  1.9373 },
  /* route_id 25 */ { name: 'park-pos-09',     x: -58.408, y:  25.570, angle:  2.1118 },
  /* route_id 26 */ { name: 'park-pos-10',     x: -81.771, y:   9.476, angle: -0.2269 },
  /* route_id 27 */ { name: 'park-pos-11',     x:  76.972, y:  29.407, angle:  3.0020 },
  /* route_id 28 */ { name: 'park-pos-12',     x:  55.227, y:  24.972, angle:  2.3562 },  // angle was suspicious in Lua
  /* route_id 29 */ { name: 'park-pos-13',     x:  42.245, y:  28.416, angle:  2.1118 },
  /* route_id 30 */ { name: 'to-yellow-00',    x:  11.583, y: -10.558, angle: -1.7628 },
  /* route_id 31 */ { name: 'to-yellow-01',    x:  35.585, y: -11.890, angle: -2.5656 },
  /* route_id 32 */ { name: 'to-yellow-02',    x:  47.322, y:  11.541, angle:  2.7227 },
  /* route_id 33 */ { name: 'to-yellow-04',    x:  -1.388, y:  15.011, angle:  3.0020 },
  /* route_id 34 */ { name: 'to-yellow-05',    x: -19.832, y: -10.003, angle: -2.6005 },
  /* route_id 35 */ { name: 'to-yellow-06',    x: -99.482, y:  -0.003, angle: -2.4260 },
  /* route_id 36 */ { name: 'to-yellow-07',    x: -71.776, y: -26.351, angle: -2.7751 },
  /* route_id 37 */ { name: 'to-yellow-08',    x: -73.047, y: -10.062, angle: -0.2269 },
  /* route_id 38 */ { name: 'to-yellow-09',    x: -86.107, y: -35.072, angle: -1.6057 },
  /* route_id 39 */ { name: 'to-yellow-09a',   x: -91.044, y: -23.329, angle: -1.8326 },
  /* route_id 40 */ { name: 'to-yellow-09b',   x: -85.226, y: -35.629, angle: -2.0420 },
  /* route_id 41 */ { name: 'to-yellow-11',    x: -91.046, y:   1.009, angle: -2.1991 },
  /* route_id 42 */ { name: 'to-yellow-12',    x: -48.069, y:  -9.800, angle: -2.5656 },
  /* route_id 43 */ { name: 'to-yellow-13',    x:-119.079, y: -15.036, angle: -2.0246 },
  /* route_id 44 */ { name: 'to-yellow-14',    x:  -7.069, y:  -9.006, angle: -0.9250 },
  /* route_id 45 */ { name: 'to-yellow-15',    x: -99.145, y: -22.216, angle: -2.4086 },
  /* route_id 46 */ { name: 'to-yellow-16',    x: -64.518, y:  -1.548, angle: -2.6354, points: [
                      { x: -34.363, y: -6.193, angle: 0 },
                      { x: -64.518, y: -1.548, angle: -2.6354 },
                    ] },
  /* route_id 47 */ { name: 'park-pos-02a',    x: -42.834, y:  22.393, angle:  1.4137 },
  /* route_id 48 */ { name: 'route_48',        x: -32.126, y:  23.805, angle:  0.4712 },
];

/**
 * Takeoff task assignments: which member goes to which route(s).
 * Derived from all 16 takeoff_tasks in crew.lua.
 * Each entry: { memberIdx, routeId } — a member can appear multiple times.
 */
export const TASK_ASSIGNMENTS = [
  // Task 1: 6pack 01 to cat1
  { memberIdx:  1, routeId: 30 },  // yellow-01 → to-yellow-00
  { memberIdx:  0, routeId: 31 },  // yellow-00 → to-yellow-01
  { memberIdx: 14, routeId:  0 },  // brown-0-11 → to-brown-pos-00

  // Task 2: 6pack 02 to Cat1
  { memberIdx:  3, routeId: 44 },  // yellow-04 → to-yellow-14
  { memberIdx:  0, routeId: 31 },  // yellow-00 → to-yellow-01 (dup)
  { memberIdx: 15, routeId:  1 },  // brown-1-12 → to-brown-pos-01

  // Task 3: 6pack 03
  { memberIdx:  4, routeId: 34 },  // yellow-05 → to-yellow-05
  { memberIdx:  7, routeId: 37 },  // yellow-08 → to-yellow-08
  { memberIdx:  6, routeId: 36 },  // yellow-07 → to-yellow-07 (note: member 6=yellow-06 at idx 5)
  { memberIdx: 16, routeId:  2 },  // brown-2-4 → to-brown-pos-02

  // Task 4: 6pack 04
  { memberIdx: 10, routeId: 42 },  // yellow-12 → to-yellow-12
  { memberIdx:  7, routeId: 37 },  // yellow-08 → to-yellow-08 (dup)
  { memberIdx:  8, routeId: 38 },  // yellow-09 → to-yellow-09
  { memberIdx: 17, routeId:  3 },  // brown-3-5 → to-brown-pos-03

  // Task 5: El-2 1
  { memberIdx:  3, routeId: 44 },  // yellow-04 → to-yellow-14 (dup)
  { memberIdx:  2, routeId: 32 },  // yellow-02 → to-yellow-02
  { memberIdx: 16, routeId:  4 },  // brown-2-4 → to-brown-pos-04

  // Task 6: El-2 2
  { memberIdx:  3, routeId: 44 },  // yellow-04 → to-yellow-14 (dup)
  { memberIdx:  1, routeId: 30 },  // yellow-01 → to-yellow-00 (dup)
  { memberIdx:  0, routeId: 31 },  // yellow-00 → to-yellow-01 (dup)
  { memberIdx: 17, routeId:  5 },  // brown-3-5 → to-brown-pos-05

  // Task 7
  { memberIdx:  5, routeId: 35 },  // yellow-06 → to-yellow-06
  { memberIdx:  7, routeId: 37 },  // yellow-08 → to-yellow-08 (dup)
  { memberIdx: 18, routeId:  6 },  // brown-6 → to-brown-pos-06

  // Task 8
  { memberIdx:  5, routeId: 35 },  // yellow-06 → to-yellow-06 (dup)
  { memberIdx:  7, routeId: 37 },  // yellow-08 → to-yellow-08 (dup)
  { memberIdx:  8, routeId: 38 },  // yellow-09 → to-yellow-09 (dup)
  { memberIdx: 19, routeId:  7 },  // brown-7 → to-brown-pos-07

  // Task 9: El-3 1
  { memberIdx:  9, routeId: 41 },  // yellow-11 → to-yellow-11
  { memberIdx: 10, routeId: 42 },  // yellow-12 → to-yellow-12 (dup)
  { memberIdx:  3, routeId: 44 },  // yellow-04 → to-yellow-14 (dup)
  { memberIdx:  1, routeId: 30 },  // yellow-01 → to-yellow-00 (dup)
  { memberIdx:  0, routeId: 31 },  // yellow-00 → to-yellow-01 (dup)
  { memberIdx: 20, routeId:  8 },  // brown-8 → to-brown-pos-08

  // Task 10: El-3 2
  { memberIdx:  5, routeId: 35 },  // yellow-06 → to-yellow-06 (dup)
  { memberIdx: 13, routeId: 46 },  // yellow-15 → to-yellow-16
  { memberIdx:  4, routeId: 34 },  // yellow-05 → to-yellow-05 (dup)
  { memberIdx:  1, routeId: 30 },  // yellow-01 → to-yellow-00 (dup)
  { memberIdx:  0, routeId: 31 },  // yellow-00 → to-yellow-01 (dup)
  { memberIdx: 21, routeId:  9 },  // brown-9 → to-brown-pos-09

  // Task 11
  { memberIdx:  1, routeId: 30 },  // yellow-01 → to-yellow-00 (dup)
  { memberIdx:  0, routeId: 31 },  // yellow-00 → to-yellow-01 (dup)
  { memberIdx: 22, routeId: 10 },  // brown-10 → to-brown-pos-10

  // Task 12: El-1 2 takeoff path
  { memberIdx:  1, routeId: 30 },  // yellow-01 → to-yellow-00 (dup)
  { memberIdx:  0, routeId: 31 },  // yellow-00 → to-yellow-01 (dup)
  { memberIdx: 14, routeId: 11 },  // brown-0-11 → to-brown-pos-11

  // Task 13: Corral to cat1
  { memberIdx:  1, routeId: 30 },  // yellow-01 → to-yellow-00 (dup)
  { memberIdx:  0, routeId: 31 },  // yellow-00 → to-yellow-01 (dup)
  { memberIdx: 15, routeId: 12 },  // brown-1-12 → to-brown-pos-12

  // Task 14
  { memberIdx:  9, routeId: 41 },  // yellow-11 → to-yellow-11 (dup)
  { memberIdx: 10, routeId: 42 },  // yellow-12 → to-yellow-12 (dup)
  { memberIdx:  3, routeId: 44 },  // yellow-04 → to-yellow-14 (dup)
  { memberIdx:  1, routeId: 30 },  // yellow-01 → to-yellow-00 (dup)
  { memberIdx:  0, routeId: 31 },  // yellow-00 → to-yellow-01 (dup)
  { memberIdx: 23, routeId: 13 },  // brown-13 → to-brown-pos-13

  // Task 15
  { memberIdx:  5, routeId: 35 },  // yellow-06 → to-yellow-06 (dup)
  { memberIdx:  6, routeId: 36 },  // yellow-07 → to-yellow-07 (dup)
  { memberIdx: 24, routeId: 14 },  // brown-14 → to-brown-pos-14

  // Task 16
  { memberIdx: 11, routeId: 43 },  // yellow-13 → to-yellow-13
  { memberIdx: 12, routeId: 45 },  // yellow-14 → to-yellow-15
  { memberIdx:  6, routeId: 36 },  // yellow-07 → to-yellow-07 (dup)
  { memberIdx: 25, routeId: 15 },  // brown-15 → to-brown-pos-15
];

/**
 * Deduplicated member→route pairs for rendering.
 * Built at load time from TASK_ASSIGNMENTS.
 */
export const CREW_ACTIVE_LINKS = (() => {
  const seen = new Set();
  const links = [];
  for (const a of TASK_ASSIGNMENTS) {
    const key = `${a.memberIdx}:${a.routeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(a);
  }
  return links;
})();

/**
 * Replace all crew route and task data in-place from parsed crew.lua data.
 * Recalculates CREW_ACTIVE_LINKS.
 */
export function replaceCrewRoutes(routes, takeoffTasks) {
  CREW_ROUTES.length = 0;
  CREW_ROUTES.push(...routes);

  // Rebuild TASK_ASSIGNMENTS from takeoff tasks
  TASK_ASSIGNMENTS.length = 0;
  for (const task of takeoffTasks) {
    for (const step of task.steps) {
      TASK_ASSIGNMENTS.push({ memberIdx: step.memberId, routeId: step.routeId });
    }
    TASK_ASSIGNMENTS.push({ memberIdx: task.brownId, routeId: task.brownRouteId });
  }

  // Rebuild CREW_ACTIVE_LINKS
  CREW_ACTIVE_LINKS.length = 0;
  const seen = new Set();
  for (const a of TASK_ASSIGNMENTS) {
    const key = `${a.memberIdx}:${a.routeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    CREW_ACTIVE_LINKS.push(a);
  }
}
