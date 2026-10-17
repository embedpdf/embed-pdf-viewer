/**
 * An annotation's frame in pixels. The annotation plugin hands out each
 * render item's frame (a box, its turn, and how large the page draws it) and
 * the raster inside it, in page points; these put them in the page layer's
 * pixels, with the CSS turn about the middle. Plain geometry over structural
 * shapes, the same for every framework adapter, so none of them converts,
 * turns or scales anything itself.
 */

/** A box in page points and its turn, degrees clockwise about its middle. */
export interface TurnedBox {
  box: { x: number; y: number; width: number; height: number };
  rotation: number;
}

/** A frame: its box and turn, and how large the page draws it relative to its own size. */
export interface FrameBox extends TurnedBox {
  scale: number;
}

/** What a page layer converts with: its transform's `toPixels`, its turn, and its zoom (1 = 100%). */
export interface PageLayerTransform {
  toPixels(point: { x: number; y: number }): { x: number; y: number };
  rotation: number;
  zoom: number;
}

/** A box in pixels and the CSS that turns it about its middle (`undefined` for no turn). */
export interface PixelBox {
  left: number;
  top: number;
  width: number;
  height: number;
  transform: string | undefined;
}

/** A frame in the page layer's pixels, and what a look drawn inside it needs. */
export interface FramePixels extends PixelBox {
  /** Its turn on screen: its own and the page's, degrees clockwise. */
  rotationOnScreen: number;
  /**
   * How large the frame is on screen relative to the annotation at its 100%
   * size: the zoom, or for a body that keeps its size on screen, the zoom
   * capped at 1. A look drawn at `design` size is scaled by this.
   */
  scale: number;
  /** The frame's size at the annotation's 100% size, in pixels: the size a look is drawn at. */
  design: { width: number; height: number };
}

/** A box inside its frame as CSS percentages of the frame, so it lands in place at any size. */
export interface FrameFraction {
  left: string;
  top: string;
  width: string;
  height: string;
  transform: string | undefined;
}

const turnCss = (rotation: number): string | undefined =>
  rotation ? `rotate(${rotation}deg)` : undefined;

/** A frame in the page layer's pixels: where it is, its turn, and the size and scale a look is drawn at. */
export function frameInPixels(frame: FrameBox, page: PageLayerTransform): FramePixels {
  const { box } = frame;
  const topLeft = page.toPixels({ x: box.x, y: box.y });
  const bottomRight = page.toPixels({ x: box.x + box.width, y: box.y + box.height });
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;
  const scale = frame.scale * page.zoom || 1;
  return {
    left: topLeft.x,
    top: topLeft.y,
    width,
    height,
    transform: turnCss(frame.rotation),
    rotationOnScreen: (((frame.rotation + page.rotation) % 360) + 360) % 360,
    scale,
    design: { width: width / scale, height: height / scale },
  };
}

/**
 * A raster inside its frame, as CSS percentages of the frame. `raster`'s box
 * is relative to the frame's box, as the annotation plugin hands it out.
 */
export function rasterInFrame(raster: TurnedBox, frame: TurnedBox): FrameFraction {
  const percent = (part: number, whole: number) => `${whole > 0 ? (part / whole) * 100 : 0}%`;
  return {
    left: percent(raster.box.x, frame.box.width),
    top: percent(raster.box.y, frame.box.height),
    width: percent(raster.box.width, frame.box.width),
    height: percent(raster.box.height, frame.box.height),
    transform: turnCss(raster.rotation),
  };
}

/** The frame a renderer's look draws into: the size to draw at, its turn on screen, and its scale. */
export interface AnnotationLookFrame {
  width: number;
  height: number;
  /** Its turn on screen, the page's and its own, degrees clockwise. */
  rotation: number;
  /** How much the layer scales what the look draws. */
  scale: number;
}

/**
 * The frame a look draws into. A `scaled` look (the default) draws at the
 * annotation's 100% size (`design`) inside an element of that size, which
 * the layer scales by `scale` from its top-left corner; an unscaled look
 * draws at the frame's size on screen.
 */
export function lookFrameOf(frame: FramePixels, scaled: boolean): AnnotationLookFrame {
  return {
    width: scaled ? frame.design.width : frame.width,
    height: scaled ? frame.design.height : frame.height,
    rotation: frame.rotationOnScreen,
    scale: frame.scale,
  };
}
