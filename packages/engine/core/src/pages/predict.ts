/**
 * What a page op leaves, worked out before the engine runs it: the document's
 * pages as a read of them (`pages.list()`) returns them afterwards. The
 * engine's rules as plain functions, so a viewer can show a page edit at once
 * and the engine follows the same rules (`runPagePredictionConformance`
 * checks them on both engines).
 *
 * An op the engine refuses leaves the pages as they are, and the same list
 * comes back. A viewer replays its pending changes over the engine's pages
 * every time those move, so an op that already applied (its page already
 * gone, its blank page already there) changes nothing. Where pages go follows
 * `positionIndex` and `reorderedList`.
 *
 * Labels stay at their positions, as the engine leaves `/PageLabels`: a
 * position past the last page there was has no label until a read tells.
 */
import type { PageLayout } from '../dto/PageLayout';
import type { PdfRotation } from '../geometry/primitives';
import { encodePageKey, toPageRef, type PageRef } from '../identity/PageRef';
import type { ChangeOp } from '../mutation/Change';
import { positionIndex, reorderedList, type PagePosition } from '../mutation/ListPosition';
import { PAGE_INSERT_BLANK_MAX_COUNT } from '../mutation/PageInsertBlankInput';

type PageOp<T extends ChangeOp['type']> = Extract<ChangeOp, { type: T }>;

/**
 * The page ops a prediction knows the outcome of. `pages.insert` isn't one:
 * its pages are those of another PDF. A blank insert is one only when it
 * names its pages (`objectNumbers`).
 */
export type PredictablePageOp = PageOp<
  'pages.rotate' | 'pages.reorder' | 'pages.delete' | 'pages.insertBlank'
>;

/** A page a delete took, as undoing the delete brings it back. */
export interface RestoredPage {
  /** The page as it read before the delete. */
  readonly page: PageLayout;
  /**
   * The page it followed then, or `null` when it was the first. It comes
   * back right after that page, or first when that page isn't there.
   */
  readonly after: PageRef | null;
}

const ROTATIONS: readonly number[] = [0, 90, 180, 270];

/** `pages` once `op` applies, or `pages` itself when the engine would refuse it. */
export function pagesAfter(
  pages: readonly PageLayout[],
  op: PredictablePageOp,
): readonly PageLayout[] {
  switch (op.type) {
    case 'pages.rotate':
      return pagesAfterRotate(pages, op.pages, op.rotation);
    case 'pages.reorder':
      return pagesAfterReorder(pages, op.pages, op.position);
    case 'pages.delete':
      return pagesAfterDelete(pages, op.pages);
    case 'pages.insertBlank':
      return pagesAfterInsertBlank(pages, op);
  }
}

/**
 * The pages once a delete's undo brings `restored` back, in the order given:
 * each right after the page it followed, or first when that page isn't
 * there. A page that is there already stays where it is.
 */
export function pagesAfterRestore(
  pages: readonly PageLayout[],
  restored: readonly RestoredPage[],
): readonly PageLayout[] {
  const order = [...pages];
  const present = new Set(order.map(keyOf));
  for (const { page, after } of restored) {
    if (present.has(keyOf(page))) continue;
    const anchor = after ? order.findIndex((each) => keyOf(each) === encodePageKey(after)) : -1;
    order.splice(anchor + 1, 0, page);
    present.add(keyOf(page));
  }
  return order.length === pages.length ? pages : renumbered(order, pages);
}

/**
 * What deleting `refs` takes, as undoing the delete brings it back: the
 * pages in display order, each with the page it follows now.
 */
export function restoredPagesOf(
  pages: readonly PageLayout[],
  refs: readonly PageRef[],
): RestoredPage[] {
  const deleting = new Set(refs.map(encodePageKey));
  return pages.flatMap((page, index) =>
    deleting.has(keyOf(page)) ? [{ page, after: index > 0 ? pages[index - 1]!.ref : null }] : [],
  );
}

/**
 * The moves that put `refs` back where they are now, once a reorder moved
 * them: each page, in display order, right after the page it follows now
 * (first when it is the first). What the engine's undo of the reorder does.
 */
export function reorderBackOf(
  pages: readonly PageLayout[],
  refs: readonly PageRef[],
): PageOp<'pages.reorder'>[] {
  return restoredPagesOf(pages, refs).map(({ page, after }) => ({
    type: 'pages.reorder',
    pages: [page.ref],
    position: after ? { after } : 'start',
  }));
}

/**
 * The turns that put `refs` back as they are now, once a rotate turned them:
 * one op for each rotation they have, in the order the pages are named. What
 * the engine's undo of the rotate does.
 */
