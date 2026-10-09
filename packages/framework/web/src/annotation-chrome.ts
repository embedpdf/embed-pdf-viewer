/**
 * The selection's chrome, ready to draw: its colors, widths and dashes as CSS
 * ({@link annotationChromePaint}), and each chrome node in the page layer's
 * pixels ({@link chromeInPixels}). The annotation plugin lists the chrome
 * nodes (outline, handles, the rotation handle, guides, the marquee) in page
 * points; a framework adapter only draws what these hand it. The settings and
 * the nodes are mirrored structurally, so this package stays free of EmbedPDF
 * imports.
 */
import type { PagePoint, PageToPixels, PixelRect } from './page-pixels';
import { rectInPixels, svgPoints } from './page-pixels';
import { mixAccent, paint } from './theme';

/** The chrome settings the paint reads: the structural twin of the annotation plugin's `ChromeSettings`. */
export interface ChromePaintSettings {
  readonly accent: string | null;
  readonly outline: {
    readonly color: string | null;
    readonly style: string;
    readonly width: number;
  };
  readonly handles: { readonly fill: string; readonly stroke: string | null };
  readonly rotationHandle: { readonly fill: string | null; readonly stroke: string | null };
  readonly guides: {
    readonly color: string;
    readonly rotationColor: string | null;
    readonly style: string;
    readonly width: number;
  };
  readonly marquee: { readonly fill: string | null; readonly stroke: string | null };
  readonly textOutline: string | null;
}

/** A line's paint as CSS: its color, width and dash. */
export interface ChromeLinePaint {
  readonly stroke: string;
  readonly strokeWidth: string;
  readonly strokeDasharray: string;
}

/** A shape's paint as CSS: its fill and its stroke color. */
export interface ChromeShapePaint {
  readonly fill: string;
  readonly stroke: string;
}

/**
 * Every chrome color, width and dash as CSS, each its `--epdf-annotation-*`
 * variable first, then the setting. Put them in `style`: an SVG attribute
 * doesn't read `var()`.
 */
export interface AnnotationChromePaint {
  /** The selection box. */
  readonly outline: ChromeLinePaint;
  /** The resize and point handles. */
  readonly handle: ChromeShapePaint;
  /** The rotation handle; its stalk takes the `stroke`. */
  readonly rotationHandle: ChromeShapePaint;
  /** A snapped move's alignment guide. */
  readonly guide: ChromeLinePaint;
  /** The reference cross and the angle line while turning. */
  readonly rotationGuide: ChromeLinePaint;
  /** The box dragged to select. */
  readonly marquee: ChromeShapePaint;
  /** The outline color of a text box while someone types in it. */
  readonly textOutline: string;
}

/**
 * The chrome settings as paint. A color left `null` follows the part it
 * names, and in the end the accent: the chrome's own, else the viewer's.
 */
export function annotationChromePaint(
  chrome: ChromePaintSettings,
  viewerAccent: string,
): AnnotationChromePaint {
  const accent = chrome.accent ?? viewerAccent;
  const guideLine = {
    strokeWidth: paint('annotation-guide-width', chrome.guides.width),
    strokeDasharray: paint('annotation-guide-dash', chrome.guides.style),
  };
  return {
    outline: {
      stroke: paint('annotation-outline', chrome.outline.color ?? accent),
      strokeWidth: paint('annotation-outline-width', chrome.outline.width),
      strokeDasharray: paint('annotation-outline-dash', chrome.outline.style),
    },
    handle: {
      fill: paint('annotation-handle-fill', chrome.handles.fill),
      stroke: paint('annotation-handle-stroke', chrome.handles.stroke ?? accent),
    },
    rotationHandle: {
      fill: paint(
        'annotation-rotation-handle-fill',
        chrome.rotationHandle.fill ?? chrome.handles.fill,
      ),
      stroke: paint(
        'annotation-rotation-handle-stroke',
        chrome.rotationHandle.stroke ?? chrome.handles.stroke ?? accent,
      ),
    },
    guide: { stroke: paint('annotation-guide', chrome.guides.color), ...guideLine },
    rotationGuide: {
      stroke: paint('annotation-rotation-guide', chrome.guides.rotationColor ?? accent),
      ...guideLine,
    },
    marquee: {
      fill: paint(
        'annotation-marquee-fill',
        chrome.marquee.fill ?? mixAccent('annotation-marquee-fill', accent),
      ),
      stroke: paint('annotation-marquee-stroke', chrome.marquee.stroke ?? accent),
    },
    textOutline: paint('annotation-text-outline', chrome.textOutline ?? accent),
  };
}

