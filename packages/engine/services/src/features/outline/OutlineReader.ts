import {
  EngineError,
  EngineErrorCode,
  OUTLINE_READ_LIMITS,
  type DocumentOutline,
  type OutlineItem,
  type PdfDestination,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import { outlineActionBudget, readOutlineItem } from './internal/readOutlineItem';
import { TOP } from './internal/readOutlineTree';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';

/**
 * Synchronous read of the document's outline, shared by the local worker and
 * the server. Dictionary reads only: no page is loaded. It never throws for
 * a bad outline: what it can't read (a loop, an item that isn't an indirect
 * object, a broken action, past `OUTLINE_READ_LIMITS`) it leaves out or
 * marks, and says `incomplete`.
 */
export class OutlineReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  read(signal: AbortSignal): DocumentOutline<PdfDestination> {
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const budget = outlineActionBudget();
    const items: OutlineItem<PdfDestination>[] = [];
    const seen = new Set<number>();
    let incomplete = false;

    // Depth first; false once the read has to stop.
    const visit = (parentHandle: Ptr, parent: number, depth: number): boolean => {
      for (
        let handle = fn.FPDFBookmark_GetFirstChild(docPtr, parentHandle);
        handle;
        handle = fn.FPDFBookmark_GetNextSibling(docPtr, handle)
      ) {
        throwIfAborted(signal);
        const objectNumber = fn.EPDFOutline_GetObjectNumber(handle);
        if (!objectNumber) {
          incomplete = true; // not an indirect object: it and the items under it
          continue;
        }
        if (seen.has(objectNumber)) {
          incomplete = true; // a loop ends the list
          break;
        }
        if (items.length >= OUTLINE_READ_LIMITS.items) {
          incomplete = true;
          return false;
        }
        seen.add(objectNumber);
        const read = readOutlineItem(this.runtime, docPtr, handle, objectNumber, parent, budget);
        items.push(read.item);
        if (!read.complete) incomplete = true;
        if (fn.FPDFBookmark_GetFirstChild(docPtr, handle) === NULL_PTR) continue;
        if (depth + 1 >= OUTLINE_READ_LIMITS.depth) {
          incomplete = true;
          continue;
        }
        if (!visit(handle, objectNumber, depth + 1)) return false;
      }
      return true;
    };
    visit(NULL_PTR, TOP, 0);
    return { items, incomplete };
  }

  /** The item `objectNumber`, under `parent` ({@link TOP} for the top level), as it reads now. */
  readItem(objectNumber: number, parent: number): OutlineItem<PdfDestination> {
    const docPtr = this.session.requireDocPtr();
    const handle = this.runtime.fn.EPDFOutline_GetItem(docPtr, objectNumber);
    if (!handle) {
      throw new EngineError(EngineErrorCode.NotFound, `no outline item ${objectNumber}`, {
        details: { field: 'ref' },
      });
    }
    return readOutlineItem(
      this.runtime,
      docPtr,
      handle,
      objectNumber,
      parent,
      outlineActionBudget(),
    ).item;
  }
}
