import type {
  NamedPageEntry,
  PageBoxes,
  PageLayout,
  PageListSnapshot,
  PdfRect,
  PdfPageActions,
} from '@embedpdf/engine-core/runtime';
import {
  normalizePdfRect,
  pageBoxesOf,
  pdfRectSize,
  toPageRef,
} from '@embedpdf/engine-core/runtime';
import type {
  PdfFunctions,
  PdfRuntimeMemory,
  PdfRuntimeModule,
  Ptr,
} from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratchN } from '../../runtime/memory/scratch';
import { readUtf16String } from '../../runtime/memory/strings';
import { F32_BYTES, RECTF_BYTES, readF32, readRectF } from '../../runtime/memory/structs';
import { throwIfAborted } from '../../shared/abort';
import { ActionReadBudgetTracker, readActionModel } from '../actions/ActionModelReader';

// EPDF_PAGE_BOX_TYPE (public/fpdfview.h).
const BOX_MEDIA = 0;
const BOX_CROP = 1;
const BOX_BLEED = 2;
const BOX_TRIM = 3;
const BOX_ART = 4;

/**
 * Runtime-agnostic page geometry reader. Produces the `pages.list()`
 * snapshot from the lightweight `...ByIndex` PDFium bindings, none of which
 * load or parse a page (no `pagePtr`), so listing stays cheap. Shared
 * verbatim by the local WASM worker and the server native worker, so a
 * given PDF yields an identical `PageListSnapshot` on both engines.
 */
export class PagesReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  read(signal: AbortSignal): PageListSnapshot {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const records = this.session.allRecords();
    const actionBudget = new ActionReadBudgetTracker();

    // One scratch buffer per struct kind, reused across every page.
    return withScratchN(mem, [RECTF_BYTES, F32_BYTES], ([rectPtr, userUnitPtr]) => {
      const pages: PageLayout[] = records.map((record) => {
        throwIfAborted(signal);
        const index = record.pageIndex;
        const actions = readPageActions(fn, mem, docPtr, record.pageObjectNumber, actionBudget);
        const boxes = readBoxes(fn, mem, docPtr, index, rectPtr);
        return {
          index,
          ref: toPageRef(record.pageObjectNumber),
          label: readLabel(fn, mem, docPtr, index),
          size: pdfRectSize(boxes.crop),
          rotation: readRotation(fn, docPtr, index),
          userUnit: readUserUnit(fn, mem, docPtr, index, userUnitPtr),
          boxes,
          ...(actions ? { actions } : {}),
        };
      });
      return { pageCount: pages.length, pages, namedPages: readNamedPages(fn, mem, docPtr) };
    });
  }
}

function readPageActions(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  pageObjectNumber: number,
  budget: ActionReadBudgetTracker,
): PdfPageActions | undefined {
  const actions: PdfPageActions = {};
  const open = readActionModel(
    fn,
    mem,
    docPtr,
    fn.EPDFDoc_GetPageActionModel(docPtr, pageObjectNumber, 0),
    budget,
  );
  const close = readActionModel(
    fn,
    mem,
    docPtr,
    fn.EPDFDoc_GetPageActionModel(docPtr, pageObjectNumber, 1),
    budget,
  );
  if (open) actions.open = open;
  if (close) actions.close = close;
  return open || close ? actions : undefined;
}

/** One box as the page writes it, or `undefined` when it is absent, empty or not four numbers. */
function readWrittenBox(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  index: number,
  boxType: number,
  rectPtr: Ptr,
): PdfRect | undefined {
  if (!fn.EPDF_GetPageBoxByIndex(docPtr, index, boxType, rectPtr)) return undefined;
  return normalizePdfRect(readRectF(mem, rectPtr));
}

/** The page's five boxes as ISO 32000 defines them; `crop` is the visible page. */
export function readBoxes(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  index: number,
  rectPtr: Ptr,
): PageBoxes {
  const read = (boxType: number) => readWrittenBox(fn, mem, docPtr, index, boxType, rectPtr);
  return pageBoxesOf({
    media: read(BOX_MEDIA),
    crop: read(BOX_CROP),
    bleed: read(BOX_BLEED),
    trim: read(BOX_TRIM),
    art: read(BOX_ART),
  });
}

function readRotation(fn: PdfFunctions, docPtr: Ptr, index: number): 0 | 90 | 180 | 270 {
  // Returns quarter-turns (0..3), or -1 on error.
  const quarterTurns = fn.EPDF_GetPageRotationByIndex(docPtr, index);
  switch (quarterTurns) {
    case 1:
      return 90;
    case 2:
      return 180;
    case 3:
      return 270;
    default:
      return 0;
  }
}

function readUserUnit(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  index: number,
  userUnitPtr: Ptr,
): number {
  if (!fn.EPDF_GetPageUserUnitByIndex(docPtr, index, userUnitPtr)) return 1;
  const value = readF32(mem, userUnitPtr, 0);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function readLabel(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  index: number,
): string | null {
  // A page label of '' is indistinguishable from "absent" for our DTO, so
  // empty reads as null (`emptyAs: null`); the trailing `|| null` also maps
  // a decoded-but-empty buffer to null.
  return (
    readUtf16String(
      mem,
      (buf, capacity) => fn.FPDF_GetPageLabel(docPtr, index, buf, capacity),
      null,
    ) || null
  );
}

// `EPDF_NAMED_PAGE_TREE_*` / `EPDF_NAMED_PAGE_KIND_*` from public/epdf_named_pages.h.
const NAMED_PAGE_TREES = [0, 1] as const; // Pages, Templates
const NAMED_PAGE_KIND_PAGE = 0;
const NAMED_PAGE_KIND_TEMPLATE = 1;

/**
 * The catalog's `/Names /Pages` and `/Names /Templates` registrations, in
 * tree order, each value classified by the fork (page / template /
 * dangling). Page-identity data like `label`, so it ships inside the same
 * snapshot — a registration is only meaningful against the page set that
 * contains its target.
 */
function readNamedPages(fn: PdfFunctions, mem: PdfRuntimeMemory, docPtr: Ptr): NamedPageEntry[] {
  const entries: NamedPageEntry[] = [];
  withScratchN(mem, [4, 4], ([objNumPtr, kindPtr]) => {
    for (const tree of NAMED_PAGE_TREES) {
      const count = fn.EPDFDoc_GetNamedPageCount(docPtr, tree);
      for (let index = 0; index < count; index++) {
        const name = readUtf16String(
          mem,
          (buf, capacity) =>
            fn.EPDFDoc_GetNamedPageAt(docPtr, tree, index, buf, capacity, objNumPtr, kindPtr),
          '',
        );
        if (name === null) continue;
        const objectNumber = Number(mem.peek(objNumPtr, 'i32')) >>> 0;
        const kind = Number(mem.peek(kindPtr, 'i32'));
        entries.push({
          name,
          target:
            kind === NAMED_PAGE_KIND_PAGE
              ? { kind: 'page', page: toPageRef(objectNumber) }
              : kind === NAMED_PAGE_KIND_TEMPLATE
                ? { kind: 'template', objectNumber }
                : { kind: 'dangling' },
        });
      }
    }
  });
  return entries;
}
