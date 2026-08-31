import type { DocumentActionsSnapshot, PdfActionTree } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { ActionReadBudgetTracker, readActionModel } from './ActionModelReader';
import { readDestination } from '../destinations/readDestination';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { readUtf16String } from '../../runtime/memory/strings';
import { throwIfAborted } from '../../shared/abort';

const DOCUMENT_ACTION_EVENTS = [
  ['willClose', 0],
  ['willSave', 1],
  ['didSave', 2],
  ['willPrint', 3],
  ['didPrint', 4],
] as const;

/** Read catalog-owned actions. Extraction only; no action is executed. */
export class DocumentActionsReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  read(signal: AbortSignal): DocumentActionsSnapshot {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const budget = new ActionReadBudgetTracker();
    const count = fn.FPDFDoc_GetJavaScriptActionCount(docPtr);
    if (count < 0) {
      throw new EngineError(
        EngineErrorCode.MalformedPdf,
        'failed to enumerate PDF name-tree scripts',
      );
    }

    const nameTreeScripts: DocumentActionsSnapshot['nameTreeScripts'] = [];
    for (let index = 0; index < count; index++) {
      throwIfAborted(signal);
      const namedPtr = fn.FPDFDoc_GetJavaScriptAction(docPtr, index);
      if (namedPtr === NULL_PTR) {
        throw new EngineError(EngineErrorCode.MalformedPdf, 'invalid PDF name-tree script entry', {
          details: { index },
        });
      }
      let name: string;
      try {
        name =
          readUtf16String(mem, (buf, capacity) =>
            fn.FPDFJavaScriptAction_GetName(namedPtr, buf, capacity),
          ) ?? '';
      } finally {
        fn.FPDFDoc_CloseJavaScriptAction(namedPtr);
      }
      // Name-tree keys enter the same detached snapshot as node payloads and
      // ride the same aggregate budget.
      budget.reservePayloadBytes(name.length);
      const action = requireAction(
        readActionModel(
          fn,
          mem,
          docPtr,
          fn.EPDFDoc_GetNamedJavaScriptActionModel(docPtr, index),
          budget,
        ),
        'name-tree script',
        index,
      );
      nameTreeScripts.push({ name, action });
    }

    const openAction = readActionModel(
      fn,
      mem,
      docPtr,
      fn.EPDFDoc_GetOpenActionModel(docPtr),
      budget,
    );
    // `/OpenAction` is one entry — the destination form only exists when the
    // action form does not.
    const openDestPtr = openAction ? NULL_PTR : fn.EPDFDoc_GetOpenActionDest(docPtr);
    const openDestination =
      openDestPtr !== NULL_PTR ? readDestination(fn, mem, docPtr, openDestPtr) : null;
    const additional: Partial<Record<(typeof DOCUMENT_ACTION_EVENTS)[number][0], PdfActionTree>> =
      {};
    for (const [key, event] of DOCUMENT_ACTION_EVENTS) {
      throwIfAborted(signal);
      const action = readActionModel(
        fn,
        mem,
        docPtr,
        fn.EPDFDoc_GetAdditionalActionModel(docPtr, event),
        budget,
      );
      if (action) additional[key] = action;
    }
    return { nameTreeScripts, openAction, openDestination, ...additional };
  }
}

function requireAction(action: PdfActionTree | null, owner: string, index: number): PdfActionTree {
  if (action) return action;
  throw new EngineError(EngineErrorCode.MalformedPdf, `failed to read ${owner}`, {
    details: { index },
  });
}
