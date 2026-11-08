import {
  authorizeCapability,
  EngineError,
  EngineErrorCode,
  pageMeasureOf,
  pdfMeasureOf,
  toPageRef,
  type ChangeOp,
  type PageRef,
  type PdfCoordinates,
  type PdfMeasure,
  type PdfRect,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';

import { leftAlone, type ChangeContext, type Done } from './changeContext';
import { withScratch } from '../../../runtime/memory/scratch';
import { RECTF_BYTES } from '../../../runtime/memory/structs';
import { MeasureMutator } from '../../measure/MeasureMutator';
import { readViewports } from '../../measure/internal/readViewports';
import { PagesReader } from '../../pages';
import { readBoxes } from '../../pages/PagesReader';
import type { PageScaleStep } from '../ChangeRecord';

type Op = Extract<ChangeOp<PdfCoordinates, WireAnnotationResources>, { type: 'pages.setScale' }>;

/** A page's scale belongs to its measurements: writing one takes what writing them does. */
const authorize = (ctx: ChangeContext) => authorizeCapability(ctx.authority, 'doc.annotate.modify');

/**
 * `pages.setScale`: each page's own viewport gets the scale. The op's
 * measure is in page space, so each page takes it on its own visible box.
 * Its reverse puts back the scale each page had, while the page still has
 * the one this change left.
 */
export function setPageScales(ctx: ChangeContext, op: Op): Done {
  authorize(ctx);
  const pages = op.pages.map((page) => page.objectNumber);
  if (new Set(pages).size !== pages.length) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'pages.setScale names a page twice', {
      details: { field: 'pages' },
    });
  }
  const changed = pages.map((page) => {
    const box = visibleBoxOf(ctx, page);
    const before = ownScaleOf(ctx, page);
    write(ctx, page, op.measure && pdfMeasureOf(op.measure, box));
    return { page, box, before, left: ownScaleOf(ctx, page) };
  });
  const reverse = new Map<
    string,
    { pages: number[]; measure: PdfMeasure | null; left: PdfMeasure | null }
  >();
  for (const { page, box, before, left } of changed) {
    const key = JSON.stringify([before, left, box]);
    const step = reverse.get(key) ?? { pages: [], measure: before, left };
    step.pages.push(page);
    reverse.set(key, step);
  }
  return {
    item: {
      type: 'pages.setScale',
      pages: [...op.pages],
      measure: op.measure,
      ...resultOf(ctx, op.pages[0]!),
    },
    reverse: [...reverse.values()].map((step) => ({ kind: 'pages.setScale', ...step })),
  };
}

/** Gives a step's pages its scale, those that still have the scale it left. */
export function setPageScalesBack(ctx: ChangeContext, step: PageScaleStep): Done {
  const pages = step.pages.filter((page) => sameScale(ownScaleOf(ctx, page), step.left));
  if (pages.length === 0) return leftAlone(ctx, 'pages.setScale');
  authorize(ctx);
  for (const page of pages) write(ctx, page, step.measure);
  const refs = pages.map(toPageRef);
  // A step's pages share their size, so the first one's box says where the scale is on each.
  const measure = step.measure && pageMeasureOf(step.measure, visibleBoxOf(ctx, pages[0]!));
  return {
    item: { type: 'pages.setScale', pages: refs, measure, ...resultOf(ctx, refs[0]!) },
    reverse: [{ kind: 'pages.setScale', pages, measure: step.left, left: step.measure }],
  };
}

function write(ctx: ChangeContext, page: number, measure: PdfMeasure | null): void {
  new MeasureMutator(ctx.runtime, ctx.session).setScale(page, measure, ctx.signal);
}

/** What a scale change answers: its first page, and the layout that carries every page's viewports. */
function resultOf(ctx: ChangeContext, first: PageRef) {
  return {
    page: first,
    layout: new PagesReader(ctx.runtime, ctx.session).read(ctx.signal),
    meta: { affectedPages: [], cacheDelta: null, ...ctx.session.writeStamp() },
  };
}

/** The scale of the last viewport the engine owns on the page, in the file's coordinates, or `null`. */
function ownScaleOf(ctx: ChangeContext, page: number): PdfMeasure | null {
  const { fn, mem } = ctx.runtime;
  const index = ctx.session.recordByObjectNumber(page).pageIndex;
  const own = readViewports(fn, mem, ctx.session.requireDocPtr(), index)
    .filter((viewport) => viewport.owned)
    .pop();
  return own?.measure?.subtype === 'rectilinear' ? own.measure : null;
}

/** Two scales as the file holds them; both read through the same codec. */
const sameScale = (a: PdfMeasure | null, b: PdfMeasure | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** The page's visible box in the file's coordinates. */
function visibleBoxOf(ctx: ChangeContext, page: number): PdfRect {
  const { fn, mem } = ctx.runtime;
  const index = ctx.session.recordByObjectNumber(page).pageIndex;
  return withScratch(
    mem,
    RECTF_BYTES,
    (p) => readBoxes(fn, mem, ctx.session.requireDocPtr(), index, p).crop,
  );
}
