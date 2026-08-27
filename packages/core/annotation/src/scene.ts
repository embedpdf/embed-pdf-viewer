/**
 * `scene(item)` — the render contract. Turns an annotation render-item into a flat
 * list of fully-PAINTED nodes (geometry + how to paint it). A framework renderer
 * just maps each node to one element and applies `paint`; it owns no per-kind
 * appearance logic, so adding a framework (or a kind) never duplicates drawing.
 *
 * Geometry comes from `geomScene` (shared with hit-testing); paint is layered on
 * here. Text markup is the one family whose paint varies per node (highlight FILLS,
 * underline/strikeout/squiggly STROKE, widths derived from the line height), so it
 * has its own small painter — but it still emits the same generic SceneNodes.
 */
import { textQuadBounds, textQuadRing } from '@embedpdf/core-geometry';
import { geomScene } from './geometry';
import { hatchPath } from './measure';
import type {
  Geom,
  MeasureRender,
  Paint,
  Rect,
  RenderItem,
  SceneNode,
  Style,
  Subtype,
  TextQuad,
  TextStyle,
  Vec,
} from './types';

const num = (n: number): number => Number(n.toFixed(3));

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

/** A smooth squiggle (quadratic-bezier wave) along an ARBITRARY baseline,
 *  generated in the (û, n̂) basis: one `Q` hump then reflected `T` segments
 *  alternate across the run. Reflection is affine-invariant, so an upright
 *  quad reproduces the old axis-aligned wave byte-for-byte. `n̂` points from
 *  the baseline toward the ascent side; humps rise toward the text. */
function squigglePath(start: Vec, u: Vec, n: Vec, w: number, amp: number): string {
  const half = Math.max(2, amp * 1.5); // half a wavelength
  const at = (t: number, off: number): Vec => ({
    x: start.x + u.x * t + n.x * off,
    y: start.y + u.y * t + n.y * off,
  });
  const p = (v: Vec) => `${num(v.x)} ${num(v.y)}`;
  const hump = at(half / 2, amp);
  let d = `M ${p(at(0, 0))} Q ${p(hump)} ${p(at(half, 0))}`;
  for (let t = half; t + half <= w + 0.5; t += half) {
    d += ` T ${p(at(t + half, 0))}`;
  }
  return d;
}

/** Per-subtype markup nodes on the quads' own edges (corner-NAMED TextQuads:
 *  upper = ascent side, lower = baseline side, start → end along the frame).
 *  The colour is the markup `/C` (our model keeps stroke==fill). Rotated and
 *  sheared cells draw along their true baselines; upright output is identical
 *  to the old axis-aligned math. */
