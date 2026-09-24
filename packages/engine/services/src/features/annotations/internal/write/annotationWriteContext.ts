import type { FontIdentityInfo, WireAnnotationResources } from '@embedpdf/engine-core/runtime';
import type { Ptr } from '@embedpdf/engine-runtime';

/**
 * Optional capabilities threaded into per-subtype annotation writers.
 *
 * The registered-font resolver serves the FreeText writer (stable
 * `registeredFontKey` → this thread's volatile `CFX_FontRegistry::FontId`).
 * The document/page pointers and `resources` serve the writers that take
 * bytes (stamp, file attachment): image objects and files are created
 * against the document from the resources that came with the write. Every
 * member is optional end-to-end — writers that don't need one ignore it.
 */
export interface AnnotationWriteContext {
  /**
   * Resolve a registered font key to this thread's native FontId. Throws if
   * the key was never registered on this thread. Absent when the host has no
   * font registry wired (e.g. read-only paths).
   */
  resolveRegisteredFontId?: (fontKey: string) => number;
  /**
   * The identity (family, weight, italic) a registered key resolved to, or
   * undefined for a string that is not a key. Rich text names faces by
   * identity, so a run's `family` may be a key, a standard name, or a
   * family; this is how a key is told apart.
   */
  describeRegisteredFont?: (fontKey: string) => FontIdentityInfo | undefined;
  /** Document pointer — required by writers that create page objects. */
  docPtr?: Ptr;
  /** Page pointer of the annotation being written. */
  pagePtr?: Ptr;
  /** The bytes that came with this write, by role. */
  resources?: WireAnnotationResources;
}
