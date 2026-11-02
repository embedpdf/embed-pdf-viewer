/**
 * What a page op leaves, worked out before the engine runs it: the document's
 * pages and their label sections as a read of them (`pages.list()`) returns
 * them afterwards. The engine's rules as plain functions, so a viewer can show
 * a page edit at once and the engine follows the same rules
 * (`runPagePredictionConformance` checks them on both engines).
 *
 * An op the engine refuses leaves the list as it is, and the same list comes
 * back. A viewer replays its pending changes over the engine's pages every
 * time those move, so an op that already applied (its page already gone, its
 * blank page already there) changes nothing. Where pages go follows
 * `positionIndex` and `reorderedList`; where label sections go, the rules in
 * `./labels`, and each page's label is read from them (`labelAt`).
 */
import type { PageLabelSection } from '../dto/PageLabelSection';
import type { PageLayout } from '../dto/PageLayout';
import type { PdfRotation } from '../geometry/primitives';
import { encodePageKey, toPageRef, type PageRef } from '../identity/PageRef';
import type { ChangeOp } from '../mutation/Change';
import { positionIndex, reorderedList, type PagePosition } from '../mutation/ListPosition';
import { PAGE_INSERT_BLANK_MAX_COUNT } from '../mutation/PageInsertBlankInput';
import {
  labelAt,
  sameSections,
  sectionsAfterDelete,
  sectionsAfterInsert,
  sectionsAfterMove,
} from './labels';

type PageOp<T extends ChangeOp['type']> = Extract<ChangeOp, { type: T }>;

/** The pages of a document, in display order, and their label sections. */
export interface PageList {
  readonly pages: readonly PageLayout[];
  readonly labels: readonly PageLabelSection[];
}

/**
 * The page ops a prediction knows the outcome of. `pages.insert` isn't one:
 * its pages are those of another PDF. A blank insert and a copy are ones only
 * when they name their pages (`objectNumbers`).
 */
export type PredictablePageOp = PageOp<
  'pages.rotate' | 'pages.reorder' | 'pages.delete' | 'pages.insertBlank' | 'pages.copy'
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

/** `list` once `op` applies, or `list` itself when the engine would refuse it. */
export function pagesAfter(list: PageList, op: PredictablePageOp): PageList {
  switch (op.type) {
    case 'pages.rotate':
      return pagesAfterRotate(list, op.pages, op.rotation);
    case 'pages.reorder':
      return pagesAfterReorder(list, op.pages, op.position);
    case 'pages.delete':
      return pagesAfterDelete(list, op.pages);
    case 'pages.insertBlank':
      return pagesAfterInsertBlank(list, op);
    case 'pages.copy':
      return pagesAfterCopy(list, op);
  }
}

/**
 * The list once a delete's undo brings `restored` back, in the order given:
 * each right after the page it followed, or first when that page isn't
 * there, and in the numbering of the section it lands in. A page that is
 * there already stays where it is.
 */
export function pagesAfterRestore(list: PageList, restored: readonly RestoredPage[]): PageList {
  const order = [...list.pages];
  let { labels } = list;
  const present = new Set(order.map(keyOf));
  for (const { page, after } of restored) {
    if (present.has(keyOf(page))) continue;
    const anchor = after ? order.findIndex((each) => keyOf(each) === encodePageKey(after)) : -1;
    order.splice(anchor + 1, 0, page);
    labels = sectionsAfterInsert(labels, anchor + 1, 1);
    present.add(keyOf(page));
  }
  return order.length === list.pages.length ? list : listOf(order, labels, list);
}

/**
 * The list with `labels` as its label sections: what an undo of a page edit
 * shows, which puts back the sections the edit found.
 */
export function pagesRelabelled(list: PageList, labels: readonly PageLabelSection[]): PageList {
  return sameSections(labels, list.labels) ? list : listOf(list.pages, labels, list);
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
  list: PageList,
  refs: readonly PageRef[],
  rotation: PdfRotation,
): PageList {
  if (!ROTATIONS.includes(rotation) || !namesPagesOnce(list.pages, refs)) return list;
  const turning = new Set(refs.map(encodePageKey));
  let changed = false;
  const pages = list.pages.map((page) => {
    if (!turning.has(keyOf(page)) || page.rotation === rotation) return page;
    changed = true;
    return { ...page, rotation };
  });
  return changed ? { pages, labels: list.labels } : list;
}

