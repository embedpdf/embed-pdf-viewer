/**
 * Where a field's new widget goes when `addWidget()` gets no place for it: next in line after
 * the field's widgets on the page. A column of buttons grows downward and a row grows sideways,
 * each step the same as the one between the last two buttons; one button gets the next below
 * it, half its height away. Where the next step leaves the page, the line starts again beside
 * the group (a column) or under it (a row). Page space: top-left origin, y down.
 */
import type { Box } from '../model';

/** The page's size, as the widgets' boxes are measured on it. */
interface PageSize {
  readonly width: number;
  readonly height: number;
}

const fits = (box: Box, page: PageSize): boolean =>
  box.x >= 0 && box.y >= 0 && box.x + box.width <= page.width && box.y + box.height <= page.height;

/** The box after `boxes`, the field's widgets on one page in the field's order. */
export function nextInLine(boxes: readonly Box[], page: PageSize): Box {
  const last = boxes.at(-1);
  if (!last) return { x: 0, y: 0, width: 0, height: 0 };
  const { width, height } = last;
  const previous = boxes.at(-2);
  // The step between the last two, or half a button's height below the only one.
  const step =
    previous && (previous.x !== last.x || previous.y !== last.y)
      ? { x: last.x - previous.x, y: last.y - previous.y }
      : { x: 0, y: height * 1.5 };
  const next = { x: last.x + step.x, y: last.y + step.y, width, height };
  if (fits(next, page)) return next;

  const column = Math.abs(step.y) >= Math.abs(step.x);
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  // The gap between two buttons along the line: the new line keeps the same one.
  const gap = Math.max(column ? Math.abs(step.y) - height : Math.abs(step.x) - width, 0);
  const restart = column
    ? { x: right + (gap || width / 2), y: top, width, height }
    : { x: left, y: bottom + (gap || height / 2), width, height };
  if (fits(restart, page)) return restart;
  // No room beside the group either: on the page, at the last button's place shifted in.
  return {
    x: Math.min(Math.max(next.x, 0), Math.max(page.width - width, 0)),
    y: Math.min(Math.max(next.y, 0), Math.max(page.height - height, 0)),
    width,
    height,
  };
}
