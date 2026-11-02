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
import type { MountableFontProgram } from './web-font';

/** U+200D: next to a letter drawn alone, it gives the letter its form joined on that side. */
const ZERO_WIDTH_JOINER = '\u200d';

/** A run's text with a joiner on each side where it joins a letter drawn elsewhere. */
const joinedRunText = (run: { text: string; joinsPrevious?: boolean; joinsNext?: boolean }) =>
  `${run.joinsPrevious ? ZERO_WIDTH_JOINER : ''}${run.text}${run.joinsNext ? ZERO_WIDTH_JOINER : ''}`;

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
export type SceneShapeNode = (
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
      program?: MountableFontProgram;
      paint: ScenePaint;
    }
  | {
      kind: 'textRun';
      at: ScenePoint;
      text: string;
      rtl: boolean;
      plain: boolean;
      /** A letter joined to the one before or after it in the text, drawn alone (a comb's cell). */
      joinsPrevious?: boolean;
      joinsNext?: boolean;
      fontSize: number;
      fontFamily: string;
      fontWeight?: number;
      fontStyle?: 'normal' | 'italic';
      rotation?: number;
      /** The face it draws in: whatever draws it mounts it. */
      program?: MountableFontProgram;
      paint: ScenePaint;
    }
) & {
  /** Drawn only inside this upright box. */
  clip?: SceneBox;
};

/** The SVG elements a scene draws with; a nested `svg` clips what's inside it to its box. */
export type SvgShapeTag =
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'path'
  | 'text'
  | 'polygon'
  | 'polyline'
  | 'svg';

/**
 * One SVG element: its tag, its attributes under their SVG names
 * (`stroke-width`, `fill-rule`; an attribute left out is not set), the text
 * inside it, and the CSS that has no attribute (`mix-blend-mode`,
 * `white-space`, `font-kerning`), under its CSS names, for the element's
 * `style`.
 */
export interface SvgShape {
  tag: SvgShapeTag;
  attributes: Readonly<Record<string, string | number>>;
  text?: string;
  style?: Readonly<Record<string, string>>;
  /** What a clipping `svg` holds, in drawing order. */
  children?: SvgShape[];
  /** The face a `text` draws in: the renderer mounts it (`fontProgramsOf`). */
  program?: MountableFontProgram;
}

/** A shape's `style` as CSS text, for a renderer that sets it as one attribute. */
export function styleText(style: Readonly<Record<string, string>> | undefined): string | undefined {
  if (!style) return undefined;
  return Object.entries(style)
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ');
}

/** The faces shapes draw their text in, each once: a renderer mounts them while it shows the shapes. */
export function fontProgramsOf(shapes: readonly SvgShape[]): MountableFontProgram[] {
  const programs = new Map<string, MountableFontProgram>();
  const walk = (each: readonly SvgShape[]) => {
    for (const shape of each) {
      if (shape.program) programs.set(shape.program.family, shape.program);
      if (shape.children) walk(shape.children);
    }
  };
  walk(shapes);
  return [...programs.values()];
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

/**
 * Each scene node as one SVG element, in drawing order, in the scene's own
 * page-point units. A clipped node comes inside an `svg` of its clip box,
 * which shows only what's inside it (no ids, so every framework draws it the
 * same).
 */
export function svgShapesOf(
  nodes: readonly SceneShapeNode[],
  options: SvgShapesOptions,
): SvgShape[] {
  return nodes.map((node) => {
    const shape = svgShapeOf(node, options);
    if (!node.clip) return shape;
    const { x, y, width, height } = node.clip;
    return {
      tag: 'svg',
      attributes: {
        x,
        y,
        width,
        height,
        viewBox: `${x} ${y} ${width} ${height}`,
        overflow: 'hidden',
      },
      children: [shape],
    };
  });
}

function svgShapeOf(node: SceneShapeNode, options: SvgShapesOptions): SvgShape {
  const painted = paintAttributes(node.paint, options.miterLimit);
  const blendStyle = node.paint.blend ? { 'mix-blend-mode': node.paint.blend } : undefined;
  const styled = blendStyle ? { style: blendStyle } : {};
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
        ...styled,
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
        ...styled,
      };
    case 'line':
      return {
        tag: 'line',
        attributes: { x1: node.a.x, y1: node.a.y, x2: node.b.x, y2: node.b.y, ...painted },
        ...styled,
      };
    case 'path':
      return { tag: 'path', attributes: { d: node.d, ...painted }, ...styled };
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
        ...styled,
        ...(node.program ? { program: node.program } : {}),
      };
    case 'poly':
      return {
        tag: node.closed ? 'polygon' : 'polyline',
        attributes: {
          points: node.points.map((point) => `${point.x},${point.y}`).join(' '),
          ...painted,
        },
        ...styled,
      };
    case 'textRun':
      // One element per run, at its left edge: the browser shapes the run in
      // its direction and orders nothing (bidi-override); a right-to-left run
      // ends at its left edge (text-anchor: end). Spaces at either end keep
      // their room only with white-space: pre. A letter joined to a neighbour
      // drawn elsewhere (a comb's cell) gets a joiner on that side, so it
      // takes its joined form; Firefox ignores a joiner at a run's edge under
      // bidi-override, and a lone letter needs no override, so such a run is
      // embedded instead.
      return {
        tag: 'text',
        attributes: {
          x: node.at.x,
          y: node.at.y,
          ...(node.rotation
            ? { transform: `rotate(${node.rotation} ${node.at.x} ${node.at.y})` }
            : {}),
          'font-size': node.fontSize,
          'font-family': node.fontFamily,
          ...(node.fontWeight !== undefined ? { 'font-weight': node.fontWeight } : {}),
          ...(node.fontStyle !== undefined ? { 'font-style': node.fontStyle } : {}),
          direction: node.rtl ? 'rtl' : 'ltr',
          'unicode-bidi': node.joinsPrevious || node.joinsNext ? 'embed' : 'bidi-override',
          'text-anchor': node.rtl ? 'end' : 'start',
          ...painted,
        },
        text: joinedRunText(node),
        style: {
          'white-space': 'pre',
          ...(node.plain ? { 'font-kerning': 'none', 'font-variant-ligatures': 'none' } : {}),
          ...blendStyle,
        },
        ...(node.program ? { program: node.program } : {}),
      };
  }
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
