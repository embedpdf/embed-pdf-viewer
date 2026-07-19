/**
 * Cloudy-border (scalloped outline) path generation for shape annotations.
 *
 * Derived from Apache PDFBox's CloudyBorder.java (Apache-2.0):
 * https://github.com/apache/pdfbox — the arc/curl placement is theirs, and we
 * keep it because it visually matches what PDFium bakes into the `/BE` appearance
 * stream, so our live SVG preview and the saved PDF agree.
 *
 * What's v3-specific: this is a PURE function. It takes a content-space box plus
 * the border `intensity`/`strokeWidth` and returns SVG path data in ABSOLUTE
 * content coordinates (the same space `geomScene`'s rect/ellipse nodes use). There
 * is no stored `/RD`, no border-style enum, no bbox bookkeeping — the inset is
 * derived (`cloudyBorderExtent`) and the outer edge of the scallops lands exactly
 * on the box, so the box stays the annotation's outer boundary (its `/Rect`).
 *
 * The internal math runs in PDFBox's y-UP frame; `PathBuilder` flips back to
 * y-down and translates into the box's content-space origin on the way out.
 */
import type { Rect, Vec } from './types';

const ANGLE_180 = Math.PI;
const ANGLE_90 = Math.PI / 2;
const ANGLE_34 = (34 * Math.PI) / 180;
const ANGLE_30 = (30 * Math.PI) / 180;
const ANGLE_12 = (12 * Math.PI) / 180;

interface P {
  x: number;
  y: number;
}

const r = (n: number): string => Number(n.toFixed(4)).toString();

/**
 * Accumulates SVG path commands. Input is PDFBox's y-up frame; output is y-down
 * content space, offset into the box origin (ox, oy) so the `d` string is in the
 * same absolute coordinates as every other render node.
 */
class PathBuilder {
  private parts: string[] = [];
  private started = false;
  constructor(
    private ox: number,
    private oy: number,
  ) {}
  moveTo(x: number, y: number): void {
    this.parts.push(`M ${r(x + this.ox)} ${r(-y + this.oy)}`);
    this.started = true;
  }
  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    this.parts.push(
      `C ${r(x1 + this.ox)} ${r(-y1 + this.oy)}, ${r(x2 + this.ox)} ${r(-y2 + this.oy)}, ${r(x3 + this.ox)} ${r(-y3 + this.oy)}`,
    );
  }
  close(): void {
    if (this.started) this.parts.push('Z');
  }
  build(): string {
    return this.parts.join(' ');
  }
}

/* ── geometry helpers ─────────────────────────────────────────────────────── */

const distance = (a: P, b: P): number => Math.hypot(b.x - a.x, b.y - a.y);
const cosine = (dx: number, hyp: number): number => (hyp === 0 ? 0 : dx / hyp);
const sine = (dy: number, hyp: number): number => (hyp === 0 ? 0 : dy / hyp);

/** Signed area (shoelace): positive = counter-clockwise. */
function polygonDirection(pts: P[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[i].y * pts[j].x;
  }
  return a;
}
function ensurePositiveWinding(pts: P[]): void {
  if (polygonDirection(pts) < 0) pts.reverse();
}
function removeZeroLengthSegments(polygon: P[]): P[] {
  if (polygon.length <= 2) return polygon;
  const tol = 0.5;
  const out: P[] = [polygon[0]];
  for (let i = 1; i < polygon.length; i++) {
    const prev = out[out.length - 1];
    const cur = polygon[i];
    if (Math.abs(cur.x - prev.x) >= tol || Math.abs(cur.y - prev.y) >= tol) out.push(cur);
  }
  return out;
}

/* ── elliptical-arc Bézier approximation ──────────────────────────────────── */

function arcSegment(
  startAng: number,
  endAng: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  out: PathBuilder,
  addMoveTo: boolean,
): void {
  const cosA = Math.cos(startAng);
  const sinA = Math.sin(startAng);
  const cosB = Math.cos(endAng);
  const sinB = Math.sin(endAng);
  const denom = Math.sin((endAng - startAng) / 2);
  if (denom === 0) {
    if (addMoveTo) out.moveTo(cx + rx * cosA, cy + ry * sinA);
    return;
  }
  const bcp = ((4 / 3) * (1 - Math.cos((endAng - startAng) / 2))) / denom;
  if (addMoveTo) out.moveTo(cx + rx * cosA, cy + ry * sinA);
  out.curveTo(
    cx + rx * (cosA - bcp * sinA),
    cy + ry * (sinA + bcp * cosA),
    cx + rx * (cosB + bcp * sinB),
    cy + ry * (sinB - bcp * cosB),
    cx + rx * cosB,
    cy + ry * sinB,
  );
}