function markupScene(subtype: Subtype, quads: TextQuad[], style: Style): SceneNode[] {
  const color = style.color;
  const opacity = style.opacity;
  const nodes: SceneNode[] = [];
  for (const q of quads) {
    const down = { x: q.lowerStart.x - q.upperStart.x, y: q.lowerStart.y - q.upperStart.y };
    const h = Math.hypot(down.x, down.y); // true ink height
    const wVec = { x: q.lowerEnd.x - q.lowerStart.x, y: q.lowerEnd.y - q.lowerStart.y };
    const w = Math.hypot(wVec.x, wVec.y); // true baseline length
    if (w <= 0 || h <= 0) continue;
    const n = { x: down.x / h, y: down.y / h }; // unit, toward the baseline
    const lw = Math.min(2.5, Math.max(0.75, h * 0.06));
    if (subtype === 'underline') {
      // the baseline edge, inset lw off the descent side (the old `y + h − lw`)
      nodes.push({
        kind: 'line',
        a: { x: q.lowerStart.x - n.x * lw, y: q.lowerStart.y - n.y * lw },
        b: { x: q.lowerEnd.x - n.x * lw, y: q.lowerEnd.y - n.y * lw },
        paint: { stroke: color, width: lw, opacity, blend: blendFor(style) },
      });
    } else if (subtype === 'strikeout') {
      nodes.push({
        kind: 'line',
        a: {
          x: (q.upperStart.x + q.lowerStart.x) / 2,
          y: (q.upperStart.y + q.lowerStart.y) / 2,
        },
        b: { x: (q.upperEnd.x + q.lowerEnd.x) / 2, y: (q.upperEnd.y + q.lowerEnd.y) / 2 },
        paint: { stroke: color, width: lw, opacity, blend: blendFor(style) },
      });
    } else if (subtype === 'squiggly') {
      const amp = Math.min(2, Math.max(1, h * 0.08));
      const u = { x: wVec.x / w, y: wVec.y / w };
      const start = { x: q.lowerStart.x - n.x * amp, y: q.lowerStart.y - n.y * amp };
      nodes.push({
        kind: 'path',
        // n̂ toward ascent = −(toward baseline)
        d: squigglePath(start, u, { x: -n.x, y: -n.y }, w, amp),
        paint: { stroke: color, width: lw, opacity, blend: blendFor(style) },
      });
    } else {
      // highlight: translucent fill with `multiply` so the text reads through it
      nodes.push({
        kind: 'poly',
        points: textQuadRing(q),
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
  ring: [Vec, Vec, Vec, Vec];
  bounds: Rect;
}

const rectRing = (r: Rect): [Vec, Vec, Vec, Vec] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];

function redactRegions(geom: Geom): RedactRegion[] {
  if (geom.t === 'quads') {
    const out: RedactRegion[] = [];
    for (const q of geom.quads) {
      const bounds = textQuadBounds(q);
      if (bounds.width > 0 && bounds.height > 0) out.push({ ring: textQuadRing(q), bounds });
    }
    return out;
  }
  if (geom.t === 'rect') return [{ ring: rectRing(geom.rect), bounds: geom.rect }];
  return [];
}

/**
 * Redaction label layout — the SAME reading of ISO 32000-2 the engine's
 * apply-time painter uses, as pure math: top-aligned, `/Q` horizontal
 * alignment, `/Repeat` tiling a full grid that FITS the region (no partial
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
  for (let r = 0; r < rows && nodes.length < 400; r++) {
    for (let c = 0; c < cols && nodes.length < 400; c++) {
      nodes.push({
        kind: 'text',
        at: { x: region.x + c * (textW + charW), y: baseline(region.y + r * lineH) },
        text: label.text,
        ...base,
      });
    }
  }
  return nodes;
}

/**
 * Redaction marks: at REST an outline per region, nothing filled. On HOVER
 * the applied-look preview — the `/IC` fill plus the tiled `/OverlayText`
 * label — exactly what the destructive apply will paint. All pure data, so
 * every framework renders the preview from the same scene.
 */
function redactScene(item: RenderItem): SceneNode[] {
  const regions = redactRegions(item.geom);
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

/* ────────────────────────────────────────────────────────────────────────────
 * Measurement read-out
 * ──────────────────────────────────────────────────────────────────────────── */

/** Average glyph advance as a fraction of font size, for the pill sizing. The
 *  label is a short numeric string in the UI sans-serif; the same estimate sizes
 *  the pill AND places the text, so the two agree even where it is imprecise. */
const LABEL_CHAR_RATIO = 0.6;
/** Pill padding, as a fraction of the font size (so it scales with the label). */
const LABEL_PAD_X = 0.42;
const LABEL_PAD_Y = 0.25;

/** Opacity of the area hatch — a hint that the region is what is measured,
 *  never so strong that it competes with the page underneath. */
const HATCH_OPACITY = 0.4;
/** Hatch line width as a fraction of the spacing: a hairline at any zoom. */
const HATCH_WIDTH_RATIO = 1 / 7;

/**
 * The hatch that fills an area measurement, UNDER the annotation's own paint.
 * Emitted as a single multi-segment path, already clipped to the outline by
 * `hatchPath` — the SceneNode vocabulary has no patterns or clip paths, and it
 * does not need them.
 */
function measureHatch(geom: Geom, style: Style, m: MeasureRender): SceneNode[] {
  if (!(m.hatch > 0)) return [];
  const d = hatchPath(geom, m.hatch);
  if (!d) return [];
  return [
    {
      kind: 'path',
      d,
      paint: {
        stroke: style.color,
        width: m.hatch * HATCH_WIDTH_RATIO,
        opacity: HATCH_OPACITY,
      },
    },
  ];
}

/**
 * The read-out pill: a rounded-ish plate behind the value so it stays legible
 * over any page content, plus the value itself. Drawn LAST so nothing paints
 * over the number. `at` is the pill CENTRE; the text node wants a baseline
 * start, so both are derived from the same estimated text width.
 */
function measureLabel(m: MeasureRender, style: Style): SceneNode[] {
  if (!m.text) return [];
  const fs = m.fontSize;
  const padX = fs * LABEL_PAD_X;
  const padY = fs * LABEL_PAD_Y;
  const textW = m.text.length * fs * LABEL_CHAR_RATIO;
  const boxW = textW + padX * 2;
  const boxH = fs + padY * 2;
  return [
    {
      kind: 'rect',
      rect: { x: m.at.x - boxW / 2, y: m.at.y - boxH / 2, width: boxW, height: boxH },
      paint: { fill: style.color, opacity: 0.92 },
    },
    {
      kind: 'text',
      // Baseline start: left edge of the estimated run, then down from the
      // pill centre by roughly half the cap height.
      at: { x: m.at.x - textW / 2, y: m.at.y + fs * 0.35 },
      text: m.text,
      fontSize: fs,
      paint: { fill: '#ffffff', opacity: 1 },
    },
  ];
}

/**
 * JUST the measurement read-out (hatch + label) for an item, or `[]` when it is
 * not a measurement.
 *
 * `scene()` layers these around the annotation's own paint for a VECTOR item.
 * A committed annotation, though, renders as the engine's baked `/AP` raster —
 * and the engine cannot bake a read-out (there is no `/Measure` appearance to
 * bake). So the painter draws this overlay on top of the raster instead, which
 * is why the two halves are exposed separately. The hatch is translucent, so
 * riding above the raster rather than beneath the stroke is indistinguishable.
 */
export function measureScene(item: RenderItem): SceneNode[] {
  if (!item.measure) return [];
  return [
    ...measureHatch(item.geom, item.style, item.measure),
    ...measureLabel(item.measure, item.style),
  ];
}

/** The full painted scene for one annotation. */
export function scene(item: RenderItem): SceneNode[] {
  // Links paint NOTHING: an invisible hit rectangle is the norm (any visible
  // border a PDF authored shows through the page raster). Selection chrome
  // still outlines it, so an editable link is findable when selected.
  if (item.subtype === 'link') return [];
  if (item.subtype === 'redact') return redactScene(item);
  if (item.geom.t === 'quads') return markupScene(item.subtype, item.geom.quads, item.style);
  if (item.geom.t === 'caret') {
    return geomScene(item.geom).map((n) => ({
      ...n,
      paint: {
        fill: item.style.color,
        stroke: item.style.color,
        width: 0.5,
        opacity: item.style.opacity,
      },
    })) as SceneNode[];
  }
  const ink = item.geom.t === 'ink'; // freehand: round the pen-stroke ends (caps)
  const body = geomScene(item.geom, item.style.strokeWidth, item.style.border).map((n) => {
    const closed =
      n.kind === 'rect' ||
      n.kind === 'ellipse' ||
      n.kind === 'path' ||
      (n.kind === 'poly' && n.closed);
    const paint = { ...shapePaint(item.style, closed), blend: blendFor(item.style) };
    // Ink is freehand: round the pen-stroke ends AND joins. Every other kind keeps
    // the default butt caps + sharp (miter) joins — square corners and poly knees
    // stay crisp.
    return { ...n, paint: ink ? { ...paint, cap: 'round', join: 'round' } : paint } as SceneNode;
  });
  // A measurement layers its hatch UNDER the shape and its read-out OVER it, so
  // the stroke stays crisp and the number is never occluded.
  if (!item.measure) return body;
  return [
    ...measureHatch(item.geom, item.style, item.measure),
    ...body,
    ...measureLabel(item.measure, item.style),
  ];
}
