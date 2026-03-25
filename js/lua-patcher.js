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
    // Terminal size only on first point
    if (j === 0 && route.terminalSize) {
      line += `,\t${formatNum(route.terminalSize)}`;
    }
    line += '}';
    // Trailing comma except on last point
    if (j < route.points.length - 1) line += ',';
    lines.push(line);
  }
  return ' -- ' + route.label + '\n' + lines.join('\n') + '\n\t\t';
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

    // Extract the inner content of the Points block
    const inner = luaText.slice(blocks[i].pointsStart, blocks[i].pointsEnd);

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

  let result = originalLua;
  // Patch in reverse order to preserve offsets
  for (let i = blocks.length - 1; i >= 0; i--) {
    const { pointsStart, pointsEnd } = blocks[i];
    const newInner = buildPointsInner(editedRoutes[i]);
    result = result.slice(0, pointsStart) + newInner + result.slice(pointsEnd);
  }
  return result;
}

/**
 * Download the patched Lua file as a Blob.
 */
export function downloadPatchedLua(originalLua, editedRoutes, headerComment) {
  let patched = patchLua(originalLua, editedRoutes);
  if (headerComment) {
    patched = '-- ' + headerComment + '\n' + patched;
  }
  const blob = new Blob([patched], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'USS_Nimitz_RunwaysAndRoutes.lua';
  a.click();
  URL.revokeObjectURL(url);
}
