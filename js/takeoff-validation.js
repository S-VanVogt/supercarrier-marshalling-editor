/**
 * Validate takeoff tasks for DCS compatibility.
 *
 * Returns:
 *  errors[]   — red, will crash DCS
 *  warnings[] — orange, assumption-based soft limits
 *
 * Error rules:
 *  - route_id = -1 not allowed in takeoff tasks (only valid in parking)
 *  - route_id = 0 not allowed (Lua 1-based: routes[0] = nil → crash)
 *  - brown_route_id must be 0–15 (16 brown routes only)
 *
 * Warning rules:
 *  - Member assigned to >5 unique active routes across all tasks (assumption based on
 *    original data max of 5; not confirmed as a hard DCS limit)
 */
export function validateTakeoffTasks(tasks, parkingTasks) {
  const errors = [];
  const warnings = [];
  for (let ti = 0; ti < tasks.length; ti++) {
    const task = tasks[ti];
    // Brown route range check
    if (task.brownRouteId != null && (task.brownRouteId < 0 || task.brownRouteId > 15)) {
      errors.push({
        taskIdx: ti, stepIdx: -1, field: 'brownRouteId', value: task.brownRouteId,
        message: `brown_route_id = ${task.brownRouteId} out of range (0–15)`,
      });
    }
    // Step checks
    const steps = task.steps || [];
    for (let si = 0; si < steps.length; si++) {
      const s = steps[si];
      if (s.routeId === 0) {
        errors.push({
          taskIdx: ti, stepIdx: si, field: 'routeId', value: 0,
          message: `route_id = 0 (Lua 1-based: routes[0] = nil, will crash)`,
        });
      }
      if (s.routeId === -1) {
        errors.push({
          taskIdx: ti, stepIdx: si, field: 'routeId', value: -1,
          message: `route_id = -1 not allowed in takeoff tasks`,
        });
      }
    }
  }

  // Member→routes soft limit check across all tasks (takeoff + parking)
  const memberRoutes = new Map();
  const allTasks = [...tasks, ...(parkingTasks || [])];
  for (const task of allTasks) {
    for (const step of (task.steps || [])) {
      if (step.routeId < 1) continue; // skip -1 (idle) and 0 (invalid)
      if (!memberRoutes.has(step.memberId)) memberRoutes.set(step.memberId, new Set());
      memberRoutes.get(step.memberId).add(step.routeId);
    }
  }
  for (const [memberId, routes] of memberRoutes) {
    if (routes.size > 5) {
      warnings.push({
        memberId,
        routeCount: routes.size,
        message: `Member ${memberId} assigned to ${routes.size} active routes (max observed in original: 5)`,
      });
    }
  }

  return { errors, warnings };
}
