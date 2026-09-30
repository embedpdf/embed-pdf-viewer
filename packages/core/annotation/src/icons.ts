/**
 * The note and file-attachment icons, drawn live. They are the drawings the
 * engine bakes for these kinds (the fork's `GenerateTextSymbolAP` and
 * `GenerateFileAttachmentSymbolAP`), so a new or restyled icon shows at once,
 * before the engine answers, and looks the same after.
 *
 * Each icon is designed in a 20 × 20 square, y up as PDF draws, and stretched
 * onto the annotation's box, each axis on its own. The annotation's colour
 * fills the body; the outline is black, or white on a dark colour.
 */
import { blendFor } from './kinds/styles';
import type { Paint, Point, Rect, RenderItem, SceneNode, Style } from './types';

/** The side of the square every icon is designed in. */
const DESIGN = 20;

/** The icons' outline width, in design units. */
const OUTLINE = 1;

/** A point in the design square, y up. */
type DesignPoint = (x: number, y: number) => Point;

const num = (value: number): number => Number(value.toFixed(3));

/** Builds an SVG path from design-square coordinates. */
class DesignPath {
  private readonly parts: string[] = [];

  constructor(private readonly toPage: DesignPoint) {}

  private point(x: number, y: number): string {
    const point = this.toPage(x, y);
    return `${num(point.x)} ${num(point.y)}`;
  }

  move(x: number, y: number): this {
    this.parts.push(`M ${this.point(x, y)}`);
    return this;
  }

  line(x: number, y: number): this {
    this.parts.push(`L ${this.point(x, y)}`);
    return this;
  }

  curve(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): this {
    this.parts.push(`C ${this.point(x1, y1)} ${this.point(x2, y2)} ${this.point(x3, y3)}`);
    return this;
  }

  close(): this {
    this.parts.push('Z');
    return this;
  }

  /** A closed rectangle from one corner to the other, as PDF's `re` draws it. */
  rect(x1: number, y1: number, x2: number, y2: number): this {
    return this.move(x1, y1).line(x2, y1).line(x2, y2).line(x1, y2).close();
  }

  /** A closed ellipse in the box between two corners: four curves from its top middle. */
  ellipse(x1: number, y1: number, x2: number, y2: number): this {
    const middleX = (x1 + x2) / 2;
    const middleY = (y1 + y2) / 2;
    const dx = (KAPPA * Math.abs(x2 - x1)) / 2;
    const dy = (KAPPA * Math.abs(y2 - y1)) / 2;
    const [left, right] = [Math.min(x1, x2), Math.max(x1, x2)];
    const [bottom, top] = [Math.min(y1, y2), Math.max(y1, y2)];
    return this.move(middleX, top)
      .curve(middleX + dx, top, right, middleY + dy, right, middleY)
      .curve(right, middleY - dy, middleX + dx, bottom, middleX, bottom)
      .curve(middleX - dx, bottom, left, middleY - dy, left, middleY)
      .curve(left, middleY + dy, middleX - dx, top, middleX, top)
      .close();
  }

  get d(): string {
    return this.parts.join(' ');
  }
}

/** How far a quarter ellipse's control points sit from its ends, as a share of the radius. */
const KAPPA = 0.5523;

/** Black on a light colour, white on a dark one: the outline that reads on the fill. */
export function contrastOf(color: string | null): string {
  const hex = color?.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  const [red, green, blue] = hex ? hex.slice(1).map((part) => parseInt(part, 16) / 255) : [0, 0, 0];
  const luminance = 0.299 * red! + 0.587 * green! + 0.114 * blue!;
  return luminance < 0.45 ? '#ffffff' : '#000000';
}

