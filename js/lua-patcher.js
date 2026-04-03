/**
 * Lua file patcher — reads the original USS_Nimitz_RunwaysAndRoutes.lua,
 * locates the 16 active TaxiForTORoutes, and patches their Points blocks
 * with edited data from the app.
 */

const DECK_HEIGHT = '20.1494';

/**
 * Find the start/end character offsets of each active route's Points { ... }
 * inner block within the GT.TaxiForTORoutes section.
 * Uses brace-counting to handle nested braces and skips block comments.
 * Returns an array of { pointsStart, pointsEnd } for the 16 active routes,
 * where pointsStart is the char after the opening '{' of Points and
 * pointsEnd is the char of the closing '}'.
 */
function findRoutePointsBlocks(lua) {
  // Locate the GT.TaxiForTORoutes section
  const sectionStart = lua.indexOf('GT.TaxiForTORoutes =');
  if (sectionStart < 0) throw new Error('GT.TaxiForTORoutes not found');

  // Find the opening brace of the top-level table
  const topBrace = lua.indexOf('{', sectionStart + 20);

  // Find the section end (before RoutesForTONumber)
  const sectionEnd = lua.indexOf('GT.TaxiForTORoutes.RoutesForTONumber', sectionStart);
  const slice = lua.slice(topBrace, sectionEnd);

  const blocks = [];
  let i = 0;

  while (i < slice.length) {
    // Skip block comments --[[ ... --]]
    if (slice[i] === '-' && slice[i + 1] === '-' && slice[i + 2] === '[' && slice[i + 3] === '[') {
      const endComment = slice.indexOf('--]]', i + 4);
      if (endComment >= 0) { i = endComment + 4; continue; }
    }

    // Skip line comments
    if (slice[i] === '-' && slice[i + 1] === '-' && slice[i + 2] !== '[') {
      const eol = slice.indexOf('\n', i);
      if (eol >= 0) { i = eol + 1; continue; }
      break;
    }

    // Look for "RunwayIdx"
    if (slice.slice(i, i + 10) === 'RunwayIdx ') {
      // Capture RunwayIdx value position: "RunwayIdx = N"
      const rwEqIdx = slice.indexOf('=', i + 9);
      const rwValMatch = rwEqIdx >= 0 ? slice.slice(rwEqIdx + 1, rwEqIdx + 10).match(/\s*(\d+)/) : null;
      const rwValStart = rwValMatch ? topBrace + rwEqIdx + 1 + rwValMatch.index + rwValMatch[0].indexOf(rwValMatch[1]) : -1;
      const rwValEnd = rwValStart >= 0 ? rwValStart + rwValMatch[1].length : -1;

      // Find "Points =" after this
      const ptsEq = slice.indexOf('Points =', i);
      if (ptsEq < 0) { i++; continue; }

      // Find the opening brace of Points value
      let pBrace = slice.indexOf('{', ptsEq + 8);
      if (pBrace < 0) { i++; continue; }

      // Brace-count to find the matching close
      let depth = 0;
      let j = pBrace;
      while (j < slice.length) {
        // Skip line comments inside Points block
        if (slice[j] === '-' && slice[j + 1] === '-') {
          const eol = slice.indexOf('\n', j);
          if (eol >= 0) { j = eol + 1; continue; }
          break;
        }
        if (slice[j] === '{') depth++;
        if (slice[j] === '}') {
          depth--;
          if (depth === 0) {
            // pBrace+1 to j is the inner content (exclusive of outer braces)
            blocks.push({
              pointsStart: topBrace + pBrace + 1,
              pointsEnd: topBrace + j,
              rwValStart,
              rwValEnd,
            });
            i = j + 1;
            break;
          }
        }
        j++;
      }
      continue;
    }
    i++;
  }

  return blocks;
}

/**
 * Build the inner content of a Points { ... } block from edited route data.
 */
function buildPointsInner(route) {
  const lines = [];
  for (let j = 0; j < route.points.length; j++) {
    const p = route.points[j];
    const x = formatNum(p.x);
    const z = formatNum(p.y);  // JS y → Lua z
    const v = formatNum(p.v);
    let line = `\t\t\t{{${x},\t${DECK_HEIGHT},\t\t${z}},\t${v}`;
    // Terminal size only on first point (takeoff spawn diameter)
    if (j === 0 && route.terminalSize) {
      line += `,\t${formatNum(route.terminalSize)}`;
    }
    // Despawn time only on last point (landing despawn)
    if (j === route.points.length - 1 && route.despawnTime) {
      line += `,\t${formatNum(route.despawnTime)}`;
    }
    line += '}';
    // Trailing comma except on last point
    if (j < route.points.length - 1) line += ',';
    lines.push(line);
  }
  return ' -- Route ' + route.id + ': ' + route.label + '\n' + lines.join('\n') + '\n\t\t';
}

