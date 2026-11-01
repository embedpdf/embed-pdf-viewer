/**
 * Which frames a page shows, and at what size: pure, from the page's transform.
 *
 * - The page frame is the whole page, about twice as wide as it shows when it first does, so it
 *   stays sharp to about twice that size. It's kept while the page zooms.
 * - The sharp frame is just the part on screen, at the screen's resolution, for a page zoomed in
 *   past where its page frame is sharp. It's placed in the page's content box, which the stage
 *   turns with the page: the frames are of the page as it's stored.
 *
 * A frame's key says what it holds (the page, its content version, the size, the part), so a
 * layer shows a frame it has again without asking the server.
 */
import { encodePageKey } from '@embedpdf/core';
import type { PicturePage } from '@embedpdf/plugin-render/contract';
import type { Rect } from '@embedpdf/plugin-stage/contract/host';

/** The largest frame the protected decoders take: H.264 level 5.1, and 4096 pixels a side. */
const MAX_PIXELS = 9_400_000;
const MAX_SIDE = 4096;
/** Page frame widths are rounded up to a step, so a small resize keeps the frame it has. */
const WIDTH_STEP = 256;
/** How far a page frame may stretch before the part on screen gets a sharp frame. */
const SHARP_PAST = 1.05;

type PageTransform = PicturePage['transform'];

/** A page frame: which page, from which version of its content, at which width. */
export interface PageFrame {
  readonly key: string;
  readonly pageKey: string;
  readonly version: number;
  readonly width: number;
  /** What the frames route is asked. */
  readonly query: Readonly<Record<string, string>>;
}

/** A sharp frame: the part of a page on screen, and where it sits in the page's box. */
export interface SharpFrame {
  readonly key: string;
  /** The part, in the content box's pixels: where its layer sits. */
  readonly rectInBox: Rect;
  readonly query: Readonly<Record<string, string>>;
}

/** The page frame `page` shows now, at its content `version`. */
export function pageFrameOf(page: PicturePage, version: number): PageFrame {
  const pageKey = encodePageKey(page.ref);
  const width = pageFrameWidth(page.transform);
  return {
    key: `${pageKey}#${version}w${width}`,
    pageKey,
    version,
    width,
    query: { 'viewport.kind': 'width', 'viewport.width': String(width) },
  };
}

/**
 * The page frame's width: twice the page's width on screen, in device pixels, rounded up to a
 * step, within what the decoders take for the page's shape.
 */
export function pageFrameWidth(transform: PageTransform): number {
  const aspect = transform.contentWidth / transform.contentHeight;
  const largest = Math.min(MAX_SIDE, MAX_SIDE * aspect, Math.sqrt(MAX_PIXELS * aspect));
  const wanted = Math.ceil((2 * transform.deviceWidth) / WIDTH_STEP) * WIDTH_STEP;
  return even(Math.min(wanted, largest));
}

/**
 * The sharp frame of `visible` (the part of the page on screen, in page points), or `null` while
 * `frame` is sharp enough at the page's size, or nothing of it is on screen.
 */
export function sharpFrameOf(
  frame: PageFrame,
  transform: PageTransform,
  visible: Rect,
): SharpFrame | null {
  if (transform.deviceWidth <= frame.width * SHARP_PAST) return null;
  if (visible.width <= 0 || visible.height <= 0) return null;
  const topLeft = transform.toPixels({ x: visible.x, y: visible.y });
  const bottomRight = transform.toPixels({
    x: visible.x + visible.width,
    y: visible.y + visible.height,
  });
  const rectInBox = {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
  const width = even((rectInBox.width * transform.renderScale) / transform.viewScale);
  return {
    key: `${frame.pageKey}#${frame.version}r${rectKey(visible)}w${width}`,
    rectInBox,
    query: {
      'target.kind': 'rect',
      'target.rect.x': String(visible.x),
      'target.rect.y': String(visible.y),
      'target.rect.width': String(visible.width),
      'target.rect.height': String(visible.height),
      'viewport.kind': 'width',
      'viewport.width': String(width),
    },
  };
}

/** The page key a frame key is of. */
export const pageKeyOfFrame = (key: string): string => key.slice(0, key.indexOf('#'));

/** The page's size on screen, in device pixels: a page frame draws again when it changes. */
export const shownSizeOf = (transform: PageTransform): string =>
  `${transform.deviceWidth}x${transform.deviceHeight}`;

/** The even number at or under `value`, at least 16. A hair under one counts as it (1599.9999). */
const even = (value: number) => Math.max(16, 2 * Math.floor(value / 2 + 1e-6));

const rectKey = (rect: Rect) =>
  [rect.x, rect.y, rect.width, rect.height].map((value) => value.toFixed(1)).join(',');
