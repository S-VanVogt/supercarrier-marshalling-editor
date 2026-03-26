/**
 * Crew member positions extracted from crew.lua (takeoff_crew.members).
 * Lua position: [1]=X (longitudinal), [2]=deck height (ignored), [3]=Z (lateral → our Y).
 */
export const CREW_MEMBERS = [
  { name: 'yellow-00',   x:   41.76, y:   7.57, hdg: -148, livery: 'yellow', type: 'shooter'  },
  { name: 'yellow-01',   x:   13.43, y:  16.77, hdg:   77, livery: 'yellow', type: 'tech'     },
  { name: 'yellow-02',   x:   42.20, y:   9.22, hdg:  127, livery: 'yellow', type: 'shooter'  },
  { name: 'yellow-04',   x:   -1.64, y:  23.57, hdg:   69, livery: 'yellow', type: 'tech'     },
  { name: 'yellow-05',   x:  -32.12, y:  26.54, hdg:   95, livery: 'yellow', type: 'tech'     },
  { name: 'yellow-06',   x: -118.01, y: -24.36, hdg:  -95, livery: 'yellow', type: 'shooter'  },
  { name: 'yellow-07',   x:  -87.98, y: -33.78, hdg:  -87, livery: 'yellow', type: 'shooter'  },
  { name: 'yellow-08',   x:  -89.06, y: -32.67, hdg:  -24, livery: 'yellow', type: 'shooter'  },
  { name: 'yellow-09',   x:  -85.70, y: -35.50, hdg:  -90, livery: 'yellow', type: 'shooter'  },
  { name: 'yellow-11',   x:  -85.52, y:  27.14, hdg:   95, livery: 'yellow', type: 'shooter'  },
  { name: 'yellow-12',   x:  -43.13, y:  22.91, hdg:  101, livery: 'yellow', type: 'shooter'  },
  { name: 'yellow-13',   x: -121.27, y: -23.64, hdg: -122, livery: 'yellow', type: 'shooter'  },
  { name: 'yellow-14',   x: -122.40, y: -21.30, hdg:    0, livery: 'yellow', type: 'shooter'  },
  { name: 'yellow-15',   x:  -35.70, y:  26.40, hdg:   95, livery: 'yellow', type: 'shooter'  },
  { name: 'brown-0-11',  x:   15.07, y:  34.78, hdg:  103, livery: 'brown',  type: 'shooter'  },
  { name: 'brown-1-12',  x:   -1.20, y:  36.20, hdg:    0, livery: 'brown',  type: 'shooter'  },
  { name: 'brown-2-4',   x:   -3.83, y:  36.58, hdg:   85, livery: 'brown',  type: 'shooter'  },
  { name: 'brown-3-5',   x:  -32.40, y:  35.50, hdg:    0, livery: 'brown',  type: 'shooter'  },
  { name: 'brown-6',     x:  -90.30, y: -29.60, hdg:  180, livery: 'brown',  type: 'shooter'  },
  { name: 'brown-7',     x: -118.79, y: -22.76, hdg:   42, livery: 'brown',  type: 'shooter'  },
  { name: 'brown-8',     x:  -81.09, y:  35.94, hdg:  122, livery: 'brown',  type: 'shooter'  },
  { name: 'brown-9',     x: -111.00, y:  31.60, hdg:    0, livery: 'brown',  type: 'shooter'  },
  { name: 'brown-10',    x:   78.49, y:  26.66, hdg:  135, livery: 'brown',  type: 'shooter'  },
  { name: 'brown-13',    x: -110.68, y:  29.73, hdg:  143, livery: 'brown',  type: 'shooter'  },
  { name: 'brown-14',    x: -110.30, y:  25.90, hdg:    0, livery: 'brown',  type: 'shooter'  },
  { name: 'brown-15',    x: -110.20, y:  27.90, hdg:    0, livery: 'brown',  type: 'shooter'  },
];

/** Colour map for liveries. */
export const LIVERY_COLOURS = {
  yellow: { fill: '#EAB308', stroke: '#A16207', text: '#713F12' },
  brown:  { fill: '#A0522D', stroke: '#6B3A1F', text: '#3E1F0D' },
};

/** Replace CREW_MEMBERS contents in-place (keeps all references valid). */
export function replaceCrewMembers(newMembers) {
  CREW_MEMBERS.length = 0;
  CREW_MEMBERS.push(...newMembers);
}
