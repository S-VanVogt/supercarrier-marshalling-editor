/**
 * Parser for crew.lua — extracts members, routes, takeoff_tasks, and parking_tasks
 * from the takeoff_crew section.
 *
 * All indices in the parsed output are 0-based (matching CREW_MEMBERS / CREW_ROUTES arrays).
 * Lua arrays are 1-based; task member_id/route_id references are already 0-based in the file.
 */

/**
 * Parse a crew.lua file text and return structured data.
 * @param {string} lua  Raw crew.lua text
 * @returns {{ members, routes, takeoffTasks, parkingTasks }}
 */
export function parseCrewLua(lua) {
  // Strip all Lua comments before parsing to avoid block-comment braces confusing the parser.
  // Block comments: --[[ ... ]]-- or --[[ ... --]]
  lua = lua.replace(/--\[\[[\s\S]*?(?:\]\]--|--\]\])/g, '');
  // Line comments: -- ...
  lua = lua.replace(/--[^\n]*/g, '');

  const takeoffCrew = extractSection(lua, '["takeoff_crew"]');
  if (!takeoffCrew) throw new Error('Could not find ["takeoff_crew"] section');

  const members = parseMembers(takeoffCrew);
  const routes = parseRoutes(takeoffCrew);
  const takeoffTasks = parseTakeoffTasks(takeoffCrew);
  const parkingTasks = parseParkingTasks(takeoffCrew);

  return { members, routes, takeoffTasks, parkingTasks };
}

/**
 * Extract a brace-balanced section starting from a key.
 */
function extractSection(text, key) {
  const idx = text.indexOf(key);
  if (idx < 0) return null;

  // Find the '= {' after the key
  const eqIdx = text.indexOf('=', idx + key.length);
  if (eqIdx < 0) return null;
  const braceIdx = text.indexOf('{', eqIdx);
  if (braceIdx < 0) return null;

  return extractBraceBlock(text, braceIdx);
}

/**
 * Extract content between matching braces (including the braces).
 */
function extractBraceBlock(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    // Skip block comments: --[[ ... ]]-- or --[[ ... --]]
    if (text[i] === '-' && text[i + 1] === '-' && text[i + 2] === '[' && text[i + 3] === '[') {
      // Find end: ]]-- or --]]
      let endPos = -1;
      const e1 = text.indexOf(']]--', i + 4);
      const e2 = text.indexOf('--]]', i + 4);
      if (e1 >= 0 && e2 >= 0) endPos = Math.min(e1 + 4, e2 + 4);
      else if (e1 >= 0) endPos = e1 + 4;
      else if (e2 >= 0) endPos = e2 + 4;
      if (endPos >= 0) { i = endPos - 1; continue; }
    }
    // Skip line comments
    if (text[i] === '-' && text[i + 1] === '-') {
      const eol = text.indexOf('\n', i);
      if (eol >= 0) { i = eol; continue; }
      break;
    }
    if (text[i] === '"') {
      // Skip string literals
      const end = text.indexOf('"', i + 1);
      if (end >= 0) { i = end; continue; }
    }
    if (text[i] === '{') depth++;
    if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return null;
}

/**
 * Parse ["members"] = { ... } section.
 * Returns array of { name, x, y, hdg, livery, type, modelName, unitType }.
 */
