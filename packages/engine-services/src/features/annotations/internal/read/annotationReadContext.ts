import type { Ptr } from '@embedpdf/pdf-runtime';

import type { DocumentSession } from '../../../../document-session/DocumentSession';

/**
 * Document-scoped capabilities threaded into per-subtype annotation
 * READERS — the read-side mirror of `AnnotationWriteContext`. Most kinds
 * materialise from the `annotPtr` alone and ignore it; the link reader
 * needs the document because destination, action, and URI resolution are
 * document-scoped PDFium operations.
 */
export interface AnnotationReadContext {
  readonly docPtr: Ptr;
}

/** Build the read context both read paths (list loop, mutator read-back) use. */
export function readContextFor(session: DocumentSession): AnnotationReadContext {
  return { docPtr: session.requireDocPtr() };
}