function pagesAfterReorder(
  list: PageList,
  refs: readonly PageRef[],
  position: PagePosition,
): PageList {
  const { pages } = list;
  if (refs.length === 0) return list;
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
    return list;
  }
  const moved = order.map((ref) => byKey.get(encodePageKey(ref))!);
  if (moved.every((page, index) => page === pages[index])) return list;
  const first = encodePageKey(refs[0]!);
  const labels = sectionsAfterMove(
    list.labels,
    pages.length,
    indexesOf(pages, refs),
    moved.findIndex((page) => keyOf(page) === first),
  );
  return listOf(moved, labels, list);
}

function pagesAfterDelete(list: PageList, refs: readonly PageRef[]): PageList {
  const { pages } = list;
  if (!namesPagesOnce(pages, refs) || refs.length >= pages.length) return list;
  const deleting = new Set(refs.map(encodePageKey));
  return listOf(
    pages.filter((page) => !deleting.has(keyOf(page))),
    sectionsAfterDelete(list.labels, pages.length, indexesOf(pages, refs)),
    list,
  );
}

function pagesAfterInsertBlank(list: PageList, op: PageOp<'pages.insertBlank'>): PageList {
  const { size } = op.spec;
  const count = op.spec.count ?? 1;
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > PAGE_INSERT_BLANK_MAX_COUNT ||
    !(Number.isFinite(size.width) && size.width > 0) ||
    !(Number.isFinite(size.height) && size.height > 0)
  ) {
    return list;
  }
  return inserted(list, op.position, op.objectNumbers, count, (ref) =>
    blankPage(ref, size.width, size.height),
  );
}

/** Each copy reads as its page does, under its own number. */
function pagesAfterCopy(list: PageList, op: PageOp<'pages.copy'>): PageList {
  const byKey = new Map(list.pages.map((page) => [keyOf(page), page]));
  const sources = op.pages.map((ref) => byKey.get(encodePageKey(ref)));
  if (sources.length === 0 || sources.some((page) => !page)) return list;
  let next = 0;
  return inserted(list, op.position, op.objectNumbers, sources.length, (ref) => ({
    ...sources[next++]!,
    ref,
  }));
}

/**
 * `count` new pages at `position`, made by `make` under the numbers given:
 * one per page, none twice, none a page has. Without them the engine picks
 * numbers a prediction can't know, so the list stays.
 */
function inserted(
  list: PageList,
  position: PagePosition | undefined,
  numbers: readonly number[] | undefined,
  count: number,
  make: (ref: PageRef) => PageLayout,
): PageList {
  const { pages } = list;
  if (!numbers || numbers.length !== count) return list;
  const taken = new Set(pages.map((page) => page.ref.objectNumber));
  if (new Set(numbers).size !== numbers.length || numbers.some((number) => taken.has(number))) {
    return list;
  }
  let at: number;
  try {
    at = positionIndex(
      pages.map((page) => page.ref),
      position ?? 'end',
      encodePageKey,
    );
  } catch {
    return list;
  }
  const made = numbers.map((number) => make(toPageRef(number)));
  return listOf(
    [...pages.slice(0, at), ...made, ...pages.slice(at)],
    sectionsAfterInsert(list.labels, at, count),
    list,
  );
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

/** Where each of `refs` is in `pages`. */
function indexesOf(pages: readonly PageLayout[], refs: readonly PageRef[]): number[] {
  const named = new Set(refs.map(encodePageKey));
  return pages.flatMap((page, index) => (named.has(keyOf(page)) ? [index] : []));
}

/**
 * `order` under `labels`: each page's index its position and its label read
 * from the sections. A page whose index and label stay is the same object,
 * and so are the sections when they say what `before`'s do.
 */
function listOf(
  order: readonly PageLayout[],
  labels: readonly PageLabelSection[],
  before: PageList,
): PageList {
  const sections = sameSections(labels, before.labels) ? before.labels : labels;
  const pages = order.map((page, index) => {
    const label = labelAt(sections, index);
    return page.index === index && page.label === label ? page : { ...page, index, label };
  });
  return { pages, labels: sections };
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
