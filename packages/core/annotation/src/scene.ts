/**
 * `scene(item)` — the render contract. Turns an annotation render-item into a flat
 * list of fully-painted nodes (geometry + how to paint it). A framework renderer
 * just maps each node to one element and applies `paint`; it owns no per-kind
 * appearance logic, so adding a framework (or a kind) never duplicates drawing.
 *
 * Geometry comes from `geomScene` (shared with hit-testing); paint is layered on
 * here. Text markup is the one family whose paint varies per node (highlight fills,
 * underline/strikeout/squiggly stroke, widths derived from the line height), so it
 * has its own small painter — but it still emits the same generic SceneNodes.
 */
import { distanceScene, measurementCaptionScene } from './measurement';
import { shapeMeasurementLayout } from './measurement-shape';
import { textQuadBounds, textQuadRing } from '@embedpdf/core-geometry';
import { geomScene } from './geometry';
import type {
  ContentGeometry,
  Paint,
  Rect,
  RenderItem,
  SceneNode,
  Style,
  Subtype,
  TextQuad,
  TextStyle,
  Point,
} from './types';

const num = (value: number): number => Number(value.toFixed(3));

/** Uniform paint for a shape/line/poly node. Fill only lands on closed nodes; the
 *  dash comes solely from the border style — so a live draft (ghost) previews
 *  exactly how the committed annotation will look, not as a dashed hint. */
/** CSS mix-blend-mode for live vector paint. `normal` needs no style override. */
export function blendFor(style: Style): Paint['blend'] {
  return style.blendMode === 'normal' ? undefined : style.blendMode;
}

function shapePaint(style: Style, closed: boolean): Paint {
  return {
    fill: closed ? (style.interiorColor ?? undefined) : undefined,
    stroke: style.color,
    width: style.strokeWidth,
    opacity: style.opacity,
    dash: style.border.kind === 'dashed' ? style.border.dash : undefined,
    // Cloud curls end in deliberate direction reversals (the 22° curl-back
    // tails), which a miter join blows up into spikes. PDFium bakes cloudy
    // borders with `1 j` (round join) for exactly this reason — match it, so
    // the live path and the baked /AP render the same seams.
    ...(style.border.kind === 'cloudy' ? { join: 'round' as const } : {}),
  };
}

/** A smooth squiggle (quadratic-bezier wave) along an arbitrary baseline,
 *  generated in the (û, n̂) basis: one `Q` hump then reflected `T` segments
 *  alternate across the run. Reflection is affine-invariant, so an upright
 *  quad reproduces the old axis-aligned wave byte-for-byte. `n̂` points from
 *  the baseline toward the ascent side; humps rise toward the text. */
function squigglePath(
  start: Point,
  direction: Point,
  normal: Point,
  length: number,
  amp: number,
): string {
  const half = Math.max(2, amp * 1.5); // half a wavelength
  const at = (distance: number, off: number): Point => ({
    x: start.x + direction.x * distance + normal.x * off,
    y: start.y + direction.y * distance + normal.y * off,
  });
  const formatPoint = (point: Point) => `${num(point.x)} ${num(point.y)}`;
  const hump = at(half / 2, amp);
  let pathData = `M ${formatPoint(at(0, 0))} Q ${formatPoint(hump)} ${formatPoint(at(half, 0))}`;
  for (let position = half; position + half <= length + 0.5; position += half) {
    pathData += ` T ${formatPoint(at(position + half, 0))}`;
  }
  return pathData;
}

/** Per-subtype markup nodes on the quads' own edges (corner-named TextQuads:
 *  upper = ascent side, lower = baseline side, start → end along the frame).
 *  The colour is the markup `/C` (our model keeps stroke==fill). Rotated and
 *  sheared cells draw along their true baselines; upright output is identical
 *  to the old axis-aligned math. */
