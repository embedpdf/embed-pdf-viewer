import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../document-session/DocumentSession';

interface SignatureModelEntry {
  seq: number;
  ptr: Ptr;
}

/**
 * Per-session cache of the native `EPDFSig_LoadModel` snapshot, keyed on
 * the session's mutation sequence exactly like the form model: the model
 * walks the revision chain, the field tree and every widget, so it is
 * built once per document state and rebuilt after any mutation.
 */
const cache = new WeakMap<DocumentSession, SignatureModelEntry>();

export function acquireSignatureModel(runtime: PdfRuntimeModule, session: DocumentSession): Ptr {
  const seq = session.mutationSeq();
  const hit = cache.get(session);
  if (hit && hit.seq === seq) {
    return hit.ptr;
  }
  if (hit) {
    runtime.fn.EPDFSig_CloseModel(hit.ptr);
    cache.delete(session);
  }
  const ptr = runtime.fn.EPDFSig_LoadModel(session.requireDocPtr());
  if (ptr === NULL_PTR) {
    throw new EngineError(EngineErrorCode.Unknown, 'failed to build signature model');
  }
  cache.set(session, { seq, ptr });
  return ptr;
}

export function disposeSignatureModel(runtime: PdfRuntimeModule, session: DocumentSession): void {
  const hit = cache.get(session);
  if (!hit) {
    return;
  }
  runtime.fn.EPDFSig_CloseModel(hit.ptr);
  cache.delete(session);
}
