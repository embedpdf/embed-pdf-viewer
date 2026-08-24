import type { WireResourceMap } from '@embedpdf/engine-core/runtime';
import type { Ptr } from '@embedpdf/engine-runtime';

/**
 * Optional capabilities threaded into per-subtype annotation writers.
 *
 * The registered-font resolver serves the FreeText writer (stable
 * `registeredFontKey` → this thread's volatile `CFX_FontRegistry::FontId`).
 * The document/page pointers and `resources` serve binary-carrying writers
 * (stamp today): image objects are created against the document, and the
 * wire draft's `{ resource }` refs are resolved out of `resources`. Every
 * member is optional end-to-end — writers that don't need one ignore it.
 */
export interface AnnotationWriteContext {
  /**
   * Resolve a registered font key to this thread's native FontId. Throws if
   * the key was never registered on this thread. Absent when the host has no
   * font registry wired (e.g. read-only paths).
   */
  resolveRegisteredFontId?: (fontKey: string) => number;
  /** Document pointer — required by writers that create page objects. */
  docPtr?: Ptr;
  /** Page pointer of the annotation being written. */
  pagePtr?: Ptr;
  /** Binary payloads that accompanied this mutation, keyed by resource key. */
  resources?: WireResourceMap;
}