export function rotateBackOf(
  pages: readonly PageLayout[],
  refs: readonly PageRef[],
): PageOp<'pages.rotate'>[] {
  const rotations = new Map(pages.map((page) => [keyOf(page), page.rotation]));
  const groups = new Map<PdfRotation, PageRef[]>();
  for (const ref of refs) {
    const rotation = rotations.get(encodePageKey(ref));
    if (rotation === undefined) continue;
    groups.set(rotation, [...(groups.get(rotation) ?? []), ref]);
  }
  return [...groups].map(([rotation, group]) => ({
    type: 'pages.rotate',
    pages: group,
    rotation,
  }));
}

/* ── the ops ────────────────────────────────────────────────────────────── */

function pagesAfterRotate(
  pages: readonly PageLayout[],
  refs: readonly PageRef[],
  rotation: PdfRotation,
): readonly PageLayout[] {
  if (!ROTATIONS.includes(rotation) || !namesPagesOnce(pages, refs)) return pages;
  const turning = new Set(refs.map(encodePageKey));
  let changed = false;
  const next = pages.map((page) => {
    if (!turning.has(keyOf(page)) || page.rotation === rotation) return page;
    changed = true;
    return { ...page, rotation };
  });
  return changed ? next : pages;
}

function pagesAfterReorder(
  pages: readonly PageLayout[],
  refs: readonly PageRef[],
  position: PagePosition,
): readonly PageLayout[] {
  if (refs.length === 0) return pages;
  const byKey = new Map(pages.map((page) => [keyOf(page), page]));
  let order: PageRef[];
  try {
    order = reorderedList(
      pages.map((page) => page.ref),
      refs,
      position,
      encodePageKey,
    );
  } catch {
    return pages;
  }
  const moved = order.map((ref) => byKey.get(encodePageKey(ref))!);
  return moved.every((page, index) => page === pages[index]) ? pages : renumbered(moved, pages);
}

function pagesAfterDelete(
  pages: readonly PageLayout[],
  refs: readonly PageRef[],
): readonly PageLayout[] {
  if (!namesPagesOnce(pages, refs) || refs.length >= pages.length) return pages;
  const deleting = new Set(refs.map(encodePageKey));
  return renumbered(
    pages.filter((page) => !deleting.has(keyOf(page))),
    pages,
  );
}

function pagesAfterInsertBlank(
  pages: readonly PageLayout[],
  op: PageOp<'pages.insertBlank'>,
): readonly PageLayout[] {
  const { size } = op.spec;
  const count = op.spec.count ?? 1;
  const numbers = op.objectNumbers;
  if (
    !numbers ||
    numbers.length !== count ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > PAGE_INSERT_BLANK_MAX_COUNT ||
    !(Number.isFinite(size.width) && size.width > 0) ||
    !(Number.isFinite(size.height) && size.height > 0)
  ) {
    return pages;
  }
  const taken = new Set(pages.map((page) => page.ref.objectNumber));
  if (new Set(numbers).size !== numbers.length || numbers.some((number) => taken.has(number))) {
    return pages;
  }
  let at: number;
  try {
    at = positionIndex(
      pages.map((page) => page.ref),
      op.position ?? 'end',
      encodePageKey,
    );
  } catch {
    return pages;
  }
  const blank = numbers.map((number) => blankPage(toPageRef(number), size.width, size.height));
  return renumbered([...pages.slice(0, at), ...blank, ...pages.slice(at)], pages);
}

/* ── helpers ────────────────────────────────────────────────────────────── */

const keyOf = (page: PageLayout): string => encodePageKey(page.ref);

/** Whether `refs` names pages of `pages`, at least one, none twice: what every page op checks. */
function namesPagesOnce(pages: readonly PageLayout[], refs: readonly PageRef[]): boolean {
  if (refs.length === 0) return false;
  const present = new Set(pages.map(keyOf));
  const named = new Set(refs.map(encodePageKey));
  return named.size === refs.length && [...named].every((key) => present.has(key));
}

/**
 * `order` with each page's index its position, and the label `before` has at
 * that position: labels belong to positions. A page whose index and label
 * stay is the same object.
 */
function renumbered(
  order: readonly PageLayout[],
  before: readonly PageLayout[],
): readonly PageLayout[] {
  return order.map((page, index) => {
    const label = before[index]?.label ?? null;
    return page.index === index && page.label === label ? page : { ...page, index, label };
  });
}

/** A blank page as a read returns it: its visible box is its whole page, unturned. */
function blankPage(ref: PageRef, width: number, height: number): PageLayout {
  const box = { x: 0, y: 0, width, height };
  return {
    index: 0,
    ref,
    label: null,
    size: { width, height },
    rotation: 0,
    userUnit: 1,
    tabOrder: null,
    boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
    pdfCropBox: { left: 0, bottom: 0, right: width, top: height },
  };
}
