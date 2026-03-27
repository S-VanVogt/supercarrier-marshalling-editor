/**
 * Core polyline geometry — arc-length parameterised point lookup,
 * segment lengths, total length, and nearest-point queries.
 */

/** Euclidean distance between two {x,y} points. */
function dist(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Compute per-segment lengths and total arc length. */
export function segmentLengths(points) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = dist(points[i], points[i + 1]);
    segs.push(len);
    total += len;
  }
  return { segs, total };
}

/**
 * Return the point at ratio t ∈ [0, 1] along the polyline (arc-length
 * parameterisation).  Returns {x, y, segIndex} or null if fewer than 2 points.
 */
export function polylinePoint(points, t) {
  if (points.length < 2) return null;

  const { segs, total } = segmentLengths(points);
  const target = t * total;
  let acc = 0;

  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i] >= target) {
      const frac = segs[i] === 0 ? 0 : (target - acc) / segs[i];
      const v0 = points[i].v ?? 1, v1 = points[i + 1].v ?? 1;
      return {
        x: points[i].x + frac * (points[i + 1].x - points[i].x),
        y: points[i].y + frac * (points[i + 1].y - points[i].y),
        v: v0 + frac * (v1 - v0),
        segIndex: i,
      };
    }
    acc += segs[i];
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, v: last.v ?? 1, segIndex: points.length - 2 };
}

/**
 * Find the index of the point nearest to (wx, wy) within a given
 * world-space radius.  Returns -1 if nothing is close enough.
 */
export function nearestPointIndex(points, wx, wy, radius) {
  let best = -1;
  let bestD = radius;
  for (let i = 0; i < points.length; i++) {
    const d = dist(points[i], { x: wx, y: wy });
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
