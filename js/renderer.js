/**
 * Canvas renderer — draws grid, reference polygon, polyline, vertices, and
 * the arc-length ratio marker.
 */
import { getDeck } from './polygon-data.js';
import { polylinePoint } from './polyline.js';
import { CREW_MEMBERS, LIVERY_COLOURS } from './crew-data.js';
import { CREW_ROUTES, CREW_ACTIVE_LINKS } from './crew-routes-data.js';
import { CATAPULT_COLORS, LANDING_COLOR } from './route-data.js';
import { TAKEOFF_TASKS, PARKING_TASKS, TAKEOFF_USED_ROUTE_IDS, NON_TAKEOFF_LINKS } from './takeoff-tasks-data.js';
import { CATAPULT_CREWS, CATAPULT_MEMBER_COLORS, CATAPULT_PHASES, findPhaseRoute, memberLocalTs, interpolateByArcLength } from './catapult-crew-data.js';

export class Renderer {
  /** @param {HTMLCanvasElement} canvas  @param {import('./viewport.js').Viewport} viewport */
  constructor(canvas, viewport) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewport = viewport;

    // Load F-14 silhouette for route progress overlay
    this._f14Img = new Image();
    this._f14Img.src = 'assets/f14-folded.svg?v=' + Date.now();
    this._f14Ready = false;
    this._f14Img.onload = () => { this._f14Ready = true; };
    // SVG dimensions: nose at x≈724, tail at x≈93, centerline y≈635
    // Real F-14 length ≈ 19.1m. SVG length ≈ 631px. Scale: 19.1/631 ≈ 0.0303 world units/px
    this._f14Scale = 19.1 / 631 * 0.98;
    this._f14CenterX = (724 + 93) / 2;  // SVG center X
    this._f14CenterY = 635;              // SVG centerline Y
  }

  /** CSS pixel dimensions (canvas buffer may be larger on high-DPI). */
  get W() { return this.canvas.width / (this.dpr || 1); }
  get H() { return this.canvas.height / (this.dpr || 1); }

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

    // Validation warning (set externally)
    let warnY = H - 6;
    if (this.validationWarning) {
      ctx.fillStyle = this.validationWarningLevel === 'warning'
        ? 'rgba(200,140,40,0.85)' : 'rgba(192,57,43,0.85)';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this.validationWarning, 8, warnY);
      warnY -= 16;
    }
    // Cat crew conflict warning (set externally)
    if (this.catCrewWarning) {
      ctx.fillStyle = 'rgba(200,140,40,0.85)';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this.catCrewWarning, 8, warnY);
    }

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

    ctx.restore();
  }

  // ── Catapult rectangles ──────────────────────────────────────────────────
  // Each: center (x,y), azimuth in degrees, length, width
  static CATAPULTS = [
    { name: 'Cat 1', cx:  59.954,  cy:  18.020, azDeg: 354.3,   len: 102.6, wid: 2.0 },
    { name: 'Cat 2', cx:  58.800,  cy:  -3.752, azDeg: 358.0,   len: 102.5, wid: 2.0 },
    { name: 'Cat 3', cx: -37.374,  cy: -20.162, azDeg: 355.002, len: 112.0, wid: 2.0 },
    { name: 'Cat 4', cx: -56.176,  cy: -32.900, azDeg: 359.957, len: 108.0, wid: 2.0 },
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

    // Fixed marker circle at (78.2, 30.0), diameter 0.5
    const mc = this.wc(78.2, 30.0);
    const refO = this.wc(0, 0);
    const refR = this.wc(1, 0);
    const mr = 0.25 * Math.abs(refR.x - refO.x);
    ctx.beginPath();
    ctx.arc(mc.x, mc.y, mr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200,60,60,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,60,60,0.7)';
    ctx.stroke();

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

  // ── Deck markings (foul lines, landing area, elevators) ─────────────────

  // Angled deck centerline: 9.5° off ship axis, anchored at round-down (-159, 9)
  // Slope: dy/dx = -0.165
  static LANDING_CENTERLINE = [
    { x: -159, y: 9.0 }, { x: -120, y: 2.6 }, { x: -80, y: -4.0 },
    { x: -40, y: -10.6 }, { x: 0, y: -17.2 }, { x: 40, y: -23.8 }, { x: 77, y: -30.0 },
  ];

  // Landing area outline (24m wide, 12m each side of centerline)
  // Perpendicular offset at 9.5°: (±1.98, ±11.84)
  static LANDING_AREA = [
    // Port edge (stern to bow)
    { x: -157.0, y: 20.8 }, { x: -118.0, y: 14.4 }, { x: -78.0, y: 7.8 },
    { x: -38.0, y: 1.2 }, { x: 2.0, y: -5.4 }, { x: 42.0, y: -12.0 }, { x: 90.6, y: -20.0 },
    // Starboard edge (bow to stern)
    { x: 63.88, y: -40.0 }, { x: 38.0, y: -35.7 }, { x: -2.0, y: -29.1 },
    { x: -42.0, y: -22.5 }, { x: -82.0, y: -15.9 }, { x: -122.0, y: -9.3 }, { x: -161.0, y: -2.8 },
  ];

  // Foul lines
  static FOUL_LINE_1 = [
    { x: -147.7, y: 22.3 }, { x: -110.6, y: 16.3 }, { x: -105.4, y: 19.6 },
    { x: -68.9, y: 13.6 }, { x: -7.6, y: -1.0 }, { x: 104.2, y: -18.0 },
  ];
  static FOUL_LINE_2 = [
    { x: 43.6, y: 9.7 }, { x: 166.8, y: 4.9 },
  ];
  static FOUL_LINE_3 = [
    { x: 43.5, y: 6.5 }, { x: 165.1, y: -5.1 },
  ];
  static FOUL_LINE_4 = [
    { x: 43.4, y: 32.6 }, { x: 78.9, y: 29.1 },
  ];

  // Elevators
  static ELEVATORS = [
    { name: 'El1', pts: [
      { x: 16.6, y: 37.0 }, { x: 16.6, y: 21.5 }, { x: 37.8, y: 21.5 },
      { x: 37.8, y: 29.0 }, { x: 42.3, y: 35.8 }, { x: 42.3, y: 37.0 },
    ]},
    { name: 'El2', pts: [
      { x: -30.7, y: 37.0 }, { x: -30.7, y: 21.5 }, { x: -9.5, y: 21.5 },
      { x: -9.5, y: 29.0 }, { x: -5.0, y: 35.8 }, { x: -5.0, y: 37.0 },
    ]},
    { name: 'El3', pts: [
      { x: -109.5, y: 37.0 }, { x: -109.5, y: 21.5 }, { x: -88.3, y: 21.5 },
      { x: -88.3, y: 29.0 }, { x: -83.8, y: 35.8 }, { x: -83.8, y: 37.0 },
    ]},
    { name: 'El4', pts: [
      { x: -116.0, y: -37.0 }, { x: -116.0, y: -21.5 }, { x: -94.8, y: -21.5 },
      { x: -94.8, y: -29.0 }, { x: -90.3, y: -35.8 }, { x: -90.3, y: -37.0 },
    ]},
  ];

  drawDeckMarkings() {
    const { ctx } = this;
    ctx.save();
    const refO = this.wc(0, 0);
    const refR = this.wc(1, 0);
    const pxPerWorld = Math.abs(refR.x - refO.x);

    // Landing area outline (light fill + border)
    ctx.beginPath();
    const la0 = this.wc(Renderer.LANDING_AREA[0].x, Renderer.LANDING_AREA[0].y);
    ctx.moveTo(la0.x, la0.y);
    for (let i = 1; i < Renderer.LANDING_AREA.length; i++) {
      const p = this.wc(Renderer.LANDING_AREA[i].x, Renderer.LANDING_AREA[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(140,140,140,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,140,140,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Angled deck centerline — 18 segments alternating yellow/white, no gaps
    {
      const clPts = Renderer.LANDING_CENTERLINE;
      // Build dense point list by interpolating along polyline at 18 equal divisions
      let totalLen = 0;
      const cumLen = [0];
      for (let i = 1; i < clPts.length; i++) {
        const dx = clPts[i].x - clPts[i - 1].x;
        const dy = clPts[i].y - clPts[i - 1].y;
        totalLen += Math.sqrt(dx * dx + dy * dy);
        cumLen.push(totalLen);
      }
      // Interpolate a point at a given arc-length distance
      const ptAt = (dist) => {
        for (let i = 1; i < cumLen.length; i++) {
          if (dist <= cumLen[i]) {
            const t = (dist - cumLen[i - 1]) / (cumLen[i] - cumLen[i - 1] || 1);
            return {
              x: clPts[i - 1].x + t * (clPts[i].x - clPts[i - 1].x),
              y: clPts[i - 1].y + t * (clPts[i].y - clPts[i - 1].y),
            };
          }
        }
        return clPts[clPts.length - 1];
      };
      const nDashes = 18;
      const colors = ['rgba(232,200,64,0.4)', 'rgba(255,255,255,0.4)']; // yellow, white
      ctx.lineWidth = 1.0 * pxPerWorld; // 1m wide in world space
      ctx.lineCap = 'butt';
      for (let d = 0; d < nDashes; d++) {
        const p0 = ptAt(d * totalLen / nDashes);
        const p1 = ptAt((d + 1) * totalLen / nDashes);
        const c0 = this.wc(p0.x, p0.y);
        const c1 = this.wc(p1.x, p1.y);
        ctx.beginPath();
        ctx.moveTo(c0.x, c0.y);
        ctx.lineTo(c1.x, c1.y);
        ctx.strokeStyle = colors[d % 2];
        ctx.stroke();
      }
    }

    // Foul lines (dashed red/white, world-space width)
    for (const foul of [Renderer.FOUL_LINE_1, Renderer.FOUL_LINE_2, Renderer.FOUL_LINE_3, Renderer.FOUL_LINE_4]) {
      const dashWorld = 1.65 * pxPerWorld; // 1.65m dashes
      ctx.lineWidth = 0.2 * pxPerWorld;
      ctx.lineCap = 'butt';
      // Red dashes
      ctx.beginPath();
      const f0 = this.wc(foul[0].x, foul[0].y);
      ctx.moveTo(f0.x, f0.y);
      for (let i = 1; i < foul.length; i++) {
        const p = this.wc(foul[i].x, foul[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = 'rgba(255,60,60,0.3)';
      ctx.setLineDash([dashWorld, dashWorld]);
      ctx.stroke();
      // White dashes (offset)
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineDashOffset = dashWorld;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }

    // Elevators
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const elev of Renderer.ELEVATORS) {
      const pts = elev.pts.map(p => this.wc(p.x, p.y));
      // Fill with closed path
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(180,160,100,0.08)';
      ctx.fill();
      // Stroke open path (skip closing segment)
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      const elevDash = 0.825 * pxPerWorld;
      ctx.lineWidth = 0.2 * pxPerWorld;
      ctx.lineCap = 'butt';
      // Yellow dashes
      ctx.strokeStyle = 'rgba(232,200,64,0.3)';
      ctx.setLineDash([elevDash, elevDash]);
      ctx.stroke();
      // Red dashes (offset)
      ctx.strokeStyle = 'rgba(255,60,60,0.3)';
      ctx.lineDashOffset = elevDash;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      ctx.fillStyle = 'rgba(180,160,100,0.7)';
      ctx.fillText(elev.name, cx, cy);
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

      // Selection ring (crew idle edit mode)
      if (rs && rs.crewEditMode && rs.selectedCrewType === 'idle' && rs.selectedCrewIdx === mi) {
        const ringR = r + 10;
        ctx.beginPath();
        ctx.arc(c.x, c.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = pal.fill;
        ctx.lineWidth = 2;
        ctx.stroke();
        // Angle tick on ring
        const tickInner = ringR - 3;
        const tickOuter = ringR + 5;
        const tx1 = c.x + Math.cos(hdgRad) * tickInner;
        const ty1 = c.y - Math.sin(hdgRad) * tickInner;
        const tx2 = c.x + Math.cos(hdgRad) * tickOuter;
        const ty2 = c.y - Math.sin(hdgRad) * tickOuter;
        ctx.beginPath();
        ctx.moveTo(tx1, ty1);
        ctx.lineTo(tx2, ty2);
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // label tag — offset away from heading arrow to avoid masking it
      const label = m.name;
      ctx.font = 'bold 10px monospace';
      const tw = ctx.measureText(label).width;
      const pad = 3;
      const tagW = tw + pad * 2;
      const tagH = 13;

      // Place label opposite the arrow: pick the side (above/below) that is
      // farther from the arrow tip direction
      const arrowDy = -Math.sin(hdgRad); // arrow y-direction in canvas (negative = up)
      const below = arrowDy < 0; // arrow points up → place label below, and vice versa
      const tagY = below ? c.y + r + 4 : c.y - r - 4 - tagH;
      const tagX = c.x - tagW / 2; // centered on dot

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.strokeStyle = pal.stroke;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagW, tagH, 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = pal.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, c.x, tagY + tagH / 2);

      // index number centered above/below name tag
      const idxY = below ? tagY + tagH + 1 : tagY - 2;
      ctx.fillStyle = pal.stroke;
      ctx.textAlign = 'center';
      ctx.textBaseline = below ? 'top' : 'bottom';
      ctx.fillText(`${mi}`, c.x, idxY);
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
      const selected = rs.selectedRouteType === 'takeoff' && rs.selectedRoute === i;

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

          // F-14 silhouette overlay
          this._drawF14Overlay(ctx, rpt, pts, false, t);
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

    // Parked planes at start of visible takeoff routes
    if (rs.showParkedTakeoff && this._f14Ready) {
      for (let i = 0; i < rs.takeoffRoutes.length; i++) {
        if (!rs.isTakeoffRouteVisible(i)) continue;
        if (rs.selectedRouteType === 'takeoff' && rs.selectedRoute === i) continue;
        const route = rs.takeoffRoutes[i];
        const pts = route.points;
        if (pts.length < 2) continue;
        const rpt = polylinePoint(pts, 0);
        if (rpt) this._drawF14Overlay(ctx, rpt, pts, false, 0, 0.2);
      }
    }

    ctx.restore();
  }

  // ── Landing taxi routes ────────────────────────────────────────────────────
  drawLandingRoutes(rs, t) {
    if (!rs || !rs.landingVisible) return;
    const { ctx } = this;
    ctx.save();

    for (let i = 0; i < rs.landingRoutes.length; i++) {
      if (!rs.isLandingRouteVisible(i)) continue;
      const route = rs.landingRoutes[i];
      const pts = route.points;
      if (pts.length < 2) continue;

      const color = LANDING_COLOR;
      const selected = rs.selectedRouteType === 'landing' && rs.selectedRoute === i;

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

      // waypoint markers (circles for landing to distinguish from takeoff squares)
      const sz = selected ? 5 : 3;
      for (let j = 0; j < pts.length; j++) {
        const p = this.wc(pts[j].x, pts[j].y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        if (selected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.stroke();
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

          // F-14 silhouette overlay
          this._drawF14Overlay(ctx, rpt, pts, true, t);
        }
      }

      // route number label offset from last point
      const lastPt = pts[pts.length - 1];
      const prevPt = pts[pts.length - 2];
      const p0c = this.wc(lastPt.x, lastPt.y);
      const p1c = this.wc(prevPt.x, prevPt.y);
      const dx = p0c.x - p1c.x, dy = p0c.y - p1c.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const off = 10;
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(route.id, p0c.x + nx * off, p0c.y + ny * off);
    }

    // Parked planes at end of visible landing routes
    if (rs.showParkedLanding && this._f14Ready) {
      for (let i = 0; i < rs.landingRoutes.length; i++) {
        if (!rs.isLandingRouteVisible(i)) continue;
        if (rs.selectedRouteType === 'landing' && rs.selectedRoute === i) continue;
        const route = rs.landingRoutes[i];
        const pts = route.points;
        if (pts.length < 2) continue;
        const rpt = polylinePoint(pts, 1);
        if (rpt) this._drawF14Overlay(ctx, rpt, pts, true, 1, 0.2);
      }
    }

    ctx.restore();
  }

  // ── Crew active (marshalling) positions ────────────────────────────────────
  _drawIndexLabel(ctx, cx, cy, r, label, pal) {
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = pal.stroke || '#777';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx + r + 3, cy);
  }

  /** Draw F-14 silhouette at the route progress marker position. */
  _drawF14Overlay(ctx, rpt, pts, landing, t, alpha) {
    if (!this._f14Ready) { console.warn('F14 image not ready'); return; }

    const si = rpt.segIndex;
    const dx = pts[si + 1].x - pts[si].x;
    const dy = pts[si + 1].y - pts[si].y;
    let heading = Math.atan2(dy, dx); // radians, 0 = right (nose direction)
    // At t=1.0 on landing routes, plane has parked — rotate 180°
    if (landing && t >= 1.0) heading += Math.PI;

    // World-space dimensions of the full SVG image
    const imgW = 847 * this._f14Scale;
    const imgH = 1200 * this._f14Scale;

    // Pixels per world unit at this position
    const refR = this.wc(rpt.x + 1, rpt.y);
    const refO = this.wc(rpt.x, rpt.y);
    const pxPerWorld = Math.abs(refR.x - refO.x);

    const drawW = imgW * pxPerWorld;
    const drawH = imgH * pxPerWorld;

    // Offset from SVG top-left to aircraft center (in canvas pixels)
    const offsetX = this._f14CenterX * this._f14Scale * pxPerWorld;
    const offsetY = this._f14CenterY * this._f14Scale * pxPerWorld;

    const cp = this.wc(rpt.x, rpt.y);
    ctx.save();
    ctx.translate(cp.x, cp.y);
    ctx.rotate(heading);
    ctx.globalAlpha = alpha != null ? alpha : 0.5;
    ctx.drawImage(this._f14Img, -offsetX + 0.05 * drawW, -offsetY, drawW, drawH);
    ctx.globalAlpha = 1.0;
    ctx.restore();
  }

  _drawActivePoint(ctx, cx, cy, angle, pal, r) {
    // Dot
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = pal.fill;
    ctx.globalAlpha = 0.6;
    ctx.fill();
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Heading arrow
    const arrowLen = 10;
    const ax = cx + Math.cos(angle) * arrowLen;
    const ay = cy - Math.sin(angle) * arrowLen;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ax, ay);
    ctx.strokeStyle = pal.stroke;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

  drawCrewActivePositions(rs) {
    const { ctx } = this;
    ctx.save();
    const r = 3;  // marker radius in px

    // Color only when takeoff routes are actually visible or being edited
    const anyTakeoffVisible = rs && rs.takeoffRouteVisible && rs.takeoffRouteVisible.some(Boolean);
    const editingTakeoff = rs && rs.selectedRouteType === 'takeoff' && rs.selectedRoute >= 0;
    const editingActiveCrew = rs && rs.crewEditMode;
    const useColor = anyTakeoffVisible || editingTakeoff || editingActiveCrew;

    for (const link of CREW_ACTIVE_LINKS) {
      const mi = link.memberIdx;
      if (rs && !rs.crewVisible[mi]) continue;
      if (rs && !rs.crewActiveVisible[link.routeId]) continue;

      const member = CREW_MEMBERS[mi];
      const route = CREW_ROUTES[link.routeId];
      if (!member || !route) continue;

      const pal = useColor ? (LIVERY_COLOURS[member.livery] || LIVERY_COLOURS.yellow) : { fill: '#999', stroke: '#777' };
      const idleC = this.wc(member.x, member.y);

      if (route.points && route.points.length > 1) {
        // Multi-point route: draw line from idle to first point,
        // then dashed gray lines between points, with dots at each.
        const firstC = this.wc(route.points[0].x, route.points[0].y);

        // Idle → first point
        ctx.beginPath();
        ctx.moveTo(idleC.x, idleC.y);
        ctx.lineTo(firstC.x, firstC.y);
        ctx.strokeStyle = 'rgba(120,120,120,0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        this._drawActivePoint(ctx, firstC.x, firstC.y, route.points[0].angle, pal, r);
        this._drawIndexLabel(ctx, firstC.x, firstC.y, r, `${link.routeId}.0`, pal);

        // Lines between consecutive points + dots
        for (let j = 1; j < route.points.length; j++) {
          const prevC = this.wc(route.points[j - 1].x, route.points[j - 1].y);
          const curC = this.wc(route.points[j].x, route.points[j].y);

          ctx.beginPath();
          ctx.moveTo(prevC.x, prevC.y);
          ctx.lineTo(curC.x, curC.y);
          ctx.strokeStyle = 'rgba(120,120,120,0.55)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);

          this._drawActivePoint(ctx, curC.x, curC.y, route.points[j].angle, pal, r);
          this._drawIndexLabel(ctx, curC.x, curC.y, r, `${link.routeId}.${j}`, pal);
        }

        // Selection ring for multi-point active crew edit mode
        if (rs && rs.crewEditMode && rs.selectedCrewType === 'active' && rs.selectedCrewIdx === link.routeId) {
          const selPtIdx = rs.selectedCrewPointIdx >= 0 ? rs.selectedCrewPointIdx : route.points.length - 1;
          const selPt = route.points[selPtIdx];
          if (selPt) {
            const selC = this.wc(selPt.x, selPt.y);
            const ringR = r + 10;
            const ang = selPt.angle ?? 0;
            ctx.beginPath();
            ctx.arc(selC.x, selC.y, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = pal.fill;
            ctx.lineWidth = 2;
            ctx.stroke();
            // Angle tick on ring
            const tickInner = ringR - 3;
            const tickOuter = ringR + 5;
            ctx.beginPath();
            ctx.moveTo(selC.x + Math.cos(ang) * tickInner, selC.y - Math.sin(ang) * tickInner);
            ctx.lineTo(selC.x + Math.cos(ang) * tickOuter, selC.y - Math.sin(ang) * tickOuter);
            ctx.strokeStyle = pal.stroke;
            ctx.lineWidth = 2.5;
            ctx.stroke();
          }
        }
      } else {
        // Single-point route
        const activeC = this.wc(route.x, route.y);

        // Gray line from idle to active
        ctx.beginPath();
        ctx.moveTo(idleC.x, idleC.y);
        ctx.lineTo(activeC.x, activeC.y);
        ctx.strokeStyle = 'rgba(120,120,120,0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        this._drawActivePoint(ctx, activeC.x, activeC.y, route.angle, pal, r);

        // Selection ring for active crew edit mode
        if (rs && rs.crewEditMode && rs.selectedCrewType === 'active' && rs.selectedCrewIdx === link.routeId) {
          const ringR = r + 10;
          const ang = route.angle ?? 0;
          ctx.beginPath();
          ctx.arc(activeC.x, activeC.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = pal.fill;
          ctx.lineWidth = 2;
          ctx.stroke();
          // Angle tick on ring
          const tickInner = ringR - 3;
          const tickOuter = ringR + 5;
          ctx.beginPath();
          ctx.moveTo(activeC.x + Math.cos(ang) * tickInner, activeC.y - Math.sin(ang) * tickInner);
          ctx.lineTo(activeC.x + Math.cos(ang) * tickOuter, activeC.y - Math.sin(ang) * tickOuter);
          ctx.strokeStyle = pal.stroke;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

        // Route index label
        this._drawIndexLabel(ctx, activeC.x, activeC.y, r, `${link.routeId}`, pal);
      }
    }

    ctx.restore();
  }

  // ── Parking crew route positions (colored when landing visible, gray otherwise) ─
  drawUnusedRoutePositions(rs) {
    if (!rs) return;
    const anyTakeoffVisible = rs.takeoffRouteVisible && rs.takeoffRouteVisible.some(Boolean);
    const editingTakeoff = rs.selectedRouteType === 'takeoff' && rs.selectedRoute >= 0;
    const anyLandingVisible = rs.landingVisible && rs.landingRouteVisible && rs.landingRouteVisible.some(Boolean);
    const editingLanding = rs.selectedRouteType === 'landing' && rs.selectedRoute >= 0;
    const landingActive = anyLandingVisible || editingLanding;

    // Color mode: use member livery colors when landing is active
    const useColor = landingActive;
    const { ctx } = this;
    ctx.save();
    const r = 3;

    for (const link of NON_TAKEOFF_LINKS) {
      const mi = link.memberId;
      if (!rs.crewVisible[mi]) continue;
      if (!rs.crewActiveVisible[link.routeId]) continue;

      const member = CREW_MEMBERS[mi];
      const route = CREW_ROUTES[link.routeId];
      if (!member || !route) continue;

      const pal = useColor ? (LIVERY_COLOURS[member.livery] || LIVERY_COLOURS.yellow) : null;
      const idleC = this.wc(member.x, member.y);
      const pts = route.points || [route];

      // Dashed line from idle to first point
      const firstC = this.wc(pts[0].x, pts[0].y);
      ctx.beginPath();
      ctx.moveTo(idleC.x, idleC.y);
      ctx.lineTo(firstC.x, firstC.y);
      ctx.strokeStyle = useColor ? 'rgba(120,120,120,0.55)' : 'rgba(160,160,160,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw each point
      for (let j = 0; j < pts.length; j++) {
        const c = this.wc(pts[j].x, pts[j].y);

        // Connect consecutive points
        if (j > 0) {
          const prevC = this.wc(pts[j - 1].x, pts[j - 1].y);
          ctx.beginPath();
          ctx.moveTo(prevC.x, prevC.y);
          ctx.lineTo(c.x, c.y);
          ctx.strokeStyle = useColor ? 'rgba(120,120,120,0.55)' : 'rgba(160,160,160,0.35)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (useColor) {
          this._drawActivePoint(ctx, c.x, c.y, pts[j].angle, pal, r);
        } else {
          // Gray dot
          ctx.beginPath();
          ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(160,160,160,0.5)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(120,120,120,0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Gray heading arrow
          const arrowLen = 8;
          const ax = c.x + Math.cos(pts[j].angle) * arrowLen;
          const ay = c.y - Math.sin(pts[j].angle) * arrowLen;
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(ax, ay);
          ctx.strokeStyle = 'rgba(140,140,140,0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Route index labels at each point
      const labelPal = pal || { stroke: '#999' };
      for (let j = 0; j < pts.length; j++) {
        const lc = this.wc(pts[j].x, pts[j].y);
        const lbl = pts.length > 1 ? `${link.routeId}.${j}` : `${link.routeId}`;
        this._drawIndexLabel(ctx, lc.x, lc.y, r, lbl, labelPal);
      }

      // Selection ring for crew edit mode on unused routes
      if (rs.crewEditMode && rs.selectedCrewType === 'active' && rs.selectedCrewIdx === link.routeId) {
        const selPtIdx = rs.selectedCrewPointIdx >= 0 ? rs.selectedCrewPointIdx : pts.length - 1;
        const selPt = pts[selPtIdx];
        if (selPt) {
          const selC = this.wc(selPt.x, selPt.y);
          const ringR = r + 10;
          const ang = selPt.angle ?? 0;
          const ringPal = pal || { fill: '#999', stroke: '#777' };
          ctx.beginPath();
          ctx.arc(selC.x, selC.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = ringPal.fill;
          ctx.lineWidth = 2;
          ctx.stroke();
          // Angle tick on ring
          const tickInner = ringR - 3;
          const tickOuter = ringR + 5;
          ctx.beginPath();
          ctx.moveTo(selC.x + Math.cos(ang) * tickInner, selC.y - Math.sin(ang) * tickInner);
          ctx.lineTo(selC.x + Math.cos(ang) * tickOuter, selC.y - Math.sin(ang) * tickOuter);
          ctx.strokeStyle = ringPal.stroke;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  // ── Orphaned routes (not in any takeoff or parking task) ──────────────────
  drawOrphanedRoutePositions(rs) {
    if (!rs) return;
    const drawn = new Set();
    for (const link of CREW_ACTIVE_LINKS) drawn.add(link.routeId);
    for (const link of NON_TAKEOFF_LINKS) drawn.add(link.routeId);

    const { ctx } = this;
    ctx.save();
    const r = 3;

    for (let ri = 0; ri < CREW_ROUTES.length; ri++) {
      if (drawn.has(ri)) continue;
      if (rs.crewActiveVisible && !rs.crewActiveVisible[ri]) continue;
      const route = CREW_ROUTES[ri];
      if (!route) continue;

      const pts = route.points || [route];
      for (let j = 0; j < pts.length; j++) {
        const c = this.wc(pts[j].x, pts[j].y);

        if (j > 0) {
          const prevC = this.wc(pts[j - 1].x, pts[j - 1].y);
          ctx.beginPath();
          ctx.moveTo(prevC.x, prevC.y);
          ctx.lineTo(c.x, c.y);
          ctx.strokeStyle = 'rgba(160,160,160,0.35)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(180,180,180,0.5)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(140,140,140,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const arrowLen = 8;
        const ang = pts[j].angle ?? 0;
        const ax = c.x + Math.cos(ang) * arrowLen;
        const ay = c.y - Math.sin(ang) * arrowLen;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(ax, ay);
        ctx.strokeStyle = 'rgba(120,120,120,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      for (let j = 0; j < pts.length; j++) {
        const lc = this.wc(pts[j].x, pts[j].y);
        const lbl = pts.length > 1 ? `${ri}.${j}` : `${ri}`;
        this._drawIndexLabel(ctx, lc.x, lc.y, r, lbl, { stroke: '#aaa' });
      }

      if (rs.crewEditMode && rs.selectedCrewType === 'active' && rs.selectedCrewIdx === ri) {
        const selPtIdx = rs.selectedCrewPointIdx >= 0 ? rs.selectedCrewPointIdx : pts.length - 1;
        const selPt = pts[selPtIdx];
        if (selPt) {
          const selC = this.wc(selPt.x, selPt.y);
          const ringR = r + 10;
          const a = selPt.angle ?? 0;
          ctx.beginPath();
          ctx.arc(selC.x, selC.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = '#999';
          ctx.lineWidth = 2;
          ctx.stroke();
          const tickInner = ringR - 3;
          const tickOuter = ringR + 5;
          ctx.beginPath();
          ctx.moveTo(selC.x + Math.cos(a) * tickInner, selC.y - Math.sin(a) * tickInner);
          ctx.lineTo(selC.x + Math.cos(a) * tickOuter, selC.y - Math.sin(a) * tickOuter);
          ctx.strokeStyle = '#777';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  // ── Active crew connection line (progress-based) ───────────────────────────

  /** Resolve a crew route/member to a world-space {x, y} target. */
  _crewTarget(routeId, memberId) {
    if (routeId >= 0) {
      const crewRoute = CREW_ROUTES[routeId];
      if (!crewRoute) return null;
      const pos = crewRoute.points
        ? crewRoute.points[crewRoute.points.length - 1]
        : crewRoute;
      return { x: pos.x, y: pos.y };
    }
    // routeId -1: use member's idle position
    if (memberId != null) {
      const member = CREW_MEMBERS[memberId];
      if (member) return { x: member.x, y: member.y };
    }
    return null;
  }

  /** Find the controlling step index at progress t (-1 = brown, null = catapult). */
  _controllingStep(task, t) {
    if (t === 0) return -1; // brown
    for (let i = 0; i < task.steps.length; i++) {
      if (t < task.steps[i].progress) return i;
    }
    return null; // past last step → catapult
  }

  drawActiveCrewLines(rs) {
    if (!rs || rs.selectedRouteType !== 'takeoff') return;
    const ri = rs.selectedRoute;
    if (ri < 0 || ri >= TAKEOFF_TASKS.length) return;

    const task = TAKEOFF_TASKS[ri];
    const route = rs.takeoffRoutes[ri];
    if (!route || route.points.length < 2) return;

    const t = rs.t;
    const { ctx } = this;
    ctx.save();

    const controllingIdx = this._controllingStep(task, t);
    const taskEdit = !!rs.taskEditActive;

    // In task edit mode, draw all static handoff lines in gray
    // Each line starts from where the step RECEIVES control (initial handoff)
    if (taskEdit) {
      for (let i = 0; i < task.steps.length; i++) {
        if (i === controllingIdx) continue; // drawn as orange below
        const step = task.steps[i];
        const target = this._crewTarget(step.routeId, step.memberId);
        if (!target) continue;
        // Initial position: where this step receives control
        const initT = (i === 0) ? 0 : task.steps[i - 1].progress;
        const handoffPt = polylinePoint(route.points, initT);
        if (!handoffPt) continue;
        const hc = this.wc(handoffPt.x, handoffPt.y);
        const tc = this.wc(target.x, target.y);
        ctx.strokeStyle = 'rgba(130,130,130,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hc.x, hc.y);
        ctx.lineTo(tc.x, tc.y);
        ctx.stroke();
      }
      // Brown line (from route start to brown crew position)
      if (controllingIdx !== -1 && task.brownRouteId != null) {
        const target = this._crewTarget(task.brownRouteId, task.brownId);
        if (target) {
          const startPt = polylinePoint(route.points, 0);
          if (startPt) {
            const sc = this.wc(startPt.x, startPt.y);
            const tc = this.wc(target.x, target.y);
            ctx.strokeStyle = 'rgba(130,130,130,0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sc.x, sc.y);
            ctx.lineTo(tc.x, tc.y);
            ctx.stroke();
          }
        }
      }
    }

    // Draw the controlling line (orange in task edit, gray otherwise)
    const markerPt = polylinePoint(route.points, t);
    if (!markerPt) { ctx.restore(); return; }
    const markerC = this.wc(markerPt.x, markerPt.y);

    let target = null;
    if (controllingIdx === -1) {
      // Brown is controlling
      target = this._crewTarget(task.brownRouteId, task.brownId);
    } else if (controllingIdx !== null) {
      const cs = task.steps[controllingIdx];
      target = this._crewTarget(cs.routeId, cs.memberId);
    } else {
      // Past last step → director's occupy_cat position for this catapult
      const catIdx = route.runwayIdx - 1;
      const crew = CATAPULT_CREWS[catIdx];
      if (crew) {
        const director = crew.members.find(m => m.name && m.name.includes('director'));
        if (director) {
          const occupyPhase = CATAPULT_PHASES.find(p => p.id === 'occupy_cat');
          const occupyRoute = occupyPhase && findPhaseRoute(director, occupyPhase);
          if (occupyRoute && occupyRoute.points.length > 0) {
            const lastPt = occupyRoute.points[occupyRoute.points.length - 1];
            target = { x: lastPt.x, y: lastPt.y };
          }
        }
      }
      // Fallback to catapult center if no director data available
      if (!target) {
        const cat = Renderer.CATAPULTS[catIdx];
        if (cat) target = { x: cat.cx, y: cat.cy };
      }
    }

    if (target) {
      const tc = this.wc(target.x, target.y);
      ctx.strokeStyle = taskEdit ? 'rgba(224,128,48,0.8)' : 'rgba(130,130,130,0.6)';
      ctx.lineWidth = taskEdit ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(markerC.x, markerC.y);
      ctx.lineTo(tc.x, tc.y);
      ctx.stroke();
    }

    // Circles around crew targets in task edit mode
    if (taskEdit) {
      const selIdx = (rs.selectedHandoff != null) ? rs.selectedHandoff : -1;
      // Also highlight the assign-mode step with blue
      const assignIdx = rs.assignMode ? rs.assignStepIdx : -999;
      const assignBrown = rs.assignMode && rs.assignIsBrown;
      const circleR = 12;

      const isBlue = (stepIdx, isBrown) => {
        if (isBrown) return assignBrown;
        return stepIdx === selIdx || stepIdx === assignIdx;
      };

      const drawCircle = (tgt, blue) => {
        if (!tgt) return;
        const c = this.wc(tgt.x, tgt.y);
        ctx.beginPath();
        ctx.arc(c.x, c.y, circleR, 0, Math.PI * 2);
        ctx.strokeStyle = blue ? 'rgba(60,130,240,0.9)' : 'rgba(150,150,150,0.5)';
        ctx.lineWidth = blue ? 2.5 : 1.5;
        ctx.stroke();
      };

      // Brown crew circle
      if (task.brownId != null) {
        drawCircle(this._crewTarget(task.brownRouteId, task.brownId), isBlue(-1, true));
      }
      // Step crew circles
      for (let i = 0; i < task.steps.length; i++) {
        const step = task.steps[i];
        drawCircle(this._crewTarget(step.routeId, step.memberId), isBlue(i, false));
      }
    }

    ctx.restore();
  }

  // ── Active parking crew connection line (progress-based) ──────────────────

  /** Resolve a parking step's target position (handles routeId -1 → idle). */
  _parkingTarget(step) {
    return this._crewTarget(step.routeId, step.memberId);
  }

  /** Find controlling step index for parking task at progress t.
   *  Returns step index (0-based), or -1 if past all steps (last step still controls). */
  _parkingControllingStep(task, t) {
    for (let i = 0; i < task.steps.length; i++) {
      if (t < task.steps[i].progress) return i;
    }
    // Past last step → last step still controls
    return task.steps.length > 0 ? task.steps.length - 1 : null;
  }

  drawActiveParkingCrewLines(rs) {
    if (!rs || rs.selectedRouteType !== 'landing') return;
    const ri = rs.selectedRoute;
    if (ri < 0 || ri >= PARKING_TASKS.length) return;

    const task = PARKING_TASKS[ri];
    const route = rs.landingRoutes[ri];
    if (!route || route.points.length < 2) return;

    const t = rs.t;
    const { ctx } = this;
    ctx.save();

    const controllingIdx = this._parkingControllingStep(task, t);
    const taskEdit = !!rs.taskEditActive;

    // In task edit mode, draw all static handoff lines in gray
    // Each line starts from where the step RECEIVES control (initial handoff)
    if (taskEdit) {
      for (let i = 0; i < task.steps.length; i++) {
        if (i === controllingIdx) continue; // drawn as orange below
        const step = task.steps[i];
        const target = this._parkingTarget(step);
        if (!target) continue;
        // Initial position: where this step receives control
        const initT = (i === 0) ? 0 : task.steps[i - 1].progress;
        const handoffPt = polylinePoint(route.points, initT);
        if (!handoffPt) continue;
        const hc = this.wc(handoffPt.x, handoffPt.y);
        const tc = this.wc(target.x, target.y);
        ctx.strokeStyle = 'rgba(130,130,130,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hc.x, hc.y);
        ctx.lineTo(tc.x, tc.y);
        ctx.stroke();
      }
    }

    // Draw the controlling line (orange in task edit, gray otherwise)
    const markerPt = polylinePoint(route.points, t);
    if (!markerPt) { ctx.restore(); return; }
    const markerC = this.wc(markerPt.x, markerPt.y);

    let target = null;
    if (controllingIdx !== null && controllingIdx >= 0) {
      target = this._parkingTarget(task.steps[controllingIdx]);
    }

    if (target) {
      const tc = this.wc(target.x, target.y);
      ctx.strokeStyle = taskEdit ? 'rgba(224,128,48,0.8)' : 'rgba(130,130,130,0.6)';
      ctx.lineWidth = taskEdit ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(markerC.x, markerC.y);
      ctx.lineTo(tc.x, tc.y);
      ctx.stroke();
    }

    // Circles around crew targets in task edit mode
    if (taskEdit) {
      const selIdx = (rs.selectedHandoff != null) ? rs.selectedHandoff : -1;
      const assignIdx = rs.assignMode ? rs.assignStepIdx : -999;
      const assignBrown = rs.assignMode && rs.assignIsBrown;
      const circleR = 12;

      const isBlue = (stepIdx, isBrown) => {
        if (isBrown) return assignBrown;
        return stepIdx === selIdx || stepIdx === assignIdx;
      };

      const drawCircle = (tgt, blue) => {
        if (!tgt) return;
        const c = this.wc(tgt.x, tgt.y);
        ctx.beginPath();
        ctx.arc(c.x, c.y, circleR, 0, Math.PI * 2);
        ctx.strokeStyle = blue ? 'rgba(60,130,240,0.9)' : 'rgba(150,150,150,0.5)';
        ctx.lineWidth = blue ? 2.5 : 1.5;
        ctx.stroke();
      };

      // Step crew circles
      for (let i = 0; i < task.steps.length; i++) {
        const step = task.steps[i];
        drawCircle(this._parkingTarget(step), isBlue(i, false));
      }
    }

    ctx.restore();
  }

  // ── Full frame ────────────────────────────────────────────────────────────
  render(routeState) {
    const dpr = this.dpr || 1;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.W, this.H);
    this.drawGrid();
    this.drawPolygon();
    this.drawDeckMarkings();
    this.drawCatapults();
    this.drawJBDs();
    this.drawOrphanedRoutePositions(routeState);
    this.drawUnusedRoutePositions(routeState);
    this.drawCrewActivePositions(routeState);
    this.drawCrew(routeState);
    this.drawLandingRoutes(routeState, routeState ? routeState.t : 0.5);
    this.drawTakeoffRoutes(routeState, routeState ? routeState.t : 0.5);
    this.drawActiveCrewLines(routeState);
    this.drawActiveParkingCrewLines(routeState);
    this.drawCatapultCrew(routeState);
    this.drawVersionOverlay(routeState);
  }

  drawVersionOverlay(rs) {
    if (!rs || !rs.loadedVariant) return;
    const ctx = this.ctx;
    const { name, version } = rs.loadedVariant;
    ctx.save();
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(160,160,160,0.7)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const x = 28, y = 22;
    ctx.fillText(version ? `${name}  ${version}` : name, x, y);
    if (rs.isAnythingModified()) {
      ctx.font = '11px monospace';
      ctx.fillStyle = 'rgba(200,180,80,0.7)';
      ctx.fillText('edited', x, y + 15);
    }
    ctx.restore();
  }

  // ── Catapult Crew Overlay ──────────────────────────────────────────────

  drawCatapultCrew(rs) {
    if (!rs || !rs.catCrewVisible) return;
    const crew = CATAPULT_CREWS[rs.catCrewCatapult];
    if (!crew || !crew.members.length) return;

    const ctx = this.ctx;
    const phase = CATAPULT_PHASES[rs.catCrewPhase];

    // Draw route paths first (behind dots)
    const editMi = rs.catCrewEditMode ? rs.catCrewEditMember : -1;
    for (let mi = 0; mi < crew.members.length; mi++) {
      const member = crew.members[mi];
      const route = findPhaseRoute(member, phase);
      if (!route || route.points.length < 2) continue;
      const isEdited = mi === editMi;
      const colors = CATAPULT_MEMBER_COLORS[member.name] || { fill: '#aaa', stroke: '#888' };
      ctx.save();
      if (isEdited) {
        ctx.setLineDash([]);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = colors.stroke;
      } else {
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#aaa';
      }
      ctx.beginPath();
      for (let pi = 0; pi < route.points.length; pi++) {
        const p = this.wc(route.points[pi].x, route.points[pi].y);
        if (pi === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      // Draw waypoint dots
      if (isEdited) {
        const sz = 5;
        for (let pi = 0; pi < route.points.length; pi++) {
          const p = this.wc(route.points[pi].x, route.points[pi].y);
          const isSel = pi === rs.catCrewSelectedPoint;
          ctx.fillStyle = isSel ? colors.fill : '#fff';
          ctx.strokeStyle = colors.stroke;
          ctx.lineWidth = isSel ? 2.5 : 1.5;
          ctx.fillRect(p.x - sz, p.y - sz, sz * 2, sz * 2);
          ctx.strokeRect(p.x - sz, p.y - sz, sz * 2, sz * 2);
        }
      } else {
        // Small gray dots on unselected routes
        for (let pi = 0; pi < route.points.length; pi++) {
          const p = this.wc(route.points[pi].x, route.points[pi].y);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#bbb';
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Compute per-member local t values based on path lengths
    const localTs = memberLocalTs(crew, phase, rs.catCrewT);

    for (let mi = 0; mi < crew.members.length; mi++) {
      const member = crew.members[mi];
      const colors = CATAPULT_MEMBER_COLORS[member.name] || { fill: '#aaa', stroke: '#888' };

      // Find route for this phase by name suffix
      const route = findPhaseRoute(member, phase);
      const t = localTs[mi];

      // Determine position for this phase
      let wx, wy, hdg;
      if (phase.useFastStart) {
        // Fast start phase — show at fast_start_position (or idle if missing)
        const fsp = member.fastStartPosition;
        if (fsp) {
          wx = fsp.x; wy = fsp.y; hdg = fsp.hdg;
        } else {
          wx = member.position.x; wy = member.position.y; hdg = member.position.hdg;
        }
      } else if (!route || route.points.length === 0) {
        // Idle or empty route — show at idle position
        wx = member.position.x;
        wy = member.position.y;
        hdg = member.position.hdg;
      } else {
        const pts = route.points;
        if (t >= 1 || pts.length === 1) {
          // At destination (last point)
          const last = pts[pts.length - 1];
          wx = last.x;
          wy = last.y;
          if (route.finalHeading != null) {
            hdg = route.finalHeading;
          } else if (pts.length >= 2) {
            // No finalHeading — face walk direction (last segment)
            const prev = pts[pts.length - 2];
            hdg = -Math.atan2(last.y - prev.y, last.x - prev.x) * 180 / Math.PI;
          } else {
            hdg = member.position.hdg;
          }
        } else if (t <= 0) {
          // At start — face idle heading (pre-walk stance)
          wx = pts[0].x;
          wy = pts[0].y;
          hdg = member.position.hdg;
        } else {
          // Interpolate along waypoints by true arc length
          const interp = interpolateByArcLength(pts, t);
          wx = interp.x;
          wy = interp.y;
          hdg = interp.hdg;
        }
      }

      const c = this.wc(wx, wy);
      const r = 7;

      // Draw diamond (rotated square)
      const rad = hdg * Math.PI / 180;
      ctx.save();
      ctx.translate(c.x, c.y);

      // Diamond shape
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fillStyle = colors.fill;
      ctx.fill();
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Heading tick
      const tickLen = r + 6;
      const tx = Math.cos(-rad) * tickLen;
      const ty = Math.sin(-rad) * tickLen;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      // Label
      ctx.fillStyle = colors.stroke;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(member.name, c.x, c.y - r - 4);
    }
  }
}
