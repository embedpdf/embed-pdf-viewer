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
import { geomScene } from './geometry';
import type {
  Geom,
  Paint,
  Quad,
  Rect,
  RenderItem,
  SceneNode,
  Style,
  Subtype,
  TextStyle,
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

/** A smooth squiggle (quadratic-bezier wave) along a baseline, adapted from v2's
 *  tile: one `Q` hump then reflected `T` segments alternate up/down across the run. */
function squigglePath(x: number, y: number, w: number, amp: number): string {
  const half = Math.max(2, amp * 1.5); // half a wavelength
  let d = `M ${num(x)} ${num(y)} Q ${num(x + half / 2)} ${num(y - amp)} ${num(x + half)} ${num(y)}`;
  for (let px = x + half; px + half <= x + w + 0.5; px += half) {
    d += ` T ${num(px + half)} ${num(y)}`;
  }
  return d;
}

/** Per-subtype markup nodes. Quads are axis-aligned per-line rects (UL,UR,LL,LR);
 *  the colour is the markup `/C` (our model keeps stroke==fill). */
function markupScene(subtype: Subtype, quads: Quad[], style: Style): SceneNode[] {
  const color = style.color;
  const opacity = style.opacity;
  const nodes: SceneNode[] = [];
  for (const q of quads) {
    const x = q[0].x;
    const y = q[0].y;
    const w = q[1].x - q[0].x;
    const h = q[2].y - q[0].y;
    if (w <= 0 || h <= 0) continue;
    const lw = Math.min(2.5, Math.max(0.75, h * 0.06));
    if (subtype === 'underline') {
      const yy = y + h - lw;
      nodes.push({
        kind: 'line',
        a: { x, y: yy },
        b: { x: x + w, y: yy },
        paint: { stroke: color, width: lw, opacity, blend: blendFor(style) },
      });
    } else if (subtype === 'strikeout') {
      const yy = y + h / 2;
      nodes.push({
        kind: 'line',
        a: { x, y: yy },
        b: { x: x + w, y: yy },
        paint: { stroke: color, width: lw, opacity, blend: blendFor(style) },
      });
    } else if (subtype === 'squiggly') {
      const amp = Math.min(2, Math.max(1, h * 0.08));
      nodes.push({
        kind: 'path',
        d: squigglePath(x, y + h - amp, w, amp),
        paint: { stroke: color, width: lw, opacity, blend: blendFor(style) },
      });
    } else {
      // highlight: translucent fill with `multiply` so the text reads through it
      nodes.push({
        kind: 'rect',
        rect: { x, y, width: w, height: h },
        paint: { fill: color, opacity, blend: blendFor(style) },
      });
    }
  }
  return nodes;
}

/** A redact mark's regions: per-quad boxes (text marks) or the rect (area). */
function redactRegions(geom: Geom): Rect[] {
  if (geom.t === 'quads') {
    const out: Rect[] = [];
    for (const q of geom.quads) {
      const w = q[1].x - q[0].x;
      const h = q[2].y - q[0].y;
      if (w > 0 && h > 0) out.push({ x: q[0].x, y: q[0].y, width: w, height: h });
    }
    return out;
  }
  if (geom.t === 'rect') return [geom.rect];
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
    return regions.map((rect) => ({ kind: 'rect', rect, paint }) as SceneNode);
  }
  const nodes: SceneNode[] = [];
  if (item.style.interiorColor) {
    const fill = { fill: item.style.interiorColor, opacity: 1 };
    for (const rect of regions) nodes.push({ kind: 'rect', rect, paint: fill });
  }
  if (item.label) {
    for (const region of regions) nodes.push(...layoutRedactLabel(region, item.label, item.text));
  }
  return nodes;
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
  return geomScene(item.geom, item.style.strokeWidth, item.style.border).map((n) => {
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
}
