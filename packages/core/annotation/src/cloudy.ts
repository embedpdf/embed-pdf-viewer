/**
 * Cloudy-border (scalloped outline) path generation for shape annotations.
 *
 * Derived from Apache PDFBox's CloudyBorder.java (Apache-2.0):
 * https://github.com/apache/pdfbox — the arc/curl placement is theirs, and we
 * keep it because it visually matches what PDFium bakes into the `/BE` appearance
 * stream, so our live SVG preview and the saved PDF agree.
 *
 * These are pure functions. They take a page-space box (or a polygon) plus
 * the border `intensity`/`strokeWidth`, and give the cloud's curves as SVG
 * path data in absolute content coordinates (the same space `geomScene`'s
 * rect/ellipse nodes use), or the box around what those curves paint. The
 * scallops start on the shape's box and reach out from it, as the engine
 * draws them.
 *
 * The internal math runs in PDFBox's y-up frame; a `CurveSink` flips back to
 * y-down and translates into the box's page-space origin on the way out.
 */
import { expandRect } from './rect';
import type { Rect, Point } from './types';

const ANGLE_180 = Math.PI;
const ANGLE_90 = Math.PI / 2;
const ANGLE_34 = (34 * Math.PI) / 180;
const ANGLE_30 = (30 * Math.PI) / 180;
const ANGLE_12 = (12 * Math.PI) / 180;

interface P {
  x: number;
  y: number;
}

const formatNumber = (value: number): string => Number(value.toFixed(4)).toString();

/** Where the cloud's curves go: an SVG path (`PathBuilder`), or their bounds (`CurveBounds`). */
interface CurveSink {
  moveTo(x: number, y: number): void;
  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void;
}

/**
 * Accumulates SVG path commands. Input is PDFBox's y-up frame; output is y-down
 * page space, offset into the box origin (ox, oy) so the `d` string is in the
 * same absolute coordinates as every other render node.
 */
class PathBuilder implements CurveSink {
  private parts: string[] = [];
  private started = false;
  constructor(
    private ox: number,
    private oy: number,
  ) {}
  moveTo(x: number, y: number): void {
    this.parts.push(`M ${formatNumber(x + this.ox)} ${formatNumber(-y + this.oy)}`);
    this.started = true;
  }
  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    this.parts.push(
      `C ${formatNumber(x1 + this.ox)} ${formatNumber(-y1 + this.oy)}, ${formatNumber(x2 + this.ox)} ${formatNumber(-y2 + this.oy)}, ${formatNumber(x3 + this.ox)} ${formatNumber(-y3 + this.oy)}`,
    );
  }
  close(): void {
    if (this.started) this.parts.push('Z');
  }
  build(): string {
    return this.parts.join(' ');
  }
}

/** Where a cubic Bézier coordinate `p0..p3` turns: the parameters in (0, 1) where its slope is zero. */
function turnsOf(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots =
    Math.abs(a) < 1e-12
      ? Math.abs(b) < 1e-12
        ? []
        : [-c / b]
      : b * b - 4 * a * c < 0
        ? []
        : [
            (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a),
            (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a),
          ];
  return roots.filter((t) => t > 0 && t < 1);
}

/**
 * The box around the curves themselves (not their control points), in the
 * same page space as `PathBuilder`'s path.
 */
class CurveBounds implements CurveSink {
  private left = Infinity;
  private top = Infinity;
  private right = -Infinity;
  private bottom = -Infinity;
  private current: P = { x: 0, y: 0 };
  constructor(
    private ox: number,
    private oy: number,
  ) {}
  private add(point: P): void {
    this.left = Math.min(this.left, point.x);
    this.right = Math.max(this.right, point.x);
    this.top = Math.min(this.top, point.y);
    this.bottom = Math.max(this.bottom, point.y);
  }
  private place(x: number, y: number): P {
    return { x: x + this.ox, y: -y + this.oy };
  }
  moveTo(x: number, y: number): void {
    this.current = this.place(x, y);
    this.add(this.current);
  }
  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    const p0 = this.current;
    const p1 = this.place(x1, y1);
    const p2 = this.place(x2, y2);
    const p3 = this.place(x3, y3);
    const at = (t: number): P => {
      const s = 1 - t;
      const w = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
      return {
        x: w[0]! * p0.x + w[1]! * p1.x + w[2]! * p2.x + w[3]! * p3.x,
        y: w[0]! * p0.y + w[1]! * p1.y + w[2]! * p2.y + w[3]! * p3.y,
      };
    };
    for (const t of [...turnsOf(p0.x, p1.x, p2.x, p3.x), ...turnsOf(p0.y, p1.y, p2.y, p3.y)]) {
      this.add(at(t));
    }
    this.add(p3);
    this.current = p3;
  }
  bounds(): Rect {
    return {
      x: this.left,
      y: this.top,
      width: this.right - this.left,
      height: this.bottom - this.top,
    };
  }
}

/* ── geometry helpers ─────────────────────────────────────────────────────── */

