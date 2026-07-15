import type {
  PageBoxes,
  PageLayout,
  PageListSnapshot,
  PdfRect,
  PdfPageActions,
} from '@embedpdf/engine-core/runtime';
import { normalizePdfRect } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, PdfRuntimeModule, Ptr } from '@embedpdf/pdf-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratchN } from '../../runtime/memory/scratch';
import { readUtf16String } from '../../runtime/memory/strings';
import {
  F32_BYTES,
  RECTF_BYTES,
  SIZEF_BYTES,
  readF32,
  readRectF,
  readSizeF,
} from '../../runtime/memory/structs';
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
    return withScratchN(
      mem,
      [RECTF_BYTES, SIZEF_BYTES, F32_BYTES],
      ([rectPtr, sizePtr, userUnitPtr]) => {
        const pages: PageLayout[] = records.map((record) => {
          throwIfAborted(signal);
          const index = record.pageIndex;
          const actions = readPageActions(fn, mem, docPtr, record.pageObjectNumber, actionBudget);
          return {
            index,
            pageObjectNumber: record.pageObjectNumber,
            label: readLabel(fn, mem, docPtr, index),
            size: readSize(fn, mem, docPtr, index, sizePtr),
            rotation: readRotation(fn, docPtr, index),
            userUnit: readUserUnit(fn, mem, docPtr, index, userUnitPtr),
            boxes: readBoxes(fn, mem, docPtr, index, rectPtr),
            ...(actions ? { actions } : {}),
          };
        });
        return { pageCount: pages.length, pages };
      },
    );
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
    fn.EPDFDoc_GetPageActionModel(docPtr, pageObjectNumber, 0),
    budget,
  );
  const close = readActionModel(
    fn,
    mem,
    fn.EPDFDoc_GetPageActionModel(docPtr, pageObjectNumber, 1),
    budget,
  );
  if (open) actions.open = open;
  if (close) actions.close = close;
  return open || close ? actions : undefined;
}

/**
 * Read one FS_RECTF box and canonicalize to a y-up `PdfRect`
 * (`{ left, bottom, right, top }`, equivalent to `[llx, lly, urx, ury]`) so
 * the lower-left/upper-right invariant holds regardless of how the PDF
 * ordered the corners. Returns null when the optional box is absent.
 */
function readBox(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  index: number,
  boxType: number,
  rectPtr: Ptr,
): PdfRect | null {
  if (!fn.EPDF_GetPageBoxByIndex(docPtr, index, boxType, rectPtr)) return null;
  // FS_RECTF → y-up `PdfRect`, normalized so the lower-left/upper-right invariant
  // holds regardless of how the PDF ordered the corners.
  return normalizePdfRect(readRectF(mem, rectPtr));
}

function readBoxes(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  index: number,
  rectPtr: Ptr,
): PageBoxes {
  // MediaBox always resolves (page-tree inheritance + PDFium default).
  // CropBox falls back to MediaBox, so both are guaranteed present.
  const media = readBox(fn, mem, docPtr, index, BOX_MEDIA, rectPtr) ?? {
    left: 0,
    bottom: 0,
    right: 0,
    top: 0,
  };
  const crop = readBox(fn, mem, docPtr, index, BOX_CROP, rectPtr) ?? media;
  const bleed = readBox(fn, mem, docPtr, index, BOX_BLEED, rectPtr);
  const trim = readBox(fn, mem, docPtr, index, BOX_TRIM, rectPtr);
  const art = readBox(fn, mem, docPtr, index, BOX_ART, rectPtr);
  return {
    media,
    crop,
    ...(bleed ? { bleed } : {}),
    ...(trim ? { trim } : {}),
    ...(art ? { art } : {}),
  };
}

function readSize(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  index: number,
  sizePtr: Ptr,
): { width: number; height: number } {
  if (!fn.EPDF_GetPageSizeByIndexNormalized(docPtr, index, sizePtr)) {
    return { width: 0, height: 0 };
  }
  return readSizeF(mem, sizePtr);
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
