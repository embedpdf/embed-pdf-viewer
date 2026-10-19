/**
 * Where pages dragged over the thumbnails land, worked out from the thumbnails on screen: the
 * page nearest the pointer, and which side of it. The thumbnails wrap into rows, so in a row of
 * several the side is left or right of the page; in a single column it's above or below. Pure:
 * the panel hands it the boxes the thumbnail lens laid out (`thumbnail-list.tsx`).
 */

/** A page's thumbnail on screen: its object number and its box in the lens's viewport, in px. */
export interface ThumbBox {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How the lens spaces its thumbnails, in px. */
export interface ThumbSpacing {
  /** Between two thumbnails. */
  readonly gap: number;
  /** The band under each page that holds its number. */
  readonly band: number;
}

/** Where a drop puts the pages, next to a page by object number, and the line that shows it. */
export interface ThumbDrop {
  readonly position: { readonly before: number } | { readonly after: number };
  /** In the lens's viewport, in px: a thin box down a row's gap, or across a column's. */
  readonly line: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/** How thick the drop line is drawn, in px. */
const LINE = 2;

/** How many thumbnails share the first row on screen: 1 for a single column. */
export function columnsOf(boxes: readonly ThumbBox[]): number {
  const first = boxes[0];
  if (!first) return 1;
  return Math.max(1, boxes.filter((box) => Math.abs(box.y - first.y) < 1).length);
}

/** How far a point is from a box: 0 inside it. */
function distance(box: ThumbBox, x: number, y: number): number {
  const dx = Math.max(box.x - x, 0, x - (box.x + box.width));
  const dy = Math.max(box.y - y, 0, y - (box.y + box.height));
  return Math.hypot(dx, dy);
}

/**
 * The order of the document's pages once `moving` go to `position`, together in the order they
 * have now: what a reorder answers.
 */
function orderAfter(
  order: readonly number[],
  moving: ReadonlySet<number>,
  position: ThumbDrop['position'],
): number[] {
  const staying = order.filter((page) => !moving.has(page));
  const anchor = 'before' in position ? position.before : position.after;
  const at = staying.indexOf(anchor) + ('after' in position ? 1 : 0);
  const moved = order.filter((page) => moving.has(page));
  return [...staying.slice(0, at), ...moved, ...staying.slice(at)];
}

/**
 * Where pages dropped at `point` land, or `null` when nothing would change: over a page that
 * moves, or in the place the pages already are. `order` is every page of the document in display
 * order; `moving` the pages dragged, empty for files dropped from outside.
 */
export function thumbDropAt(
  boxes: readonly ThumbBox[],
  point: { readonly x: number; readonly y: number },
  spacing: ThumbSpacing,
  order: readonly number[],
  moving: ReadonlySet<number>,
): ThumbDrop | null {
  let nearest: ThumbBox | null = null;
  for (const box of boxes) {
    if (!nearest || distance(box, point.x, point.y) < distance(nearest, point.x, point.y)) {
      nearest = box;
    }
  }
  if (!nearest || moving.has(nearest.page)) return null;
  const across = columnsOf(boxes) > 1;
  const before = across
    ? point.x < nearest.x + nearest.width / 2
    : point.y < nearest.y + nearest.height / 2;
  const position = before ? { before: nearest.page } : { after: nearest.page };
  if (moving.size > 0) {
    const next = orderAfter(order, moving, position);
    if (next.every((page, i) => page === order[i])) return null;
  }
  const half = spacing.gap / 2;
  const line = across
    ? {
        x: (before ? nearest.x - half : nearest.x + nearest.width + half) - LINE / 2,
        y: nearest.y,
        width: LINE,
        height: nearest.height,
      }
    : {
        x: nearest.x,
        y:
          (before ? nearest.y - half : nearest.y + nearest.height + spacing.band + half) - LINE / 2,
        width: nearest.width,
        height: LINE,
      };
  return { position, line };
}

/**
 * The page a move of one slot puts the selection next to, keys up or down: past the nearest page
 * that isn't selected, on that side. `null` at the start or the end.
 */
export function slotMove(
  order: readonly number[],
  selected: ReadonlySet<number>,
  direction: -1 | 1,
): ThumbDrop['position'] | null {
  const indexes = order.flatMap((page, i) => (selected.has(page) ? [i] : []));
  if (indexes.length === 0) return null;
  if (direction < 0) {
    for (let i = indexes[0]! - 1; i >= 0; i -= 1) {
      if (!selected.has(order[i]!)) return { before: order[i]! };
    }
    return null;
  }
  for (let i = indexes[indexes.length - 1]! + 1; i < order.length; i += 1) {
    if (!selected.has(order[i]!)) return { after: order[i]! };
  }
  return null;
}
