/**
 * Validate takeoff tasks for DCS compatibility.
 * Returns array of { taskIdx, stepIdx (-1 for brown), field, value, message }.
 *
 * Rules:
 *  - route_id = -1 not allowed in takeoff tasks (only valid in parking)
 *  - route_id = 0 not allowed (Lua 1-based: routes[0] = nil → crash)
 *  - brown_route_id must be 0–15 (16 brown routes only)
 */
export function validateTakeoffTasks(tasks) {
  const errors = [];
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
  return errors;
}