function markupScene(subtype: Subtype, quads: TextQuad[], style: Style): SceneNode[] {
  const color = style.color;
  const opacity = style.opacity;
  const nodes: SceneNode[] = [];
  for (const quad of quads) {
    const down = {
      x: quad.lowerStart.x - quad.upperStart.x,
      y: quad.lowerStart.y - quad.upperStart.y,
    };
    const inkHeight = Math.hypot(down.x, down.y); // true ink height
    const wVec = { x: quad.lowerEnd.x - quad.lowerStart.x, y: quad.lowerEnd.y - quad.lowerStart.y };
    const baselineLength = Math.hypot(wVec.x, wVec.y); // true baseline length
    if (baselineLength <= 0 || inkHeight <= 0) continue;
    const normal = { x: down.x / inkHeight, y: down.y / inkHeight }; // unit, toward the baseline
    const lw = Math.min(2.5, Math.max(0.75, inkHeight * 0.06));
    if (subtype === 'underline') {
      // the baseline edge, inset lw off the descent side (the old `y + h − lw`)
      nodes.push({
        kind: 'line',
        a: { x: quad.lowerStart.x - normal.x * lw, y: quad.lowerStart.y - normal.y * lw },
        b: { x: quad.lowerEnd.x - normal.x * lw, y: quad.lowerEnd.y - normal.y * lw },
        paint: { stroke: color, width: lw, opacity, blend: blendFor(style) },
      });
    } else if (subtype === 'strikeout') {
      nodes.push({
        kind: 'line',
        a: {
          x: (quad.upperStart.x + quad.lowerStart.x) / 2,
          y: (quad.upperStart.y + quad.lowerStart.y) / 2,
        },
        b: {
          x: (quad.upperEnd.x + quad.lowerEnd.x) / 2,
          y: (quad.upperEnd.y + quad.lowerEnd.y) / 2,
        },
        paint: { stroke: color, width: lw, opacity, blend: blendFor(style) },
      });
    } else if (subtype === 'squiggly') {
      const amp = Math.min(2, Math.max(1, inkHeight * 0.08));
      const direction = { x: wVec.x / baselineLength, y: wVec.y / baselineLength };
      const start = {
        x: quad.lowerStart.x - normal.x * amp,
        y: quad.lowerStart.y - normal.y * amp,
      };
      nodes.push({
        kind: 'path',
        // n̂ toward ascent = −(toward baseline)
        d: squigglePath(start, direction, { x: -normal.x, y: -normal.y }, baselineLength, amp),
        paint: { stroke: color, width: lw, opacity, blend: blendFor(style) },
      });
    } else {
      // highlight: translucent fill with `multiply` so the text reads through it
      nodes.push({
        kind: 'poly',
        points: textQuadRing(quad),
        closed: true,
        paint: { fill: color, opacity, blend: blendFor(style) },
      });
    }
  }
  return nodes;
}

/** A redact mark's regions: per-quad rings (text marks) or the rect (area).
 *  `bounds` feeds the (axis-aligned) label layout; `ring` is what gets drawn,
 *  so rotated text marks outline and fill their true cells. */
interface RedactRegion {
  ring: [Point, Point, Point, Point];
  bounds: Rect;
}

const rectRing = (rect: Rect): [Point, Point, Point, Point] => [
  { x: rect.x, y: rect.y },
  { x: rect.x + rect.width, y: rect.y },
  { x: rect.x + rect.width, y: rect.y + rect.height },
  { x: rect.x, y: rect.y + rect.height },
];

function redactRegions(geometry: ContentGeometry): RedactRegion[] {
  if (geometry.kind === 'quads') {
    const out: RedactRegion[] = [];
    for (const quad of geometry.quads) {
      const bounds = textQuadBounds(quad);
      if (bounds.width > 0 && bounds.height > 0) out.push({ ring: textQuadRing(quad), bounds });
    }
    return out;
  }
  if (geometry.kind === 'rect') return [{ ring: rectRing(geometry.rect), bounds: geometry.rect }];
  return [];
}

/**
 * Redaction label layout — the same reading of ISO 32000-2 the engine's
 * apply-time painter uses, as pure math: top-aligned, `/Q` horizontal
 * alignment, `/Repeat` tiling a full grid that fits the region (no partial
 * glyph bleed — the scene has no clipping). Character advance is estimated
 * (0.55em Helvetica-ish); this is a live preview, the engine bakes the truth.
 */