function formatNum(n) {
  // Round to 4 decimal places, strip trailing zeros but keep at least one decimal
  const s = n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0');
  return s;
}

/**
 * Parse takeoff routes from a Lua file text.
 * Extracts RunwayIdx, points (x→x, z→y), V_target, and terminal size.
 * Returns an array of route objects compatible with route-state.
 */
export function parseTakeoffRoutes(luaText) {
  const blocks = findRoutePointsBlocks(luaText);
  if (blocks.length === 0) throw new Error('No takeoff route blocks found');

  // Also extract RunwayIdx for each block
  const sectionStart = luaText.indexOf('GT.TaxiForTORoutes =');
  const topBrace = luaText.indexOf('{', sectionStart + 20);

  const routes = [];
  for (let i = 0; i < blocks.length; i++) {
    // Find RunwayIdx value by scanning backwards from pointsStart
    const before = luaText.slice(Math.max(0, blocks[i].pointsStart - 200), blocks[i].pointsStart);
    const rwMatch = before.match(/RunwayIdx\s*=\s*(\d+)/);
    const runwayIdx = rwMatch ? parseInt(rwMatch[1]) : 1;

    // Extract the inner content of the Points block, stripping commented-out lines
    const rawInner = luaText.slice(blocks[i].pointsStart, blocks[i].pointsEnd);
    const inner = rawInner.replace(/^[ \t]*--.*$/gm, '');

    // Parse each point line: {{ x, y_height, z }, V_target [, terminal_size] }
    const points = [];
    let terminalSize = null;
    // Match nested brace groups: {{ num, num, num }, num [, num] }
    const pointRe = /\{\{\s*([^,]+),\s*[^,]+,\s*([^}]+)\}\s*,\s*([0-9.\-]+)(?:\s*,\s*([0-9.\-*\s]+))?\s*\}/g;
    let m;
    while ((m = pointRe.exec(inner)) !== null) {
      const x = parseFloat(m[1].trim());
      const z = parseFloat(m[2].trim());
      const v = parseFloat(m[3].trim());
      if (isNaN(x) || isNaN(z) || isNaN(v)) continue;
      // Terminal size (may contain expressions like 3.0*60.0, but for spawn terminal it's just a number)
      if (points.length === 0 && m[4]) {
        const ts = parseFloat(m[4].trim());
        if (!isNaN(ts)) terminalSize = ts;
      }
      points.push({ x, y: z, v });
    }

    const catNames = { 1: 'Cat 1', 2: 'Cat 2', 3: 'Cat 3', 4: 'Cat 4' };
    routes.push({
      id: i + 1,
      runwayIdx,
      label: `Route ${i + 1} → ${catNames[runwayIdx] || 'Cat ' + runwayIdx}`,
      terminalSize,
      points,
    });
  }

  return routes;
}

/**
 * Find landing route blocks within GT.TaxiRoutes section.
 * Landing routes are bare arrays { point1, point2, ... } without "Points =" keyword.
 * We find each top-level child { ... } of the outer GT.TaxiRoutes table.
 */
function findLandingPointsBlocks(lua) {
  const sectionStart = lua.indexOf('GT.TaxiRoutes =');
  if (sectionStart < 0) return [];
  // Find the opening brace of the outer table (skip any comment lines)
  let topBrace = -1;
  for (let i = sectionStart + 15; i < lua.length; i++) {
    if (lua[i] === '{') { topBrace = i; break; }
    if (lua[i] === '\n' || lua[i] === ' ' || lua[i] === '\t' || lua[i] === '\r') continue;
    if (lua[i] === '-' && lua[i + 1] === '-') {
      const eol = lua.indexOf('\n', i);
      if (eol >= 0) { i = eol; continue; }
      break;
    }
    break;
  }
  if (topBrace < 0) return [];
  const sectionEnd = lua.indexOf('GT.TaxiRoutes.RoutesNumber', topBrace);
  if (sectionEnd < 0) return [];

  const blocks = [];
  let i = topBrace + 1; // skip the outer '{'
  while (i < sectionEnd) {
    // Skip whitespace
    if (lua[i] === ' ' || lua[i] === '\t' || lua[i] === '\n' || lua[i] === '\r' || lua[i] === ',') { i++; continue; }
    // Skip line comments
    if (lua[i] === '-' && lua[i + 1] === '-') {
      if (lua[i + 2] === '[' && lua[i + 3] === '[') {
        const endComment = lua.indexOf('--]]', i + 4);
        if (endComment >= 0) { i = endComment + 4; continue; }
        break;
      }
      const eol = lua.indexOf('\n', i);
      if (eol >= 0) { i = eol + 1; continue; }
      break;
    }
    // Found a child block '{'
    if (lua[i] === '{') {
      const blockStart = i;
      let depth = 0, j = i;
      while (j < sectionEnd) {
        if (lua[j] === '-' && lua[j + 1] === '-') {
          const eol = lua.indexOf('\n', j);
          if (eol >= 0) { j = eol + 1; continue; }
          break;
        }
        if (lua[j] === '{') depth++;
        if (lua[j] === '}') {
          depth--;
          if (depth === 0) {
            // blockStart+1 to j is the inner content (exclusive of outer braces)
            blocks.push({ pointsStart: blockStart + 1, pointsEnd: j });
            i = j + 1;
            break;
          }
        }
        j++;
      }
      continue;
    }
    i++;
  }
  return blocks;
}

