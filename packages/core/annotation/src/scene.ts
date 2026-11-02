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
import { quadBounds, quadRing } from '@embedpdf/core-geometry';
import { geomScene } from './geometry';
import {
  defaultPaintFonts,
  layoutField,
  type FieldText,
  type FieldTextOptions,
  type TextFont,
  type TextFonts,
} from '@embedpdf/core-text';
import { drawsLive } from './appearance';
import { fileAttachmentIconScene, noteIconScene } from './icons';
import { blendFor, dashOf } from './kinds/styles';
import { CARET_STROKE_WIDTH } from './shapes/caret';
import type {
  Shape,
  Paint,
  Rect,
  RenderItem,
  SceneNode,
  Style,
  KindName,
  Quad,
  TextStyle,
  Point,
} from './types';

const num = (value: number): number => Number(value.toFixed(3));

/** Uniform paint for a shape/line/poly node. Fill only lands on closed nodes; the
 *  dash comes solely from the border style — so a live draft (ghost) previews
 *  exactly how the committed annotation will look, not as a dashed hint. */
function shapePaint(style: Style, closed: boolean): Paint {
  return {
    fill: closed ? (style.interiorColor ?? undefined) : undefined,
    stroke: style.color,
    width: style.strokeWidth,
    opacity: style.opacity,
    dash: dashOf(style),
    // Cloud curls end in deliberate direction reversals (the 22° curl-back
    // tails), which a miter join blows up into spikes. PDFium bakes cloudy
    // borders with `1 j` (round join) for exactly this reason — match it, so
    // the live path and the baked /AP render the same seams.
    ...(style.cloudyIntensity ? { join: 'round' as const } : {}),
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

/** Per-subtype markup nodes on the quads' own edges (upper = ascent side,
 *  lower = baseline side, left → right along the frame).
 *  The colour is the markup `/C` (our model keeps stroke==fill). Rotated and
 *  sheared cells draw along their true baselines; upright output is identical
 *  to the old axis-aligned math. */
function markupScene(subtype: KindName, quads: Quad[], style: Style): SceneNode[] {
  const color = style.color;
  const opacity = style.opacity;
  const nodes: SceneNode[] = [];
  for (const quad of quads) {
    const down = {
      x: quad.lowerLeft.x - quad.upperLeft.x,
      y: quad.lowerLeft.y - quad.upperLeft.y,
    };
    const inkHeight = Math.hypot(down.x, down.y); // true ink height
    const wVec = {
      x: quad.lowerRight.x - quad.lowerLeft.x,
      y: quad.lowerRight.y - quad.lowerLeft.y,
    };
    const baselineLength = Math.hypot(wVec.x, wVec.y); // true baseline length
    if (baselineLength <= 0 || inkHeight <= 0) continue;
    const normal = { x: down.x / inkHeight, y: down.y / inkHeight }; // unit, toward the baseline
    const lw = Math.min(2.5, Math.max(0.75, inkHeight * 0.06));
    if (subtype === 'underline') {
      // the baseline edge, inset lw off the descent side (the old `y + h − lw`)
      nodes.push({
        kind: 'line',
        a: { x: quad.lowerLeft.x - normal.x * lw, y: quad.lowerLeft.y - normal.y * lw },
        b: { x: quad.lowerRight.x - normal.x * lw, y: quad.lowerRight.y - normal.y * lw },
        paint: { stroke: color, width: lw, opacity, blend: blendFor(style) },
      });
    } else if (subtype === 'strikeout') {
      nodes.push({
        kind: 'line',
        a: {
          x: (quad.upperLeft.x + quad.lowerLeft.x) / 2,
          y: (quad.upperLeft.y + quad.lowerLeft.y) / 2,
        },
        b: {
          x: (quad.upperRight.x + quad.lowerRight.x) / 2,
          y: (quad.upperRight.y + quad.lowerRight.y) / 2,
        },
        paint: { stroke: color, width: lw, opacity, blend: blendFor(style) },
      });
    } else if (subtype === 'squiggly') {
      const amp = Math.min(2, Math.max(1, inkHeight * 0.08));
      const direction = { x: wVec.x / baselineLength, y: wVec.y / baselineLength };
      const start = {
        x: quad.lowerLeft.x - normal.x * amp,
        y: quad.lowerLeft.y - normal.y * amp,
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
        points: quadRing(quad),
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

function redactRegions(geometry: Shape): RedactRegion[] {
  if (geometry.kind === 'quads') {
    const out: RedactRegion[] = [];
    for (const quad of geometry.quadPoints) {
      const bounds = quadBounds(quad);
      if (bounds.width > 0 && bounds.height > 0) out.push({ ring: quadRing(quad), bounds });
    }
    return out;
  }
  if (geometry.kind === 'box') return [{ ring: rectRing(geometry.box), bounds: geometry.box }];
  return [];
}

/**
 * The size a repeated label draws at when its `fontSize` is 0 (fit): fitting
 * would only shrink the label as it repeats, so the engine sets this one.
 */
const REPEAT_FIT_FONT_SIZE = 12;

/** How many times a repeated label's text doubles at most, as in the engine: 1,024 labels. */
const MAX_REPEAT_DOUBLINGS = 10;

/** `/Q` by the label's alignment. */
const QUADDING = { left: 0, center: 1, right: 2 } as const;

/**
 * A redaction label laid out in a region `width` × `height`, as the engine
 * lays it out when it writes the mark's overlay: a form field's text in the
 * region (PDF points, y up from its bottom), top-aligned, placed across by
 * `/Q`. A label shown once at size 0 fits the region on one line; one at a
 * set size, or a repeated one, wraps to it. A repeated label's text is the
 * label space-joined to itself, doubled until its lines reach the region's
 * bottom; what runs past the region is clipped. `null` for no text.
 */
export function redactLabelText<F extends TextFont>(
  size: { readonly width: number; readonly height: number },
  label: { readonly text: string; readonly repeat: boolean },
  text: TextStyle | undefined,
  fonts: TextFonts<F>,
): FieldText<F> | null {
  if (!label.text) return null;
  const setSize = text?.fontSize ?? 0;
  const fitted = Math.abs(setSize) < 0.0001;
  const options: FieldTextOptions = {
    plate: { left: 0, bottom: 0, right: size.width, top: size.height },
    fontSize: label.repeat && fitted ? REPEAT_FIT_FONT_SIZE : setSize,
    alignment: QUADDING[text?.textAlign ?? 'left'],
    multiline: label.repeat || !fitted,
    password: false,
    limit: 0,
    cells: 0,
    centered: false,
  };
  let shown = label.text;
  let laid = layoutField(shown, fonts, options);
  for (
    let doubling = 0;
    label.repeat && doubling < MAX_REPEAT_DOUBLINGS && laid.contentHeight < size.height;
    doubling++
  ) {
    shown = `${shown} ${shown}`;
    laid = layoutField(shown, fonts, options);
  }
  return laid;
}

/**
 * A redaction label's preview in `region` (page space): the runs
 * {@link redactLabelText} lays out, in the fonts the label carries (its
 * standard font, or Helvetica, without them), clipped to the region. What
 * the engine writes on apply, before it has.
 */
export function layoutRedactLabel(
  region: Rect,
  label: NonNullable<RenderItem['label']>,
  text: TextStyle | undefined,
): SceneNode[] {
  const laid = redactLabelText(
    region,
    label,
    text,
    label.fonts ?? defaultPaintFonts(text?.fontFamily),
  );
  if (!laid) return [];
  const paint: Paint = { fill: text?.fontColor ?? '#ffffff', opacity: 1 };
  const nodes: SceneNode[] = [];
  for (const line of laid.lines) {
    for (const run of line.runs) {
      nodes.push({
        kind: 'textRun',
        at: { x: num(region.x + run.x), y: num(region.y + region.height - line.baseline) },
        text: run.text,
        rtl: run.rtl,
        plain: run.plain,
        ...(run.joinsPrevious ? { joinsPrevious: true } : {}),
        ...(run.joinsNext ? { joinsNext: true } : {}),
        fontSize: laid.fontSize,
        fontFamily: run.font.fontFamily,
        fontWeight: run.font.fontWeight,
        fontStyle: run.font.fontStyle,
        program: run.font.program,
        paint,
        clip: region,
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
    // The engine writes a label in each region's upright bounds.
    for (const region of regions) {
      nodes.push(...layoutRedactLabel(region.bounds, item.label, item.text));
    }
  }
  return nodes;
}

/**
 * Whether the item can be drawn live now (`scene(item)`): anything not
 * drawn from the engine's picture, a kind with a live drawing, and a lent
 * record its lender draws. A stamp or a link can't: its picture is its
 * drawing.
 */
export const hasLiveDrawing = (item: RenderItem): boolean =>
  item.source !== 'baked' ||
  item.lentScene !== undefined ||
  (item.annotation !== undefined && drawsLive({ annotation: item.annotation }));

/** The full painted scene for one annotation. */
export function scene(item: RenderItem): SceneNode[] {
  // A lent record: its lender draws it.
  if (item.lentScene) return [...item.lentScene()];
  // A link draws nothing live: its look, a border when the file gives it one,
  // is the engine's raster (`rasterOnly`), and one being drawn shows as the
  // rubber band. Selection chrome outlines it, so an editable link is
  // findable when selected.
  if (item.subtype === 'link') return [];
  // A note's or file attachment's icon fills its box.
  if (item.geometry.kind === 'box' && item.subtype === 'text')
    return noteIconScene(item.icon, item.geometry.box, item.style);
  if (item.geometry.kind === 'box' && item.subtype === 'file-attachment')
    return fileAttachmentIconScene(item.icon, item.geometry.box, item.style);
  if (item.measure?.intent === 'line-dimension')
    return distanceScene(item.geometry, item.measure, item.style);
  if (item.subtype === 'redact') return redactScene(item);
  if (item.geometry.kind === 'quads')
    return markupScene(item.subtype, item.geometry.quadPoints, item.style);
  if (item.geometry.kind === 'caret') {
    return geomScene(item.geometry, item.style).map((node) => ({
      ...node,
      paint: {
        fill: item.style.color,
        stroke: item.style.color,
        width: CARET_STROKE_WIDTH,
        opacity: item.style.opacity,
      },
    })) as SceneNode[];
  }
  const ink = item.geometry.kind === 'ink'; // freehand: round the pen-stroke ends (caps)
  const nodes = geomScene(item.geometry, item.style).map((node) => {
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