function arcSegmentToArray(startAng: number, endAng: number, rx: number, ry: number): P[] {
  const cosA = Math.cos(startAng);
  const sinA = Math.sin(startAng);
  const cosB = Math.cos(endAng);
  const sinB = Math.sin(endAng);
  const denom = Math.sin((endAng - startAng) / 2);
  if (denom === 0) return [];
  const bcp = ((4 / 3) * (1 - Math.cos((endAng - startAng) / 2))) / denom;
  return [
    { x: rx * (cosA - bcp * sinA), y: ry * (sinA + bcp * cosA) },
    { x: rx * (cosB + bcp * sinB), y: ry * (sinB - bcp * cosB) },
    { x: rx * cosB, y: ry * sinB },
  ];
}

function getArc(
  startAng: number,
  endAng: number,
  rx: number,
  ry: number,
  cx: number,
  cy: number,
  out: PathBuilder,
  addMoveTo: boolean,
): void {
  let angleTodo = endAng - startAng;
  while (angleTodo < 0) angleTodo += 2 * Math.PI;
  const sweep = angleTodo;
  let angleDone = 0;
  if (addMoveTo) out.moveTo(cx + rx * Math.cos(startAng), cy + ry * Math.sin(startAng));
  while (angleTodo > ANGLE_90) {
    arcSegment(startAng + angleDone, startAng + angleDone + ANGLE_90, cx, cy, rx, ry, out, false);
    angleDone += ANGLE_90;
    angleTodo -= ANGLE_90;
  }
  if (angleTodo > 0) arcSegment(startAng + angleDone, startAng + sweep, cx, cy, rx, ry, out, false);
}

/* ── curls ─────────────────────────────────────────────────────────────────── */

function addCornerCurl(
  anglePrev: number,
  angleCur: number,
  radius: number,
  cx: number,
  cy: number,
  alpha: number,
  alphaPrev: number,
  out: PathBuilder,
  addMoveTo: boolean,
): void {
  const a = anglePrev + ANGLE_180 + alphaPrev;
  const b = a - (22 * Math.PI) / 180;
  arcSegment(a, b, cx, cy, radius, radius, out, addMoveTo);
  getArc(b, angleCur - alpha, radius, radius, cx, cy, out, false);
}

function addFirstIntermediateCurl(
  angleCur: number,
  rad: number,
  alpha: number,
  cx: number,
  cy: number,
  out: PathBuilder,
): void {
  const a = angleCur + ANGLE_180;
  arcSegment(a + alpha, a + alpha - ANGLE_30, cx, cy, rad, rad, out, false);
  arcSegment(a + alpha - ANGLE_30, a + ANGLE_90, cx, cy, rad, rad, out, false);
  arcSegment(a + ANGLE_90, a + ANGLE_180 - ANGLE_34, cx, cy, rad, rad, out, false);
}

function intermediateCurlTemplate(angleCur: number, rad: number): P[] {
  const a = angleCur + ANGLE_180;
  return [
    ...arcSegmentToArray(a + ANGLE_34, a + ANGLE_12, rad, rad),
    ...arcSegmentToArray(a + ANGLE_12, a + ANGLE_90, rad, rad),
    ...arcSegmentToArray(a + ANGLE_90, a + ANGLE_180 - ANGLE_34, rad, rad),
  ];
}
function outputCurlTemplate(template: P[], x: number, y: number, out: PathBuilder): void {
  for (let i = 0; i + 2 < template.length; i += 3) {
    out.curveTo(
      template[i].x + x,
      template[i].y + y,
      template[i + 1].x + x,
      template[i + 1].y + y,
      template[i + 2].x + x,
      template[i + 2].y + y,
    );
  }
}

/* ── cloud radius (PDFBox constants, deduced from Acrobat) ─────────────────── */

