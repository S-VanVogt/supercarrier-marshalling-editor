/**
 * Takeoff task assignments from crew.lua takeoff_crew["takeoff_tasks"].
 * Each task corresponds 1:1 to a takeoff route (task index = route index).
 *
 * member_id and route_id are 0-based (matching CREW_MEMBERS and CREW_ROUTES indices).
 * Steps are ordered by progress value.
 */
export const TAKEOFF_TASKS = [
  // Task 1: 6pack 01 to cat1
  {
    brownId: 14, brownRouteId: 0,
    steps: [
      { progress: 0.06, memberId: 1, routeId: 30 },
      { progress: 0.35, memberId: 0, routeId: 31 },
    ],
  },
  // Task 2: 6pack 02 to Cat1
  {
    brownId: 15, brownRouteId: 1,
    steps: [
      { progress: 0.06, memberId: 3, routeId: 44 },
      { progress: 0.47, memberId: 0, routeId: 31 },
    ],
  },
  // Task 3: 6pack 03
  {
    brownId: 16, brownRouteId: 2,
    steps: [
      { progress: 0.101, memberId: 4, routeId: 34 },
      { progress: 0.52,  memberId: 7, routeId: 37 },
      { progress: 0.6,   memberId: 6, routeId: 36 },
    ],
  },
  // Task 4: 6pack 04
  {
    brownId: 17, brownRouteId: 3,
    steps: [
      { progress: 0.11,  memberId: 10, routeId: 42 },
      { progress: 0.365, memberId: 7,  routeId: 37 },
      { progress: 0.726, memberId: 8,  routeId: 38 },
    ],
  },
  // Task 5: El-2 1
  {
    brownId: 16, brownRouteId: 4,
    steps: [
      { progress: 0.207, memberId: 3, routeId: 44 },
      { progress: 0.6,   memberId: 2, routeId: 32 },
    ],
  },
  // Task 6: El-2 2
  {
    brownId: 17, brownRouteId: 5,
    steps: [
      { progress: 0.31,  memberId: 3, routeId: 44 },
      { progress: 0.484, memberId: 1, routeId: 30 },
      { progress: 0.696, memberId: 0, routeId: 31 },
    ],
  },
  // Task 7
  {
    brownId: 18, brownRouteId: 6,
    steps: [
      { progress: 0.241, memberId: 5, routeId: 35 },
      { progress: 0.352, memberId: 7, routeId: 37 },
    ],
  },
  // Task 8
  {
    brownId: 19, brownRouteId: 7,
    steps: [
      { progress: 0.228, memberId: 5, routeId: 35 },
      { progress: 0.419, memberId: 7, routeId: 37 },
      { progress: 0.547, memberId: 8, routeId: 38 },
    ],
  },
  // Task 9: El-3 1
  {
    brownId: 20, brownRouteId: 8,
    steps: [
      { progress: 0.11,  memberId: 9,  routeId: 41 },
      { progress: 0.263, memberId: 10, routeId: 42 },
      { progress: 0.436, memberId: 3,  routeId: 44 },
      { progress: 0.658, memberId: 1,  routeId: 30 },
      { progress: 0.79,  memberId: 0,  routeId: 31 },
    ],
  },
  // Task 10: El-3 2
  {
    brownId: 21, brownRouteId: 9,
    steps: [
      { progress: 0.118, memberId: 5,  routeId: 35 },
      { progress: 0.242, memberId: 13, routeId: 46 },
      { progress: 0.498, memberId: 4,  routeId: 34 },
      { progress: 0.68,  memberId: 1,  routeId: 30 },
      { progress: 0.79,  memberId: 0,  routeId: 31 },
    ],
  },
  // Task 11
  {
    brownId: 22, brownRouteId: 10,
    steps: [
      { progress: 0.456, memberId: 1, routeId: 30 },
      { progress: 0.71,  memberId: 0, routeId: 31 },
    ],
  },
  // Task 12: El-1 2 takeoff path
  {
    brownId: 14, brownRouteId: 11,
    steps: [
      { progress: 0.394, memberId: 1, routeId: 30 },
      { progress: 0.5,   memberId: 0, routeId: 31 },
    ],
  },
  // Task 13: Corral to cat1
  {
    brownId: 15, brownRouteId: 12,
    steps: [
      { progress: 0.283, memberId: 1, routeId: 30 },
      { progress: 0.58,  memberId: 0, routeId: 31 },
    ],
  },
  // Task 14
  {
    brownId: 23, brownRouteId: 13,
    steps: [
      { progress: 0.128, memberId: 9,  routeId: 41 },
      { progress: 0.328, memberId: 10, routeId: 42 },
      { progress: 0.506, memberId: 3,  routeId: 44 },
      { progress: 0.686, memberId: 1,  routeId: 30 },
      { progress: 0.758, memberId: 0,  routeId: 31 },
    ],
  },
  // Task 15
  {
    brownId: 24, brownRouteId: 14,
    steps: [
      { progress: 0.276, memberId: 5, routeId: 35 },
      { progress: 0.628, memberId: 6, routeId: 36 },
    ],
  },
  // Task 16
  {
    brownId: 25, brownRouteId: 15,
    steps: [
      { progress: 0.306, memberId: 11, routeId: 43 },
      { progress: 0.505, memberId: 12, routeId: 45 },
      { progress: 0.598, memberId: 6,  routeId: 36 },
    ],
  },
];

