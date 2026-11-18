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
 * Warning rules:
 *  - Member assigned to >5 unique active routes across all tasks (assumption based on
 *    original data max of 5; not confirmed as a hard DCS limit)
 */
export function validateTakeoffTasks(tasks, parkingTasks) {
  const errors = [];
  const warnings = [];
  for (let ti = 0; ti < tasks.length; ti++) {
    const task = tasks[ti];
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

/**
 * Validate parking (landing) tasks.
 *
 * Error rules (in-game confirmed 2026-06-10, nc1-1Rowpark_3b v1.4→v1.5 A/B):
 *  - Duplicate progress value within one task — DCS skips that task's landing
 *    TERMINAL entirely (planes leapfrog the spot). Steps without a progress tag
 *    ("crew moves") are exempt — only tagged values must be unique.
 *  - Same member referenced twice in one task.
 *  - member_id / route_id out of range (route_id -1 = idle is valid).
 */
export function validateParkingTasks(parkingTasks, memberCount, routeCount) {
  const errors = [];
  for (let ti = 0; ti < (parkingTasks || []).length; ti++) {
    const steps = parkingTasks[ti].steps || [];

    const seenProgress = new Map();
    const seenMembers = new Map();
    for (let si = 0; si < steps.length; si++) {
      const s = steps[si];

      if (s.progress != null) {
        if (seenProgress.has(s.progress)) {
          errors.push({
            taskIdx: ti, stepIdx: si, field: 'progress', value: s.progress,
            message: `duplicate progress ${s.progress} (steps ${seenProgress.get(s.progress) + 1} and ${si + 1}) — DCS will skip this landing spot`,
          });
        } else {
          seenProgress.set(s.progress, si);
        }
      }

      if (seenMembers.has(s.memberId)) {
        errors.push({
          taskIdx: ti, stepIdx: si, field: 'memberId', value: s.memberId,
          message: `member ${s.memberId} used twice (steps ${seenMembers.get(s.memberId) + 1} and ${si + 1})`,
        });
      } else {
        seenMembers.set(s.memberId, si);
      }

      if (memberCount != null && (s.memberId < 0 || s.memberId >= memberCount)) {
        errors.push({
          taskIdx: ti, stepIdx: si, field: 'memberId', value: s.memberId,
          message: `member_id ${s.memberId} out of range (0–${memberCount - 1})`,
        });
      }
      if (routeCount != null && (s.routeId < -1 || s.routeId >= routeCount)) {
        errors.push({
          taskIdx: ti, stepIdx: si, field: 'routeId', value: s.routeId,
          message: `route_id ${s.routeId} out of range (-1 or 0–${routeCount - 1})`,
        });
      }
    }
  }
  return { errors };
}
