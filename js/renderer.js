/**
 * Canvas renderer — draws grid, reference polygon, polyline, vertices, and
 * the arc-length ratio marker.
 */
import { getDeck } from './polygon-data.js';
import { polylinePoint } from './polyline.js';
import { CREW_MEMBERS, LIVERY_COLOURS } from './crew-data.js';
import { CATAPULT_COLORS } from './route-data.js';

export class Renderer {
  /** @param {HTMLCanvasElement} canvas  @param {import('./viewport.js').Viewport} viewport */
  constructor(canvas, viewport) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewport = viewport;
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }

  /** Shorthand for viewport.toCanvas bound to current canvas size. */
  wc(wx, wy) { return this.viewport.toCanvas(wx, wy, this.W, this.H); }

  // ── Grid ──────────────────────────────────────────────────────────────────
  drawGrid() {
    const { ctx, W, H } = this;
    const v = this.viewport;
    ctx.save();

    // minor grid
    ctx.strokeStyle = 'rgba(128,128,128,0.12)';
    ctx.lineWidth = 0.5;
    const xStep = 20, yStep = 10;

    for (let wx = Math.ceil(v.minX / xStep) * xStep; wx <= v.maxX; wx += xStep) {
      const { x } = this.wc(wx, 0);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let wy = Math.ceil(v.minY / yStep) * yStep; wy <= v.maxY; wy += yStep) {
      const { y } = this.wc(0, wy);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // axes
    ctx.strokeStyle = 'rgba(128,128,128,0.35)';
    if (v.minX <= 0 && v.maxX >= 0) {
      const { x } = this.wc(0, 0);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    if (v.minY <= 0 && v.maxY >= 0) {
      const { y } = this.wc(0, 0);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // axis labels
    ctx.fillStyle = 'rgba(128,128,128,0.55)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    for (let wx = Math.ceil(v.minX / xStep) * xStep; wx <= v.maxX; wx += xStep) {
      const p = this.wc(wx, v.minY);
      ctx.fillText(wx, p.x, p.y + 12);
    }
    ctx.textAlign = 'right';
    for (let wy = Math.ceil(v.minY / yStep) * yStep; wy <= v.maxY; wy += yStep) {
      if (wy === 0) continue;
      const p = this.wc(v.minX, wy);
      ctx.fillText(wy, p.x + 22, p.y + 3);
    }
    // Copyright
    ctx.fillStyle = 'rgba(180,178,169,0.5)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('(c) 2026 by VanVogt', W - 8, H - 6);

    ctx.restore();
  }

  // ── Reference polygon ─────────────────────────────────────────────────────
  drawPolygon() {
    const polygon = getDeck();
    if (polygon.length < 2) return;
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    const c0 = this.wc(polygon[0].x, polygon[0].y);
    ctx.moveTo(c0.x, c0.y);
    for (let i = 1; i < polygon.length; i++) {
      const c = this.wc(polygon[i].x, polygon[i].y);
      ctx.lineTo(c.x, c.y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(29,158,117,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(29,158,117,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (const p of polygon) {
      const c = this.wc(p.x, p.y);
      ctx.beginPath(); ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(29,158,117,0.8)';
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Catapult rectangles ──────────────────────────────────────────────────
  // Each: center (x,y), azimuth in degrees, length, width
  static CATAPULTS = [
    { name: 'Cat 1', cx:  59.954,  cy:  18.020, azDeg: 354.3,   len: 107.8, wid: 5.0 },
    { name: 'Cat 2', cx:  58.800,  cy:  -3.752, azDeg: 358.0,   len: 108.8, wid: 5.0 },
    { name: 'Cat 3', cx: -37.374,  cy: -20.162, azDeg: 355.002, len: 112.0, wid: 5.0 },
    { name: 'Cat 4', cx: -56.176,  cy: -32.900, azDeg: 359.957, len: 130.0, wid: 5.0 },
  ];

  /** Compute 4 world-space corners of an oriented rectangle. */
  static _catCorners(cat) {
    const θ = cat.azDeg * Math.PI / 180;
    const ax = Math.cos(θ), ay = Math.sin(θ);   // along-axis
    const px = -ay, py = ax;                      // perpendicular (left)
    const hw = cat.wid / 2;
    return [
      { x: cat.cx - px * hw,             y: cat.cy - py * hw             },
      { x: cat.cx + ax * cat.len - px * hw, y: cat.cy + ay * cat.len - py * hw },
      { x: cat.cx + ax * cat.len + px * hw, y: cat.cy + ay * cat.len + py * hw },
      { x: cat.cx + px * hw,             y: cat.cy + py * hw             },
    ];
  }

  drawCatapults() {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(200,60,60,0.7)';
    ctx.fillStyle = 'rgba(200,60,60,0.08)';
    ctx.lineWidth = 1.2;
    ctx.font = 'bold 9px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    for (const cat of Renderer.CATAPULTS) {
      const corners = Renderer._catCorners(cat);
      const pts = corners.map(p => this.wc(p.x, p.y));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // label at center
      const cc = this.wc(cat.cx, cat.cy);
      ctx.fillStyle = 'rgba(200,60,60,0.8)';
      ctx.fillText(cat.name, cc.x, cc.y);
      ctx.fillStyle = 'rgba(200,60,60,0.08)';
    }
    ctx.restore();
  }

  // ── JBD rectangles ───────────────────────────────────────────────────────
  static JBDS = [
    { name: 'JBD1', xMin: 41.1, yMin: 13.9, xMax: 45.9, yMax: 25.0 },
    { name: 'JBD2', xMin: 36.8, yMin: -8.7, xMax: 41.6, yMax:  2.4 },
    { name: 'JBD3', xMin: -56.8, yMin: -24.3, xMax: -52.0, yMax: -13.2 },
    { name: 'JBD4', xMin: -75.3, yMin: -35.6, xMax: -70.5, yMax: -28.2 },
  ];

  drawJBDs() {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(220,140,20,0.8)';
    ctx.fillStyle = 'rgba(220,140,20,0.10)';
    ctx.lineWidth = 1.5;
    ctx.font = 'bold 9px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    for (const jbd of Renderer.JBDS) {
      const tl = this.wc(jbd.xMin, jbd.yMin);
      const br = this.wc(jbd.xMax, jbd.yMax);
      const x = Math.min(tl.x, br.x);
      const y = Math.min(tl.y, br.y);
      const w = Math.abs(br.x - tl.x);
      const h = Math.abs(br.y - tl.y);
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(220,140,20,0.9)';
      ctx.fillText(jbd.name, x + w / 2, y + h / 2);
      ctx.fillStyle = 'rgba(220,140,20,0.10)';
    }
    ctx.restore();
  }

  // ── Crew positions ───────────────────────────────────────────────────────
  drawCrew(rs) {
    const { ctx } = this;
    ctx.save();
    const r = 4;                     // marker radius in px
    ctx.font = 'bold 9px monospace';
    ctx.textBaseline = 'middle';

    const arrowLen = 12;             // arrow shaft length in px
    const headLen  = 4;              // arrowhead size in px
    const headAng  = Math.PI / 6;   // arrowhead half-angle

    for (let mi = 0; mi < CREW_MEMBERS.length; mi++) {
      if (rs && !rs.crewVisible[mi]) continue;
      const m = CREW_MEMBERS[mi];
      const c = this.wc(m.x, m.y);
      const pal = LIVERY_COLOURS[m.livery] || LIVERY_COLOURS.yellow;

      // Heading arrow  (DCS: 0°=+X=bow, positive=clockwise from above)
      // Canvas: +X right, +Y down  →  angle = hdg in radians
      const hdgRad = (m.hdg ?? 0) * Math.PI / 180;
      const ax = c.x + Math.cos(hdgRad) * arrowLen;
      const ay = c.y - Math.sin(hdgRad) * arrowLen;

      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(ax, ay);
      ctx.strokeStyle = pal.stroke;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // arrowhead
      const tipAngle = Math.atan2(ay - c.y, ax - c.x);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - headLen * Math.cos(tipAngle - headAng),
                 ay - headLen * Math.sin(tipAngle - headAng));
      ctx.lineTo(ax - headLen * Math.cos(tipAngle + headAng),
                 ay - headLen * Math.sin(tipAngle + headAng));
      ctx.closePath();
      ctx.fillStyle = pal.stroke;
      ctx.fill();

      // dot
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fillStyle = pal.fill;
      ctx.fill();
      ctx.strokeStyle = pal.stroke;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // label tag
      const label = m.name;
      const tw = ctx.measureText(label).width;
      const pad = 3;
      const tagX = c.x + r + 3;
      const tagY = c.y;
      const tagW = tw + pad * 2;
      const tagH = 12;

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.strokeStyle = pal.stroke;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(tagX, tagY - tagH / 2, tagW, tagH, 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = pal.text;
      ctx.textAlign = 'left';
      ctx.fillText(label, tagX + pad, tagY + 0.5);
    }
    ctx.restore();
  }

  // ── Takeoff taxi routes ──────────────────────────────────────────────────
  drawTakeoffRoutes(rs, t) {
    if (!rs) return;
    const { ctx } = this;
    ctx.save();

    for (let i = 0; i < rs.takeoffRoutes.length; i++) {
      if (!rs.isTakeoffRouteVisible(i)) continue;
      const route = rs.takeoffRoutes[i];
      const pts = route.points;
      if (pts.length < 2) continue;

      const color = CATAPULT_COLORS[route.runwayIdx] || '#888';
      const selected = rs.selectedRoute === i;

      // polyline
      ctx.beginPath();
      const p0 = this.wc(pts[0].x, pts[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let j = 1; j < pts.length; j++) {
        const p = this.wc(pts[j].x, pts[j].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.setLineDash(selected ? [] : [6, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // waypoint markers (squares)
      const sz = selected ? 5 : 3;
      for (let j = 0; j < pts.length; j++) {
        const p = this.wc(pts[j].x, pts[j].y);
        ctx.fillStyle = color;
        ctx.fillRect(p.x - sz, p.y - sz, sz * 2, sz * 2);
        if (selected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.strokeRect(p.x - sz, p.y - sz, sz * 2, sz * 2);
        }
      }

      // t-marker on selected route
      if (selected && t != null) {
        const rpt = polylinePoint(pts, t);
        if (rpt) {
          // highlight active segment
          const segA = this.wc(pts[rpt.segIndex].x, pts[rpt.segIndex].y);
          const segB = this.wc(pts[rpt.segIndex + 1].x, pts[rpt.segIndex + 1].y);
          ctx.beginPath();
          ctx.moveTo(segA.x, segA.y);
          ctx.lineTo(segB.x, segB.y);
          ctx.strokeStyle = '#EF9F27';
          ctx.lineWidth = 3;
          ctx.stroke();

          // marker dot
          const cp = this.wc(rpt.x, rpt.y);
          ctx.beginPath(); ctx.arc(cp.x, cp.y, 9, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(239,159,39,0.2)'; ctx.fill();
          ctx.beginPath(); ctx.arc(cp.x, cp.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#EF9F27'; ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        }
      }

      // terminal size circle at first point
      if (route.terminalSize) {
        const tc = this.wc(pts[0].x, pts[0].y);
        // Convert world radius to pixel radius
        const edgeC = this.wc(pts[0].x + route.terminalSize / 2, pts[0].y);
        const rPx = Math.abs(edgeC.x - tc.x);
        ctx.beginPath();
        ctx.arc(tc.x, tc.y, rPx, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // route number label offset from first point, perpendicular to first segment
      const p0c = this.wc(pts[0].x, pts[0].y);
      const p1c = this.wc(pts[1].x, pts[1].y);
      const dx = p1c.x - p0c.x, dy = p1c.y - p0c.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      // perpendicular unit vector (rotated 90° CCW)
      const nx = -dy / len, ny = dx / len;
      const off = 10;
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(route.id, p0c.x + nx * off, p0c.y + ny * off);
    }

    ctx.restore();
  }

  // ── Polyline + t-marker ───────────────────────────────────────────────────
  drawPolyline(points, t) {
    const { ctx, W, H } = this;

    if (points.length === 0) return;

    // Draw single point
    if (points.length === 1) {
      const c = this.wc(points[0].x, points[0].y);
      ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#534AB7'; ctx.fill();
      return;
    }

    // Line segments
    ctx.beginPath();
    const c0 = this.wc(points[0].x, points[0].y);
    ctx.moveTo(c0.x, c0.y);
    for (let i = 1; i < points.length; i++) {
      const c = this.wc(points[i].x, points[i].y);
      ctx.lineTo(c.x, c.y);
    }
    ctx.strokeStyle = 'rgba(128,128,128,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Vertex dots
    for (const p of points) {
      const c = this.wc(p.x, p.y);
      ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#534AB7'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // t-marker
    const pt = polylinePoint(points, t);
    if (!pt) return pt;

    const i = pt.segIndex;
    if (points[i] && points[i + 1]) {
      const ca = this.wc(points[i].x, points[i].y);
      const cb = this.wc(points[i + 1].x, points[i + 1].y);
      ctx.beginPath(); ctx.moveTo(ca.x, ca.y); ctx.lineTo(cb.x, cb.y);
      ctx.strokeStyle = '#EF9F27'; ctx.lineWidth = 2.5; ctx.stroke();
    }

    const cp = this.wc(pt.x, pt.y);
    ctx.beginPath(); ctx.arc(cp.x, cp.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239,159,39,0.2)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cp.x, cp.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#EF9F27'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();

    return pt;
  }

  // ── Full frame ────────────────────────────────────────────────────────────
  render(points, t, routeState) {
    this.ctx.clearRect(0, 0, this.W, this.H);
    this.drawGrid();
    this.drawPolygon();
    this.drawCatapults();
    this.drawJBDs();
    this.drawCrew(routeState);
    this.drawTakeoffRoutes(routeState, t);
    return this.drawPolyline(points, t);
  }
}
