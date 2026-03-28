# SuperCarrier Marshalling Editor

Browser-based visual editor for DCS World SuperCarrier configuration files (crew.lua and USS_Nimitz_RunwaysAndRoutes.lua).

## Dev Server

Run `python server.py 3000` from polyline-app/ — custom no-cache HTTP server. Launch config in `../.claude/launch.json`.

## Architecture

Pure vanilla JS (ES modules), no build step, no framework. Canvas 2D rendering with world-to-canvas coordinate mapping.

### File Structure

- `index.html` — Single page app shell, all panels
- `js/app.js` — Entry point, wires viewport/renderer/ui/routeState
- `js/viewport.js` — Pan/zoom, world↔canvas coordinate transforms
- `js/renderer.js` — All canvas drawing: grid, polygon, catapults, JBDs, crew, routes, active crew lines
- `js/ui.js` — DOM event handling, panel sync, route editing (drag waypoints, right-click add/insert)
- `js/route-state.js` — Reactive state: route selection, visibility, progress `t`, change notification
- `js/route-data.js` — 16 takeoff route definitions (points with x/y/v)
- `js/crew-data.js` — Crew member idle positions and display info (from crew.lua `members[]`)
- `js/crew-routes-data.js` — Crew active (marshalling) positions from crew.lua `routes[]`, plus `CREW_ACTIVE_LINKS[]` (deduplicated member→route pairs from takeoff_tasks)
- `js/takeoff-tasks-data.js` — 16 takeoff task definitions with brown/yellow handoff steps, `TAKEOFF_USED_ROUTE_IDS`, `PARKING_ASSIGNMENTS[]`, `NON_TAKEOFF_LINKS[]`
- `js/crew-lua-parser.js` — Parses crew.lua text into members/routes/tasks data structures
- `js/lua-patcher.js` — RunwaysAndRoutes.lua import/export (preserves structure, strips block comments)
- `js/crew-lua-patcher.js` — crew.lua export: patches edited member positions/headings and route positions/angles back into original crew.lua text
- `js/polygon-data.js` — Carrier deck outline polygon
- `js/polyline.js` — Polyline math: interpolated point at t (x, y, v), nearest point search
- `js/state.js` — Legacy polyline state (unused, can be removed)
- `server.py` — No-cache dev HTTP server
- `.nojekyll` — Prevents GitHub Pages Jekyll processing (CLAUDE.md has Liquid-like syntax)

## DCS SuperCarrier Data Model (crew.lua)

### Members (idle positions)
- `members[]` is a 1-based Lua array of crew with `name`, `x`, `y`, `heading`
- These are the IDLE/rest positions on deck
- Member indexing: **1-based in Lua arrays, 0-based in task references** (member_id 0 = members[1])

### Routes (active/marshalling positions)
- `routes[]` is a 1-based Lua array with `name`, `x`, `y`, `angle`
- These are positions crew marshal FROM during operations
- Route names do NOT correspond to member names — only tasks define member→route mapping
- Some routes have multiple waypoints (route_id 14, 46 have `points[]` arrays)
- Route indexing: **1-based in Lua, 0-based in task references** (route_id 0 = routes[1])

### Takeoff Tasks
- 16 tasks, each defines the crew handoff chain for one aircraft launch
- Structure: `brownId`, `brownRouteId` (initial marshaller), then `steps[]` with `{progress, memberId, routeId}`
- **Progress values are HANDOFF points**: `step[i].progress` is when control passes TO the next crew
- Control flow at progress `t`:
  - `t = 0` → brown crew controls
  - `0 < t < step[0].progress` → step[0]'s yellow controls
  - `step[i-1].progress <= t < step[i].progress` → step[i]'s yellow controls
  - `t >= last step's progress` → catapult (no crew line drawn)
- A single member can be referenced by multiple tasks (multiple active positions)

### Parking Tasks
- Similar to takeoff but in reverse (aircraft parking after landing)
- Last step has brown marshaller (no initial brown like takeoff)
- `route_id = -1` means member returns to idle position
- Used to map "unused by takeoff" routes to their members

## Rendering Logic

