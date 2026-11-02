import {
  authorizeCapability,
  sameSections,
  sectionsAfterDelete,
  sectionsAfterInsert,
  sectionsAfterMove,
  toPageRef,
  type ChangeOp,
  type PageInsertResult,
  type PageLabelSection,
  type PageListSnapshot,
  type PdfCoordinates,
  type PdfRotation,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';

import { canonicalDict, exportPage, importPage } from './captures';
import { leftAlone, type ChangeContext, type Done } from './changeContext';
import { deleteFieldsOn, fieldNumbersOf } from './formChanges';
import { sha256HexOf } from '../../../runtime/digest';
import { PagesInserter, PagesMutator, PagesReader, rotationAt } from '../../pages';
import { readLabelSections, writeLabelSections } from '../../pages/internal/pageLabels';
import type {
  PageLabelsStep,
  PageRemoveStep,
  PageReorderStep,
  PageRestoreStep,
  PageRotateStep,
} from '../ChangeRecord';

type Op<T extends ChangeOp['type']> = Extract<
  ChangeOp<PdfCoordinates, WireAnnotationResources>,
  { type: T }
>;

/** What a page's guard digests: the page, and what the layer holds of these. */
const PAGE_DEEP_KEYS = ['Annots', 'Contents', 'Resources'];

/**
 * What it leaves out of the page's bytes: its place (/Parent), so moving
 * pages around it changes nothing, and its /Rotate, which counts by value
 * instead: turning a page and turning it back reads the same.
 */
const PAGE_SKIPPED_KEYS = ['Parent', 'Rotate'];

/**
 * Runs a page op or step. It changes the page tree in place, so the
 * document's idle parsed pages close before and after it, as a
 * `contentWrite` job's do: no page that went, or came back, stays parsed.
 */
export function changingPageTree(ctx: ChangeContext, write: () => Done): Done {
  const pool = ctx.session.pagePool();
  pool.closeIdle();
  try {
    return write();
  } finally {
    pool.closeIdle();
  }
}

const mutatorOf = (ctx: ChangeContext) => new PagesMutator(ctx.runtime, ctx.session);
const inserterOf = (ctx: ChangeContext) => new PagesInserter(ctx.runtime, ctx.session);
const authorize = (ctx: ChangeContext) => authorizeCapability(ctx.authority, 'doc.pages.assemble');

/** `pages.rotate`; its reverse turns each page back while it still has this rotation. */
export function rotatePages(ctx: ChangeContext, op: Op<'pages.rotate'>): Done {
  authorize(ctx);
  const before = rotationsOf(layoutOf(ctx));
  const result = mutatorOf(ctx).rotate([...op.pages], op.rotation, ctx.signal);
  const pages = op.pages.map((page) => page.objectNumber);
  return {
    item: { type: 'pages.rotate', pages: [...op.pages], rotation: op.rotation, ...result },
    reverse: rotateSteps(pages, before, op.rotation),
  };
}

/** Turns pages to a step's rotation, those that still have the rotation it left. */
export function rotatePagesBack(ctx: ChangeContext, step: PageRotateStep): Done {
  const now = rotationsOf(layoutOf(ctx));
  const pages = step.pages.filter((page) => now.get(page) === step.left);
  if (pages.length === 0) return leftAlone(ctx, 'pages.rotate');
  authorize(ctx);
  const refs = pages.map(toPageRef);
  const result = mutatorOf(ctx).rotate(refs, step.rotation, ctx.signal);
  return {
    item: { type: 'pages.rotate', pages: refs, rotation: step.rotation, ...result },
    reverse: [{ kind: 'pages.rotate', pages, rotation: step.left, left: step.rotation }],
  };
}

/**
 * `pages.reorder`; its reverse puts each page back after the page it
 * followed. A move that changes the order moves the label sections too: a
 * delete, then an insert.
 */
export function reorderPages(ctx: ChangeContext, op: Op<'pages.reorder'>): Done {
  authorize(ctx);
  const pages = op.pages.map((page) => page.objectNumber);
  const before = orderOf(ctx);
  const found = labelsOf(ctx);
  const back = placementsOf(before, pages);
  const result = mutatorOf(ctx).reorder([...op.pages], op.position, ctx.signal);
  const after = orderOf(ctx);
  const labels = relabel(ctx, found, labelsMoved(found, before, after, pages));
  return {
    item: { type: 'pages.reorder', ...result, ...layoutIfRelabelled(ctx, labels) },
    reverse: [
      {
        kind: 'pages.reorder',
        placements: back,
        left: placementsOf(after, pages),
        ...(labels ? { labels } : {}),
      },
    ],
  };
}

/**
 * Puts pages back where a move found them: each still after the page the move
 * left it after, the page it goes after still there.
 */
export function reorderPagesBack(ctx: ChangeContext, step: PageReorderStep): Done {
  const order = orderOf(ctx);
  const leftAfter = new Map(step.left.map(({ page, after }) => [page, after]));
  const placements = step.placements.filter(({ page, after }) => {
    const at = order.indexOf(page);
    return (
      at >= 0 &&
      (order[at - 1] ?? 0) === leftAfter.get(page) &&
      (after === 0 || order.includes(after))
    );
  });
  if (placements.length === 0) return leftAlone(ctx, 'pages.reorder');
  authorize(ctx);
  const pages = placements.map(({ page }) => page);
  const back = placementsOf(order, pages);
  const found = labelsOf(ctx);
  const mutator = mutatorOf(ctx);
  let layout: PageListSnapshot<PdfCoordinates> | null = null;
  let ruled: readonly PageLabelSection[] = found;
  let moving = order;
  for (const { page, after } of placements) {
    const position = after === 0 ? 'start' : { after: toPageRef(after) };
    ({ layout } = mutator.reorder([toPageRef(page)], position, ctx.signal));
    const moved = orderOf(ctx);
    ruled = labelsMoved(ruled, moving, moved, [page]);
    moving = moved;
  }
  const labels = relabel(ctx, found, labelsAfter(found, ruled, step.labels));
  return {
    item: {
      type: 'pages.reorder',
      pages: pages.map(toPageRef),
      layout: labels ? layoutOf(ctx) : layout!,
      meta: metaOf(ctx),
    },
    reverse: [
      {
        kind: 'pages.reorder',
        placements: back,
        left: placementsOf(orderOf(ctx), pages),
        ...(labels ? { labels } : {}),
      },
    ],
  };
}

/** `pages.delete`, captured in its transaction so an undo brings back the same pages. */
export function deletePages(ctx: ChangeContext, op: Op<'pages.delete'>): Done {
  authorize(ctx);
  const pages = inDisplayOrder(
    orderOf(ctx),
    ctx.session.resolvePageRefs(op.pages), // NotFound for a page the document doesn't have
  );
  return writeDelete(ctx, pages);
}

/**
 * Brings back pages a delete removed, those that aren't back already, and the
 * label sections the delete found; each page lands in the numbering of the
 * section it lands in when the sections moved since.
 */
export function restorePages(ctx: ChangeContext, step: PageRestoreStep): Done {
  const order = orderOf(ctx);
  const gone = step.pages.filter(({ page }) => !order.includes(page));
  if (gone.length === 0) return leftAlone(ctx, 'pages.restore');
  authorize(ctx);
  const found = labelsOf(ctx);
  const docPtr = ctx.session.requireDocPtr();
  // In the display order they had: each page it followed is back before it.
  for (const { capture } of gone) importPage(ctx.runtime, docPtr, capture);
  ctx.session.refreshPageRegistry();
  ctx.session.invalidateDerived();
  const restored = orderOf(ctx);
  const pages = inDisplayOrder(
    restored,
    gone.map(({ page }) => page),
  );
  // Each came back where the pages before it already were.
  const ruled = pages.reduce<readonly PageLabelSection[]>(
    (sections, page) => sectionsAfterInsert(sections, restored.indexOf(page), 1),
    found,
  );
  const labels = relabel(ctx, found, labelsAfter(found, ruled, step.labels));
  return {
    item: {
      type: 'pages.restore',
      pages: pages.map(toPageRef),
      layout: layoutOf(ctx),
      meta: metaOf(ctx),
    },
    reverse: [removeStepOf(ctx, pages, labels)],
  };
}

/**
 * Deletes pages an insert or a restore brought, those that read as the change
 * left them; never every page of the document.
 */
export function removePages(ctx: ChangeContext, step: PageRemoveStep): Done {
  const order = orderOf(ctx);
  const pages = step.pages
    .filter(({ page, left }) => order.includes(page) && digestOf(ctx, page) === left)
    .map(({ page }) => page);
  if (pages.length === 0 || pages.length >= order.length) {
    return leftAlone(ctx, 'pages.delete');
  }
  authorize(ctx);
  const fields = deleteFieldsOn(ctx, step.fields ?? [], new Set(pages));
  const done = writeDelete(ctx, inDisplayOrder(order, pages), step.labels);
  return { item: done.item, reverse: [...done.reverse, ...fields] };
}

/** `pages.insertBlank`; its reverse deletes the new pages while nobody changed them. */
export function insertBlankPages(ctx: ChangeContext, op: Op<'pages.insertBlank'>): Done {
  authorize(ctx);
  return inserting(ctx, 'pages.insertBlank', () =>
    inserterOf(ctx).insertBlank(op.spec, op.position ?? 'end', ctx.signal, op.objectNumbers),
  );
}

/** `pages.insert`; its reverse deletes the pages it copied in while nobody changed them. */
export function insertPages(ctx: ChangeContext, op: Op<'pages.insert'>): Done {
  authorize(ctx);
  return inserting(ctx, 'pages.insert', () =>
    inserterOf(ctx).insert(bufferOf(op.source), op.position ?? 'end', ctx.signal, op.objectNumbers),
  );
}

/** `pages.copy`; its reverse deletes the copies while nobody changed them. */
export function copyPages(ctx: ChangeContext, op: Op<'pages.copy'>): Done {
  authorize(ctx);
  return inserting(ctx, 'pages.copy', () =>
    inserterOf(ctx).copy(op.pages, op.position ?? 'end', ctx.signal, op.objectNumbers),
  );
}

/**
 * Runs an insert: the new pages take the numbering of the section they land
 * in. Pages copied in may bring form fields, which its reverse deletes with
 * them.
 */
function inserting(
  ctx: ChangeContext,
  type: 'pages.insertBlank' | 'pages.insert' | 'pages.copy',
  insert: () => PageInsertResult<PdfCoordinates>,
): Done {
  const copying = type !== 'pages.insertBlank';
  const found = labelsOf(ctx);
  const fieldsBefore = copying ? fieldNumbersOf(ctx) : new Set<number>();
  const result = insert();
  if (copying) ctx.session.invalidateDerived();
  const fields = copying
    ? [...fieldNumbersOf(ctx)].filter((field) => !fieldsBefore.has(field))
    : [];
  const pages = result.insertedPages.map((page) => page.objectNumber);
  const at = orderOf(ctx).indexOf(pages[0]!);
  const labels = relabel(ctx, found, sectionsAfterInsert(found, at, pages.length));
  return {
    item: { type, ...result, ...layoutIfRelabelled(ctx, labels) },
    reverse: [removeStepOf(ctx, pages, labels, fields)],
  };
}

/**
 * Deletes `pages`, in display order, each captured first so its restore
 * brings it back. The label sections follow (`sectionsAfterDelete`), or
 * become a step's (`labels`) while they read as its change left them.
 */
function writeDelete(ctx: ChangeContext, pages: readonly number[], step?: PageLabelsStep): Done {
  const docPtr = ctx.session.requireDocPtr();
  const order = orderOf(ctx);
  const found = labelsOf(ctx);
  // Every capture before any page goes, so each holds the page it followed.
  const captures = pages.map((page) => ({ page, capture: exportPage(ctx.runtime, docPtr, page) }));
  const refs = pages.map(toPageRef);
  const result = mutatorOf(ctx).delete(refs, ctx.signal);
  ctx.session.invalidateDerived();
  const ruled = sectionsAfterDelete(
    found,
    order.length,
    pages.map((page) => order.indexOf(page)),
  );
  const labels = relabel(ctx, found, labelsAfter(found, ruled, step));
  return {
    item: { type: 'pages.delete', pages: refs, ...result, ...layoutIfRelabelled(ctx, labels) },
    reverse: [{ kind: 'pages.restore', pages: captures, ...(labels ? { labels } : {}) }],
  };
}

/** The step that deletes `pages` again while each reads as it does now. */
function removeStepOf(
  ctx: ChangeContext,
  pages: readonly number[],
  labels?: PageLabelsStep,
  fields: readonly number[] = [],
): PageRemoveStep {
  return {
    kind: 'pages.remove',
    pages: pages.map((page) => ({ page, left: digestOf(ctx, page) })),
    ...(labels ? { labels } : {}),
    ...(fields.length > 0 ? { fields } : {}),
  };
}

/* ── label sections ─────────────────────────────────────────────────────── */

function labelsOf(ctx: ChangeContext): PageLabelSection[] {
  return readLabelSections(ctx.runtime, ctx.session.requireDocPtr());
}

/**
 * The sections a step leaves: those it puts back while the document's read
 * as its change left them (`found` is how they read before the step), else
 * those the rules give.
 */
function labelsAfter(
  found: readonly PageLabelSection[],
  ruled: readonly PageLabelSection[],
  step: PageLabelsStep | undefined,
): readonly PageLabelSection[] {
  return step && sameSections(found, step.left) ? step.sections : ruled;
}

/**
 * Writes `sections` when they say other than `found`, and the step that puts
 * `found` back; `undefined` when the sections stay.
 */
function relabel(
  ctx: ChangeContext,
  found: readonly PageLabelSection[],
  sections: readonly PageLabelSection[],
): PageLabelsStep | undefined {
  if (sameSections(found, sections)) return undefined;
  writeLabelSections(ctx.runtime, ctx.session.requireDocPtr(), sections);
  return { sections: found, left: sections };
}

/**
 * The sections once `pages` moved together from `before` to `after`: a move
 * that changes the order is a delete followed by an insert, where the first
 * of them lands.
 */
function labelsMoved(
  sections: readonly PageLabelSection[],
  before: readonly number[],
  after: readonly number[],
  pages: readonly number[],
): readonly PageLabelSection[] {
  if (before.every((page, index) => after[index] === page)) return sections;
  return sectionsAfterMove(
    sections,
    before.length,
    pages.map((page) => before.indexOf(page)),
    after.indexOf(pages[0]!),
  );
}

/** A write's layout read again when it wrote label sections: the labels moved after its read. */
function layoutIfRelabelled(
  ctx: ChangeContext,
  labels: PageLabelsStep | undefined,
): { layout?: PageListSnapshot<PdfCoordinates> } {
  return labels ? { layout: layoutOf(ctx) } : {};
}

/**
 * How a page reads now: the digest of its dictionary and of what the layer
 * holds of its annotations, contents and resources, as they read (canonical
 * bytes: a save that only encodes a stream again changes nothing), without
 * its place, and with its turn as a value.
 */
function digestOf(ctx: ChangeContext, page: number): string {
  const { fn, mem } = ctx.runtime;
  const docPtr = ctx.session.requireDocPtr();
  const bytes = canonicalDict(ctx.runtime, docPtr, page, PAGE_DEEP_KEYS, PAGE_SKIPPED_KEYS);
  const index = ctx.session.allRecords().find((record) => record.pageObjectNumber === page);
  const turn = index ? rotationAt(ctx.runtime, docPtr, index.pageIndex) : 0;
  const turned = new TextEncoder().encode(`\nturn ${turn}`);
  const digested = new Uint8Array(bytes.byteLength + turned.byteLength);
  digested.set(bytes);
  digested.set(turned, bytes.byteLength);
  return sha256HexOf(fn, mem, digested);
}

/** The steps that turn each page back, one for each rotation the pages had. */
function rotateSteps(
  pages: readonly number[],
  before: ReadonlyMap<number, PdfRotation>,
  left: PdfRotation,
): PageRotateStep[] {
  const byRotation = new Map<PdfRotation, number[]>();
  for (const page of pages) {
    const rotation = before.get(page)!;
    byRotation.set(rotation, [...(byRotation.get(rotation) ?? []), page]);
  }
  return [...byRotation].map(([rotation, group]) => ({
    kind: 'pages.rotate',
    pages: group,
    rotation,
    left,
  }));
}

/** Where each of `pages` is in `order`: the page it follows (0: first), in display order. */
function placementsOf(
  order: readonly number[],
  pages: readonly number[],
): { page: number; after: number }[] {
  return inDisplayOrder(order, pages).map((page) => ({
    page,
    after: order[order.indexOf(page) - 1] ?? 0,
  }));
}

/** `pages` sorted as `order` has them. */
function inDisplayOrder(order: readonly number[], pages: readonly number[]): number[] {
  return [...pages].sort((left, right) => order.indexOf(left) - order.indexOf(right));
}

/** The document's pages by object number, in display order. */
function orderOf(ctx: ChangeContext): number[] {
  return ctx.session.allRecords().map((record) => record.pageObjectNumber);
}

function layoutOf(ctx: ChangeContext): PageListSnapshot<PdfCoordinates> {
  return new PagesReader(ctx.runtime, ctx.session).read(ctx.signal);
}

function rotationsOf(layout: PageListSnapshot<PdfCoordinates>): Map<number, PdfRotation> {
  return new Map(layout.pages.map((page) => [page.ref.objectNumber, page.rotation]));
}

function metaOf(ctx: ChangeContext) {
  return { affectedPages: [], cacheDelta: null, ...ctx.session.writeStamp() };
}

/** The bytes of `source` as an ArrayBuffer of their own. */
function bufferOf(source: Uint8Array): ArrayBuffer {
  return source.byteOffset === 0 && source.byteLength === source.buffer.byteLength
    ? (source.buffer as ArrayBuffer)
    : (source.slice().buffer as ArrayBuffer);
}