/** The paints an icon uses, for its style and scale. */
function iconPaints(style: Style, pen: number) {
  const contrast = contrastOf(style.color);
  const base = { opacity: style.opacity, blend: blendFor(style) };
  return {
    contrast,
    /** Filled with the colour and outlined, as PDF's `B` (or `B*`, even-odd) paints. */
    body: (evenOdd = false): Paint => ({
      ...base,
      fill: style.color ?? undefined,
      stroke: contrast,
      width: OUTLINE * pen,
      ...(evenOdd ? { fillRule: 'evenodd' as const } : {}),
    }),
    /** Outlined only. */
    outline: (width = OUTLINE, round = false): Paint => ({
      ...base,
      stroke: contrast,
      width: width * pen,
      ...(round ? { lineCap: 'round' as const, join: 'round' as const } : {}),
    }),
    /** Filled with the outline colour. */
    mark: (): Paint => ({ ...base, fill: contrast }),
    /** A round-ended stroke in the annotation's colour. */
    wire: (width: number): Paint => ({
      ...base,
      stroke: style.color ?? undefined,
      width: width * pen,
      lineCap: 'round',
      join: 'round',
    }),
  };
}

/**
 * The design square stretched onto `box` (page space, y down), and the width
 * a design unit of pen becomes. A stretched icon's pen stretches too; one
 * width, the mean of the two scales, stands in for it.
 */
function designOnto(box: Rect): { toPage: DesignPoint; pen: number } {
  const scaleX = box.width / DESIGN;
  const scaleY = box.height / DESIGN;
  return {
    toPage: (x, y) => ({ x: box.x + x * scaleX, y: box.y + (DESIGN - y) * scaleY }),
    pen: Math.sqrt(scaleX * scaleY),
  };
}

/**
 * A point of a glyph drawn in the square inset by half the outline, so the
 * outline stays inside the box.
 */
const inset =
  (toPage: DesignPoint, design: number): DesignPoint =>
  (x, y) =>
    toPage(
      OUTLINE / 2 + (x / design) * (DESIGN - OUTLINE),
      OUTLINE / 2 + (y / design) * (DESIGN - OUTLINE),
    );

/** A note's icon (`/Name`; `note` when it has none), filling `box`. */
export function noteIconScene(icon: RenderItem['icon'], box: Rect, style: Style): SceneNode[] {
  const { toPage, pen } = designOnto(box);
  const paints = iconPaints(style, pen);
  const path = () => new DesignPath(toPage);
  const glyph = () => new DesignPath(inset(toPage, DESIGN));
  const node = (d: DesignPath, paint: Paint): SceneNode => ({ kind: 'path', d: d.d, paint });

  switch (icon) {
    case 'comment': {
      // A speech balloon with its tip at the bottom left, and three lines of text.
      const balloon = path()
        .move(0.5, 4.5)
        .line(0.5, 19.5)
        .line(19.5, 19.5)
        .line(19.5, 4.5)
        .line(8.5, 4.5)
        .line(6.5, 0.5)
        .line(4.5, 4.5)
        .line(0.5, 4.5);
      for (const y of [15.75, 12, 8.25]) balloon.move(2.5, y).line(17.5, y);
      return [node(balloon, paints.body(true))];
    }
    case 'help': {
      // A disc with a question mark in the outline colour.
      const question = glyph()
        .move(7.2, 12.8)
        .curve(7.2, 15.2, 8.6, 16.2, 10.2, 16.2)
        .curve(11.9, 16.2, 13, 15.1, 13, 13.6)
        .curve(13, 11.6, 10.2, 11.3, 10.2, 9)
        .line(10.2, 7.8);
      return [
        node(glyph().ellipse(1, 1, 19, 19), paints.body()),
        node(question, paints.outline(1.8, true)),
        node(glyph().ellipse(9, 4, 11.4, 6.4), paints.mark()),
      ];
    }
    case 'key': {
      // Its ring (even-odd punches the hole), shaft and two teeth.
      const key = glyph()
        .ellipse(1.5, 8.5, 10.5, 17.5)
        .ellipse(4.2, 11.2, 7.8, 14.8)
        .rect(10.5, 11.8, 18.5, 14.2)
        .rect(13.5, 8.8, 15, 11.8)
        .rect(16.5, 9.8, 18.5, 11.8);
      return [node(key, paints.body(true))];
    }
    case 'new-paragraph': {
      // A triangle pointing up over a line: a new paragraph starts here.
      const mark = glyph().move(3, 8).line(17, 8).line(10, 18).close().rect(3, 2, 17, 5);
      return [node(mark, paints.body(true))];
    }
    case 'paragraph': {
      // The pilcrow as one outline: two stems and the bowl on the left.
      const pilcrow = glyph()
        .move(15.5, 18)
        .line(15.5, 2)
        .line(13.7, 2)
        .line(13.7, 16.2)
        .line(11.8, 16.2)
        .line(11.8, 2)
        .line(10, 2)
        .line(10, 9.6)
        .curve(6.6, 9.6, 4, 11.4, 4, 13.8)
        .curve(4, 16.2, 6.6, 18, 10, 18)
        .close();
      return [node(pilcrow, paints.body())];
    }
    case 'insert': {
      // A caret.
      const caret = glyph()
        .move(2.5, 3)
        .line(10, 17)
        .line(17.5, 3)
        .line(14.3, 3)
        .line(10, 11.2)
        .line(5.7, 3)
        .close();
      return [node(caret, paints.body())];
    }
    default: {
      // Note: a page with its top right corner folded over, and three lines.
      const page = glyph()
        .move(3.5, 1)
        .line(3.5, 19)
        .line(12.5, 19)
        .line(16.5, 15)
        .line(16.5, 1)
        .close();
      const fold = glyph().move(12.5, 19).line(12.5, 15).line(16.5, 15);
      for (const y of [12, 8.5, 5]) fold.move(6, y).line(14, y);
      return [node(page, paints.body()), node(fold, paints.outline())];
    }
  }
}

