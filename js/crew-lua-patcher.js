/**
 * Crew.lua patcher — patches edited member positions/headings and route
 * positions/angles back into the original crew.lua text.
 * Only modifies ["members"] and ["routes"] within ["takeoff_crew"].
 */

const DECK_HEIGHT = '20.1494';

/**
 * Find balanced brace block starting at the '{' at position `start`.
 * Returns the index of the matching '}'.
 */
function findMatchingBrace(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * Locate all numbered member entries [N] = { ... } within the members section,
 * and extract the position sub-block offsets.
 * Returns array of { idx, posStart, posEnd } where posStart/posEnd are the
 * character offsets of the inner content of ["position"] = { ... }.
 */
function findMemberPositionBlocks(lua) {
  const tcIdx = lua.indexOf('["takeoff_crew"]');
  if (tcIdx < 0) throw new Error('["takeoff_crew"] not found');

  const membersKey = '["members"]';
  const membersIdx = lua.indexOf(membersKey, tcIdx);
  if (membersIdx < 0) throw new Error('["members"] not found in takeoff_crew');

  const membersOpen = lua.indexOf('{', membersIdx + membersKey.length);
  const membersClose = findMatchingBrace(lua, membersOpen);

  const membersSection = lua.slice(membersOpen, membersClose + 1);
  const blocks = [];

  // Find each [N] = { ... } entry
  const entryRe = /\[(\d+)\]\s*=\s*\{/g;
  let match;
  while ((match = entryRe.exec(membersSection)) !== null) {
    const luaIdx = parseInt(match[1]); // 1-based
    const entryBraceStart = membersOpen + match.index + match[0].length - 1;
    const entryBraceEnd = findMatchingBrace(lua, entryBraceStart);

    // Find ["position"] within this entry
    const entryContent = lua.slice(entryBraceStart, entryBraceEnd + 1);
    const posKey = '["position"]';
    const posKeyIdx = entryContent.indexOf(posKey);
    if (posKeyIdx < 0) continue;

    const posOpen = entryContent.indexOf('{', posKeyIdx + posKey.length);
    if (posOpen < 0) continue;
    const absPosOpen = entryBraceStart + posOpen;
    const absPosClose = findMatchingBrace(lua, absPosOpen);

    blocks.push({
      luaIdx,           // 1-based Lua index
      memberIdx: luaIdx - 1, // 0-based
      posStart: absPosOpen + 1,  // after '{'
      posEnd: absPosClose,       // the '}'
    });
  }

  return blocks;
}

/**
 * Locate all numbered route entries [N] = { ... } within the routes section,
 * and extract the points sub-block offsets.
 */
function findRoutePositionBlocks(lua) {
  const tcIdx = lua.indexOf('["takeoff_crew"]');
  if (tcIdx < 0) throw new Error('["takeoff_crew"] not found');

  const routesKey = '["routes"]';
  const routesIdx = lua.indexOf(routesKey, tcIdx);
  if (routesIdx < 0) throw new Error('["routes"] not found in takeoff_crew');

  const routesOpen = lua.indexOf('{', routesIdx + routesKey.length);
  const routesClose = findMatchingBrace(lua, routesOpen);

  const routesSection = lua.slice(routesOpen, routesClose + 1);
  const blocks = [];

  // Find each [N] = { ... } entry
  const entryRe = /\[(\d+)\]\s*=\s*\{/g;
  let match;
  while ((match = entryRe.exec(routesSection)) !== null) {
    const luaIdx = parseInt(match[1]); // 1-based
    const entryBraceStart = routesOpen + match.index + match[0].length - 1;
    const entryBraceEnd = findMatchingBrace(lua, entryBraceStart);

    // Find ["points"] within this entry
    const entryContent = lua.slice(entryBraceStart, entryBraceEnd + 1);
    const ptsKey = '["points"]';
    const ptsKeyIdx = entryContent.indexOf(ptsKey);
    if (ptsKeyIdx < 0) continue;

    const ptsOpen = entryContent.indexOf('{', ptsKeyIdx + ptsKey.length);
    if (ptsOpen < 0) continue;
    const absPtsOpen = entryBraceStart + ptsOpen;
    const absPtsClose = findMatchingBrace(lua, absPtsOpen);

    blocks.push({
      luaIdx,
      routeIdx: luaIdx - 1,
      ptsStart: absPtsOpen + 1,
      ptsEnd: absPtsClose,
    });
  }

  return blocks;
}

/**
 * Build replacement text for a member's position block.
 * Format: [1] = X, [2] = deckHeight, [3] = Y, [4] = heading
 */
function buildMemberPosition(member) {
  return `\n                        [1] = ${member.x.toFixed(3)},\n                        [2] = ${DECK_HEIGHT},\n                        [3] = ${member.y.toFixed(3)},\n                        [4] = ${member.hdg.toFixed(4)},\n                    `;
}

/**
 * Build replacement text for a route's points block.
 * Each point: [N] = { [1] = x, [2] = y, [3] = angle }
 */
function buildRoutePoints(route) {
  const pts = route.points || [{ x: route.x, y: route.y, angle: route.angle }];
  const lines = pts.map((p, i) => {
    return `\n                        [${i + 1}] = \n                        {\n                            [1] = ${p.x.toFixed(3)},\n                            [2] = ${p.y.toFixed(3)},\n                            [3] = ${p.angle.toFixed(4)},\n                        },`;
  });
  return lines.join('') + '\n                    ';
}

/**
 * Patch crew.lua text with edited member positions and route positions.
 */
export function patchCrewLua(originalText, members, routes, headerComment) {
  let lua = originalText;

  // Add header comment if provided
  if (headerComment) {
    lua = `-- ${headerComment}\n${lua}`;
  }

  // Collect all patches (offset, length, replacement)
  const patches = [];

  // Patch member positions
  const memberBlocks = findMemberPositionBlocks(lua);
  for (const block of memberBlocks) {
    const mi = block.memberIdx;
    if (mi < 0 || mi >= members.length) continue;
    const member = members[mi];
    const replacement = buildMemberPosition(member);
    patches.push({
      start: block.posStart,
      end: block.posEnd,
      replacement,
    });
  }

  // Patch route positions
  const routeBlocks = findRoutePositionBlocks(lua);
  for (const block of routeBlocks) {
    const ri = block.routeIdx;
    if (ri < 0 || ri >= routes.length) continue;
    const route = routes[ri];
    const replacement = buildRoutePoints(route);
    patches.push({
      start: block.ptsStart,
      end: block.ptsEnd,
      replacement,
    });
  }

  // Apply patches in reverse order to preserve offsets
  patches.sort((a, b) => b.start - a.start);
  for (const p of patches) {
    lua = lua.slice(0, p.start) + p.replacement + lua.slice(p.end);
  }

  return lua;
}

/**
 * Download patched crew.lua as a file.
 */
export function downloadPatchedCrewLua(originalText, members, routes, headerComment) {
  const patched = patchCrewLua(originalText, members, routes, headerComment);
  const blob = new Blob([patched], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'crew.lua';
  a.click();
  URL.revokeObjectURL(url);
}