/**
 * Parking task assignments from crew.lua parking_tasks.
 * Each task corresponds 1:1 to a landing route (task index = route index).
 * No brown shirt — first step controls from t=0.
 * route_id -1 means member is at idle position (no route).
 * Steps are ordered by progress value (handoff points).
 */
export const PARKING_TASKS = [
  // Task 1
  {
    steps: [
      { progress: 0.024, memberId: 0,  routeId: 16 },
      { progress: 0.089, memberId: 1,  routeId: -1 },
      { progress: 0.171, memberId: 3,  routeId: 17 },
      { progress: 0.339, memberId: 10, routeId: 18 },
      { progress: 0.577, memberId: 9,  routeId: 19 },
      { progress: 1.0,   memberId: 24, routeId: 20 },
    ],
  },
  // Task 2
  {
    steps: [
      { progress: 0.024, memberId: 0,  routeId: 16 },
      { progress: 0.094, memberId: 1,  routeId: -1 },
      { progress: 0.188, memberId: 3,  routeId: 17 },
      { progress: 0.384, memberId: 10, routeId: 18 },
      { progress: 0.62,  memberId: 9,  routeId: 19 },
      { progress: 1.0,   memberId: 24, routeId: 21 },
    ],
  },
  // Task 3
  {
    steps: [
      { progress: 0.026, memberId: 0,  routeId: 16 },
      { progress: 0.101, memberId: 1,  routeId: -1 },
      { progress: 0.208, memberId: 3,  routeId: 17 },
      { progress: 0.447, memberId: 10, routeId: 18 },
      { progress: 0.674, memberId: 9,  routeId: 19 },
      { progress: 0.983, memberId: 24, routeId: 22 },
    ],
  },
  // Task 4
  {
    steps: [
      { progress: 0.027, memberId: 0,  routeId: 16 },
      { progress: 0.104, memberId: 1,  routeId: -1 },
      { progress: 0.203, memberId: 3,  routeId: 17 },
      { progress: 0.46,  memberId: 10, routeId: 18 },
      { progress: 0.651, memberId: 9,  routeId: 19 },
      { progress: 1.0,   memberId: 21, routeId: -1 },
    ],
  },
  // Task 5
  {
    steps: [
      { progress: 0.036, memberId: 0,  routeId: 16 },
      { progress: 0.111, memberId: 1,  routeId: -1 },
      { progress: 0.221, memberId: 3,  routeId: 17 },
      { progress: 0.475, memberId: 10, routeId: 18 },
      { progress: 0.745, memberId: 9,  routeId: 19 },
      { progress: 1.0,   memberId: 20, routeId: -1 },
    ],
  },
  // Task 6
  {
    steps: [
      { progress: 0.025, memberId: 0,  routeId: 16 },
      { progress: 0.119, memberId: 1,  routeId: -1 },
      { progress: 0.243, memberId: 3,  routeId: 17 },
      { progress: 0.55,  memberId: 10, routeId: 18 },
      { progress: 0.808, memberId: 9,  routeId: 19 },
      { progress: 1.0,   memberId: 20, routeId: -1 },
    ],
  },
  // Task 7
  {
    steps: [
      { progress: 0.028, memberId: 0,  routeId: 16 },
      { progress: 0.134, memberId: 1,  routeId: -1 },
      { progress: 0.268, memberId: 3,  routeId: 17 },
      { progress: 0.523, memberId: 4,  routeId: 18 },
      { progress: 0.925, memberId: 9,  routeId: 26 },
      { progress: 0.999, memberId: 10, routeId: 25 },
    ],
  },
  // Task 8
  {
    steps: [
      { progress: 0.026, memberId: 0,  routeId: 16 },
      { progress: 0.146, memberId: 1,  routeId: -1 },
      { progress: 0.296, memberId: 3,  routeId: 17 },
      { progress: 1.0,   memberId: 4,  routeId: 18 },
    ],
  },
  // Task 9
  {
    steps: [
      { progress: 0.054, memberId: 0,  routeId: 16 },
      { progress: 0.179, memberId: 1,  routeId: -1 },
      { progress: 0.356, memberId: 3,  routeId: 17 },
      { progress: 0.897, memberId: 4,  routeId: 47 },
      { progress: 1.0,   memberId: 10, routeId: 5 },
    ],
  },
  // Task 10: to elev2 1 (aft)
  {
    steps: [
      { progress: 0.058, memberId: 0,  routeId: 16 },
      { progress: 0.216, memberId: 1,  routeId: -1 },
      { progress: 0.399, memberId: 3,  routeId: 17 },
      { progress: 0.5,   memberId: 10, routeId: 48 },
      { progress: 0.9,   memberId: 17, routeId: -1 },
    ],
  },
  // Task 11: to elev2 2 (fwd)
  {
    steps: [
      { progress: 0.055, memberId: 0,  routeId: 16 },
      { progress: 0.243, memberId: 1,  routeId: -1 },
      { progress: 0.48,  memberId: 3,  routeId: 17 },
      { progress: 1.0,   memberId: 16, routeId: -1 },
    ],
  },
  // Task 12: to Corral
  {
    steps: [
      { progress: 0.075, memberId: 0,  routeId: 16 },
      { progress: 0.40,  memberId: 1,  routeId: -1 },
      { progress: 1.0,   memberId: 14, routeId: -1 },
    ],
  },
  // Task 13: Point fwd
  {
    steps: [
      { progress: 0.151, memberId: 0,  routeId: 16 },
      { progress: 0.357, memberId: 2,  routeId: 32 },
      { progress: 0.8,   memberId: 22, routeId: -1 },
    ],
  },
  // Task 14: Point rear
  {
    steps: [
      { progress: 0.163, memberId: 0,  routeId: 16 },
      { progress: 0.322, memberId: 2,  routeId: 32 },
      { progress: 0.95,  memberId: 22, routeId: 28 },
    ],
  },
  // Task 15
  {
    steps: [
      { progress: 0.183, memberId: 0,  routeId: 16 },
      { progress: 0.314, memberId: 1,  routeId: -1 },
      { progress: 1.0,   memberId: 14, routeId: -1 },
    ],
  },
  // Task 16
  {
    steps: [
      { progress: 0.198, memberId: 0,  routeId: 16 },
      { progress: 0.448, memberId: 2,  routeId: 32 },
      { progress: 0.997, memberId: 22, routeId: 29 },
    ],
  },
];