/**
 * Parse landing routes from a Lua file text.
 * Extracts points and despawnTime from last point's extra value.
 */
export function parseLandingRoutes(luaText) {
  const blocks = findLandingPointsBlocks(luaText);
  if (blocks.length === 0) return null;

  const routes = [];
  for (let i = 0; i < blocks.length; i++) {
    const rawInner = luaText.slice(blocks[i].pointsStart, blocks[i].pointsEnd);
    const inner = rawInner.replace(/^[ \t]*--.*$/gm, '');

    const points = [];
    const extras = []; // extra value per point (despawn on last)
    const pointRe = /\{\{\s*([^,]+),\s*[^,]+,\s*([^}]+)\}\s*,\s*([0-9.\-]+)(?:\s*,\s*([0-9.\-*\s]+))?\s*\}/g;
    let m;
    while ((m = pointRe.exec(inner)) !== null) {
      const x = parseFloat(m[1].trim());
      const z = parseFloat(m[2].trim());
      const v = parseFloat(m[3].trim());
      if (isNaN(x) || isNaN(z) || isNaN(v)) continue;
      let extra = null;
      if (m[4]) {
        // Handle expressions like 3.0*60.0
        const expr = m[4].trim();
        try { extra = Function('"use strict";return (' + expr + ')')(); } catch { extra = parseFloat(expr); }
      }
      extras.push(extra);
      points.push({ x, y: z, v });
    }

    let despawnTime = null;
    if (extras.length > 0 && extras[extras.length - 1] != null) {
      despawnTime = extras[extras.length - 1];
    }

    routes.push({
      id: i + 1,
      label: `Landing ${i + 1}`,
      despawnTime,
      points,
    });
  }
  return routes;
}

/**
 * Parse elevator data from Lua text.
 * Returns array of { elevatorIdx, elevatorType, terminalIdx, points }.
 */
export function parseElevators(luaText) {
  const start = luaText.indexOf('GT.Elevators');
  if (start < 0) return null;
  const brace = luaText.indexOf('{', luaText.indexOf('\n', start));
  if (brace < 0) return null;
  const end = luaText.indexOf('GT.Elevators.ElevatorsNumber', brace);
  if (end < 0) return null;
  const section = luaText.slice(brace, end);

  const elevators = [];
  const entryRe = /ElevatorIdx\s*=\s*(\d+)\s*,\s*ElevatorType\s*=\s*(\d+)\s*,\s*TerminalIdx\s*=\s*(\d+)/g;
  let m;
  while ((m = entryRe.exec(section)) !== null) {
    elevators.push({
      elevatorIdx: parseInt(m[1]),
      elevatorType: parseInt(m[2]),
      terminalIdx: parseInt(m[3]),
    });
  }
  return elevators;
}

/**
 * Patch elevator types in original Lua text.
 * @param {string} lua Original text
 * @param {object[]} elevators Array of { elevatorIdx, elevatorType, terminalIdx }
 * @returns {string} Patched text
 */
export function patchElevators(lua, elevators) {
  let result = lua;
  // Patch each entry's ElevatorType value
  const start = result.indexOf('GT.Elevators');
  if (start < 0) return result;
  const end = result.indexOf('GT.Elevators.ElevatorsNumber', start);
  if (end < 0) return result;

  let section = result.slice(start, end);
  for (const el of elevators) {
    // Find the entry with matching ElevatorIdx and TerminalIdx
    const re = new RegExp(
      `(ElevatorIdx\\s*=\\s*${el.elevatorIdx}\\s*,\\s*ElevatorType\\s*=\\s*)(\\d+)(\\s*,\\s*TerminalIdx\\s*=\\s*${el.terminalIdx})`
    );
    section = section.replace(re, `$1${el.elevatorType}$3`);
  }
  return result.slice(0, start) + section + result.slice(end);
}

/**
 * Parse blocker terminals from Lua text.
 * Returns array of 1-based terminal indices, or null if not found.
 */
