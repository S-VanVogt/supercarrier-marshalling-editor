/** All 31 deck vertices in their default angular-sort order. */
export const DECK_VERTICES = [
  { x: -163.9167481,  y: -15.516334    },
  { x: -160.7046814,  y: -15.90845055  },
  { x: -124.2704468,  y: -20.35620445  },
  { x: -119.8160019,  y: -37.21241326  },
  { x:  -59.12,       y: -36.5         },
  { x:  -59.1,        y: -39.25        },
  { x:  -55.75,       y: -36.5         },
  { x:  -55.75,       y: -39.25        },
  { x:   15.10599136, y: -36.50999779  },
  { x:   35.68849564, y: -40.59407372  },
  { x:   63.09670639, y: -40.59407372  },
  { x:   92.02045441, y: -19.19579262  },
  { x:  167.5255432,  y: -12.20764965  },
  { x:  167.5262146,  y:  12.20708614  },
  { x:   93.06103516, y:  19.1767469   },
  { x:   69.14647675, y:  37.21241051  },
  { x:   41.40927505, y:  37.21241051  },
  { x:  -36.86133194, y:  22.37815529  },
  { x:  -36.86133194, y:  37.21241051  },
  { x:  -64.22514343, y:  37.21241051  },
  { x:  -70.53665924, y:  37.21241051  },
  { x:  -70.53665924, y:  32.7923513   },
  { x:  -75.53092194, y:  37.21241051  },
  { x:  -64.22514343, y:  24.69155365  },
  { x:  -75.53092194, y:  32.7923513   },
  { x: -109.7,        y:  37.21241051  },
  { x: -111.5616608,  y:  34.39724403  },
  { x: -111.8388596,  y:  32.05310493  },
  { x: -143.9434204,  y:  28.05833679  },
  { x: -157.6523132,  y:  22.7383123   },
  { x: -148.7204742,  y:  21.27566772  },
];

const STORAGE_KEY = 'deck-draw-order';

/** Default draw order — tuned to avoid self-intersections. */
const DEFAULT_ORDER = [
  0, 1, 2, 3, 4, 5, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  18, 17, 23, 19, 20, 21, 24, 22, 25, 26, 27, 28, 30, 29,
];

/** Load saved order from localStorage, falling back to default. */
function loadOrder() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.every(i => Number.isInteger(i) && i >= 0 && i < DECK_VERTICES.length)) {
        return arr;
      }
    }
  } catch { /* ignore corrupt data */ }
  return [...DEFAULT_ORDER];
}

/** Current draw-order indices. */
let _order = loadOrder();

/** Persist current order to localStorage. */
function saveOrder() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_order));
}

/** Return deck vertices in the current draw order. */
export function getDeck() {
  return _order.map(i => DECK_VERTICES[i]);
}

/** Set a new draw order and save it. */
export function setDrawOrder(indices) {
  _order = indices;
  saveOrder();
}

/** Reset to default angular-sort order and save. */
export function resetDrawOrder() {
  _order = [...DEFAULT_ORDER];
  saveOrder();
}

/** Get the current draw order as an array of indices. */
export function getDrawOrder() {
  return [..._order];
}