const ellipseCloudRadius = (intensity: number, lineWidth: number): number =>
  4.75 * intensity + 0.5 * lineWidth;
const polygonCloudRadius = (intensity: number, lineWidth: number): number =>
  4 * intensity + 0.5 * lineWidth;

/* ── polygon core ──────────────────────────────────────────────────────────── */

function computeParamsPolygon(
  idealRadius: number,
  k: number,
  length: number,
): { n: number; adjustedRadius: number } {
  if (length === 0) return { n: -1, adjustedRadius: idealRadius };
  const remaining = length - 2 * k * idealRadius;
  if (remaining <= 0) return { n: 0, adjustedRadius: idealRadius };
  const n = Math.max(1, Math.ceil(remaining / (2 * k * idealRadius)));
  return { n, adjustedRadius: remaining / (n * 2 * k) };
}

function cloudyPolygonImpl(
  vertices: P[],
  isEllipse: boolean,
  intensity: number,
  lineWidth: number,
  out: PathBuilder,
): void {
  const polygon = removeZeroLengthSegments(vertices);
  ensurePositiveWinding(polygon);
  const n = polygon.length;
  if (n < 2) return;

  if (intensity <= 0) {
    out.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < n; i++)
      out.curveTo(
        polygon[i].x,
        polygon[i].y,
        polygon[i].x,
        polygon[i].y,
        polygon[i].x,
        polygon[i].y,
      );
    return;
  }

  let idealRadius = isEllipse
    ? ellipseCloudRadius(intensity, lineWidth)
    : polygonCloudRadius(intensity, lineWidth);
  if (idealRadius < 0.5) idealRadius = 0.5;
  const k = Math.cos(ANGLE_34);

  const edgeAlphas: number[] = [];
  for (let j = 0; j + 1 < n; j++) {
    const len = distance(polygon[j], polygon[j + 1]);
    edgeAlphas.push(
      len <= 0 || len >= 2 * k * idealRadius
        ? ANGLE_34
        : Math.acos(Math.min(1, len / (2 * idealRadius))),
    );
  }

  let anglePrev = 0;
  let started = false;
  for (let j = 0; j + 1 < n; j++) {
    const pt = polygon[j];
    const ptNext = polygon[j + 1];
    const len = distance(pt, ptNext);
    if (len === 0) continue;

    const params = computeParamsPolygon(idealRadius, k, len);
    if (params.n < 0) {
      if (!started) {
        out.moveTo(pt.x, pt.y);
        started = true;
      }
      continue;
    }

    const edgeRadius = Math.max(0.5, params.adjustedRadius);
    const intermAdvance = 2 * k * edgeRadius;
    const firstAdvance = k * idealRadius + k * edgeRadius;
    const angleCur = Math.atan2(ptNext.y - pt.y, ptNext.x - pt.x);
    if (j === 0) {
      const ptPrev = polygon[n - 2];
      anglePrev = Math.atan2(pt.y - ptPrev.y, pt.x - ptPrev.x);
    }
    const cos = cosine(ptNext.x - pt.x, len);
    const sin = sine(ptNext.y - pt.y, len);
    let x = pt.x;
    let y = pt.y;
    const alpha = edgeAlphas[j];
    const alphaPrev = edgeAlphas[j === 0 ? n - 2 : j - 1] ?? ANGLE_34;

    addCornerCurl(anglePrev, angleCur, idealRadius, pt.x, pt.y, alpha, alphaPrev, out, !started);
    started = true;

    if (params.n === 0) {
      x += len * cos;
      y += len * sin;
    } else {
      x += firstAdvance * cos;
      y += firstAdvance * sin;
      let numInterm = params.n;
      if (params.n >= 1) {
        addFirstIntermediateCurl(angleCur, edgeRadius, ANGLE_34, x, y, out);
        x += intermAdvance * cos;
        y += intermAdvance * sin;
        numInterm = params.n - 1;
      }
      const template = intermediateCurlTemplate(angleCur, edgeRadius);
      for (let i = 0; i < numInterm; i++) {
        outputCurlTemplate(template, x, y, out);
        x += intermAdvance * cos;
        y += intermAdvance * sin;
      }
    }
    anglePrev = angleCur;
  }
}

/* ── ellipse core ──────────────────────────────────────────────────────────── */