export function layoutRedactLabel(
  region: Rect,
  label: { text: string; repeat: boolean },
  text: TextStyle | undefined,
): SceneNode[] {
  if (!label.text) return [];
  const fontSize = Math.max(4, text && text.fontSize > 0 ? text.fontSize : region.height * 0.6);
  const charW = fontSize * 0.55;
  const textW = label.text.length * charW;
  const lineH = fontSize * 1.2;
  const paint: Paint = { fill: text?.fontColor ?? '#ffffff', opacity: 1 };
  const base = { fontSize, ...(text?.fontFamily ? { fontFamily: text.fontFamily } : {}), paint };
  const baseline = (rowTop: number) => rowTop + fontSize * 0.95;

  if (!label.repeat) {
    if (fontSize > region.height) return [];
    const x =
      text?.textAlign === 'center'
        ? region.x + Math.max(0, (region.width - textW) / 2)
        : text?.textAlign === 'right'
          ? region.x + Math.max(0, region.width - textW)
          : region.x;
    return [{ kind: 'text', at: { x, y: baseline(region.y) }, text: label.text, ...base }];
  }

  const cols = Math.max(1, Math.floor((region.width + charW) / (textW + charW)));
  const rows = Math.max(1, Math.floor(region.height / lineH));
  const nodes: SceneNode[] = [];
  for (let row = 0; row < rows && nodes.length < 400; row++) {
    for (let column = 0; column < cols && nodes.length < 400; column++) {
      nodes.push({
        kind: 'text',
        at: { x: region.x + column * (textW + charW), y: baseline(region.y + row * lineH) },
        text: label.text,
        ...base,
      });
    }
  }
  return nodes;
}

/**
 * Redaction marks: at REST an outline per region, nothing filled. On hover
 * the applied-look preview — the `/IC` fill plus the tiled `/OverlayText`
 * label — exactly what the destructive apply will paint. All pure data, so
 * every framework renders the preview from the same scene.
 */
function redactScene(item: RenderItem): SceneNode[] {
  const regions = redactRegions(item.geometry);
  if (!item.hovered) {
    const paint = {
      stroke: item.style.color,
      width: item.style.strokeWidth || 1.5,
      opacity: item.style.opacity,
    };
    return regions.map(
      (region) => ({ kind: 'poly', points: region.ring, closed: true, paint }) as SceneNode,
    );
  }
  const nodes: SceneNode[] = [];
  if (item.style.interiorColor) {
    const fill = { fill: item.style.interiorColor, opacity: 1 };
    for (const region of regions) {
      nodes.push({ kind: 'poly', points: region.ring, closed: true, paint: fill });
    }
  }
  if (item.label) {
    // Label tiling stays axis-aligned inside the region's bounds — the live
    // preview approximates; the engine's apply-time painter bakes the truth.
    for (const region of regions) {
      nodes.push(...layoutRedactLabel(region.bounds, item.label, item.text));
    }
  }
  return nodes;
}

/** The full painted scene for one annotation. */
export function scene(item: RenderItem): SceneNode[] {
  // Links paint nothing: an invisible hit rectangle is the norm (any visible
  // border a PDF authored shows through the page raster). Selection chrome
  // still outlines it, so an editable link is findable when selected.
  if (item.subtype === 'link') return [];
  if (item.measure?.intent === 'line-dimension')
    return distanceScene(item.geometry, item.measure, item.style);
  if (item.subtype === 'redact') return redactScene(item);
  if (item.geometry.kind === 'quads')
    return markupScene(item.subtype, item.geometry.quads, item.style);
  if (item.geometry.kind === 'caret') {
    return geomScene(item.geometry).map((node) => ({
      ...node,
      paint: {
        fill: item.style.color,
        stroke: item.style.color,
        width: 0.5,
        opacity: item.style.opacity,
      },
    })) as SceneNode[];
  }
  const ink = item.geometry.kind === 'ink'; // freehand: round the pen-stroke ends (caps)
  const nodes = geomScene(item.geometry, item.style.strokeWidth, item.style.border).map((node) => {
    const closed =
      node.kind === 'rect' ||
      node.kind === 'ellipse' ||
      node.kind === 'path' ||
      (node.kind === 'poly' && node.closed);
    const paint = { ...shapePaint(item.style, closed), blend: blendFor(item.style) };
    // Ink is freehand: round the pen-stroke ends and joins. Every other kind keeps
    // the default butt caps + sharp (miter) joins — square corners and poly knees
    // stay crisp.
    return {
      ...node,
      paint: ink ? { ...paint, lineCap: 'round', join: 'round' } : paint,
    } as SceneNode;
  });
  if (item.measure) {
    const layout = shapeMeasurementLayout(item.geometry, item.measure, item.style);
    nodes.push(...measurementCaptionScene(layout?.caption ?? null, item.style));
  }
  return nodes;
}