export function parseBlockerTerminals(luaText) {
  const m = luaText.match(/GT\.BlockerTerminals\s*=\s*\{([^}]*)\}/);
  if (!m) return null;
  const nums = m[1].match(/\d+/g);
  return nums ? nums.map(Number) : [];
}

/**
 * Patch blocker terminals in original Lua text.
 * @param {string} lua Original text
 * @param {number[]} terminals Array of 1-based terminal indices
 * @returns {string} Patched text
 */
export function patchBlockerTerminals(lua, terminals) {
  const sorted = [...terminals].sort((a, b) => a - b);
  const listStr = sorted.join(',');
  return lua.replace(
    /GT\.BlockerTerminals\s*=\s*\{[^}]*\}/,
    `GT.BlockerTerminals = {${listStr}}`
  );
}

/**
 * Patch the original Lua text with edited route data.
 * @param {string} originalLua  The original file text.
 * @param {object[]} editedRoutes  The 16 edited route objects from routeState.
 * @returns {string} The patched Lua text.
 */
export function patchLua(originalLua, editedRoutes) {
  const blocks = findRoutePointsBlocks(originalLua);
  if (blocks.length !== 16) {
    throw new Error(`Expected 16 route blocks, found ${blocks.length}`);
  }

  // Collect all patches (points inner + RunwayIdx values)
  const patches = [];
  for (let i = 0; i < blocks.length; i++) {
    const { pointsStart, pointsEnd, rwValStart, rwValEnd } = blocks[i];
    // Patch Points inner content
    patches.push({ start: pointsStart, end: pointsEnd, text: buildPointsInner(editedRoutes[i]) });
    // Patch RunwayIdx value if the route has one and it differs
    if (rwValStart >= 0 && rwValEnd >= 0 && editedRoutes[i].runwayIdx != null) {
      patches.push({ start: rwValStart, end: rwValEnd, text: String(editedRoutes[i].runwayIdx) });
    }
  }

  // Apply in reverse offset order to preserve positions
  patches.sort((a, b) => b.start - a.start);
  let result = originalLua;
  for (const p of patches) {
    result = result.slice(0, p.start) + p.text + result.slice(p.end);
  }
  return result;
}

/**
 * Patch landing route data in the original Lua text.
 * @param {string} originalLua  The original file text.
 * @param {object[]} editedRoutes  The edited landing route objects.
 * @returns {string} The patched Lua text.
 */
export function patchLandingLua(originalLua, editedRoutes) {
  const blocks = findLandingPointsBlocks(originalLua);
  if (blocks.length === 0) return originalLua;
  if (blocks.length !== editedRoutes.length) {
    console.warn(`Landing route count mismatch: file has ${blocks.length}, editor has ${editedRoutes.length}`);
  }
  const count = Math.min(blocks.length, editedRoutes.length);

  let result = originalLua;
  // Patch in reverse order to preserve offsets
  for (let i = count - 1; i >= 0; i--) {
    const { pointsStart, pointsEnd } = blocks[i];
    const newInner = buildPointsInner(editedRoutes[i]);
    result = result.slice(0, pointsStart) + newInner + result.slice(pointsEnd);
  }
  return result;
}

/**
 * Build the fully patched Lua string (no download).
 */
export function buildPatchedLua(originalLua, editedRoutes, headerComment, elevatorTypes, blockerTerminals, landingRoutes) {
  let patched = patchLua(originalLua, editedRoutes);
  if (landingRoutes) {
    patched = patchLandingLua(patched, landingRoutes);
  }
  if (elevatorTypes) {
    const entries = [];
    for (const [idx, type] of Object.entries(elevatorTypes)) {
      entries.push({ elevatorIdx: parseInt(idx), elevatorType: type, terminalIdx: 1 });
      entries.push({ elevatorIdx: parseInt(idx), elevatorType: type, terminalIdx: 2 });
    }
    patched = patchElevators(patched, entries);
  }
  if (blockerTerminals) {
    patched = patchBlockerTerminals(patched, blockerTerminals);
  }
  if (headerComment && headerComment.startsWith('-- [SC-Config]')) {
    patched = patched.split('\n').filter(l => !l.startsWith('-- [SC-Config]')).join('\n');
    patched = headerComment + patched;
  } else if (headerComment) {
    patched = '-- ' + headerComment + '\n' + patched;
  }
  return patched;
}

/**
 * Download the patched Lua file as a Blob.
 */
export function downloadPatchedLua(originalLua, editedRoutes, headerComment, elevatorTypes, blockerTerminals, landingRoutes) {
  const patched = buildPatchedLua(originalLua, editedRoutes, headerComment, elevatorTypes, blockerTerminals, landingRoutes);
  const blob = new Blob([patched], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'USS_Nimitz_RunwaysAndRoutes.lua';
  a.click();
  URL.revokeObjectURL(url);
}
