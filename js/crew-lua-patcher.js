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
  if (headerComment && headerComment.startsWith('-- [SC-Config]')) {
    // Pre-formatted stamp: strip old stamp lines, prepend new stamp
    lua = lua.split('\n').filter(l => !l.startsWith('-- [SC-Config]')).join('\n');
    lua = headerComment + lua;
  } else if (headerComment) {
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

// ── Catapult crew patching ─────────────────────────────────────────────────

/**
 * Find all catapult crew route points blocks in the ["crew"] section.
 * Returns array of { catIdx, memberIdx, routeIdx, ptsStart, ptsEnd }
 * where ptsStart/ptsEnd delimit the content between { } of ["points"].
 */
function findCatCrewRoutePointsBlocks(lua) {
  const crewKey = '["crew"]';
  const crewIdx = lua.indexOf(crewKey);
  if (crewIdx < 0) return [];

  const crewOpen = lua.indexOf('{', crewIdx + crewKey.length);
  if (crewOpen < 0) return [];
  const crewClose = findMatchingBrace(lua, crewOpen);

  const blocks = [];

  // Find catapult entries [N] = { ... }
  const catRe = /\[(\d+)\]\s*=\s*\{/g;
  const crewSection = lua.slice(crewOpen, crewClose + 1);
  let catMatch;
  while ((catMatch = catRe.exec(crewSection)) !== null) {
    const catLuaIdx = parseInt(catMatch[1]);
    const catBraceStart = crewOpen + catMatch.index + catMatch[0].length - 1;
    const catBraceEnd = findMatchingBrace(lua, catBraceStart);
    if (catBraceEnd < 0) continue;

    // Find ["members"] within this catapult
    const catContent = lua.slice(catBraceStart, catBraceEnd + 1);
    const membersKeyIdx = catContent.indexOf('["members"]');
    if (membersKeyIdx < 0) continue;
    const membersOpen = catContent.indexOf('{', membersKeyIdx + 11);
    if (membersOpen < 0) continue;
    const absMembersOpen = catBraceStart + membersOpen;
    const absMembersClose = findMatchingBrace(lua, absMembersOpen);

    // Find member entries
    const membersSection = lua.slice(absMembersOpen, absMembersClose + 1);
    const memRe = /\[(\d+)\]\s*=\s*\{/g;
    let memMatch;
    while ((memMatch = memRe.exec(membersSection)) !== null) {
      const memLuaIdx = parseInt(memMatch[1]);
      const memBraceStart = absMembersOpen + memMatch.index + memMatch[0].length - 1;
      const memBraceEnd = findMatchingBrace(lua, memBraceStart);
      if (memBraceEnd < 0) continue;

      // Find ["routes"] within this member
      const memContent = lua.slice(memBraceStart, memBraceEnd + 1);
      const routesKeyIdx = memContent.indexOf('["routes"]');
      if (routesKeyIdx < 0) continue;
      const routesOpen = memContent.indexOf('{', routesKeyIdx + 10);
      if (routesOpen < 0) continue;
      const absRoutesOpen = memBraceStart + routesOpen;
      const absRoutesClose = findMatchingBrace(lua, absRoutesOpen);

      // Find route entries
      const routesSection = lua.slice(absRoutesOpen, absRoutesClose + 1);
      const rtRe = /\[(\d+)\]\s*=\s*\{/g;
      let rtMatch;
      while ((rtMatch = rtRe.exec(routesSection)) !== null) {
        const rtLuaIdx = parseInt(rtMatch[1]);
        const rtBraceStart = absRoutesOpen + rtMatch.index + rtMatch[0].length - 1;
        const rtBraceEnd = findMatchingBrace(lua, rtBraceStart);
        if (rtBraceEnd < 0) continue;

        // Find ["points"] within this route
        const rtContent = lua.slice(rtBraceStart, rtBraceEnd + 1);
        const ptsKeyIdx = rtContent.indexOf('["points"]');
        if (ptsKeyIdx < 0) continue;
        const ptsOpen = rtContent.indexOf('{', ptsKeyIdx + 10);
        if (ptsOpen < 0) continue;
        const absPtsOpen = rtBraceStart + ptsOpen;
        const absPtsClose = findMatchingBrace(lua, absPtsOpen);

        blocks.push({
          catIdx: catLuaIdx - 1,
          memberIdx: memLuaIdx - 1,
          routeIdx: rtLuaIdx - 1,
          ptsStart: absPtsOpen + 1,   // after '{'
          ptsEnd: absPtsClose,        // the '}'
        });

        rtRe.lastIndex = rtBraceStart + (rtBraceEnd - rtBraceStart) + 1 - absRoutesOpen;
      }

      memRe.lastIndex = memBraceStart + (memBraceEnd - memBraceStart) + 1 - absMembersOpen;
    }

    catRe.lastIndex = catBraceStart + (catBraceEnd - catBraceStart) + 1 - crewOpen;
  }

  return blocks;
}

/**
 * Build replacement text for a catapult crew route's points block.
 * Each point: [N] = { [1]=x, [2]=deckHeight, [3]=z, [4]=vx, [5]=vy, [6]=vz }
 */
function buildCatCrewRoutePoints(points) {
  if (!points || points.length === 0) return '\n                            ';
  const lines = points.map((p, i) => {
    const h = p.h != null ? p.h : 20.1494140625;  // preserve original deck height per point
    return `\n                                [${i + 1}] = {\n                                    [1] = ${p.x},\n                                    [2] = ${h},\n                                    [3] = ${p.y},\n                                    [4] = ${p.vx || 0},\n                                    [5] = ${p.vy || 0},\n                                    [6] = ${p.vz || 0},\n                                },`;
  });
  return lines.join('') + '\n                            ';
}

/**
 * Check if a route's points have been modified from the original snapshot.
 */
function isCatRouteModified(orig, curr) {
  if (!orig || !curr) return true;
  if (orig.points.length !== curr.points.length) return true;
  return orig.points.some((p, j) =>
    p.x !== curr.points[j].x || p.y !== curr.points[j].y ||
    p.vx !== curr.points[j].vx || p.vy !== curr.points[j].vy || p.vz !== curr.points[j].vz
  );
}

/**
 * Patch catapult crew route points into crew.lua text.
 * Only patches routes that were actually modified (compared to originalCatCrews snapshot).
 */
export function patchCatCrewLua(lua, catapultCrews, originalCatCrews) {
  const blocks = findCatCrewRoutePointsBlocks(lua);
  if (blocks.length === 0) return lua;

  const patches = [];
  for (const block of blocks) {
    const crew = catapultCrews[block.catIdx];
    if (!crew) continue;
    const member = crew.members[block.memberIdx];
    if (!member) continue;
    const route = member.routes[block.routeIdx];
    if (!route) continue;

    // Only patch if modified from original
    const origCrew = originalCatCrews?.[block.catIdx];
    const origMember = origCrew?.members[block.memberIdx];
    const origRoute = origMember?.routes[block.routeIdx];
    if (origRoute && !isCatRouteModified(origRoute, route)) continue;

    const replacement = buildCatCrewRoutePoints(route.points);
    patches.push({
      start: block.ptsStart,
      end: block.ptsEnd,
      replacement,
    });
  }

  if (patches.length === 0) return lua;

  // Apply in reverse order
  patches.sort((a, b) => b.start - a.start);
  for (const p of patches) {
    lua = lua.slice(0, p.start) + p.replacement + lua.slice(p.end);
  }

  return lua;
}

/**
 * Download patched crew.lua as a file (includes both deck crew and catapult crew edits).
 */
export function downloadPatchedCrewLua(originalText, members, routes, catapultCrews, originalCatCrews, headerComment) {
  let patched = patchCrewLua(originalText, members, routes, headerComment);
  if (catapultCrews && catapultCrews.length > 0) {
    patched = patchCatCrewLua(patched, catapultCrews, originalCatCrews);
  }
  const blob = new Blob([patched], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'crew.lua';
  a.click();
  URL.revokeObjectURL(url);
}