/** A file attachment's icon (`/Name`; `push-pin` when it has none), filling `box`. */
export function fileAttachmentIconScene(
  icon: RenderItem['icon'],
  box: Rect,
  style: Style,
): SceneNode[] {
  const { toPage, pen } = designOnto(box);
  const paints = iconPaints(style, pen);
  // The glyphs are laid out in shares of the inset square.
  const glyph = () => new DesignPath(inset(toPage, 1));
  const node = (d: DesignPath, paint: Paint): SceneNode => ({ kind: 'path', d: d.d, paint });

  switch (icon) {
    case 'paperclip': {
      // A wire, not a region: a wide outline pass, then the wire in the colour over it.
      const wire = glyph()
        .move(0.32, 0.28)
        .line(0.32, 0.72)
        .curve(0.32, 0.85, 0.68, 0.85, 0.68, 0.72)
        .line(0.68, 0.2)
        .curve(0.68, 0.1, 0.5, 0.1, 0.5, 0.2)
        .line(0.5, 0.65)
        .curve(0.5, 0.72, 0.41, 0.72, 0.41, 0.65)
        .line(0.41, 0.3);
      return [node(wire, paints.outline(2.6, true)), node(wire, paints.wire(1.4))];
    }
    case 'graph': {
      // A frame ring (even-odd) with three bars standing on its bottom edge.
      const graph = glyph()
        .rect(0.1, 0.1, 0.9, 0.9)
        .rect(0.16, 0.16, 0.84, 0.84)
        .rect(0.22, 0.16, 0.36, 0.4)
        .rect(0.43, 0.16, 0.57, 0.56)
        .rect(0.64, 0.16, 0.78, 0.76);
      return [node(graph, paints.body(true))];
    }
    case 'tag': {
      // A label pointing left; even-odd punches its eyelet.
      const tag = glyph()
        .move(0.1, 0.5)
        .line(0.34, 0.8)
        .line(0.9, 0.8)
        .line(0.9, 0.2)
        .line(0.34, 0.2)
        .close()
        .ellipse(0.305, 0.445, 0.415, 0.555);
      return [node(tag, paints.body(true))];
    }
    default: {
      // Push pin: round head, collar and a tapering needle, merged by the nonzero rule.
      const pin = glyph()
        .ellipse(0.33, 0.53, 0.67, 0.87)
        .rect(0.37, 0.46, 0.63, 0.525)
        .move(0.47, 0.455)
        .line(0.53, 0.455)
        .line(0.5, 0.1)
        .close();
      return [node(pin, paints.body())];
    }
  }
}