### Crew Position Coloring (context-aware)
- Takeoff crew positions: **colored** when any takeoff route visible, **gray** otherwise
- Landing crew positions: **always gray** (shown even with no routes visible), **colored** when landing routes visible
- When editing a specific route, that route's crew shows colored, others gray

### Render Order
grid → polygon → catapults → JBDs → unusedRoutePositions → crewActivePositions → crew → takeoffRoutes → landingRoutes → activeCrewLines

### Coordinate System
- x = along deck (negative = bow/front, positive = stern/back)
- y = across deck
- In RunwaysAndRoutes.lua points: `{{x, deckHeight, z}, v}` where x→viewport X, z→viewport Y, deckHeight(20.1494) ignored

## UI Layout

### Banner (fixed top)
- Canvas (500px fixed height, width fills container)
- Progress bar (shown when not in crew edit mode) — displays t value and interpolated x/y/v coordinates
- Crew edit bar (replaces progress bar in crew edit mode) — shows selected crew name, editable x/y/angle fields, coordinates

### Panels (scrollable below canvas)
- **Routes panel** — 3-column grid: Takeoff Routes | Landing Routes | Points list. Each route column has "Show all" checkbox in header. Points column shows editable waypoints for selected route.
- **Crew panel** — 2-column grid: Idle Positions (members) | Active Positions (routes). Each column has "Show all" checkbox. Crew names are clickable to select. T/L reference tags show which takeoff/landing tasks use each member/route.
- **Import/Export panel** — Import/export buttons for RunwaysAndRoutes and crew.lua, with header comment fields.

## Canvas Interaction

### Click-to-enter edit modes
- Click crew dot (any mode) → enters crew edit mode, selects that member
- Click route segment (any mode) → enters route edit mode for that route
- Modes are mutually exclusive — clicking switches between them seamlessly

### Route cycling
- Repeated clicks at the same spot cycle through all overlapping visible routes (sorted by distance, 2s timeout)

### Panning
- Left-click on empty space pans in all modes (crew edit, route edit, or no edit)
- Middle-click or shift+left-click always pans
- Right-click pans (except in route edit mode where it adds waypoints)

### Cursors
- Crosshair+circle (custom SVG) when hovering over draggable points (crew dots, route waypoints)
- Pointer when hovering over route segments (no edit mode)
- Default crosshair otherwise

## Crew Editing

- **Idle positions** (members): click to select, drag to move x/y, scroll wheel to rotate heading (5° increments, selected only)
- **Active positions** (routes): same interaction, angle stored in radians internally, displayed as degrees
- All points of multi-point routes are individually selectable and editable
- Click-to-enter from canvas or crew panel (click member/route name)
- Left-click on empty space exits crew edit mode
- Selection shown with larger ring (r+10) plus angle tick mark on ring
- Selection ring works on gray (inactive) crew positions too
- Crew edit fields shown in banner bar (replaces progress bar): name label + x/y/angle inputs
- Angle field always updates on scroll-wheel rotation (even when focused)
- Selected point row highlighted in light blue in points panel
- Revert button per member/route restores original values
- Export patches edited values back into original crew.lua text, preserving all other content

## Reference Files (not in repo)
- `G:/OneDrive/ClaudeAI/DCS rr ref/crew.lua` — Source crew data
- `G:/OneDrive/ClaudeAI/DCS rr ref/USS_Nimitz_RunwaysAndRoutes.lua` — Source route data

## Backups
- `polyline-app-backup-v4` — After crew active positions and task-based crew control
- `polyline-app-backup-v5` — After landing routes and context-aware crew coloring
- `polyline-app-backup-v6` — After crew.lua import, comment fix, always-show landing crew
- `polyline-app-backup-v7` — After editable crew positions/heading with crew.lua export
- `polyline-app-backup-v8` — After click-to-enter edit modes, route cycling, crew index labels
- `polyline-app-backup-v9` — After UI overhaul: 3-column layout, crew panel improvements, banner layout
- `polyline-app-backup-v10` — (created in earlier session)
- `polyline-app-backup-v11` — (created in earlier session)
- `polyline-app-backup-v12` — After F-14 silhouette overlay on route progress marker, 180° rotation on landing at t=1.0
