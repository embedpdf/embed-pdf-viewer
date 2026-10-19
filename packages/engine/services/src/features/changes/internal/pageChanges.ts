import {
  authorizeCapability,
  toPageRef,
  type ChangeOp,
  type PageListSnapshot,
  type PdfCoordinates,
  type PdfRotation,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';

import { exportDict, exportPage, importPage } from './captures';
import { leftAlone, type ChangeContext, type Done } from './changeContext';
import { sha256HexOf } from '../../../runtime/digest';
import { PagesInserter, PagesMutator, PagesReader } from '../../pages';
import type {
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

/** `pages.reorder`; its reverse puts each page back after the page it followed. */
export function reorderPages(ctx: ChangeContext, op: Op<'pages.reorder'>): Done {
  authorize(ctx);
  const pages = op.pages.map((page) => page.objectNumber);
  const back = placementsOf(orderOf(ctx), pages);
  const result = mutatorOf(ctx).reorder([...op.pages], op.position, ctx.signal);
  return {
    item: { type: 'pages.reorder', ...result },
    reverse: [{ kind: 'pages.reorder', placements: back, left: placementsOf(orderOf(ctx), pages) }],
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
  const mutator = mutatorOf(ctx);
  let layout: PageListSnapshot<PdfCoordinates> | null = null;
  for (const { page, after } of placements) {
    const position = after === 0 ? 'start' : { after: toPageRef(after) };
    ({ layout } = mutator.reorder([toPageRef(page)], position, ctx.signal));
  }
  return {
    item: {
      type: 'pages.reorder',
      pages: pages.map(toPageRef),
      layout: layout!,
      meta: metaOf(ctx),
    },
    reverse: [{ kind: 'pages.reorder', placements: back, left: placementsOf(orderOf(ctx), pages) }],
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

/** Brings back pages a delete removed, those that aren't back already. */
export function restorePages(ctx: ChangeContext, step: PageRestoreStep): Done {
  const order = orderOf(ctx);
  const gone = step.pages.filter(({ page }) => !order.includes(page));
  if (gone.length === 0) return leftAlone(ctx, 'pages.restore');
  authorize(ctx);
  const docPtr = ctx.session.requireDocPtr();
  // In the display order they had: each page it followed is back before it.
  for (const { capture } of gone) importPage(ctx.runtime, docPtr, capture);
  ctx.session.refreshPageRegistry();
  ctx.session.invalidateDerived();
  const pages = inDisplayOrder(
    orderOf(ctx),
    gone.map(({ page }) => page),
  );
  return {
    item: {
      type: 'pages.restore',
      pages: pages.map(toPageRef),
      layout: layoutOf(ctx),
      meta: metaOf(ctx),
    },
    reverse: [removeStepOf(ctx, pages)],
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
  return writeDelete(ctx, inDisplayOrder(order, pages));
}

/** `pages.insertBlank`; its reverse deletes the new pages while nobody changed them. */
export function insertBlankPages(ctx: ChangeContext, op: Op<'pages.insertBlank'>): Done {
  authorize(ctx);
  const result = inserterOf(ctx).insertBlank(
    op.spec,
    op.position ?? 'end',
    ctx.signal,
    op.objectNumbers,
  );
  const pages = result.insertedPages.map((page) => page.objectNumber);
  return { item: { type: 'pages.insertBlank', ...result }, reverse: [removeStepOf(ctx, pages)] };
}

/** `pages.insert`; its reverse deletes the pages it copied in while nobody changed them. */
export function insertPages(ctx: ChangeContext, op: Op<'pages.insert'>): Done {
  authorize(ctx);
  const result = inserterOf(ctx).insert(bufferOf(op.source), op.position ?? 'end', ctx.signal);
  // The pages copied in may bring form fields.
  ctx.session.invalidateDerived();
  const pages = result.insertedPages.map((page) => page.objectNumber);
  return { item: { type: 'pages.insert', ...result }, reverse: [removeStepOf(ctx, pages)] };
}

/** Deletes `pages`, in display order, each captured first so its restore brings it back. */
function writeDelete(ctx: ChangeContext, pages: readonly number[]): Done {
  const docPtr = ctx.session.requireDocPtr();
  // Every capture before any page goes, so each holds the page it followed.
  const captures = pages.map((page) => ({ page, capture: exportPage(ctx.runtime, docPtr, page) }));
  const refs = pages.map(toPageRef);
  const result = mutatorOf(ctx).delete(refs, ctx.signal);
  ctx.session.invalidateDerived();
  return {
    item: { type: 'pages.delete', pages: refs, ...result },
    reverse: [{ kind: 'pages.restore', pages: captures }],
  };
}

/** The step that deletes `pages` again while each reads as it does now. */
function removeStepOf(ctx: ChangeContext, pages: readonly number[]): PageRemoveStep {
  return {
    kind: 'pages.remove',
    pages: pages.map((page) => ({ page, left: digestOf(ctx, page) })),
  };
}

/**
 * How a page reads now: the digest of its dictionary and of what the layer
 * holds of its annotations, contents and resources. Its place isn't in it, so
 * moving pages around it changes nothing.
 */
function digestOf(ctx: ChangeContext, page: number): string {
  const { fn, mem } = ctx.runtime;
  const capture = exportDict(ctx.runtime, ctx.session.requireDocPtr(), page, PAGE_DEEP_KEYS);
  return sha256HexOf(fn, mem, capture);
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
