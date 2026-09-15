import type { Ptr } from '@embedpdf/engine-runtime';

import type { FontRegistrar } from '../../../fonts/FontRegistrar';
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
  /** This thread's font registry, when the host has one: a FreeText body
   *  face reads back as the registered `key` whose identity matches. */
  readonly fonts?: FontRegistrar;
}

/** Build the read context both read paths (list loop, mutator read-back) use. */
export function readContextFor(
  session: DocumentSession,
  fonts?: FontRegistrar,
): AnnotationReadContext {
  return { docPtr: session.requireDocPtr(), ...(fonts ? { fonts } : {}) };
}