const distance = (left: P, right: P): number => Math.hypot(right.x - left.x, right.y - left.y);
const cosine = (dx: number, hyp: number): number => (hyp === 0 ? 0 : dx / hyp);
const sine = (dy: number, hyp: number): number => (hyp === 0 ? 0 : dy / hyp);

/** Signed area (shoelace): positive = counter-clockwise. */
function polygonDirection(points: P[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[i].y * points[j].x;
  }
  return area;
}
function ensurePositiveWinding(points: P[]): void {
  if (polygonDirection(points) < 0) points.reverse();
}
function removeZeroLengthSegments(polygon: P[]): P[] {
  if (polygon.length <= 2) return polygon;
  const tol = 0.5;
  const out: P[] = [polygon[0]];
  for (let i = 1; i < polygon.length; i++) {
    const previous = out[out.length - 1];
    const current = polygon[i];
    if (Math.abs(current.x - previous.x) >= tol || Math.abs(current.y - previous.y) >= tol)
      out.push(current);
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
  out: CurveSink,
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
  out: CurveSink,
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
  out: CurveSink,
  addMoveTo: boolean,
): void {
  const startAngle = anglePrev + ANGLE_180 + alphaPrev;
  const joinAngle = startAngle - (22 * Math.PI) / 180;
  arcSegment(startAngle, joinAngle, cx, cy, radius, radius, out, addMoveTo);
  getArc(joinAngle, angleCur - alpha, radius, radius, cx, cy, out, false);
}

function addFirstIntermediateCurl(
  angleCur: number,
  rad: number,
  alpha: number,
  cx: number,
  cy: number,
  out: CurveSink,
): void {
  const backAngle = angleCur + ANGLE_180;
  arcSegment(backAngle + alpha, backAngle + alpha - ANGLE_30, cx, cy, rad, rad, out, false);
  arcSegment(backAngle + alpha - ANGLE_30, backAngle + ANGLE_90, cx, cy, rad, rad, out, false);
  arcSegment(backAngle + ANGLE_90, backAngle + ANGLE_180 - ANGLE_34, cx, cy, rad, rad, out, false);
}

function intermediateCurlTemplate(angleCur: number, rad: number): P[] {
  const backAngle = angleCur + ANGLE_180;
  return [
    ...arcSegmentToArray(backAngle + ANGLE_34, backAngle + ANGLE_12, rad, rad),
    ...arcSegmentToArray(backAngle + ANGLE_12, backAngle + ANGLE_90, rad, rad),
    ...arcSegmentToArray(backAngle + ANGLE_90, backAngle + ANGLE_180 - ANGLE_34, rad, rad),
  ];
}
function outputCurlTemplate(template: P[], x: number, y: number, out: CurveSink): void {
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
  curlFactor: number,
  length: number,
): { n: number; adjustedRadius: number } {
  if (length === 0) return { n: -1, adjustedRadius: idealRadius };
  const remaining = length - 2 * curlFactor * idealRadius;
  if (remaining <= 0) return { n: 0, adjustedRadius: idealRadius };
  const curlCount = Math.max(1, Math.ceil(remaining / (2 * curlFactor * idealRadius)));
  return { n: curlCount, adjustedRadius: remaining / (curlCount * 2 * curlFactor) };
}

function cloudyPolygonImpl(
  vertices: P[],
  isEllipse: boolean,
  intensity: number,
  lineWidth: number,
  out: CurveSink,
): void {
  const polygon = removeZeroLengthSegments(vertices);
  ensurePositiveWinding(polygon);
  const vertexCount = polygon.length;
  if (vertexCount < 2) return;

  if (intensity <= 0) {
    out.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < vertexCount; i++)
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
  const curlFactor = Math.cos(ANGLE_34);

  const edgeAlphas: number[] = [];
  for (let j = 0; j + 1 < vertexCount; j++) {
    const len = distance(polygon[j], polygon[j + 1]);
    edgeAlphas.push(
      len <= 0 || len >= 2 * curlFactor * idealRadius
        ? ANGLE_34
        : Math.acos(Math.min(1, len / (2 * idealRadius))),
    );
  }

  let anglePrev = 0;
  let started = false;
  for (let j = 0; j + 1 < vertexCount; j++) {
    const pt = polygon[j];
    const ptNext = polygon[j + 1];
    const len = distance(pt, ptNext);
    if (len === 0) continue;

    const params = computeParamsPolygon(idealRadius, curlFactor, len);
    if (params.n < 0) {
      if (!started) {
        out.moveTo(pt.x, pt.y);
        started = true;
      }
      continue;
    }

    const edgeRadius = Math.max(0.5, params.adjustedRadius);
    const intermAdvance = 2 * curlFactor * edgeRadius;
    const firstAdvance = curlFactor * idealRadius + curlFactor * edgeRadius;
    const angleCur = Math.atan2(ptNext.y - pt.y, ptNext.x - pt.x);
    if (j === 0) {
      const ptPrev = polygon[vertexCount - 2];
      anglePrev = Math.atan2(pt.y - ptPrev.y, pt.x - ptPrev.x);
    }
    const cos = cosine(ptNext.x - pt.x, len);
    const sin = sine(ptNext.y - pt.y, len);
    let x = pt.x;
    let y = pt.y;
    const alpha = edgeAlphas[j];
    const alphaPrev = edgeAlphas[j === 0 ? vertexCount - 2 : j - 1] ?? ANGLE_34;

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
  const points: P[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return points;
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
  out: CurveSink,
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

  const curlFactor = Math.cos(ANGLE_34);
  let curlCount = Math.ceil(totLen / (2 * curlFactor * cloudRadius));
  if (curlCount < 2) return plainEllipse();

  let curlAdvance = totLen / curlCount;
  cloudRadius = curlAdvance / (2 * curlFactor);
  if (cloudRadius < 0.5) {
    cloudRadius = 0.5;
    curlAdvance = 2 * curlFactor * cloudRadius;
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
      let offset = curlAdvance - remain;
      while (todo >= curlAdvance - toler) {
        centers.push({ x: p1.x + offset * cos, y: p1.y + offset * sin });
        todo -= curlAdvance;
        offset += curlAdvance;
      }
      remain = Math.max(0, todo);
    } else {
      remain += segLen;
    }
  }

  const centerCount = centers.length;
  let anglePrev = 0;
  let alphaPrev = 0;
  for (let i = 0; i < centerCount; i++) {
    const pt = centers[i];
    const ptNext = centers[(i + 1) % centerCount];
    if (i === 0) {
      const ptPrev = centers[centerCount - 1];
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
 * About how far (content units) a cloud's scallops reach out from the shape's
 * box on each side: the scallop radius plus half the stroke. A hit band; what
 * a cloud paints is `cloudyBounds` / `cloudyPolyBounds`.
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

/** The cloud of a closed polygon, its curves into `out`. */
function polygonCloud(
  points: Point[],
  intensity: number,
  strokeWidth: number,
  out: CurveSink,
): void {
  // Page space is y-down; the PDFBox core runs y-up (the sink flips back).
  const ring = points.map((point) => ({ x: point.x, y: -point.y }));
  const first = ring[0];
  const last = ring[ring.length - 1];
  // The impl walks edges of a closed ring (first vertex repeated at the end).
  if (first && (first.x !== last.x || first.y !== last.y)) ring.push({ ...first });
  cloudyPolygonImpl(ring, false, intensity, strokeWidth, out);
}

/** The cloud of a square's (rect) or circle's (ellipse) `box`, its curves into `out`. */
function boxCloud(
  box: Rect,
  ellipse: boolean,
  intensity: number,
  strokeWidth: number,
  out: CurveSink,
): void {
  const right = box.width;
  const bottom = box.height;
  if (ellipse) {
    cloudyEllipseImpl(0, -bottom, right, 0, intensity, strokeWidth, out);
  } else {
    cloudyPolygonImpl(
      [
        { x: 0, y: 0 },
        { x: right, y: 0 },
        { x: right, y: -bottom },
        { x: 0, y: -bottom },
        { x: 0, y: 0 },
      ],
      false,
      intensity,
      strokeWidth,
      out,
    );
  }
}

/**
 * SVG path data for a cloudy polygon border, in absolute content coordinates.
 * A polygon's curls are centred on the vertex path and reach outward by the
 * cloud radius, the same rule PDFium's `GenerateCloudyPolygonPath` bakes into
 * the /AP, so the live drawing and the saved appearance agree.
 *
 * Stroke it with round joins: the curl tails reverse direction by design, and
 * `scene()` sets `join: 'round'` to match PDFium's `1 j`; a miter join turns
 * every seam into a spike.
 */
export function cloudyPolyPath(points: Point[], intensity: number, strokeWidth: number): string {
  const out = new PathBuilder(0, 0);
  polygonCloud(points, intensity, strokeWidth, out);
  out.close();
  return out.build();
}

/**
 * SVG path data for a cloudy square (rect) or circle (ellipse), in absolute
 * content coordinates. The scallops are generated on `box` and bulge out
 * from it.
 */
export function cloudyPath(
  box: Rect,
  ellipse: boolean,
  intensity: number,
  strokeWidth: number,
): string {
  const out = new PathBuilder(box.x, box.y);
  boxCloud(box, ellipse, intensity, strokeWidth, out);
  out.close();
  return out.build();
}

/**
 * The box around what a cloudy polygon border paints: its curves, and half
 * the stroke past them (round joins: the pen reaches that far every way).
 */
export function cloudyPolyBounds(points: Point[], intensity: number, strokeWidth: number): Rect {
  const out = new CurveBounds(0, 0);
  polygonCloud(points, intensity, strokeWidth, out);
  return expandRect(out.bounds(), strokeWidth / 2);
}

/** The box around what a cloudy square's or circle's border paints, as `cloudyPolyBounds`. */
export function cloudyBounds(
  box: Rect,
  ellipse: boolean,
  intensity: number,
  strokeWidth: number,
): Rect {
  const out = new CurveBounds(box.x, box.y);
  boxCloud(box, ellipse, intensity, strokeWidth, out);
  return expandRect(out.bounds(), strokeWidth / 2);
}
