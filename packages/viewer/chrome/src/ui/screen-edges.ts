/**
 * Which edges of the window the viewer reaches, and the padding that keeps
 * what sits at those edges clear of the notch, the rounded corners and the
 * home bar. The padding is the browser's `env(safe-area-inset-*)`, which is
 * zero unless the page lets content under those areas (`viewport-fit=cover`),
 * so it changes nothing on an ordinary page. The viewer reaches an edge when
 * its box is at that edge of the window or past it, as in full screen or as
 * the whole page of a phone app.
 */
/** For each edge of the window, whether the viewer reaches it. */
export interface ScreenEdges {
  readonly top: boolean;
  readonly right: boolean;
  readonly bottom: boolean;
  readonly left: boolean;
}

export const NO_SCREEN_EDGES: ScreenEdges = {
  top: false,
  right: false,
  bottom: false,
  left: false,
};

/** A box in window px. */
export interface ScreenBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** How close to the window's edge a box counts as reaching it, for rounding. */
const EDGE_TOLERANCE_PX = 1;

/** The edges of a `width` × `height` window that `box` reaches while some of it is on screen. */
export function screenEdgesOf(
  box: ScreenBox,
  view: { readonly width: number; readonly height: number },
): ScreenEdges {
  const across = box.right > 0 && box.left < view.width;
  const down = box.bottom > 0 && box.top < view.height;
  return {
    top: across && box.top <= EDGE_TOLERANCE_PX && box.bottom > 0,
    right: down && box.right >= view.width - EDGE_TOLERANCE_PX && box.left < view.width,
    bottom: across && box.bottom >= view.height - EDGE_TOLERANCE_PX && box.top < view.height,
    left: down && box.left <= EDGE_TOLERANCE_PX && box.right > 0,
  };
}

export const sameScreenEdges = (left: ScreenEdges, right: ScreenEdges): boolean =>
  left.top === right.top &&
  left.right === right.right &&
  left.bottom === right.bottom &&
  left.left === right.left;

/** The padding of each side in `sides` whose edge the viewer reaches. */
export interface SafeAreaPadding {
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
}

const PADDING: Readonly<Record<keyof ScreenEdges, keyof SafeAreaPadding>> = {
  top: 'paddingTop',
  right: 'paddingRight',
  bottom: 'paddingBottom',
  left: 'paddingLeft',
};

/** The safe-area padding for the reached edges among `sides` (default all four), as style properties. */
export function safeAreaPaddingOf(
  edges: ScreenEdges,
  sides: readonly (keyof ScreenEdges)[] = ['top', 'right', 'bottom', 'left'],
): SafeAreaPadding {
  const padding: SafeAreaPadding = {};
  for (const side of sides) {
    if (edges[side]) padding[PADDING[side]] = `env(safe-area-inset-${side}, 0px)`;
  }
  return padding;
}

/** The window's size, without its scrollbars. */
export function windowSizeOf(element: Element): { width: number; height: number } {
  const { clientWidth, clientHeight } = element.ownerDocument.documentElement;
  return { width: clientWidth, height: clientHeight };
}
