import type { AnnotationActor } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import {
  writeAnnotationAuthor,
  writeAnnotationCreated,
  writeAnnotationModified,
} from './writeAnnotationBase';
import { applyEmbedMetadataOnCreate } from './writeEmbedMetadata';

/**
 * Attribute a new annotation to the session, as `create` does: `/T` from
 * the actor's name, `/CreationDate` and `/M` at `now`, and the owner in
 * `/EMBD_Metadata`. Written after the kind's writer, so none clobbers it.
 */
export function stampCreation(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  actor: AnnotationActor | undefined,
  now: Date,
): void {
  if (actor?.displayName) writeAnnotationAuthor(fn, mem, annotPtr, actor.displayName);
  writeAnnotationCreated(fn, mem, annotPtr, now);
  writeAnnotationModified(fn, mem, annotPtr, now);
  applyEmbedMetadataOnCreate(fn, mem, annotPtr, actor);
}
