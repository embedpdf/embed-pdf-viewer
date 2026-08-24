import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../document-session/DocumentSession';

interface FormModelEntry {
  /** The session mutation sequence the model was built at. */
  seq: number;
  ptr: Ptr;
}

/**
 * Per-session cache of the native `EPDFForm_LoadModel` snapshot, keyed on
 * the session's mutation sequence.
 *
 * The native model is an immutable, detached snapshot: correct forever,
 * stale after any document mutation. Rebuilding it per call would walk the
 * field tree and sweep every page's /Annots on each read (widget lists on
 * multi-page documents read it constantly); keeping one forever would
 * serve stale values. Version-keying gives exact coherence for free:
 * `DocumentSession.noteMutation()` bumps the sequence on EVERY successful
 * mutation (annotations, pages, metadata, forms — widgets are annotations,
 * so all of them can affect the form model), and the next read rebuilds.
 *
 * The cache also owns the native handle's lifetime: exactly one live model
 * per session, closed before replacement and on session teardown via
 * {@link disposeFormModel}.
 */
const cache = new WeakMap<DocumentSession, FormModelEntry>();

export function acquireFormModel(runtime: PdfRuntimeModule, session: DocumentSession): Ptr {
  const seq = session.mutationSeq();
  const hit = cache.get(session);
  if (hit && hit.seq === seq) {
    return hit.ptr;
  }
  if (hit) {
    runtime.fn.EPDFForm_CloseModel(hit.ptr);
    cache.delete(session);
  }
  const ptr = runtime.fn.EPDFForm_LoadModel(session.requireDocPtr());
  if (ptr === NULL_PTR) {
    throw new EngineError(EngineErrorCode.Unknown, 'failed to build form model');
  }
  cache.set(session, { seq, ptr });
  return ptr;
}

/** Close and forget the session's cached model, if any. */
export function disposeFormModel(runtime: PdfRuntimeModule, session: DocumentSession): void {
  const hit = cache.get(session);
  if (!hit) {
    return;
  }
  runtime.fn.EPDFForm_CloseModel(hit.ptr);
  cache.delete(session);
}
