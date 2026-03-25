/**
 * Takeoff taxi route data extracted from USS_Nimitz_RunwaysAndRoutes.lua
 * GT.TaxiForTORoutes — 16 spawn-to-catapult routes.
 * Coordinates: Lua X → viewport X, Lua Z → viewport Y.
 */

/** Color palette by catapult (RunwayIdx). */
export const CATAPULT_COLORS = {
  1: '#3080E0',  // Cat 1 — blue
  2: '#E08030',  // Cat 2 — orange
  3: '#40A840',  // Cat 3 — green
  4: '#9040C0',  // Cat 4 — purple
};

export const TAKEOFF_ROUTES = [
  { id: 1, runwayIdx: 2, label: '6pack 1 → Cat 2', terminalSize: 12.0, points: [
    { x: 24.5, y: 9.5, v: 1.0 },
    { x: 18.5, y: 3.0, v: 1.0 },
    { x: 19.0, y: -2.0, v: 1.0 },
    { x: 25.0, y: -2.9, v: 2.0 },
    { x: 39.5, y: -3.20, v: 1.0 },
    { x: 55.9, y: -3.68, v: 1.0 },
  ]},
  { id: 2, runwayIdx: 2, label: '6pack 2 → Cat 2', terminalSize: 12.0, points: [
    { x: 7.6, y: 10.5, v: 1.0 },
    { x: 3.1, y: 4.0, v: 1.0 },
    { x: 7.5, y: -1.0, v: 2.0 },
    { x: 25.0, y: -2.9, v: 2.0 },
    { x: 39.5, y: -3.20, v: 1.0 },
    { x: 55.9, y: -3.68, v: 1.0 },
  ]},
  { id: 3, runwayIdx: 3, label: '6pack 3 → Cat 3', terminalSize: 12.0, points: [
    { x: -9.9, y: 10.8, v: 1.0 },
    { x: -21.2, y: -5.8, v: 3.0 },
    { x: -62.0, y: -1.5, v: 3.0 },
    { x: -67.0, y: -17.0, v: 2.0 },
    { x: -55.0, y: -18.8, v: 1.0 },
    { x: -39.4, y: -19.92, v: 1.0 },
  ]},
  { id: 4, runwayIdx: 4, label: '6pack 4 → Cat 4', terminalSize: 12.0, points: [
    { x: -25.2, y: 13.0, v: 1.0 },
    { x: -27.2, y: 11.5, v: 1.0 },
    { x: -31.7, y: -4.6, v: 1.0 },
    { x: -81.0, y: 2.4, v: 2.0 },
    { x: -83.0, y: -20.0, v: 2.0 },
    { x: -79.0, y: -32.8, v: 2.0 },
    { x: -70.0, y: -33.3, v: 1.0 },
    { x: -58.5, y: -32.8, v: 1.0 },
  ]},
  { id: 5, runwayIdx: 2, label: 'Lift2 p1 → Cat 2', terminalSize: 12.0, points: [
    { x: -13.1, y: 34.0, v: 2.0 },
    { x: -13.1, y: 13.0, v: 2.0 },
    { x: 25.0, y: -2.9, v: 2.0 },
    { x: 39.5, y: -3.20, v: 1.0 },
    { x: 55.9, y: -3.68, v: 1.0 },
  ]},
  { id: 6, runwayIdx: 2, label: 'Lift2 p2 → Cat 2', points: [
    { x: -25.2, y: 34.0, v: 1.0 },
    { x: -25.2, y: 11.0, v: 2.0 },
    { x: 7.0, y: 3.0, v: 2.0 },
    { x: 25.0, y: -2.9, v: 2.0 },
    { x: 39.5, y: -3.20, v: 1.0 },
    { x: 55.9, y: -3.68, v: 1.0 },
  ]},
  { id: 7, runwayIdx: 3, label: 'Lift4 p1 → Cat 3', points: [
    { x: -98.0, y: -34.0, v: 1.0 },
    { x: -98.0, y: -16.0, v: 2.0 },
    { x: -75.0, y: -16.0, v: 2.0 },
    { x: -65.0, y: -17.3, v: 2.0 },
    { x: -55.0, y: -18.8, v: 2.0 },
    { x: -39.4, y: -19.92, v: 1.0 },
  ]},
  { id: 8, runwayIdx: 4, label: 'Lift4 p2 → Cat 4', points: [
    { x: -110.0, y: -34.0, v: 1.0 },
    { x: -110.0, y: -14.0, v: 2.0 },
    { x: -90.0, y: -14.0, v: 2.0 },
    { x: -79.0, y: -32.8, v: 2.0 },
    { x: -70.0, y: -33.3, v: 1.0 },
    { x: -58.5, y: -32.8, v: 1.0 },
  ]},
  { id: 9, runwayIdx: 2, label: 'Lift3 p1 → Cat 2', terminalSize: 12.0, points: [
    { x: -92.0, y: 34.0, v: 1.0 },
    { x: -92.0, y: 8.7, v: 2.0 },
    { x: -60.6, y: 4.3, v: 3.0 },
    { x: -32.4, y: -1.0, v: 3.0 },
    { x: 25.0, y: -2.9, v: 2.0 },
    { x: 39.5, y: -3.20, v: 1.0 },
    { x: 55.9, y: -3.68, v: 1.0 },
  ]},
  { id: 10, runwayIdx: 2, label: 'Lift3 p2 → Cat 2', points: [
    { x: -103.5, y: 34.0, v: 1.0 },
    { x: -103.7, y: 10.7, v: 2.0 },
    { x: -91.2, y: 8.7, v: 2.0 },
    { x: -60.6, y: 3.3, v: 3.0 },
    { x: -32.4, y: -1.0, v: 3.0 },
    { x: 7.8, y: -3.6, v: 2.0 },
    { x: 25.0, y: -2.9, v: 1.0 },
    { x: 55.9, y: -3.68, v: 1.0 },
  ]},
  { id: 11, runwayIdx: 2, label: 'Lift1 p1 → Cat 2', terminalSize: 12.0, points: [
    { x: 35.0, y: 34.0, v: 1.0 },
    { x: 34.8, y: 16.2, v: 1.0 },
    { x: 25.0, y: -2.9, v: 2.0 },
    { x: 39.5, y: -3.20, v: 1.0 },
    { x: 55.9, y: -3.68, v: 1.0 },
  ]},
  { id: 12, runwayIdx: 2, label: 'Lift1 p2 → Cat 2', points: [
    { x: 23.0, y: 34.0, v: 1.0 },
    { x: 23.0, y: 23.0, v: 1.0 },
    { x: 18.9, y: 9.8, v: 1.0 },
    { x: 24.6, y: -2.0, v: 1.0 },
    { x: 39.5, y: -3.20, v: 1.0 },
    { x: 55.9, y: -3.68, v: 1.0 },
  ]},
  { id: 13, runwayIdx: 2, label: 'Corral → Cat 2', points: [
    { x: 6.0, y: 32.5, v: 1.0 },
    { x: 6.0, y: 10.5, v: 1.0 },
    { x: 13.0, y: 0.0, v: 1.0 },
    { x: 25.0, y: -2.9, v: 1.0 },
    { x: 39.5, y: -3.20, v: 1.0 },
    { x: 55.9, y: -3.68, v: 1.0 },
  ]},
  { id: 14, runwayIdx: 2, label: 'Patio front → Cat 2', terminalSize: 12.0, points: [
    { x: -118.0, y: 28.0, v: 1.0 },
    { x: -110.2, y: 12.1, v: 2.0 },
    { x: -60.6, y: 3.3, v: 3.0 },
    { x: -32.4, y: -1.0, v: 3.0 },
    { x: -6.0, y: 13.6, v: 2.0 },
    { x: 25.0, y: -2.9, v: 2.0 },
    { x: 39.5, y: -3.20, v: 1.0 },
    { x: 55.9, y: -3.68, v: 1.0 },
  ]},
  { id: 15, runwayIdx: 3, label: 'Patio mid → Cat 3', terminalSize: 20.0, points: [
    { x: -129.2, y: 26.2, v: 1.0 },
    { x: -123.7, y: 19.2, v: 1.0 },
    { x: -122.7, y: 12.1, v: 1.0 },
    { x: -96.0, y: -16.0, v: 2.0 },
    { x: -75.0, y: -16.0, v: 2.0 },
    { x: -65.0, y: -17.3, v: 2.0 },
    { x: -55.0, y: -18.8, v: 2.0 },
    { x: -39.4, y: -19.92, v: 1.0 },
  ]},
  { id: 16, runwayIdx: 4, label: 'Patio rear → Cat 4', terminalSize: 20.0, points: [
    { x: -141.15, y: 24.2, v: 1.0 },
    { x: -137.0, y: 21.2, v: 1.0 },
    { x: -130.0, y: 4.0, v: 1.0 },
    { x: -108.0, y: -7.0, v: 2.0 },
    { x: -90.0, y: -13.0, v: 2.0 },
    { x: -79.0, y: -32.2, v: 2.0 },
    { x: -70.0, y: -32.8, v: 1.0 },
    { x: -58.5, y: -32.8, v: 1.0 },
  ]},
];

/** Placeholder — landing routes to be added later. */
export const LANDING_ROUTES = [];
