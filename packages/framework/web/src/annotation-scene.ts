/**
 * An annotation's painted scene as SVG elements. The annotation core turns a
 * render item into its scene (`scene(item)` in `@embedpdf/core-annotation`):
 * rects, ellipses, lines, polygons, paths and text, each with its paint.
 * {@link svgShapesOf} turns that scene into one SVG element description per
 * node (its tag, its attributes under their SVG names, and its text), so a
 * framework adapter draws it with one loop and no per-kind logic. The scene's
 * types are mirrored structurally, so this package stays free of EmbedPDF
 * imports.
 */
import { paint } from './theme';

/** How a scene node paints: the structural twin of core-annotation's `Paint`. */
export interface ScenePaint {
  fill?: string;
  stroke?: string;
  /** Stroke width, in page points. */
  width?: number;
  opacity?: number;
  /** Stroke dash, in page points. */
  dash?: number[];
  blend?: string;
  lineCap?: 'round';
  join?: 'round';
  fillRule?: 'evenodd';
}

interface SceneBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScenePoint {
  x: number;
  y: number;
}

/** One painted node: the structural twin of core-annotation's `SceneNode`. */
export type SceneShapeNode =
  | { kind: 'rect'; rect: SceneBox; paint: ScenePaint }
  | { kind: 'ellipse'; rect: SceneBox; paint: ScenePaint }
  | { kind: 'line'; a: ScenePoint; b: ScenePoint; paint: ScenePaint }
  | { kind: 'poly'; points: ScenePoint[]; closed: boolean; paint: ScenePaint }
  | { kind: 'path'; d: string; paint: ScenePaint }
  | {
      kind: 'text';
      at: ScenePoint;
      text: string;
      fontSize: number;
      fontFamily?: string;
      rotation?: number;
      paint: ScenePaint;
    };

/** The SVG elements a scene draws with. */
export type SvgShapeTag = 'rect' | 'ellipse' | 'line' | 'path' | 'text' | 'polygon' | 'polyline';

/**
 * One SVG element: its tag, its attributes under their SVG names
 * (`stroke-width`, `fill-rule`; an attribute left out is not set), the text
 * inside it, and its blend mode, which is CSS (`mix-blend-mode` in its
 * `style`), never an attribute.
 */
export interface SvgShape {
  tag: SvgShapeTag;
  attributes: Readonly<Record<string, string | number>>;
  text?: string;
  blend?: string;
}

export interface SvgShapesOptions {
  /**
   * The stroke miter limit, core-annotation's `MITER_LIMIT`: it must be the
   * one the core's bounds math uses, so a sharp corner spikes or bevels the
   * same way in both.
   */
  miterLimit: number;
}

/** A node's paint as SVG presentation attributes; everything else about its look is the core's. */
function paintAttributes(
  nodePaint: ScenePaint,
  miterLimit: number,
): Record<string, string | number> {
  const attributes: Record<string, string | number> = {
    fill: nodePaint.fill ?? 'none',
    stroke: nodePaint.stroke ?? 'none',
    // Unset joins are sharp miters; round joins and caps are only for ink.
    'stroke-linejoin': nodePaint.join ?? 'miter',
    'stroke-miterlimit': miterLimit,
  };
  // Even-odd punches the holes of an icon; unset is SVG's nonzero.
  if (nodePaint.fillRule !== undefined) attributes['fill-rule'] = nodePaint.fillRule;
  if (nodePaint.width !== undefined) attributes['stroke-width'] = nodePaint.width;
  if (nodePaint.opacity !== undefined) attributes.opacity = nodePaint.opacity;
  if (nodePaint.lineCap !== undefined) attributes['stroke-linecap'] = nodePaint.lineCap;
  if (nodePaint.dash) attributes['stroke-dasharray'] = nodePaint.dash.join(' ');
  return attributes;
}

/** Each scene node as one SVG element, in drawing order, in the scene's own page-point units. */
export function svgShapesOf(
  nodes: readonly SceneShapeNode[],
  options: SvgShapesOptions,
): SvgShape[] {
  return nodes.map((node) => {
    const painted = paintAttributes(node.paint, options.miterLimit);
    const blend = node.paint.blend ? { blend: node.paint.blend } : {};
    switch (node.kind) {
      case 'rect':
        return {
          tag: 'rect',
          attributes: {
            x: node.rect.x,
            y: node.rect.y,
            width: node.rect.width,
            height: node.rect.height,
            ...painted,
          },
          ...blend,
        };
      case 'ellipse':
        return {
          tag: 'ellipse',
          attributes: {
            cx: node.rect.x + node.rect.width / 2,
            cy: node.rect.y + node.rect.height / 2,
            rx: node.rect.width / 2,
            ry: node.rect.height / 2,
            ...painted,
          },
          ...blend,
        };
      case 'line':
        return {
          tag: 'line',
          attributes: { x1: node.a.x, y1: node.a.y, x2: node.b.x, y2: node.b.y, ...painted },
          ...blend,
        };
      case 'path':
        return { tag: 'path', attributes: { d: node.d, ...painted }, ...blend };
      case 'text':
        return {
          tag: 'text',
          attributes: {
            x: node.at.x,
            y: node.at.y,
            ...(node.rotation
              ? { transform: `rotate(${node.rotation} ${node.at.x} ${node.at.y})` }
              : {}),
            'font-size': node.fontSize,
            ...(node.fontFamily ? { 'font-family': node.fontFamily } : {}),
            ...painted,
          },
          text: node.text,
          ...blend,
        };
      case 'poly':
        return {
          tag: node.closed ? 'polygon' : 'polyline',
          attributes: {
            points: node.points.map((point) => `${point.x},${point.y}`).join(' '),
            ...painted,
          },
          ...blend,
        };
    }
  });
}

/**
 * The `viewBox` an item's scene draws in: its box, in page points. `null`
 * while the box has no area (a drawing at its first press): draw nothing then.
 *
 * The `<svg>` fills the item's frame, so the viewBox and the element's size
 * stay proportional (their ratio is the zoom). Never clamp either one: a
 * clamped element with a shrinking viewBox scales its content up, and a
 * cloudy border's scallops flood the page.
 */
export function sceneViewBox(box: SceneBox): string | null {
  if (box.width <= 0 || box.height <= 0) return null;
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

/** How opaque a tool's ghost paints: `--epdf-ghost-opacity` wins over the tool's own. */
export function ghostOpacity(opacity: number): string {
  return paint('ghost-opacity', opacity);
}