/**
 * Set of all route_ids used by any takeoff task (steps + brown assignments).
 * Built at load time.
 */
export const TAKEOFF_USED_ROUTE_IDS = (() => {
  const ids = new Set();
  for (const task of TAKEOFF_TASKS) {
    ids.add(task.brownRouteId);
    for (const step of task.steps) {
      if (step.routeId >= 0) ids.add(step.routeId);
    }
  }
  return ids;
})();

/**
 * Parking task member→route assignments from crew.lua parking_tasks.
 * Used to map unused-by-takeoff route positions back to members.
 * route_id -1 means member returns to idle (no route position).
 */
export const PARKING_ASSIGNMENTS = [
  // Task 1
  { memberId: 0, routeId: 16 }, { memberId: 3, routeId: 17 }, { memberId: 10, routeId: 18 },
  { memberId: 9, routeId: 19 }, { memberId: 24, routeId: 20 },
  // Task 2
  { memberId: 24, routeId: 21 },
  // Task 3
  { memberId: 24, routeId: 22 },
  // Task 7
  { memberId: 4, routeId: 18 }, { memberId: 9, routeId: 26 }, { memberId: 10, routeId: 25 },
  // Task 9
  { memberId: 4, routeId: 47 }, { memberId: 10, routeId: 5 },
  // Task 10
  { memberId: 10, routeId: 48 },
  // Task 13
  { memberId: 2, routeId: 32 },
  // Task 14
  { memberId: 2, routeId: 32 }, { memberId: 22, routeId: 28 },
  // Task 16
  { memberId: 2, routeId: 32 }, { memberId: 22, routeId: 29 },
];

/**
 * All route_ids used by ANY task (takeoff + parking), excluding -1.
 */
export const ALL_USED_ROUTE_IDS = (() => {
  const ids = new Set(TAKEOFF_USED_ROUTE_IDS);
  for (const a of PARKING_ASSIGNMENTS) {
    if (a.routeId >= 0) ids.add(a.routeId);
  }
  return ids;
})();

/**
 * Member→route mapping for routes NOT used by takeoff tasks.
 * Deduplicated. Built from parking task assignments.
 */
export const NON_TAKEOFF_LINKS = (() => {
  const seen = new Set();
  const links = [];
  for (const a of PARKING_ASSIGNMENTS) {
    if (a.routeId < 0 || TAKEOFF_USED_ROUTE_IDS.has(a.routeId)) continue;
    const key = `${a.memberId}:${a.routeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(a);
  }
  return links;
})();