/**
 * One chrome node as the annotation plugin lists it: the structural twin of
 * core-annotation's `ChromeNode`. `Role` is what a handle reshapes.
 */
export type ChromeNodeShape<Role extends string = string> =
  | { kind: 'outline'; rect: { x: number; y: number; width: number; height: number } }
  | { kind: 'obb'; corners: readonly PagePoint[] }
  | { kind: 'handle'; at: PagePoint; rot?: number; role: Role; active: boolean }
  | { kind: 'rotate-knob'; at: PagePoint; from: PagePoint }
  | { kind: 'guide'; axis: 'x' | 'y'; at: number; lo: number; hi: number }
  | {
      kind: 'rotate-guides';
      lines: ReadonlyArray<{ a: PagePoint; b: PagePoint; role: 'axis' | 'indicator' }>;
    }
  | { kind: 'marquee'; rect: { x: number; y: number; width: number; height: number } };

/** A line in pixels. */
export interface ChromeLine {
  from: PagePoint;
  to: PagePoint;
}

/**
 * A chrome node in the page layer's pixels. What each one draws:
 * - `outline`, `marquee`: a rectangle, `box` (the marquee is always dashed `4 3`);
 * - `turned-outline`: a closed polygon through `points`, the outline of a turned selection;
 * - `handle`: a handle centred on `at`, turned by `rotation` (degrees clockwise) when square;
 * - `rotation-handle`: a round handle at `at`, its stalk from `from` on the box;
 * - `guide`: a crisp line, a snapped move's alignment;
 * - `rotation-guides`: the lines of a turn in progress, each at its `opacity`.
 */
export type ChromeInPixels<Role extends string = string> =
  | { kind: 'outline'; box: PixelRect }
  | { kind: 'marquee'; box: PixelRect }
  | { kind: 'turned-outline'; points: string }
  | { kind: 'handle'; at: PagePoint; rotation: number; role: Role; active: boolean }
  | { kind: 'rotation-handle'; at: PagePoint; from: PagePoint }
  | ({ kind: 'guide' } & ChromeLine)
  | { kind: 'rotation-guides'; lines: Array<ChromeLine & { opacity: number }> };

/**
 * Each chrome node in the page layer's pixels, in drawing order. The plugin
 * already sized the screen-constant parts (handle grab zones, the rotation
 * handle's offset) for the page's zoom; this only places them.
 */
export function chromeInPixels<Role extends string>(
  nodes: readonly ChromeNodeShape<Role>[],
  page: PageToPixels,
): ChromeInPixels<Role>[] {
  return nodes.map((node): ChromeInPixels<Role> => {
    switch (node.kind) {
      case 'handle':
        return {
          kind: 'handle',
          at: page.toPixels(node.at),
          rotation: node.rot ?? 0,
          role: node.role,
          active: node.active,
        };
      case 'guide': {
        // A through-line at the snapped edge or centre, spanning both shapes.
        const start = node.axis === 'x' ? { x: node.at, y: node.lo } : { x: node.lo, y: node.at };
        const end = node.axis === 'x' ? { x: node.at, y: node.hi } : { x: node.hi, y: node.at };
        return { kind: 'guide', from: page.toPixels(start), to: page.toPixels(end) };
      }
      case 'obb':
        // A turned selection: the closed quad through its four corners, in
        // place of the upright outline.
        return {
          kind: 'turned-outline',
          points: svgPoints(node.corners.map((corner) => page.toPixels(corner))),
        };
      case 'rotate-guides':
        // A faint 0°/90° reference cross and the line at the angle, already cut to the page.
        return {
          kind: 'rotation-guides',
          lines: node.lines.map((chord) => ({
            from: page.toPixels(chord.a),
            to: page.toPixels(chord.b),
            opacity: chord.role === 'axis' ? 0.35 : 0.8,
          })),
        };
      case 'rotate-knob':
        return {
          kind: 'rotation-handle',
          at: page.toPixels(node.at),
          from: page.toPixels(node.from),
        };
      case 'marquee':
        return { kind: 'marquee', box: rectInPixels(node.rect, page) };
      case 'outline':
        return { kind: 'outline', box: rectInPixels(node.rect, page) };
    }
  });
}