function parseMembers(section) {
  const membersBlock = extractSection(section, '["members"]');
  if (!membersBlock) throw new Error('Could not find ["members"] section');

  const members = [];
  // Match each [N] = { ... } member block
  const memberRe = /\[\d+\]\s*=\s*\{/g;
  let match;
  while ((match = memberRe.exec(membersBlock)) !== null) {
    const block = extractBraceBlock(membersBlock, match.index + match[0].length - 1);
    if (!block) continue;

    const name = extractString(block, '["name"]');
    if (!name) continue;

    const livery = extractString(block, '["livery"]') || '';
    const modelName = extractString(block, '["model_name"]') || '';
    const unitType = extractString(block, '["unit_type"]') || '';

    // Position: [1]=x, [2]=deckHeight(ignored), [3]=z(→y), [4]=hdg
    const posBlock = extractSection(block, '["position"]');
    const posNums = posBlock ? extractNumberArray(posBlock) : [0, 0, 0, 0];

    // Determine livery from name if empty
    let effectiveLivery = livery;
    if (!effectiveLivery) {
      if (name.startsWith('yellow')) effectiveLivery = 'yellow';
      else if (name.startsWith('brown')) effectiveLivery = 'brown';
      else effectiveLivery = 'yellow';
    }

    // Determine type from model_name
    let type = 'shooter';
    if (modelName.includes('tech')) type = 'tech';

    members.push({
      name,
      x: posNums[0],                // Lua [1] = X
      y: posNums[2],                // Lua [3] = Z → viewport Y
      hdg: posNums[3] || 0,         // Lua [4] = heading
      livery: effectiveLivery,
      type,
      modelName,
      unitType,
    });
  }

  return members;
}

/**
 * Parse ["routes"] = { ... } section.
 * Returns array of route objects indexed by route_id (0-based).
 * Each has { name, x, y, angle, points? }.
 */
function parseRoutes(section) {
  const routesBlock = extractSection(section, '["routes"]');
  if (!routesBlock) throw new Error('Could not find ["routes"] section');

  const routes = [];
  const routeRe = /\[\d+\]\s*=\s*\{/g;
  let match;

  while ((match = routeRe.exec(routesBlock)) !== null) {
    const block = extractBraceBlock(routesBlock, match.index + match[0].length - 1);
    if (!block) continue;

    const name = extractString(block, '["name"]');
    if (!name) continue;

    // Parse points
    const pointsBlock = extractSection(block, '["points"]');
    if (!pointsBlock) continue;

    const waypoints = [];
    const ptRe = /\[\d+\]\s*=\s*\{/g;
    let ptMatch;
    while ((ptMatch = ptRe.exec(pointsBlock)) !== null) {
      const ptBlock = extractBraceBlock(pointsBlock, ptMatch.index + ptMatch[0].length - 1);
      if (!ptBlock) continue;
      const nums = extractNumberArray(ptBlock);
      if (nums.length >= 3) {
        waypoints.push({
          x: nums[0],       // Lua [1] = X
          y: nums[1],       // Lua [2] = Z → viewport Y
          angle: nums[2],   // Lua [3] = angle (radians)
        });
      }
    }

    if (waypoints.length === 0) continue;

    const route = {
      name,
      x: waypoints[waypoints.length - 1].x,
      y: waypoints[waypoints.length - 1].y,
      angle: waypoints[waypoints.length - 1].angle,
    };

    if (waypoints.length > 1) {
      route.points = waypoints;
    }

    routes.push(route);
  }

  return routes;
}

/**
 * Parse ["takeoff_tasks"] = { ... } section.
 * Returns array of task objects with { brownId, brownRouteId, steps: [{ progress, memberId, routeId }] }.
 */
function parseTakeoffTasks(section) {
  const tasksBlock = extractSection(section, '["takeoff_tasks"]');
  if (!tasksBlock) return [];

  const tasks = [];
  // Match top-level [N] = { entries
  const taskEntries = findTopLevelEntries(tasksBlock);

  for (const entry of taskEntries) {
    const brownId = extractNumber(entry, '["brown_id"]');
    const brownRouteId = extractNumber(entry, '["brown_route_id"]');

    // Steps are numbered [1], [2], etc. with progress/member_id/route_id
    const steps = [];
    const stepRe = /\[(\d+)\]\s*=\s*\{/g;
    let sMatch;
    while ((sMatch = stepRe.exec(entry)) !== null) {
      const stepBlock = extractBraceBlock(entry, sMatch.index + sMatch[0].length - 1);
      if (!stepBlock) continue;

      const progress = extractNumber(stepBlock, '["progress"]');
      const memberId = extractNumber(stepBlock, '["member_id"]');
      const routeId = extractNumber(stepBlock, '["route_id"]');

      if (progress !== null && memberId !== null && routeId !== null) {
        steps.push({ progress, memberId, routeId });
      }
    }

    // Sort steps by progress
    steps.sort((a, b) => a.progress - b.progress);

    if (brownId !== null && brownRouteId !== null) {
      tasks.push({ brownId, brownRouteId, steps });
    }
  }

  return tasks;
}

/**
 * Parse ["parking_tasks"] = { ... } section.
 * Returns array of task objects with { steps: [{ progress, memberId, routeId }] }.
 * (parking_tasks have no brown_id/brown_route_id at the start — brown is at the end)
 */
function parseParkingTasks(section) {
  const tasksBlock = extractSection(section, '["parking_tasks"]');
  if (!tasksBlock) return [];

  const tasks = [];
  const taskEntries = findTopLevelEntries(tasksBlock);

  for (const entry of taskEntries) {
    const steps = [];
    const stepRe = /\[(\d+)\]\s*=\s*\{/g;
    let sMatch;
    while ((sMatch = stepRe.exec(entry)) !== null) {
      const stepBlock = extractBraceBlock(entry, sMatch.index + sMatch[0].length - 1);
      if (!stepBlock) continue;

      const progress = extractNumber(stepBlock, '["progress"]');
      const memberId = extractNumber(stepBlock, '["member_id"]');
      const routeId = extractNumber(stepBlock, '["route_id"]');

      if (progress !== null && memberId !== null && routeId !== null) {
        steps.push({ progress, memberId, routeId });
      }
    }

    steps.sort((a, b) => a.progress - b.progress);
    if (steps.length > 0) {
      tasks.push({ steps });
    }
  }

  return tasks;
}

// ── Catapult Crew Parser ─────────────────────────────────────────────────────

/**
 * Parse the ["crew"] section of crew.lua — catapult crew (4 catapults × 6 members).
 * @param {string} lua  Raw crew.lua text
 * @returns {Array<{name, members: Array<{name, position, fastStartPosition, routes}>}>}
 */
export function parseCatapultCrew(lua) {
  // Strip comments
  lua = lua.replace(/--\[\[[\s\S]*?(?:\]\]--|--\]\])/g, '');
  lua = lua.replace(/--[^\n]*/g, '');

  const crewSection = extractSection(lua, '["crew"]');
  if (!crewSection) return [];

  const catapults = [];
  const catEntries = findTopLevelEntries(crewSection);

  for (const catBlock of catEntries) {
    // Strip ["members"] block to avoid picking up nested ["name"] values
    const membersBlock = extractSection(catBlock, '["members"]');
    const catBlockNoMembers = membersBlock
      ? catBlock.replace(membersBlock, '')
      : catBlock;
    const catName = extractString(catBlockNoMembers, '["name"]') || `crew_${catapults.length}`;
    if (!membersBlock) { catapults.push({ name: catName, members: [] }); continue; }

    const members = [];
    const memberEntries = findTopLevelEntries(membersBlock);

    for (const mBlock of memberEntries) {
      // Member ["name"] comes AFTER ["routes"] in crew.lua, so strip routes
      // block first to avoid picking up a route's ["name"] instead.
      const routesSectionForName = extractSection(mBlock, '["routes"]');
      const mBlockNoRoutes = routesSectionForName
        ? mBlock.replace(routesSectionForName, '')
        : mBlock;
      const name = extractString(mBlockNoRoutes, '["name"]') || `member_${members.length}`;

      // Position: {[1]=x, [2]=deckHeight, [3]=z, [4]=hdg}
      const posBlock = extractSection(mBlock, '["position"]');
      const posNums = posBlock ? extractNumberArray(posBlock) : [0, 0, 0, 0];
      const position = { x: posNums[0], h: posNums[1] != null ? posNums[1] : 20.1494140625, y: posNums[2], hdg: posNums[3] || 0 };

      // Fast start position
      const fspBlock = extractSection(mBlock, '["fast_start_position"]');
      const fspNums = fspBlock ? extractNumberArray(fspBlock) : null;
      const fastStartPosition = fspNums ? { x: fspNums[0], h: fspNums[1] != null ? fspNums[1] : 20.1494140625, y: fspNums[2], hdg: fspNums[3] || 0 } : null;

      // Angles
      const anglesBlock = extractSection(mBlock, '["angles"]');
      const angles = anglesBlock ? extractNumberArray(anglesBlock) : [];

      // Routes: each has optional name, points[], final_heading
      const routesBlock = extractSection(mBlock, '["routes"]');
      const routes = [];
      if (routesBlock) {
        const routeEntries = findTopLevelEntries(routesBlock);
        for (const rBlock of routeEntries) {
          const rName = extractString(rBlock, '["name"]') || '';
          const finalHeading = extractNumber(rBlock, '["final_heading"]');

          const pointsBlock = extractSection(rBlock, '["points"]');
          const points = [];
          if (pointsBlock) {
            const ptEntries = findTopLevelEntries(pointsBlock);
            for (const ptBlock of ptEntries) {
              const nums = extractNumberArray(ptBlock);
              if (nums.length >= 3) {
                points.push({
                  x: nums[0],      // [1] = x
                  h: nums[1],      // [2] = deck height (preserved for export)
                  y: nums[2],      // [3] = z → viewport y
                  vx: nums[3] || 0,  // [4]
                  vy: nums[4] || 0,  // [5]
                  vz: nums[5] || 0,  // [6]
                });
              }
            }
          }

          routes.push({ name: rName, points, finalHeading });
        }
      }

      const livery = extractString(mBlock, '["livery"]') || '';
      const modelName = extractString(mBlock, '["model_name"]') || '';

      members.push({ name, position, fastStartPosition, angles, routes, livery, modelName });
    }

    catapults.push({ name: catName, members });
  }

  return catapults;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find top-level [N] = { ... } entries in a table block (depth=1 only).
 */
function findTopLevelEntries(block) {
  const entries = [];
  // Strip outer braces
  const inner = block.slice(1, -1);

  const re = /\[\d+\]\s*=\s*\{/g;
  let match;
  while ((match = re.exec(inner)) !== null) {
    const bracePos = inner.indexOf('{', match.index + match[0].length - 1);
    const content = extractBraceBlock(inner, bracePos);
    if (content) {
      entries.push(content);
      // Skip past this block
      re.lastIndex = bracePos + content.length;
    }
  }
  return entries;
}

/**
 * Extract a string value: ["key"] = "value"
 */
function extractString(text, key) {
  const idx = text.indexOf(key);
  if (idx < 0) return null;
  const afterEq = text.indexOf('=', idx + key.length);
  if (afterEq < 0) return null;
  const qStart = text.indexOf('"', afterEq + 1);
  if (qStart < 0) return null;
  const qEnd = text.indexOf('"', qStart + 1);
  if (qEnd < 0) return null;
  return text.slice(qStart + 1, qEnd);
}

/**
 * Extract a number value: ["key"] = number
 */
function extractNumber(text, key) {
  const idx = text.indexOf(key);
  if (idx < 0) return null;
  const afterEq = text.indexOf('=', idx + key.length);
  if (afterEq < 0) return null;
  // Find the number after '='
  const rest = text.slice(afterEq + 1, afterEq + 40);
  const m = rest.match(/\s*(-?[0-9]+\.?[0-9]*(?:e[+-]?\d+)?)/i);
  if (!m) return null;
  return parseFloat(m[1]);
}

/**
 * Extract all numbers from a { [1]=n, [2]=n, ... } block.
 * Handles both [N] = val and bare val formats.
 */
function extractNumberArray(block) {
  const nums = [];
  // Match [N] = number patterns, stripping comments
  const re = /\[\d+\]\s*=\s*(-?[0-9]+\.?[0-9]*(?:e[+-]?\d+)?)/gi;
  let m;
  while ((m = re.exec(block)) !== null) {
    nums.push(parseFloat(m[1]));
  }
  return nums;
}