function flattenEllipse(left: number, bottom: number, right: number, top: number): P[] {
  const cx = (left + right) / 2;
  const cy = (bottom + top) / 2;
  const rx = (right - left) / 2;
  const ry = (top - bottom) / 2;
  if (rx <= 0 || ry <= 0) return [];
  const segments = Math.max(32, Math.ceil(Math.max(rx, ry) * 2));
  const pts: P[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    pts.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return pts;
}

function computeParamsEllipse(pt: P, ptNext: P, rad: number, curlAdv: number): number {
  const len = distance(pt, ptNext);
  if (len === 0) return ANGLE_34;
  const arg = (curlAdv / 2 + (len - curlAdv) / 2) / rad;
  return arg < -1 || arg > 1 ? 0 : Math.acos(arg);
}

function cloudyEllipseImpl(
  left: number,
  bottom: number,
  right: number,
  top: number,
  intensity: number,
  lineWidth: number,
  out: PathBuilder,
): void {
  const plainEllipse = () => {
    const rx = Math.abs(right - left) / 2;
    const ry = Math.abs(top - bottom) / 2;
    getArc(0, 2 * Math.PI, rx, ry, (left + right) / 2, (bottom + top) / 2, out, true);
  };

  if (intensity <= 0) return plainEllipse();

  const width = right - left;
  const height = top - bottom;
  let cloudRadius = ellipseCloudRadius(intensity, lineWidth);

  if (width < 0.5 * cloudRadius && height < 0.5 * cloudRadius) return plainEllipse();

  // very long & thin → treat as a rectangle so the scallops read correctly
  if ((width < 5 && height > 20) || (width > 20 && height < 5)) {
    return cloudyPolygonImpl(
      [
        { x: left, y: bottom },
        { x: right, y: bottom },
        { x: right, y: top },
        { x: left, y: top },
        { x: left, y: bottom },
      ],
      true,
      intensity,
      lineWidth,
      out,
    );
  }

  // shrink so the cloud tails touch the original outline
  const radiusAdj = Math.sin(ANGLE_12) * cloudRadius - 1.5;
  let adjLeft = left;
  let adjRight = right;
  let adjBottom = bottom;
  let adjTop = top;
  if (width > 2 * radiusAdj) {
    adjLeft += radiusAdj;
    adjRight -= radiusAdj;
  } else {
    const mid = (left + right) / 2;
    adjLeft = mid - 0.1;
    adjRight = mid + 0.1;
  }
  if (height > 2 * radiusAdj) {
    adjBottom += radiusAdj;
    adjTop -= radiusAdj;
  } else {
    const mid = (top + bottom) / 2;
    adjTop = mid + 0.1;
    adjBottom = mid - 0.1;
  }

  const flat = flattenEllipse(adjLeft, adjBottom, adjRight, adjTop);
  if (flat.length < 2) return;
  let totLen = 0;
  for (let i = 1; i < flat.length; i++) totLen += distance(flat[i - 1], flat[i]);

  const k = Math.cos(ANGLE_34);
  let n = Math.ceil(totLen / (2 * k * cloudRadius));
  if (n < 2) return plainEllipse();

  let curlAdvance = totLen / n;
  cloudRadius = curlAdvance / (2 * k);
  if (cloudRadius < 0.5) {
    cloudRadius = 0.5;
    curlAdvance = 2 * k * cloudRadius;
  } else if (cloudRadius < 3.0) {
    return plainEllipse();
  }

  // distribute curl centers along the flattened perimeter
  const centers: P[] = [];
  let remain = 0;
  const toler = lineWidth * 0.1;
  for (let i = 0; i + 1 < flat.length; i++) {
    const p1 = flat[i];
    const p2 = flat[i + 1];
    const segLen = distance(p1, p2);
    if (segLen === 0) continue;
    let todo = segLen + remain;
    if (todo >= curlAdvance - toler || i === flat.length - 2) {
      const cos = cosine(p2.x - p1.x, segLen);
      const sin = sine(p2.y - p1.y, segLen);
      let d = curlAdvance - remain;
      while (todo >= curlAdvance - toler) {
        centers.push({ x: p1.x + d * cos, y: p1.y + d * sin });
        todo -= curlAdvance;
        d += curlAdvance;
      }
      remain = Math.max(0, todo);
    } else {
      remain += segLen;
    }
  }

  const m = centers.length;
  let anglePrev = 0;
  let alphaPrev = 0;
  for (let i = 0; i < m; i++) {
    const pt = centers[i];
    const ptNext = centers[(i + 1) % m];
    if (i === 0) {
      const ptPrev = centers[m - 1];
      anglePrev = Math.atan2(pt.y - ptPrev.y, pt.x - ptPrev.x);
      alphaPrev = computeParamsEllipse(ptPrev, pt, cloudRadius, curlAdvance);
    }
    const angleCur = Math.atan2(ptNext.y - pt.y, ptNext.x - pt.x);
    const alpha = computeParamsEllipse(pt, ptNext, cloudRadius, curlAdvance);
    addCornerCurl(anglePrev, angleCur, cloudRadius, pt.x, pt.y, alpha, alphaPrev, out, i === 0);
    anglePrev = angleCur;
    alphaPrev = alpha;
  }
}

/* ── public API ────────────────────────────────────────────────────────────── */

/**
 * The per-side inset (content units) from a shape's outer box to the cloud's
 * inner boundary — the scallop radius plus half the stroke. This IS the `/RD`
 * the engine stores, and it's sized so the scallop peaks reach back out to the
 * box edge: the box remains the annotation's outer boundary.
 */
export function cloudyBorderExtent(
  intensity: number,
  strokeWidth: number,
  ellipse: boolean,
): number {
  const cr = ellipse
    ? ellipseCloudRadius(intensity, strokeWidth)
    : polygonCloudRadius(intensity, strokeWidth);
  return cr + strokeWidth / 2;
}

/**
 * SVG path data for a cloudy POLYGON border, in ABSOLUTE content coordinates.
 * Unlike the box kinds (whose scallops inset back INTO the outer box), a
 * polygon's curls are centred ON the vertex path and reach OUTWARD by the cloud
 * radius — the same rule PDFium's `GenerateCloudyPolygonPath` bakes into the
 * /AP, so the live preview and the saved appearance agree. The visual therefore
 * extends `cloudyBorderExtent` beyond the vertices (see `geomVisualBounds`).
 *
 * The v3 counterpart of v2's `generateCloudyPolygonPath` (same steps: y-flip,
 * close the ring, run the polygon core). Stroke it with ROUND joins — the curl
 * tails reverse direction by design, and `scene()` sets `join: 'round'` to
 * match PDFium's `1 j`; a miter join turns every seam into a spike.
 */
export function cloudyPolyPath(points: Vec[], intensity: number, strokeWidth: number): string {
  const out = new PathBuilder(0, 0);
  // Content space is y-down; the PDFBox core runs y-up (PathBuilder flips back).
  const ring = points.map((p) => ({ x: p.x, y: -p.y }));
  const first = ring[0];
  const last = ring[ring.length - 1];
  // The impl walks edges of a CLOSED ring (first vertex repeated at the end).
  if (first && (first.x !== last.x || first.y !== last.y)) ring.push({ ...first });
  cloudyPolygonImpl(ring, false, intensity, strokeWidth, out);
  out.close();
  return out.build();
}

/**
 * SVG path data for a cloudy square (rect) or circle (ellipse), in ABSOLUTE
 * content coordinates. The scallops are generated on the box inset by
 * `cloudyBorderExtent` and bulge back out to `box`'s edge.
 */
export function cloudyPath(
  box: Rect,
  ellipse: boolean,
  intensity: number,
  strokeWidth: number,
): string {
  const inset = cloudyBorderExtent(intensity, strokeWidth, ellipse);
  const out = new PathBuilder(box.x, box.y);
  const left = inset;
  const top = inset;
  const right = box.width - inset;
  const bottom = box.height - inset;
  if (ellipse) {
    cloudyEllipseImpl(left, -bottom, right, -top, intensity, strokeWidth, out);
  } else {
    cloudyPolygonImpl(
      [
        { x: left, y: -top },
        { x: right, y: -top },
        { x: right, y: -bottom },
        { x: left, y: -bottom },
        { x: left, y: -top },
      ],
      false,
      intensity,
      strokeWidth,
      out,
    );
  }
  out.close();
  return out.build();
}
